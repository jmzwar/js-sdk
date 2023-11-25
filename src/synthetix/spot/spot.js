import { ethers } from 'ethers';
import { etherToWei, weiToEther } from '../utils/wei.js';
import { SPOT_MARKETS_BY_ID, SPOT_MARKETS_BY_NAME } from './constants.js';

class Spot {
    constructor(snx, pyth) {
        this.snx = snx;
        this.pyth = pyth;
        this.logger = snx.logger;

        // Check if spot is deployed on this network
        if ('SpotMarketProxy' in snx.contracts) {
            const { address, abi } = snx.contracts['SpotMarketProxy'];
            this.marketProxy = new ethers.Contract(address, abi, snx.signer);
        }
    }

    // Internals
    async _resolveMarket(marketId, marketName) {
        if (marketId === undefined && marketName === undefined) {
            throw new Error('Must provide a marketId or marketName');
        }

        const hasMarketId = marketId !== undefined;
        const hasMarketName = marketName !== undefined;

        if (!hasMarketId && hasMarketName) {
            if (!(marketName in SPOT_MARKETS_BY_NAME[this.snx.networkId])) {
                throw new Error('Invalid marketName');
            }
            marketId = SPOT_MARKETS_BY_NAME[this.snx.networkId][marketName];

            if (marketId === -1) {
                throw new Error('Invalid marketName');
            }
        } else if (hasMarketId && !hasMarketName) {
            if (!(marketId in SPOT_MARKETS_BY_ID[this.snx.networkId])) {
                throw new Error('Invalid marketId');
            }
            marketName = SPOT_MARKETS_BY_ID[this.snx.networkId][marketId];
        }
        return { marketId, marketName };
    }

    async _getSynthContract(marketId, marketName) {
        const { marketId: resolvedMarketId, marketName: resolvedMarketName } = await this._resolveMarket(marketId, marketName);

        let marketImplementation;
        if (resolvedMarketId === 0) {
            marketImplementation = this.snx.contracts['USDProxy']['address'];
        } else {
            marketImplementation = await this.marketProxy.getSynth(resolvedMarketId);
        }

        return new ethers.Contract(marketImplementation, this.snx.contracts['USDProxy']['abi'], this.snx.signer);
    }

    // Read
    async getBalance(address, marketId, marketName) {
        const { marketId: resolvedMarketId } = await this._resolveMarket(marketId, marketName);

        if (address === undefined) {
            address = await this.snx.getAddress();
        }

        const synthContract = await this._getSynthContract(resolvedMarketId);
        const balance = await synthContract.balanceOf(address);
        return weiToEther(balance);
    }

    async getAllowance(targetAddress, address, marketId, marketName) {
        const { marketId: resolvedMarketId } = await this._resolveMarket(marketId, marketName);

        if (address === undefined) {
            address = await this.snx.getAddress();
        }

        const synthContract = await this._getSynthContract(resolvedMarketId);
        const allowance = await synthContract.allowance(address, targetAddress);
        return weiToEther(allowance);
    }

    async getSettlementStrategy(settlementStrategyId, marketId, marketName) {
        const { marketId: resolvedMarketId } = await this._resolveMarket(marketId, marketName);

        const settlementStrategy = await this.marketProxy.getSettlementStrategy(resolvedMarketId, settlementStrategyId);
        return settlementStrategy;
    }

    async getOrder(asyncOrderId, marketId, marketName, fetchSettlementStrategy) {
        const { marketId: resolvedMarketId } = await this._resolveMarket(marketId, marketName);

        const marketContract = this.marketProxy;
        const order = await marketContract.getAsyncOrderClaim(resolvedMarketId, asyncOrderId);
        const [id, owner, orderType, amountEscrowed, settlementStrategyId, settlementTime, minimumSettlementAmount, settledAt, referrer] = order;

        const orderData = {
            id,
            owner,
            orderType,
            amountEscrowed,
            settlementStrategyId,
            settlementTime,
            minimumSettlementAmount,
            settledAt,
            referrer,
        };

        if (fetchSettlementStrategy) {
            const settlementStrategy = await this.getSettlementStrategy(settlementStrategyId, resolvedMarketId);
            orderData.settlementStrategy = settlementStrategy;
        }

        return orderData;
    }

    // Transactions
    async approve(targetAddress, amount, marketId, marketName, submit) {
        const { marketId: resolvedMarketId } = await this._resolveMarket(marketId, marketName);

        amount = amount === undefined ? ethers.constants.MaxUint256.toString() : etherToWei(amount);
        const synthContract = await this._getSynthContract(resolvedMarketId);

        const txData = synthContract.interface.encodeFunctionData('approve', [targetAddress, amount]);

        const txParams = await this.snx._getTxParams();
        const txRequest = {
            to: synthContract.address,
            data: txData,
            ...txParams,
        };

        if (submit) {
            const txHash = await this.snx.executeTransaction(txRequest);
            this.logger.info(`Approving ${targetAddress} to spend ${weiToEther(amount)} ${marketName}`);
            this.logger.info(`approve tx: ${txHash}`);
            return txHash;
        } else {
            return txRequest;
        }
    }

    async commitOrder(side, size, settlementStrategyId = 2, marketId, marketName, submit) {
        const { marketId: resolvedMarketId, marketName: resolvedMarketName } = await this._resolveMarket(marketId, marketName);

        // TODO: Add a slippage parameter
        // TODO: Allow the user to specify USD or ETH values (?)

        const sizeWei = etherToWei(size);
        const orderType = side === 'buy' ? 3 : 4;

        // Prepare the transaction
        const txArgs = [
            resolvedMarketId,         // marketId
            orderType,                // orderType
            sizeWei,                  // amountProvided
            settlementStrategyId,     // settlementStrategyId
            0,                        // minimumSettlementAmount
            this.snx.referrer,        // referrer
        ];

        const txParams = await writeErc7412(this.snx, this.marketProxy, 'commitOrder', txArgs);

        if (submit) {
            const txHash = await this.snx.executeTransaction(txParams);
            this.logger.info(`Committing ${side} order of size ${weiToEther(sizeWei)} (${size}) to ${resolvedMarketName} (id: ${resolvedMarketId})`);
            this.logger.info(`commitOrder tx: ${txHash}`);
            return txHash;
        } else {
            return txParams;
        }
    }

    async settlePythOrder(asyncOrderId, marketId, marketName, maxRetry = 10, retryDelay = 2, submit) {
        const { marketId: resolvedMarketId, marketName: resolvedMarketName } = await this._resolveMarket(marketId, marketName);

        const order = await this.getOrder(asyncOrderId, resolvedMarketId);
        const settlementStrategy = order.settlement_strategy;

        // Check if the order is ready to be settled
        this.logger.info(`Settlement time: ${order.settlement_time}`);
        this.logger.info(`Current time: ${Date.now() / 1000}`);
        if (order.settlement_time > Date.now() / 1000) {
            const duration = order.settlement_time - Date.now() / 1000;
            this.logger.info(`Waiting ${duration} seconds until the order can be settled`);
            await new Promise(resolve => setTimeout(resolve, duration * 1000));
        } else {
            // TODO: Check if expired
            this.logger.info('Order is ready to be settled');
        }

        // Create hex inputs
        const feedIdHex = settlementStrategy.feed_id;
        const settlementTimeHex = ethers.utils.hexValue(order.settlement_time);

        // Concatenate the hex strings with '0x' prefix
        const dataParam = `0x${feedIdHex}${settlementTimeHex.slice(2)}`;

        // Query Pyth for the price update data
        const url = settlementStrategy.url.replace('{data}', dataParam);

        let retryCount = 0;
        let priceUpdateData = null;
        while (!priceUpdateData && retryCount < maxRetry) {
            const response = await fetch(url);

            if (response.status === 200) {
                const responseJson = await response.json();
                priceUpdateData = responseJson.data;
            } else {
                retryCount += 1;
                if (retryCount > maxRetry) {
                    throw new Error("Price update data not available");
                }

                this.logger.info("Price update data not available, waiting 2 seconds and retrying");
                await new Promise(resolve => setTimeout(resolve, retryDelay * 1000));
            }
        }

        // Encode the extra data
        const marketBytes = Buffer.alloc(32);
        marketBytes.writeUIntBE(resolvedMarketId, 0, 32);
        const orderIdBytes = Buffer.alloc(32);
        orderIdBytes.writeUIntBE(order.id, 0, 32);

        // Concatenate the bytes and convert to hex
        const extraData = ethers.utils.hexValue(Buffer.concat([marketBytes, orderIdBytes]));

        // Log the data
        this.logger.info(`priceUpdateData: ${priceUpdateData}`);
        this.logger.info(`extraData: ${extraData}`);

        // Prepare the transaction
        const txParams = await writeErc7412(this.snx, this.marketProxy, 'settlePythOrder', [priceUpdateData, extraData], { value: 1 });

        if (submit) {
            this.logger.info(`tx params: ${JSON.stringify(txParams)}`);
            const txHash = await this.snx.executeTransaction(txParams);
            this.logger.info(`Settling order ${order.id}`);
            this.logger.info(`settle tx: ${txHash}`);
            return txHash;
        } else {
            return txParams;
        }
    }
}

export default Spot;










// Usage for test
// const spot = new Spot(snxInstance, pythInstance);
// spot.getBalance('0xYourAddress', /* marketId or marketName parameters */)
//     .then(balance => console.log(balance))
//     .catch(error => console.error(error));
// const spot = new Spot(snxInstance, pythInstance);

// spot.getAllowance('0xTargetAddress', /* address, marketId, marketName parameters */)
//     .then(allowance => console.log(allowance))
//     .catch(error => console.error(error));

// spot.getSettlementStrategy(/* settlementStrategyId, marketId, marketName parameters */)
//     .then(settlementStrategy => console.log(settlementStrategy))
//     .catch(error => console.error(error));

// spot.getOrder(/* asyncOrderId, marketId, marketName, fetchSettlementStrategy parameters */)
//     .then(orderData => console.log(orderData))
//     .catch(error => console.error(error));

// spot.approve('0xTargetAddress', /* amount, marketId, marketName, submit parameters */);
// const spot = new Spot(snxInstance, pythInstance);

// spot.commitOrder('buy', 10, /* settlementStrategyId, marketId, marketName, submit parameters */);
// spot.settlePythOrder(/* asyncOrderId, marketId, marketName, maxRetry, retryDelay, submit parameters */);