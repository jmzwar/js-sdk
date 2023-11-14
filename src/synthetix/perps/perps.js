const axios = require('axios');
const Web3 = require('web3');
const { decodeHex } = require('eth-abi');

const { etherToWei, weiToEther } = require('../utils');
const { callErc7412, multicallErc7412, writeErc7412, makeFulfillmentRequest } = require('../utils/multicall');
const { COLLATERALS_BY_ID, COLLATERALS_BY_NAME, PERPS_MARKETS_BY_ID, PERPS_MARKETS_BY_NAME } = require('./constants');

class Perps {
    // Class for interacting with Synthetix Perps V3 contracts. Provides methods for
    // creating and managing accounts, depositing and withdrawing collateral,
    // committing and settling orders, and liquidating accounts.

    // Use ``get_`` methods to fetch information about accounts, markets, and orders::
    
    //     markets = snx.perps.get_markets()
    //     open_positions = snx.perps.get_open_positions()
    
    // Other methods prepare transactions, and submit them to your RPC::
    
    //     create_tx_hash = snx.perps.create_account(submit=True)
    //     collateral_tx_hash = snx.perps.modify_collateral(amount=1000, market_name='sUSD', submit=True)
    //     order_tx_hash = snx.perps.commit_order(size=10, market_name='ETH', desired_fill_price=2000, submit=True)
    
    // :param Synthetix snx: An instance of the Synthetix class.
    // :param Pyth pyth: An instance of the Pyth class.
    // :param int | None default_account_id: The default ``account_id`` to use for transactions.
    
    // :return: An instance of the Perps class.
    // :rtype: Perps
    constructor(snx, pyth, defaultAccountId = null) {
        this.snx = snx;
        this.pyth = pyth;
        this.logger = snx.logger;

        this.erc7412Enabled = snx.contracts['ERC7412'] ? true : false;

        if (snx.contracts['PerpsMarketProxy']) {
            const marketProxyAddress = snx.contracts['PerpsMarketProxy']['address'];
            const marketProxyAbi = snx.contracts['PerpsMarketProxy']['abi'];

            const accountProxyAddress = snx.contracts['PerpsAccountProxy']['address'];
            const accountProxyAbi = snx.contracts['PerpsAccountProxy']['abi'];

            this.marketProxy = new snx.web3.eth.Contract(marketProxyAbi, marketProxyAddress);
            this.accountProxy = new snx.web3.eth.Contract(accountProxyAbi, accountProxyAddress);

            try {
                this.getAccountIds();
            } catch (e) {
                this.accountIds = [];
                this.logger.warning(`Failed to fetch perps accounts: ${e}`);
            }

            try {
                this.getMarkets();
            } catch (e) {
                this.logger.warning(`Failed to fetch markets: ${e}`);
            }

            this.defaultAccountId = defaultAccountId || (this.accountIds.length > 0 ? this.accountIds[0] : null);
        }
    }

    // internals
    _resolveMarket(marketId, marketName, collateral = false) 
    // Look up the market_id and market_name for a market. If only one is provided,
    // the other is resolved. If both are provided, they are checked for consistency.
    
    // :param int | None market_id: The id of the market. If not known, provide `None`.
    // :param str | None market_name: The name of the market. If not known, provide `None`.
    // :param bool collateral: If ``True``, resolve the market as a collateral type from the spot markets. Otherwise, resolve a perps market.
    
    // :return: The ``market_id`` and ``market_name`` for the market.
    // :rtype: (int, str)
    {
        if (!marketId && !marketName) {
            throw new Error("Must provide a marketId or marketName");
        }

        const ID_LOOKUP = collateral ? COLLATERALS_BY_ID[this.snx.networkId] : PERPS_MARKETS_BY_ID[this.snx.networkId];
        const NAME_LOOKUP = collateral ? COLLATERALS_BY_NAME[this.snx.networkId] : PERPS_MARKETS_BY_NAME[this.snx.networkId];

        const hasMarketId = marketId !== null;
        const hasMarketName = marketName !== null;

        if (!hasMarketId && hasMarketName) {
            if (!NAME_LOOKUP[marketName]) {
                throw new Error("Invalid marketName");
            }
            marketId = NAME_LOOKUP[marketName];
        } else if (hasMarketId && !hasMarketName) {
            if (!ID_LOOKUP[marketId]) {
                throw new Error("Invalid marketId");
            }
            marketName = ID_LOOKUP[marketId];
        } else if (hasMarketId && hasMarketName) {
            const marketNameLookup = ID_LOOKUP[marketId];
            if (marketName !== marketNameLookup) {
                throw new Error(`Market name ${marketName} does not match market id ${marketId}`);
            }
        }
        return { marketId, marketName };
    }

    _prepareOracleCall(marketNames = []) 
    // Prepare a call to the external node with oracle updates for the specified market names.
    //     The result can be passed as the first argument to a multicall function to improve performance
    //     of ERC-7412 calls. If no market names are provided, all markets are fetched. This is useful for
    //     read functions since the user does not pay gas for those oracle calls, and reduces RPC calls and
    //     runtime.
        
    //     :param [str] market_names: A list of market names to fetch prices for. If not provided, all markets are fetched.
    //     :return: The address of the oracle contract, the value to send, and the encoded transaction data.
    //     :rtype: (str, int, str)
    {
        if (marketNames.length === 0) {
            marketNames = Object.keys(PERPS_MARKETS_BY_NAME[this.snx.networkId]);
        }

        const feedIds = marketNames.map(marketName => this.snx.pyth.priceFeedIds[marketName]);
        const priceUpdateData = this.snx.pyth.getFeedsData(feedIds);

        const rawFeedIds = feedIds.map(feedId => decodeHex(feedId));
        const args = [1, 30, rawFeedIds];

        const { to, data, value } = makeFulfillmentRequest(this.snx, this.snx.contracts['ERC7412']['address'], priceUpdateData, args);

        return { to, value, data };
    }

    // read
    // TODO: getMarketSettings
    // TODO: getOrderFees
    getMarkets()
    // Fetch the ids and summaries for all perps markets. Market summaries include
    //     information about the market's price, open interest, funding rate,
    //     and skew::
        
    //         markets_by_name = {
    //             'ETH': {
    //                 'market_id': 100,
    //                 'market_name': 'ETH',
    //                 'skew': -15,
    //                 'size': 100,
    //                 'max_open_interest': 10000,
    //                 'current_funding_rate': 0.000182,
    //                 'current_funding_velocity': 0.00002765,
    //                 'index_price': 1852.59
    //             }
    //             'BTC': {
    //                 ...
    //             }
    //         }

    //     :return: Market summaries keyed by `market_id` and `market_name`.
    //     :rtype: (dict, dict)
    {
        const marketIds = this.marketProxy.methods.getMarkets().call();
        const marketSummaries = this.getMarketSummaries(marketIds);

        this.marketsById = marketSummaries.reduce((acc, summary) => {
            acc[summary.marketId] = summary;
            return acc;
        }, {});

        this.marketsByName = marketSummaries.reduce((acc, summary) => {
            acc[summary.marketName] = summary;
            return acc;
        }, {});

        return { marketsById: this.marketsById, marketsByName: this.marketsByName };
    }

    getOrder(accountId = null, fetchSettlementStrategy = true)
    // Fetches the open order for an account.
    //     Optionally fetches the settlement strategy, which can be useful for order settlement and debugging. 
        
    //     :param int | None account_id: The id of the account. If not provided, the default account is used.
    //     :param bool | None fetch_settlement_strategy: If ``True``, fetch the settlement strategy information.
    //     :return: A dictionary with order information.
    //     :rtype: dict
    {
        if (!accountId) {
            accountId = this.defaultAccountId;
        }

        const order = callErc7412(this.snx, this.marketProxy, 'getOrder', [accountId]);
        const [settlementTime, request] = order;
        const [marketId, accountIdResult, sizeDelta, settlementStrategyId, acceptablePrice, trackingCode, referrer] = request;

        const orderData = {
            settlementTime,
            marketId,
            accountId: accountIdResult,
            sizeDelta: weiToEther(sizeDelta),
            settlementStrategyId,
            acceptablePrice: weiToEther(acceptablePrice),
            trackingCode,
            referrer,
        };

        if (fetchSettlementStrategy) {
            const settlementStrategy = this.getSettlementStrategy(settlementStrategyId, { marketId });
            orderData.settlementStrategy = settlementStrategy;
        }

        return orderData;
    }

}

    
    
}
