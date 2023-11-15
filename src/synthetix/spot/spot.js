const { etherToWei, weiToEther } = require('../utils');
const SPOT_MARKETS_BY_ID = require('./constants').SPOT_MARKETS_BY_ID;
const SPOT_MARKETS_BY_NAME = require('./constants').SPOT_MARKETS_BY_NAME;

class Spot {
    constructor(snx, pyth) {
        this.snx = snx;
        this.pyth = pyth;
        this.logger = snx.logger;

        // Check if spot is deployed on this network
        if ('SpotMarketProxy' in snx.contracts) {
            const { address, abi } = snx.contracts['SpotMarketProxy'];
            this.market_proxy = new snx.web3.eth.Contract(abi, address);
        }
    }

    // Internals
    _resolveMarket(marketId, marketName) {
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

    _getSynthContract(marketId, marketName) {
        const { marketId: resolvedMarketId, marketName: resolvedMarketName } = this._resolveMarket(marketId, marketName);

        let marketImplementation;
        if (resolvedMarketId === 0) {
            marketImplementation = this.snx.contracts['USDProxy']['address'];
        } else {
            marketImplementation = this.market_proxy.methods.getSynth(resolvedMarketId).call();
        }

        return new this.snx.web3.eth.Contract(
            this.snx.contracts['USDProxy']['abi'],
            marketImplementation
        );
    }

    // Read
    getBalance(address, marketId, marketName) {
        const { marketId: resolvedMarketId } = this._resolveMarket(marketId, marketName);

        if (address === undefined) {
            address = this.snx.address;
        }

        const synthContract = this._getSynthContract(resolvedMarketId);
        return synthContract.methods.balanceOf(address).call()
            .then(balance => weiToEther(balance));
    }

    getAllowance(targetAddress, address, marketId, marketName) {
        const { marketId: resolvedMarketId } = this._resolveMarket(marketId, marketName);

        if (address === undefined) {
            address = this.snx.address;
        }

        const synthContract = this._getSynthContract(resolvedMarketId);
        return synthContract.methods.allowance(address, targetAddress).call()
            .then(allowance => weiToEther(allowance));
    }

    getSettlementStrategy(settlementStrategyId, marketId, marketName) {
        const { marketId: resolvedMarketId, marketName: resolvedMarketName } = this._resolveMarket(marketId, marketName);

        const settlementStrategy = this.market_proxy.methods.getSettlementStrategy(resolvedMarketId, settlementStrategyId).call();
        return settlementStrategy;
    }

    getOrder(asyncOrderId, marketId, marketName, fetchSettlementStrategy) {
        const { marketId: resolvedMarketId } = this._resolveMarket(marketId, marketName);

        const marketContract = this.market_proxy;
        const order = marketContract.methods.getAsyncOrderClaim(resolvedMarketId, asyncOrderId).call();
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
            const settlementStrategy = this.getSettlementStrategy(settlementStrategyId, resolvedMarketId);
            orderData.settlementStrategy = settlementStrategy;
        }

        return orderData;
    }

    // Transactions
    approve(targetAddress, amount, marketId, marketName, submit) {
        const { marketId: resolvedMarketId } = this._resolveMarket(marketId, marketName);

        amount = amount === undefined ? Math.pow(2, 256) - 1 : etherToWei(amount);
        const synthContract = this._getSynthContract(resolvedMarketId);

        const txData = synthContract.methods.approve(targetAddress, amount).encodeABI();

        const txParams = this.snx._getTxParams();
        synthContract.methods.approve(targetAddress, amount).buildTransaction(txParams);

        if (submit) {
            const txHash = this.snx.executeTransaction(txParams);
            this.logger.info(`Approving ${targetAddress} to spend ${amount / 1e18} ${marketName}`);
            this.logger.info(`approve tx: ${txHash}`);
            return txHash;
        } else {
            return txParams;
        }
    }

    commitOrder(side, size, settlementStrategyId = 2, marketId, marketName, submit) {
        const { marketId: resolvedMarketId, marketName: resolvedMarketName } = this._resolveMarket(marketId, marketName);

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

        const txParams = writeErc7412(this.snx, this.market_proxy, 'commitOrder', txArgs);

        if (submit) {
            const txHash = this.snx.executeTransaction(txParams);
            this.logger.info(`Committing ${side} order of size ${sizeWei} (${size}) to ${resolvedMarketName} (id: ${resolvedMarketId})`);
            this.logger.info(`commitOrder tx: ${txHash}`);
            return txHash;
        } else {
            return txParams;
        }
    }

    async settlePythOrder(asyncOrderId, marketId, marketName, maxRetry = 10, retryDelay = 2, submit) {
        const { marketId: resolvedMarketId, marketName: resolvedMarketName } = this._resolveMarket(marketId, marketName);

        const order = this.getOrder(asyncOrderId, resolvedMarketId);
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
        const settlementTimeHex = this.snx.web3.utils.toHex(BigInt(order.settlement_time));

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
        const extraData = this.snx.web3.utils.toHex(Buffer.concat([marketBytes, orderIdBytes]));

        // Log the data
        this.logger.info(`priceUpdateData: ${priceUpdateData}`);
        this.logger.info(`extraData: ${extraData}`);

        // Prepare the transaction
        const txParams = writeErc7412(this.snx, this.market_proxy, 'settlePythOrder', [priceUpdateData, extraData], { value: 1 });

        if (submit) {
            this.logger.info(`tx params: ${JSON.stringify(txParams)}`);
            const txHash = this.snx.executeTransaction(txParams);
            this.logger.info(`Settling order ${order.id}`);
            this.logger.info(`settle tx: ${txHash}`);
            return txHash;
        } else {
            return txParams;
        }
    }
    

    
}











// Usage
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