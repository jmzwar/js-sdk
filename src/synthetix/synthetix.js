import { ethers } from 'ethers';
import loadContracts  from '../synthetix/contracts/contracts.js';
import Pyth from './pyth/pyth.js';
import Core from './core/core.js';
import Perps from './perps/perps.js';
import Spot from './spot/spot.js';
import Queries from './queries/queries.js';


import { ADDRESS_ZERO, DEFAULT_NETWORK_ID, DEFAULT_TRACKING_CODE, DEFAULT_SLIPPAGE, DEFAULT_GQL_ENDPOINT_PERPS, DEFAULT_GQL_ENDPOINT_RATES, DEFAULT_PRICE_SERVICE_ENDPOINTS, DEFAULT_REFERRER } from './constants.js';

class Synthetix {

    constructor({
        providerRpc,
        address = ADDRESS_ZERO,
        privateKey = null,
        networkId = null,
        coreAccountId = null,
        perpsAccountId = null,
        trackingCode = null,
        referrer = null,
        maxPriceImpact = DEFAULT_SLIPPAGE,
        useEstimateGas = true,
        gqlEndpointPerps = null,
        gqlEndpointRates = null,
        satsumaApiKey = null,
        priceServiceEndpoint = null,
        telegramToken = null,
        telegramChannelName = null
    }) {
        // set up logging
        this.logger = console; // Use console for logging in Node.js
        console.log('Provider RPC:', providerRpc);

    
        // set default values
        this.networkId = networkId || DEFAULT_NETWORK_ID;
        this.trackingCode = trackingCode || DEFAULT_TRACKING_CODE;
        this.referrer = referrer || DEFAULT_REFERRER;
        this.maxPriceImpact = maxPriceImpact || DEFAULT_SLIPPAGE;
    
        // init account variables
        this.privateKey = privateKey;
        this.address = address;
        this.useEstimateGas = useEstimateGas;
        this.providerRpc = providerRpc;
    
        // init provider
        if (this.providerRpc && this.providerRpc.startsWith('https')) {
            this.provider = new ethers.providers.JsonRpcProvider(this.providerRpc);
        } else if (this.providerRpc && this.providerRpc.startsWith('wss')) {
            this.provider = new ethers.providers.WebSocketProvider(this.providerRpc);
        } else {
            throw new Error("RPC endpoint is invalid");
        }
        if (!this.provider) {
            throw new Error("Provider is not defined. Make sure to initialize it before calling _loadContracts.");
        }
        
    
        // check if the chain_id matches
        this.checkChainId();
        console.log('v2Markets during initialization:', this.v2Markets);
    
        // init contracts
        // try {
        //     this.contracts = loadContracts(this.networkId);
        //     [this.v2Markets, this.susdLegacyToken, this.susdToken, this.multicall] = this._loadContracts();
        // } catch (error) {
        //     console.error("Error loading contracts:", error);
        // }
            
        // init queries
        if (!gqlEndpointPerps && this.networkId in DEFAULT_GQL_ENDPOINT_PERPS) {
            gqlEndpointPerps = DEFAULT_GQL_ENDPOINT_PERPS[this.networkId];
        }
    
        if (!gqlEndpointRates && this.networkId in DEFAULT_GQL_ENDPOINT_RATES) {
            gqlEndpointRates = DEFAULT_GQL_ENDPOINT_RATES[this.networkId];
        }
    
        this.queries = new Queries(this, gqlEndpointPerps, gqlEndpointRates, satsumaApiKey);
    
        // init pyth
        if (!priceServiceEndpoint && this.networkId in DEFAULT_PRICE_SERVICE_ENDPOINTS) {
            priceServiceEndpoint = DEFAULT_PRICE_SERVICE_ENDPOINTS[this.networkId];
        }
    
        this.pyth = new Pyth(this, priceServiceEndpoint);
        this.core = new Core(this, this.pyth, coreAccountId);
        // this.perps = new Perps(this, this.pyth, perpsAccountId);
        // this.spot = new Spot(this, this.pyth);
    }
    
    async checkChainId() {
        const network = await this.provider.getNetwork();
        const chainId = network.chainId;
    
        if (chainId !== this.networkId) {
            throw new Error("The RPC `chain_id` must match the stored `network_id`");
        } else {
            this.nonce = await this.provider.getTransactionCount(this.address);
        }
    }
    

    async _loadContracts() {
        const eth = this.provider;
        console.log(eth);
    
        let markets = {};
    
        if ('PerpsV2MarketData' in this.contracts) {
            const dataDefinition = this.contracts['PerpsV2MarketData'];
            const dataAddress = ethers.utils.getAddress(dataDefinition['address']);
            const dataAbi = dataDefinition['abi'];
    
            const marketDataContract = new ethers.Contract(dataAddress, dataAbi, eth);
    
            try {
                const allMarketsData = await marketDataContract.allProxiedMarketSummaries();

                if (!Array.isArray(allMarketsData)) {
                    console.error('Unexpected data structure returned by marketDataContract.allProxiedMarketSummaries():', allMarketsData);
                    throw new Error("Invalid data structure returned by marketDataContract.allProxiedMarketSummaries()");
                }
                
                
    
                if (Array.isArray(allMarketsData)) {
                    allMarketsData.forEach(market => {
                        markets[market[2].toString('utf-8').replace(/\0/g, '').slice(1, -4)] = {
                            marketAddress: market[0],
                            asset: market[1].toString('utf-8').replace(/\0/g, ''),
                            key: market[2],
                            maxLeverage: ethers.utils.formatUnits(market[3], 'ether'),
                            price: market[4],
                            marketSize: market[5],
                            marketSkew: market[6],
                            marketDebt: market[7],
                            currentFundingRate: market[8],
                            currentFundingVelocity: market[9],
                            takerFee: market[10][0],
                            makerFee: market[10][1],
                            takerFeeDelayedOrder: market[10][2],
                            makerFeeDelayedOrder: market[10][3],
                            takerFeeOffchainDelayedOrder: market[10][4],
                            makerFeeOffchainDelayedOrder: market[10][5],
                            
                        };
                    });
                } else {
                    console.error('Unexpected data structure returned by marketDataContract.allProxiedMarketSummaries():', allMarketsData);
                }
            } catch (error) {
                console.error("Error loading contracts:", error);
                throw new Error("Failed to load contracts. See console for details.");
            }
        }

        // load sUSD legacy contract
        let susdLegacyToken = null;
        if ('sUSD' in this.contracts) {
            const susdLegacyDefinition = this.contracts['sUSD'];
            const susdLegacyAddress = ethers.utils.getAddress(susdLegacyDefinition['address']);
            const susdLegacyAbi = susdLegacyDefinition['abi'];

            susdLegacyToken = new ethers.Contract(susdLegacyAddress, susdLegacyAbi, eth);
        }

        // load sUSD contract
        let susdToken = null;
        if ('USDProxy' in this.contracts) {
            const susdDefinition = this.contracts['USDProxy'];
            const susdAddress = ethers.utils.getAddress(susdDefinition['address']);
            const susdAbi = susdDefinition['abi'];

            susdToken = new ethers.Contract(susdAddress, susdAbi, eth);
        }

        // load multicall contract
        let multicall = null;
        if ('TrustedMulticallForwarder' in this.contracts) {
            const mcDefinition = this.contracts['TrustedMulticallForwarder'];
            const mcAddress = eth.utils.getAddress(mcDefinition['address']);
            const mcAbi = mcDefinition['abi'];

            multicall = new ethers.Contract(mcAddress, mcAbi, eth);
        }

        return [markets, susdLegacyToken, susdToken, multicall];
    }

    _getTxParams(value = 0, to = null) {
        const params = {
            from: this.address,
            chainId: this.networkId,
            value: value,
            nonce: this.nonce
        };

        if (to !== null) {
            params.to = to;
        }

        return params;
    }

    async wait(txHash, timeout = 120) {
        try {
            const receipt = await this.provider.waitForTransaction(txHash, timeout * 1000);
            return receipt;
        } catch (error) {
            console.error(error);
            throw new Error(`Transaction receipt not received within the specified timeout.`);
        }
    }

    async executeTransaction(txData) {
        if (!this.privateKey) {
            throw new Error("No private key specified.");
        }

        try {
            if (!("gas" in txData)) {
                if (this.useEstimateGas) {
                    txData["gas"] = Math.ceil((await this.provider.estimateGas(txData)) * 1.2);
                } else {
                    txData["gas"] = 1500000;
                }
            }

            const wallet = new ethers.Wallet(this.privateKey, this.provider);
            const signedTxn = await wallet.signTransaction(txData);
            const txReceipt = await this.provider.sendTransaction(signedTxn);

            // increase nonce
            this.nonce += 1;

            return txReceipt.hash;
        } catch (error) {
            console.error(error);
            throw new Error("Error executing transaction.");
        }
    }

    async getSUSDBalance(address, legacy = false) {
        if (!address) {
            address = this.address;
        }

        const token = legacy ? this.susdLegacyToken : this.susdToken;

        const balance = await this.provider.getBalance(address);
        return { balance: ethers.utils.formatUnits(balance, 'ether') };
    }

    async getEthBalance(address) {
        if (!address) {
            address = this.address;
        }

        const wethContract = new ethers.Contract(
            this.contracts['WETH']['address'],
            this.contracts['WETH']['abi'],
            this.provider
        );

        const ethBalance = await this.provider.getBalance(address);
        const wethBalance = await wethContract.balanceOf(address);

        return { eth: ethers.utils.formatUnits(ethBalance, 'ether'), weth: ethers.utils.formatUnits(wethBalance, 'ether') };
    }

    async approve(tokenAddress, targetAddress, amount = null, submit = false) {
        amount = amount === null ? '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' : ethers.utils.parseUnits(amount.toString(), 'ether');

        const tokenContract = new ethers.Contract(
            tokenAddress,
            this.contracts['USDProxy']['abi'],
            this.provider
        );

        const txParams = this._getTxParams();
        const approveData = tokenContract.populateTransaction.approve(targetAddress, amount);

        const txData = {
            ...txParams,
            to: tokenAddress,
            data: approveData.data
        };

        if (submit) {
            const txHash = await this.executeTransaction(txData);
            this.logger.info(`Approving ${targetAddress} to spend ${ethers.utils.formatUnits(amount, 'ether')} ${tokenAddress} for ${this.address}`);
            this.logger.info(`approve tx: ${txHash}`);
            return txHash;
        } else {
            return txData;
        }
    }

    async wrapEth(amount, submit = false) {
        const valueWei = ethers.utils.parseUnits(Math.max(amount, 0).toString(), 'ether');
        const wethContract = new ethers.Contract(
            this.contracts['WETH']['address'],
            this.contracts['WETH']['abi'],
            this.provider
        );

        let fnName, txArgs;
        if (amount < 0) {
            fnName = 'withdraw';
            txArgs = [ethers.utils.parseUnits(Math.abs(amount).toString(), 'ether')];
        } else {
            fnName = 'deposit';
            txArgs = [];
        }

        const txParams = this._getTxParams({
            value: valueWei
        });

        const txData = {
            ...txParams,
            to: this.contracts['WETH']['address'],
            data: wethContract.interface.encodeFunctionData(fnName, txArgs)
        };

        if (submit) {
            const txHash = await this.executeTransaction(txData);
            this.logger.info(`Wrapping ${amount} ETH for ${this.address}`);
            this.logger.info(`wrap_eth tx: ${txHash}`);
            return txHash;
        } else {
            return txData;
        }
    }
}

export default Synthetix;
