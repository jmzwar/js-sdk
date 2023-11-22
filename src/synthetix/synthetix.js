const web3 = require('web3')

const loadContracts = require('./contracts').loadContracts;
const Pyth = require('./pyth');
const Core = require('./core');
const Perps = require('./perps');
const Spot = require('./spot');
// const Alerts = require('./alerts');
const Queries = require('./queries');

const DEFAULT_NETWORK_ID = constants.DEFAULT_NETWORK_ID;
const DEFAULT_TRACKING_CODE = constants.DEFAULT_TRACKING_CODE;
const DEFAULT_SLIPPAGE = constants.DEFAULT_SLIPPAGE;
const DEFAULT_GQL_ENDPOINT_PERPS = constants.DEFAULT_GQL_ENDPOINT_PERPS;
const DEFAULT_GQL_ENDPOINT_RATES = constants.DEFAULT_GQL_ENDPOINT_RATES;
const DEFAULT_PRICE_SERVICE_ENDPOINTS = constants.DEFAULT_PRICE_SERVICE_ENDPOINTS;
const DEFAULT_REFERRER = constants.DEFAULT_REFERRER;
class Synthetix {
    // The main class for interacting with the Synthetix protocol. The class
    // requires a provider RPC endpoint and a wallet address::
        
    //         snx = Synthetix(
    //             provider_rpc='https://optimism-mainnet.infura.io/v3/...',
    //             network_id=10,
    //             address='0x12345...'
    //         )
    
    // The class can be initialized with a private key to allow for transactions
    // to be sent::
            
    //             snx = Synthetix(
    //                 provider_rpc='https://optimism-mainnet.infura.io/v3/...',
    //                 network_id=10,
    //                 address='0x12345...',
    //                 private_key='0xabcde...'
    //             )

    // :param str provider_rpc: An RPC endpoint to use for the provider.
    // :param str address: Wallet address to use as a default. If a private key is
    //     specified, this address will be used to sign transactions.
    // :param str private_key: Private key of the provided wallet address. If specified,
    //     the wallet will be enabled to sign and submit transactions.
    // :param int network_id: Network ID for the chain to connect to. This must match 
    //     the chain ID of the RPC endpoint.
    // :param int core_account_id: A default ``account_id`` for core transactions.
    //     Setting a default will avoid the need to specify on each transaction. If
    //     not specified, the first ``account_id`` will be used.
    // :param int perps_account_id: A default ``account_id`` for perps transactions.
    //     Setting a default will avoid the need to specify on each transaction. If 
    //     not specified, the first ``account_id`` will be used.
    // :param str tracking_code: Set a tracking code for trades.
    // :param str referrer: Set a referrer address for trades.
    // :param float max_price_impact: Max price impact setting for trades,
    //     specified as a percentage. This setting applies to both spot and
    //     perps markets.
    // :param bool use_estimate_gas: Use estimate gas for transactions. If false,
    //     it is assumed you will add a gas limit to all transactions.
    // :param str gql_endpoint_perps: GraphQL endpoint for perps data.
    // :param str satsuma_api_key: API key for Satsuma. If the endpoint is from
    //     Satsuma, the API key will be automatically added to the request.
    // :param str price_service_endpoint: Endpoint for a Pyth price service. If
    //     not specified, a default endpoint is used.
    // :return: Synthetix class instance
    // :rtype: Synthetix
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
        if (providerRpc.startsWith('http')) {
            this.providerClass = Web3.providers.HttpProvider;
        } else if (providerRpc.startsWith('wss')) {
            this.providerClass = Web3.providers.WebsocketProvider;
        } else {
            throw new Error("RPC endpoint is invalid");
        }

        // set up the web3 instance
        this.web3 = new Web3(new this.providerClass(this.providerRpc));

        // check if the chain_id matches
        if (this.web3.eth.chainId !== this.networkId) {
            throw new Error("The RPC `chain_id` must match the stored `network_id`");
        } else {
            this.nonce = this.web3.eth.getTransactionCount(this.address);
        }

        // init contracts
        this.contracts = loadContracts(this.networkId);
        [this.v2Markets, this.susdLegacyToken, this.susdToken, this.multicall] = this._loadContracts();

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
        this.perps = new Perps(this, this.pyth, perpsAccountId);
        this.spot = new Spot(this, this.pyth);
    }

    _loadContracts() {
        // Initializes and sets up contracts according to the connected chain.
        // On calling this function, the following contracts are connected and set up:
        // * ``PerpsV2MarketData``
        // * ``PerpsV2MarketProxy`` (for each V2 market)
        // * ``sUSD`` contracts for both V3 and legacy sUSD.
        // * ``TrustedMulticallForwarder`` (if available)
        
        // These are stored as methods on the base Synthetix object::
        
        //     >>> snx.susd_token.address
        //     0x...
        
        // :return: web3 contracts
        // :rtype: [contract, contract, contract, contract]
        const w3 = this.web3;
    
        let markets = {};
        if ('PerpsV2MarketData' in this.contracts) {
            const dataDefinition = this.contracts['PerpsV2MarketData'];
            const dataAddress = w3.utils.toChecksumAddress(dataDefinition['address']);
            const dataAbi = dataDefinition['abi'];
    
            const marketDataContract = new w3.eth.Contract(dataAbi, dataAddress);
    
            try {
                const allMarketsData = marketDataContract.methods.allProxiedMarketSummaries().call();
                allMarketsData.forEach(market => {
                    markets[market[2].toString('utf-8').replace(/\0/g, '').slice(1, -4)] = {
                        marketAddress: market[0],
                        asset: market[1].toString('utf-8').replace(/\0/g, ''),
                        key: market[2],
                        maxLeverage: w3.utils.fromWei(market[3], 'ether'),
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
            } catch (error) {
                console.error(error);
            }
        }
    
        // load sUSD legacy contract
        let susdLegacyToken = null;
        if ('sUSD' in this.contracts) {
            const susdLegacyDefinition = this.contracts['sUSD'];
            const susdLegacyAddress = w3.utils.toChecksumAddress(susdLegacyDefinition['address']);
            const susdLegacyAbi = susdLegacyDefinition['abi'];
    
            susdLegacyToken = new w3.eth.Contract(susdLegacyAbi, susdLegacyAddress);
        }
    
        // load sUSD contract
        let susdToken = null;
        if ('USDProxy' in this.contracts) {
            const susdDefinition = this.contracts['USDProxy'];
            const susdAddress = w3.utils.toChecksumAddress(susdDefinition['address']);
            const susdAbi = susdDefinition['abi'];
    
            susdToken = new w3.eth.Contract(susdAbi, susdAddress);
        }
    
        // load multicall contract
        let multicall = null;
        if ('TrustedMulticallForwarder' in this.contracts) {
            const mcDefinition = this.contracts['TrustedMulticallForwarder'];
            const mcAddress = w3.utils.toChecksumAddress(mcDefinition['address']);
            const mcAbi = mcDefinition['abi'];
    
            multicall = new w3.eth.Contract(mcAbi, mcAddress);
        }
    
        return [markets, susdLegacyToken, susdToken, multicall];
    }
    
    _getTxParams(value = 0, to = null) {
        // A helper function to prepare transaction parameters. This function
        // will set up the transaction based on the parameters at initialization,
        // but leave the ``data`` parameter empty.
        
        // :param int value: value to send with transaction
        // :param str | None to: address to send transaction to
        // :return: A prepared transaction without the ``data`` parameter
        // :rtype: TxParams
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
        // Wait for a transaction to be confirmed and return the receipt.
        // The function will throw an error if the timeout is exceeded.
        // Use this as a helper function to wait for a transaction to be confirmed,
        // then check the results and react accordingly.

        // :param str tx_hash: transaction hash to wait for
        // :param int timeout: timeout in seconds
        // :return: A transaction receipt
        // :rtype: dict
        try {
            const receipt = await this.web3.eth.waitForTransactionReceipt(txHash, timeout * 1000);
            return receipt;
        } catch (error) {
            console.error(error);
            throw new Error(`Transaction receipt not received within the specified timeout.`);
        }
    }
    
    async executeTransaction(txData) {
        // Execute a provided transaction. This function will be signed with the provided
        // private key and submitted to the connected RPC. The ``Synthetix`` object tracks
        // the nonce internally, and will handle estimating gas limits if they are not
        // provided.
        
        // :param dict tx_data: transaction data
        // :return: A transaction hash
        // :rtype: str

        if (!this.privateKey) {
            throw new Error("No private key specified.");
        }
    
        try {
            if (!("gas" in txData)) {
                if (this.useEstimateGas) {
                    txData["gas"] = Math.ceil((await this.web3.eth.estimateGas(txData)) * 1.2);
                } else {
                    txData["gas"] = 1500000;
                }
            }
    
            const signedTxn = await this.web3.eth.accounts.signTransaction(txData, this.privateKey);
            const txReceipt = await this.web3.eth.sendSignedTransaction(signedTxn.rawTransaction);
    
            // increase nonce
            this.nonce += 1;
    
            return txReceipt.transactionHash;
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
    
        const balance = await token.methods.balanceOf(address).call();
        return { balance: this.web3.utils.fromWei(balance, 'ether') };
    }
    
    async getEthBalance(address) {
        // Gets current ETH and WETH balances at the specified address.
        
        // :param str address: address to check balances for
        // :return: A dictionary with the ETH and WETH balances
        // :rtype: dict
        if (!address) {
            address = this.address;
        }
    
        const wethContract = new this.web3.eth.Contract(
            this.contracts['WETH']['abi'],
            this.contracts['WETH']['address']
        );
    
        const ethBalance = await this.web3.eth.getBalance(address);
        const wethBalance = await wethContract.methods.balanceOf(address).call();
    
        return { eth: this.web3.utils.fromWei(ethBalance, 'ether'), weth: this.web3.utils.fromWei(wethBalance, 'ether') };
    }

    async approve(tokenAddress, targetAddress, amount = null, submit = false) {
        // Approve an address to spend a specified ERC20 token. This is a general
        // implementation that can be used for any ERC20 token. Specify the amount
        // as an ether value, otherwise it will default to the maximum amount::
        
        //     snx.approve(
        //         snx.susd_token.address,
        //         snx.perps.market_proxy.address,
        //         amount=1000
        //     )
        
        // :param str token_address: address of the token to approve
        // :param str target_address: address to approve to spend the token
        // :param float amount: amount of the token to approve
        // :param bool submit: submit the transaction
        // :return: If ``submit``, returns a transaction hash. Otherwise, returns
        //     the transaction parameters.
        // :rtype: str | dict
        // Fix the amount
        amount = amount === null ? '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' : this.web3.utils.toWei(amount.toString(), 'ether');
    
        const tokenContract = new this.web3.eth.Contract(
            this.contracts['USDProxy']['abi'],
            tokenAddress
        );
    
        const txParams = this._getTxParams();
        const approveData = tokenContract.methods.approve(targetAddress, amount).encodeABI();
    
        const txData = {
            ...txParams,
            to: tokenAddress,
            data: approveData
        };
    
        if (submit) {
            const txHash = await this.executeTransaction(txData);
            this.logger.info(`Approving ${targetAddress} to spend ${this.web3.utils.fromWei(amount, 'ether')} ${tokenAddress} for ${this.address}`);
            this.logger.info(`approve tx: ${txHash}`);
            return txHash;
        } else {
            return txData;
        }
    }
    
    async wrapEth(amount, submit = false) {
        // Wraps or unwaps ETH to/from the WETH implementation stored in the constants file.
        // Negative numbers will unwrap ETH, positive numbers will wrap ETH::
            
        //         snx.wrap_eth(1)
        //         snx.wrap_eth(-1)
        
        // :param float amount: amount of ETH to wrap
        // :param bool submit: submit the transaction
        // :return: If ``submit``, returns a transaction hash. Otherwise, returns
        //     the transaction parameters.
        // :rtype: str | dict
        const valueWei = this.web3.utils.toWei(Math.max(amount, 0).toString(), 'ether');
        const wethContract = new this.web3.eth.Contract(
            this.contracts['WETH']['abi'],
            this.contracts['WETH']['address']
        );
    
        let fnName, txArgs;
        if (amount < 0) {
            fnName = 'withdraw';
            txArgs = [this.web3.utils.toWei(Math.abs(amount).toString(), 'ether')];
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
            data: wethContract.methods[fnName](...txArgs).encodeABI()
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

module.exports = Synthetix;
