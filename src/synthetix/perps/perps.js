const axios = require('axios');
const { decodeHex } = require('eth-utils');
const { encode } = require('eth-abi');
const { etherToWei, weiToEther } = require('../utils');
const { callERC7412, multicallERC7412, writeERC7412, makeFulfillmentRequest } = require('../utils/multicall');
const { COLLATERALS_BY_ID, COLLATERALS_BY_NAME, PERPS_MARKETS_BY_ID, PERPS_MARKETS_BY_NAME } = require('./constants');


class Perps {
    /**
     * Class for interacting with Synthetix Perps V3 contracts. Provides methods for
     * creating and managing accounts, depositing and withdrawing collateral,
     * committing and settling orders, and liquidating accounts.
     *
     * Use `get_` methods to fetch information about accounts, markets, and orders::
     * 
     *   const markets = snx.perps.getMarkets();
     *   const openPositions = snx.perps.getOpenPositions();
     * 
     * Other methods prepare transactions and submit them to your RPC::
     * 
     *   const createTxHash = snx.perps.createAccount({ submit: true });
     *   const collateralTxHash = snx.perps.modifyCollateral({ amount: 1000, marketName: 'sUSD', submit: true });
     *   const orderTxHash = snx.perps.commitOrder({ size: 10, marketName: 'ETH', desiredFillPrice: 2000, submit: true });
     *
     * @param {Synthetix} snx - An instance of the Synthetix class.
     * @param {Pyth} pyth - An instance of the Pyth class.
     * @param {number|null} defaultAccountId - The default `accountId` to use for transactions.
     */
    // TODO: implement asyncio
    // TODO: add waiting for transaction receipt

    constructor(snx, pyth, defaultAccountId = null) {
        this.snx = snx;
        this.pyth = pyth;
        this.logger = snx.logger;

        this.erc7412Enabled = 'ERC7412' in snx.contracts;

        // Check if perps is deployed on this network
        if ('PerpsMarketProxy' in snx.contracts) {
            const marketProxyAddress = snx.contracts['PerpsMarketProxy']['address'];
            const marketProxyAbi = snx.contracts['PerpsMarketProxy']['abi'];
            const accountProxyAddress = snx.contracts['PerpsAccountProxy']['address'];
            const accountProxyAbi = snx.contracts['PerpsAccountProxy']['abi'];

            this.marketProxy = new snx.web3.eth.Contract(marketProxyAbi, marketProxyAddress);
            this.accountProxy = new snx.web3.eth.Contract(accountProxyAbi, accountProxyAddress);

            try {
                this.getAccountIds();
            } catch (error) {
                this.accountIds = [];
                this.logger.warning(`Failed to fetch perps accounts: ${error}`);
            }

            try {
                this.getMarkets();
            } catch (error) {
                this.logger.warning(`Failed to fetch markets: ${error}`);
            }

            this.defaultAccountId = defaultAccountId || (this.accountIds.length > 0 ? this.accountIds[0] : null);
        }
    }

    // Internals
    _resolveMarket(marketId, marketName, collateral = false) {
        // Look up the market_id and market_name for a market. If only one is provided,
        // the other is resolved. If both are provided, they are checked for consistency.
        
        // :param int | None market_id: The id of the market. If not known, provide `None`.
        // :param str | None market_name: The name of the market. If not known, provide `None`.
        // :param bool collateral: If ``True``, resolve the market as a collateral type from the spot markets. Otherwise, resolve a perps market.
        
        // :return: The ``market_id`` and ``market_name`` for the market.
        // :rtype: (int, str)
        const ID_LOOKUP = collateral ? COLLATERALS_BY_ID[this.snx.networkId] : PERPS_MARKETS_BY_ID[this.snx.networkId];
        const NAME_LOOKUP = collateral ? COLLATERALS_BY_NAME[this.snx.networkId] : PERPS_MARKETS_BY_NAME[this.snx.networkId];

        if (marketId === null && marketName === null) {
            throw new Error("Must provide a marketId or marketName");
        }

        const hasMarketId = marketId !== null;
        const hasMarketName = marketName !== null;

        if (!hasMarketId && hasMarketName) {
            if (!(marketName in NAME_LOOKUP)) {
                throw new Error("Invalid marketName");
            }
            marketId = NAME_LOOKUP[marketName];
        } else if (hasMarketId && !hasMarketName) {
            if (!(marketId in ID_LOOKUP)) {
                throw new Error("Invalid marketId");
            }
            marketName = ID_LOOKUP[marketId];
        } else if (hasMarketId && hasMarketName) {
            const marketNameLookup = ID_LOOKUP[marketId];
            if (marketName !== marketNameLookup) {
                throw new Error(`Market name ${marketName} does not match market id ${marketId}`);
            }
        }

        return [marketId, marketName];
    }

    _prepareOracleCall(marketNames = []) {
        // Prepare a call to the external node with oracle updates for the specified market names.
        // The result can be passed as the first argument to a multicall function to improve performance
        // of ERC-7412 calls. If no market names are provided, all markets are fetched. This is useful for
        // read functions since the user does not pay gas for those oracle calls, and reduces RPC calls and
        // runtime.
        
        // :param [str] market_names: A list of market names to fetch prices for. If not provided, all markets are fetched.
        // :return: The address of the oracle contract, the value to send, and the encoded transaction data.
        // :rtype: (str, int, str)
        if (marketNames.length === 0) {
            marketNames = Object.keys(PERPS_MARKETS_BY_NAME[this.snx.networkId]);
        }

        const feedIds = marketNames.map((marketName) => this.snx.pyth.priceFeedIds[marketName]);
        const priceUpdateData = this.snx.pyth.getFeedsData(feedIds);

        const rawFeedIds = feedIds.map(decodeHex);
        const args = [1, 30, rawFeedIds];

        const { to, data } = makeFulfillmentRequest(this.snx, this.snx.contracts['ERC7412']['address'], priceUpdateData, args);
        const value = marketNames.length;

        return { to, value, data };
    }

    getMarkets() {
        // Fetch the ids and summaries for all perps markets. Market summaries include
        // information about the market's price, open interest, funding rate,
        // and skew::
        
        //     markets_by_name = {
        //         'ETH': {
        //             'market_id': 100,
        //             'market_name': 'ETH',
        //             'skew': -15,
        //             'size': 100,
        //             'max_open_interest': 10000,
        //             'current_funding_rate': 0.000182,
        //             'current_funding_velocity': 0.00002765,
        //             'index_price': 1852.59
        //         }
        //         'BTC': {
        //             ...
        //         }
        //     }

        // :return: Market summaries keyed by `market_id` and `market_name`.
        // :rtype: (dict, dict)
        const marketIds = this.marketProxy.methods.getMarkets().call();
        const marketSummaries = this.getMarketSummaries(marketIds);

        const marketsById = marketSummaries.reduce((result, summary) => {
            result[summary.market_id] = summary;
            return result;
        }, {});

        const marketsByName = marketSummaries.reduce((result, summary) => {
            result[summary.market_name] = summary;
            return result;
        }, {});

        this.marketsById = marketsById;
        this.marketsByName = marketsByName;

        return [marketsById, marketsByName];
    }

    getOrder(accountId = null, fetchSettlementStrategy = true) {
        // Fetches the open order for an account.
        // Optionally fetches the settlement strategy, which can be useful for order settlement and debugging. 
        
        // :param int | None account_id: The id of the account. If not provided, the default account is used.
        // :param bool | None fetch_settlement_strategy: If ``True``, fetch the settlement strategy information.
        // :return: A dictionary with order information.
        // :rtype: dict
        if (!accountId) {
            accountId = this.defaultAccountId;
        }

        const order = callERC7412(this.snx, this.marketProxy, 'getOrder', [accountId]);
        const [settlementTime, request] = order;
        const [marketId, accountIdOrder, sizeDelta, settlementStrategyId, acceptablePrice, trackingCode, referrer] = request;

        const orderData = {
            settlementTime,
            marketId,
            accountId: accountIdOrder,
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

    getMarketSummaries(marketIds = []) {
        // Fetch the market summaries for a list of ``market_id``.
        
        // :param [int] market_ids: A list of market ids to fetch.
        // :return: A list of market summaries in the order of the input ``market_ids``.
        // :rtype: [dict]
        if (this.erc7412Enabled) {
            const oracleCall = this._prepareOracleCall();
            const calls = [oracleCall];
        } else {
            const calls = [];
        }

        const inputs = marketIds.map(marketId => [marketId]);
        const markets = multicallERC7412(this.snx, this.marketProxy, 'getMarketSummary', inputs, { calls });

        if (marketIds.length !== markets.length) {
            this.logger.warning("Failed to fetch some market summaries");
        }

        const marketSummaries = markets.map((market, ind) => {
            const [skew, size, maxOpenInterest, currentFundingRate, currentFundingVelocity, indexPrice] = market;
            const marketId = marketIds[ind];
            const [resolvedMarketId, marketName] = this._resolveMarket(marketId, null);

            return {
                marketId: resolvedMarketId,
                marketName,
                skew: weiToEther(skew),
                size: weiToEther(size),
                maxOpenInterest: weiToEther(maxOpenInterest),
                currentFundingRate: weiToEther(currentFundingRate),
                currentFundingVelocity: weiToEther(currentFundingVelocity),
                indexPrice: weiToEther(indexPrice)
            };
        });

        return marketSummaries;
    }

    getMarketSummary(marketId = null, marketName = null) {
        // Fetch the market summary for a single market, including
        // information about the market's price, open interest, funding rate,
        // and skew. Provide either the `market_id` or `market_name`.
        
        // :param int | None market_id: A market id to fetch the summary for.
        // :param str | None market_name: A market name to fetch the summary for.
        // :return: A dictionary with the market summary.
        // :rtype: dict
        [marketId, marketName] = this._resolveMarket(marketId, marketName);

        if (this.erc7412Enabled) {
            const oracleCall = this._prepareOracleCall([marketName]);
            const calls = [oracleCall];
        } else {
            const calls = [];
        }

        const [skew, size, maxOpenInterest, currentFundingRate, currentFundingVelocity, indexPrice] = callERC7412(
            this.snx, this.marketProxy, 'getMarketSummary', marketId, { calls });

        return {
            marketId,
            marketName,
            skew: weiToEther(skew),
            size: weiToEther(size),
            maxOpenInterest: weiToEther(maxOpenInterest),
            currentFundingRate: weiToEther(currentFundingRate),
            currentFundingVelocity: weiToEther(currentFundingVelocity),
            indexPrice: weiToEther(indexPrice)
        };
    }

    getSettlementStrategy(settlementStrategyId, { marketId = null, marketName = null } = {}) {
        // Fetch the settlement strategy for a market. Settlement strategies describe the
        // conditions under which an order can be settled. Provide either a ``market_id``
        // or ``market_name``.
        
        // :param int settlement_strategy_id: The id of the settlement strategy to fetch.
        // :param int | None market_id: The id of the market to fetch the settlement strategy for.
        // :param str | None market_name: The name of the market to fetch the settlement strategy for.
        // :return: A dictionary with the settlement strategy information.
        // :rtype: dict
        [marketId, marketName] = this._resolveMarket(marketId, marketName);

        const [
            strategyType,
            settlementDelay,
            settlementWindowDuration,
            priceWindowDuration,
            priceVerificationContract,
            feedId,
            url,
            settlementReward,
            disabled
        ] = callERC7412(
            this.snx, this.marketProxy, 'getSettlementStrategy', [marketId, settlementStrategyId]);

        return {
            strategyType,
            settlementDelay,
            settlementWindowDuration,
            priceWindowDuration,
            priceVerificationContract,
            feedId,
            url,
            settlementReward: weiToEther(settlementReward),
            disabled,
        };
    }

    getAccountIds(address = null) {
        // """
        // Fetch a list of perps ``account_id`` owned by an address. Perps accounts
        // are minted as an NFT to the owner's address. The ``account_id`` is the
        // token id of the NFTs held by the address.
        
        // :param str | None address: The address to fetch the account ids for. If not provided, the default address is used.
        // :return: A list of account ids.
        // :rtype: [int]
        // """
        if (!address) {
            address = this.snx.address;
        }

        const balance = this.accountProxy.methods.balanceOf(address).call();

        const inputs = Array.from({ length: balance }, (_, i) => [address, i]);

        const accountIds = multicallERC7412(this.snx, this.accountProxy, 'tokenOfOwnerByIndex', inputs);

        this.accountIds = accountIds;
        if (accountIds.length > 0) {
            this.defaultAccountId = accountIds[0];
        }

        return accountIds;
    }

    getMarginInfo(accountId = null) {
        // Fetch information about an account's margin requirements and balances.
        // Accounts must maintain an ``available_margin`` above the ``maintenance_margin_requirement``
        // to avoid liquidation. Accounts with ``available_margin`` below the ``initial_margin_requirement``
        // can not interact with their position unless they deposit more collateral.
        
        // :param int | None account_id: The id of the account to fetch the margin info for. If not provided, the default account is used.
        // :return: A dictionary with the margin information.
        // :rtype: dict
        // """
        if (!accountId) {
            accountId = this.defaultAccountId;
        }

        if (this.erc7412Enabled) {
            const oracleCall = this._prepareOracleCall();
            const calls = [oracleCall];
        } else {
            const calls = [];
        }

        const totalCollateralValue = callERC7412(
            this.snx, this.marketProxy, 'totalCollateralValue', [accountId], { calls });
        const availableMargin = callERC7412(
            this.snx, this.marketProxy, 'getAvailableMargin', [accountId], { calls });
        const withdrawableMargin = callERC7412(
            this.snx, this.marketProxy, 'getWithdrawableMargin', [accountId], { calls });
        const [
            initialMarginRequirement,
            maintenanceMarginRequirement,
            totalAccumulatedLiquidationRewards,
            maxLiquidationReward
        ] = callERC7412(
            this.snx, this.marketProxy, 'getRequiredMargins', [accountId], { calls });

        return {
            totalCollateralValue: weiToEther(totalCollateralValue),
            availableMargin: weiToEther(availableMargin),
            withdrawableMargin: weiToEther(withdrawableMargin),
            initialMarginRequirement: weiToEther(initialMarginRequirement),
            maintenanceMarginRequirement: weiToEther(maintenanceMarginRequirement),
            totalAccumulatedLiquidationRewards: weiToEther(totalAccumulatedLiquidationRewards),
            maxLiquidationReward: weiToEther(maxLiquidationReward),
        };
    }

    getCollateralBalances(accountId = null) {
        // Fetch the balance of each collateral type for an account.
        
        // :param int | None account_id: The id of the account to fetch the collateral balances for. If not provided, the default account is used.
        // :return: A dictionary with the collateral balances.
        // :rtype: dict
        if (!accountId) {
            accountId = this.defaultAccountId;
        }

        const inputs = Object.keys(COLLATERALS_BY_ID[this.snx.networkId]).map(marketId => [accountId, marketId]);

        const balances = multicallERC7412(
            this.snx, this.marketProxy, 'getCollateralAmount', inputs);

        const collateralBalances = balances.reduce((result, balance, ind) => {
            const marketId = inputs[ind][1];
            result[COLLATERALS_BY_ID[this.snx.networkId][marketId]] = weiToEther(balance);
            return result;
        }, {});

        return collateralBalances;
    }

    getCanLiquidate(accountId = null) {
        // Check if an ``account_id`` is eligible for liquidation.
        
        // :param int | None account_id: The id of the account to check. If not provided, the default account is used.
        // :return: A boolean indicating if the account is eligible for liquidation.
        // :rtype: bool
        if (!accountId) {
            accountId = this.defaultAccountId;
        }

        if (this.erc7412Enabled) {
            const oracleCall = this._prepareOracleCall();
            const calls = [oracleCall];
        } else {
            const calls = [];
        }

        const canLiquidate = callERC7412(
            this.snx, this.marketProxy, 'canLiquidate', [accountId], { calls });

        return canLiquidate;
    }

    getCanLiquidates(accountIds = [null]) {
        // Check if a batch of ``account_id`` are eligible for liquidation.
        
        // :param [int] account_ids: A list of account ids to check.
        // :return: A list of tuples containing the ``account_id`` and a boolean indicating if the account is eligible for liquidation.
        // :rtype: [(int, bool)]
        accountIds = accountIds.map(accountId => [accountId]);

        if (this.erc7412Enabled) {
            const oracleCall = this._prepareOracleCall();
            const calls = [oracleCall];
        } else {
            const calls = [];
        }

        const canLiquidates = multicallERC7412(
            this.snx, this.marketProxy, 'canLiquidate', accountIds, { calls });

        const result = canLiquidates.map((canLiquidate, ind) => [accountIds[ind][0], canLiquidate]);

        return result;
    }

    getOpenPosition(marketId = null, marketName = null, accountId = null) {
        // Fetch the position for a specified account and market. The result includes the unrealized
        // pnl since the last interaction with this position, any accrued funding, and the position size.
        // Provide either a ``market_id`` or a ``market_name``::
        
        //     open_position = {
        //         'pnl': 86.56,
        //         'accrued_funding': -10.50,
        //         'position_size': 10.0,
        //     }
        
        // :param int | None market_id: The id of the market to fetch the position for.
        // :param str | None market_name: The name of the market to fetch the position for.
        // :param int | None account_id: The id of the account to fetch the position for. If not provided, the default account is used.
        // :return: A dictionary with the position information.
        // :rtype: dict
        [marketId, marketName] = this._resolveMarket(marketId, marketName);

        if (!accountId) {
            accountId = this.defaultAccountId;
        }

        if (this.erc7412Enabled) {
            const oracleCall = this._prepareOracleCall([marketName]);
            const calls = [oracleCall];
        } else {
            const calls = [];
        }

        const [pnl, accruedFunding, positionSize] = callERC7412(
            this.snx, this.marketProxy, 'getOpenPosition', [accountId, marketId], { calls });

        return {
            pnl: weiToEther(pnl),
            accruedFunding: weiToEther(accruedFunding),
            positionSize: weiToEther(positionSize),
        };
    }

    getOpenPositions(marketNames = null, marketIds = null, accountId = null) {
        // Get the open positions for a list of markets.
        // Provide either a list of ``market_name`` or ``market_id``::
        
        //     open_positions = {
        //         'ETH': {
        //             'market_id': 100,
        //             'market_name': 'ETH',
        //             'pnl': 86.56,
        //             'accrued_funding': -10.50,
        //             'position_size': 10.0,
        //         },
        //         'BTC': {
        //             ...
        //         }
        //     }
        
        // :param [str] | None market_names: A list of market names to fetch the positions for.
        // :param [int] | None market_ids: A list of market ids to fetch the positions for.
        // :param int | None account_id: The id of the account to fetch the positions for. If not provided, the default account is used.
        // :return: A dictionary with the position information keyed by ``market_name``.
        // :rtype: dict        
        if (!accountId) {
            accountId = this.defaultAccountId;
        }

        // If no market names or ids are provided, fetch all markets
        if (!marketNames && !marketIds) {
            marketIds = Object.keys(this.marketsById);
            marketNames = Object.keys(this.marketsByName);
        } else if (marketNames && !marketIds) {
            marketIds = marketNames.map(marketName => this._resolveMarket(null, marketName)[0]);
        }

        const cleanInputs = marketIds.map(marketId => [accountId, marketId]);

        if (this.erc7412Enabled) {
            const oracleCall = this._prepareOracleCall(marketNames);
            const calls = [oracleCall];
        } else {
            const calls = [];
        }

        const openPositions = multicallERC7412(
            this.snx, this.marketProxy, 'getOpenPosition', cleanInputs, { calls });

        const result = openPositions.reduce((positions, [pnl, accruedFunding, positionSize], ind) => {
            const marketName = marketNames[ind];
            const marketId = marketIds[ind];

            if (Math.abs(positionSize) > 0) {
                positions[marketName] = {
                    marketId,
                    marketName,
                    pnl: weiToEther(pnl),
                    accruedFunding: weiToEther(accruedFunding),
                    positionSize: weiToEther(positionSize),
                };
            }

            return positions;
        }, {});

        return result;
    }

    createAccount(accountId = null, submit = false) {
        //  Create a perps account. An account NFT is minted to the sender, who
        // owns the account.

        // :param int | None account_id: Specify the id of the account. If the id already exists,
        // :param boolean submit: If ``True``, submit the transaction to the blockchain.

        // :return: If `submit`, returns the trasaction hash. Otherwise, returns the transaction.
        // :rtype: str | dict
        if (!accountId) {
            var txArgs = [];
        } else {
            var txArgs = [accountId];
        }

        const marketProxy = this.marketProxy;
        let txParams = this.snx.getTxParams();
        txParams = marketProxy.methods.createAccount(...txArgs).encodeABI(txParams);

        if (submit) {
            const txHash = this.snx.executeTransaction(txParams);
            this.logger.info(`Creating account for ${this.snx.address}`);
            this.logger.info(`createAccount tx: ${txHash}`);
            return txHash;
        } else {
            return txParams;
        }
    }

    async modifyCollateral(amount, { marketId, marketName, accountId = null, submit = false }) {
        // Move collateral in or out of a specified perps account. The ``market_id``
        // or ``market_name`` must be provided to specify the collateral type. 
        // Provide either a ``market_id`` or a ``market_name``.  Note that the ``market_id``
        // here refers to the spot market id, not the perps market id. Make sure to approve
        // the market proxy to transfer tokens of the collateral type before calling this function.
        
        // :param int amount: The amount of collateral to move. Positive values deposit collateral, negative values withdraw collateral.
        // :param int | None market_id: The id of the market to move collateral for.
        // :param str | None market_name: The name of the market to move collateral for.
        // :param int | None account_id: The id of the account to move collateral for. If not provided, the default account is used.
        // :param bool submit: If ``True``, submit the transaction to the blockchain.
        // :return: If ``submit``, returns the trasaction hash. Otherwise, returns the transaction.
        // :rtype: str | dict
        const [resolvedMarketId, resolvedMarketName] = this._resolveMarket(marketId, marketName, true);
    
        if (!accountId) {
            accountId = this.defaultAccountId;
        }
    
        // TODO: check approvals
        const marketProxy = this.marketProxy;
        const txData = marketProxy.methods.modifyCollateral(accountId, resolvedMarketId, etherToWei(amount)).encodeABI();
    
        const txParams = writeERC7412(this.snx, this.marketProxy, 'modifyCollateral', [accountId, resolvedMarketId, etherToWei(amount)]);
    
        if (submit) {
            const txHash = await this.snx.executeTransaction(txParams);
            this.logger.info(`Transferring ${amount} ${resolvedMarketName} for account ${accountId}`);
            this.logger.info(`modify_collateral tx: ${txHash}`);
            return txHash;
        } else {
            return txParams;
        }
    }
    
    async commitOrder(size, { settlementStrategyId = 1, marketId, marketName, accountId = null, desiredFillPrice = null, maxPriceImpact = null, submit = false }) {
        // Submit an order to the specified market. Keepers will attempt to fill the order 
        // according to the settlement strategy. If ``desired_fill_price`` is provided, the order
        // will be filled at that price or better. If ``max_price_impact`` is provided, the 
        // ``desired_fill_price`` is calculated from the current market price and the price impact.
        
        // :param int size: The size of the order to submit.
        // :param int settlement_strategy_id: The id of the settlement strategy to use.
        // :param int | None market_id: The id of the market to submit the order to. If not provided, `market_name` must be provided.
        // :param str | None market_name: The name of the market to submit the order to. If not provided, `market_id` must be provided.
        // :param int | None account_id: The id of the account to submit the order for. Defaults to `default_account_id`.
        // :param float | None desired_fill_price: The max price for longs and minimum price for shorts. If not provided, one will be calculated based on `max_price_impact`.
        // :param float | None max_price_impact: The maximum price impact to allow when filling the order as a percentage (1.0 = 1%). If not provided, it will inherit the default value from `snx.max_price_impact`.
        // :param bool submit: If ``True``, submit the transaction to the blockchain.

        // :return: If `submit`, returns the trasaction hash. Otherwise, returns the transaction.
        const [resolvedMarketId, resolvedMarketName] = this._resolveMarket(marketId, marketName);
    
        // Set acceptable price
        if (desiredFillPrice !== null && maxPriceImpact !== null) {
            throw new Error("Cannot set both desiredFillPrice and maxPriceImpact");
        }
    
        const isShort = size < 0 ? -1 : 1;
        const sizeWei = etherToWei(Math.abs(size)) * isShort;
    
        let acceptablePrice;
        if (desiredFillPrice !== null) {
            acceptablePrice = desiredFillPrice;
        } else {
            // Fetch market summary to get index price
            const marketSummary = await this.getMarketSummary(resolvedMarketId);
    
            if (maxPriceImpact === null) {
                maxPriceImpact = this.snx.maxPriceImpact;
            }
    
            const priceImpact = 1 + isShort * (maxPriceImpact / 100);
            // TODO: Check that this price is skew-adjusted
            acceptablePrice = marketSummary.indexPrice * priceImpact;
        }
    
        if (!accountId) {
            accountId = this.defaultAccountId;
        }
    
        // Prepare the transaction
        const txArgs = {
            marketId: resolvedMarketId,
            accountId,
            sizeDelta: sizeWei,
            settlementStrategyId,
            acceptablePrice: etherToWei(acceptablePrice),
            trackingCode: this.snx.trackingCode,
            referrer: this.snx.referrer,
        };
    
        const txParams = writeERC7412(this.snx, this.marketProxy, 'commitOrder', [txArgs]);
    
        if (submit) {
            const txHash = await this.snx.executeTransaction(txParams);
            this.logger.info(`Committing order size ${sizeWei} (${size}) to ${resolvedMarketName} (id: ${resolvedMarketId}) for account ${accountId}`);
            this.logger.info(`commit_order tx: ${txHash}`);
            return txHash;
        } else {
            return txParams;
        }
    }

    async liquidate({ accountId = null, submit = false, static = false }) {
        // Submit a liquidation for an account, or static call the liquidation function to fetch
        // the liquidation reward. The static call is important for accounts which have been
        // partially liquidated. Due to the throughput limit on liquidated value, the static call
        // returning a nonzero value means more value can be liquidated (and rewards collected).
        // This function can not be called if ``submit`` and ``static`` are true.
        
        // :param int | None account_id: The id of the account to liquidate. If not provided, the default account is used.
        // :param bool submit: If ``True``, submit the transaction to the blockchain.
        // :param bool static: If ``True``, static call the liquidation function to fetch the liquidation reward.
        // :return: If ``submit``, returns the trasaction hash. If ``static``, returns the liquidation reward. Otherwise, returns the transaction.
        // :rtype: str | dict | float
        if (!accountId) {
            accountId = this.defaultAccountId;
        }
    
        if (submit && static) {
            throw new Error("Cannot submit and use static in the same transaction");
        }
    
        const marketProxy = this.marketProxy;
        if (static) {
            const liquidationReward = await callERC7412(this.snx, marketProxy, 'liquidate', [accountId]);
            return weiToEther(liquidationReward);
        } else {
            const txParams = writeERC7412(this.snx, marketProxy, 'liquidate', [accountId]);
    
            if (submit) {
                const txHash = await this.snx.executeTransaction(txParams);
                this.logger.info(`Liquidating account ${accountId}`);
                this.logger.info(`liquidate tx: ${txHash}`);
                return txHash;
            } else {
                return txParams;
            }
        }
    }

    async settlePythOrder(accountId = null, maxPythTries = 10, pythDelay = 2000, submit = false, maxTxTries = 3, txDelay = 2000) {
        // Settles an order by fetching data from the Pyth price feed and submitting a transaction.
        // If the order is not yet ready to be settled, this function will wait until the settlement time.
        // If the Pyth data is not available, this function will retry until the max number of tries is reached
        // with a configurable delay. If the transaction fails, this function will retry until the max number
        // of tries is reached with a configurable delay.
        
        // :param int | None account_id: The id of the account to settle. If not provided, the default account is used.
        // :param int max_pyth_tries: The max number of tries to fetch the Pyth data.
        // :param int pyth_delay: The delay in seconds between Pyth data fetches.
        // :param bool submit: If ``True``, submit the transaction to the blockchain.
        // :param int max_tx_tries: The max number of tries to submit the transaction.
        // :param int tx_delay: The delay in seconds between transaction submissions.
        if (!accountId) {
            accountId = this.defaultAccountId;
        }

        const order = await this.getOrder(accountId);
        const settlementStrategy = order.settlement_strategy;

        console.log(`settlement time: ${order.settlement_time}`);
        console.log(`current time: ${Date.now() / 1000}`);
        if (order.settlement_time > Date.now() / 1000) {
            const duration = order.settlement_time - Date.now() / 1000;
            console.log(`Waiting ${duration} seconds until order can be settled`);
            await sleep(duration * 1000);
        } else {
            console.log('Order is ready to be settled');
        }

        const feedIdHex = settlementStrategy.feed_id.toString('hex');
        const settlementTimeHex = '0x' + Buffer.from([Math.floor(order.settlement_time / 256), order.settlement_time % 256]).toString('hex').slice(2);

        const dataParam = `0x${feedIdHex}${settlementTimeHex.slice(2)}`;

        const url = settlementStrategy.url.replace('{data}', dataParam);

        let pythTries = 0;
        let priceUpdateData = null;
        while (!priceUpdateData && pythTries < maxPythTries) {
            try {
                const response = await axios.get(url);
                if (response.status === 200) {
                    priceUpdateData = response.data.data;
                } else {
                    pythTries++;
                    if (pythTries > maxPythTries) {
                        throw new Error("Price update data not available");
                    } else {
                        console.log("Price update data not available, waiting 2 seconds and retrying");
                        await sleep(pythDelay);
                    }
                }
            } catch (error) {
                pythTries++;
                if (pythTries > maxPythTries) {
                    throw new Error("Price update data not available");
                } else {
                    console.log("Price update data not available, waiting 2 seconds and retrying");
                    await sleep(pythDelay);
                }
            }
        }

        const accountBytes = Buffer.alloc(32);
        accountBytes.writeBigInt64BE(BigInt(accountId));
        const marketBytes = Buffer.alloc(32);
        marketBytes.writeBigInt64BE(BigInt(order.market_id));

        const extraData = '0x' + Buffer.concat([accountBytes, marketBytes]).toString('hex');

        console.log(`priceUpdateData: ${priceUpdateData}`);
        console.log(`extraData: ${extraData}`);

        const marketName = this._resolveMarket(order.market_id, null)[1];
        let calls = [];
        if (this.erc7412Enabled) {
            const oracleCall = this._prepareOracleCall([marketName]);
            calls = [oracleCall];
        }

        let txTries = 0;
        while (txTries < maxTxTries) {
            const txParams = this.writeErc7412(this.snx, this.marketProxy, 'settlePythOrder', [priceUpdateData, extraData], { value: 1 }, calls);

            if (submit) {
                console.log(`tx params: ${JSON.stringify(txParams)}`);

                const txHash = await this.snx.executeTransaction(txParams);
                console.log(`Settling order for account ${accountId}`);
                console.log(`settle tx: ${txHash}`);

                const receipt = await this.snx.wait(txHash);
                console.log(`settle receipt: ${JSON.stringify(receipt)}`);

                const updatedOrder = await this.getOrder(accountId);
                if (updatedOrder.size_delta === 0) {
                    console.log(`Order settlement successful for account ${accountId}`);
                    return txHash;
                }

                txTries++;
                if (txTries > maxTxTries) {
                    throw new Error("Failed to settle order");
                } else {
                    console.log("Failed to settle order, waiting 2 seconds and retrying");
                    await sleep(txDelay);
                }
            } else {
                return txParams;
            }
        }
    }

    
    }
    

module.exports = Perps;
