import { ethers } from 'ethers';
import { etherToWei, weiToEther } from '../utils/wei.js';
import util from 'util';

import {
  callErc7412,
  multicallErc7412,
  writeErc7412,
  makeFulfillmentRequest,
} from '../utils/multicall.js';
import {
  COLLATERALS_BY_ID,
  COLLATERALS_BY_NAME,
  PERPS_MARKETS_BY_ID,
  PERPS_MARKETS_BY_NAME,
} from './constants.js';


class Perps {
    /**
     * Class for interacting with Synthetix Perps V3 contracts.
     * Provides methods for creating and managing accounts, depositing and withdrawing collateral,
     * committing and settling orders, and liquidating accounts.
     *
     * Use `get_` methods to fetch information about accounts, markets, and orders::
     *
     *     const markets = snx.perps.getMarkets();
     *     const openPositions = snx.perps.getOpenPositions();
     *
     * Other methods prepare transactions and submit them to your RPC::
     *
     *     const createTxHash = snx.perps.createAccount({ submit: true });
     *     const collateralTxHash = snx.perps.modifyCollateral({ amount: 1000, marketName: 'sUSD', submit: true });
     *     const orderTxHash = snx.perps.commitOrder({ size: 10, marketName: 'ETH', desiredFillPrice: 2000, submit: true });
     *
     * @param {Object} snx - An instance of the Synthetix class.
     * @param {Object} pyth - An instance of the Pyth class.
     * @param {number|null} defaultAccountId - The default `accountId` to use for transactions.
     *
     * @return {Perps} An instance of the Perps class.
     */
    constructor(snx, pyth, defaultAccountId = null) {
      if (!snx || !snx.provider || !snx.contracts) {
        throw new Error(`Invalid or missing snx, provider, or contracts. snx: ${util.inspect(snx, { showHidden: false, depth: 5 })}`);

    }
  
      this.snx = snx;
      this.pyth = pyth;
      this.logger = snx.logger;

      if (!('contracts' in snx)) {
        throw new Error(`'contracts' not found in snx object. snx: ${util.inspect(snx, { showHidden: false, depth: null })}`);
    }
  
      this.erc7412Enabled = snx.contracts ? 'ERC7412' in snx.contracts : false;
  
      // check if perps is deployed on this network
      if (!('PerpsMarketProxy' in snx.contracts)) {
        throw new Error(`'PerpsMarketProxy' not found in snx.contracts. contracts: ${util.inspect(snx.contracts, { showHidden: false, depth: null })}`);
    }

    try {
      const marketProxyAddress = snx.contracts['PerpsMarketProxy']['address'];
      const marketProxyAbi = snx.contracts['PerpsMarketProxy']['abi'];
      const accountProxyAddress = snx.contracts['PerpsAccountProxy']['address'];
      const accountProxyAbi = snx.contracts['PerpsAccountProxy']['abi'];

      this.marketProxy = new ethers.Contract(marketProxyAddress, marketProxyAbi, snx.provider);
      this.accountProxy = new ethers.Contract(accountProxyAddress, accountProxyAbi, snx.provider);

      this.getAccountIds();
      this.getMarkets();
  } catch (error) {
      this.logger.error(`Error during initialization: ${error}`);
  }

  this.defaultAccountId = defaultAccountId !== null ? defaultAccountId : (this.accountIds.length > 0 ? this.accountIds[0] : null);
  }
  

    // internals
    _resolveMarket(marketId, marketName, collateral = false) {
      if (marketId === null && marketName === null) {
          throw new Error("Must provide a marketId or marketName");
      }
  
      const ID_LOOKUP = collateral ? COLLATERALS_BY_ID[this.snx.networkId] : PERPS_MARKETS_BY_ID[this.snx.networkId];
      const NAME_LOOKUP = collateral ? COLLATERALS_BY_NAME[this.snx.networkId] : PERPS_MARKETS_BY_NAME[this.snx.networkId];
  
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
    if (marketNames.length === 0) {
        marketNames = Object.keys(PERPS_MARKETS_BY_NAME[this.snx.networkId]);
    }

    const feedIds = marketNames.map(marketName => this.snx.pyth.priceFeedIds[marketName]);
    const priceUpdateData = this.snx.pyth.getFeedsData(feedIds);

    const rawFeedIds = feedIds.map(feedId => ethers.utils.arrayify(ethers.utils.hexlify(feedId)));
    const args = [1, 30, rawFeedIds];

    const { to, data } = makeFulfillmentRequest(this.snx, this.snx.contracts['ERC7412'].address, priceUpdateData, args);
    const value = marketNames.length;

    return { to, value, data };
}

getMarkets() {
    const marketIds = this.marketProxy.functions.getMarkets();
    const marketSummaries = this.getMarketSummaries(marketIds);

    const marketsById = marketSummaries.reduce((acc, summary) => {
        acc[summary.market_id] = summary;
        return acc;
    }, {});

    const marketsByName = marketSummaries.reduce((acc, summary) => {
        acc[summary.market_name] = summary;
        return acc;
    }, {});

    this.marketsById = marketsById;
    this.marketsByName = marketsByName;

    return { marketsById, marketsByName };
}

getOrder(accountId = null, fetchSettlementStrategy = true) {
  if (!accountId) {
      accountId = this.defaultAccountId;
  }

  const order = callErc7412(this.snx, this.marketProxy, 'getOrder', [accountId]);
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
  // TODO: Fetch for market names
  // get fresh prices to provide to the oracle
  const oracleCall = this.erc7412Enabled ? this._prepareOracleCall() : null;
  const calls = oracleCall ? [oracleCall] : [];

  const inputs = marketIds.map(marketId => [marketId]);
  const markets = multicallErc7412(this.snx, this.marketProxy, 'getMarketSummary', inputs, { calls });

  if (marketIds.length !== markets.length) {
      this.logger.warning("Failed to fetch some market summaries");
  }

  const marketSummaries = markets.map((market, ind) => {
      const [skew, size, maxOpenInterest, currentFundingRate, currentFundingVelocity, indexPrice] = market;
      const marketId = marketIds[ind];
      const { marketId: resolvedMarketId, marketName } = this._resolveMarket(marketId, null);
      return {
          marketId: resolvedMarketId,
          marketName,
          skew: weiToEther(skew),
          size: weiToEther(size),
          maxOpenInterest: weiToEther(maxOpenInterest),
          currentFundingRate: weiToEther(currentFundingRate),
          currentFundingVelocity: weiToEther(currentFundingVelocity),
          indexPrice: weiToEther(indexPrice),
      };
  });

  return marketSummaries;
}

getMarketSummary(marketId = null, marketName = null) {
  const { marketId: resolvedMarketId, marketName: resolvedMarketName } = this._resolveMarket(marketId, marketName);

  // get a fresh price to provide to the oracle
  const oracleCall = this.erc7412Enabled ? this._prepareOracleCall([resolvedMarketName]) : null;
  const calls = oracleCall ? [oracleCall] : [];

  const [
      skew,
      size,
      maxOpenInterest,
      currentFundingRate,
      currentFundingVelocity,
      indexPrice
  ] = callErc7412(
      this.snx,
      this.marketProxy,
      'getMarketSummary',
      [resolvedMarketId],
      { calls }
  );

  return {
      marketId: resolvedMarketId,
      marketName: resolvedMarketName,
      skew: weiToEther(skew),
      size: weiToEther(size),
      maxOpenInterest: weiToEther(maxOpenInterest),
      currentFundingRate: weiToEther(currentFundingRate),
      currentFundingVelocity: weiToEther(currentFundingVelocity),
      indexPrice: weiToEther(indexPrice)
  };
}

getSettlementStrategy(settlementStrategyId, marketId = null, marketName = null) {
  const { marketId: resolvedMarketId, marketName: resolvedMarketName } = this._resolveMarket(marketId, marketName);

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
  ] = callErc7412(
      this.snx,
      this.marketProxy,
      'getSettlementStrategy',
      [resolvedMarketId, settlementStrategyId]
  );

  return {
      strategyType,
      settlementDelay,
      settlementWindowDuration,
      priceWindowDuration,
      priceVerificationContract,
      feedId,
      url,
      settlementReward: weiToEther(settlementReward),
      disabled
  };
}


getAccountIds(address = null) {
  if (!address) {
      address = this.snx.address;
  }

  const balance = this.accountProxy.functions.balanceOf(address).call();

  // multicall the account ids
  const inputs = Array.from({ length: balance }, (_, i) => [address, i]);

  const accountIds = multicallErc7412(this.snx, this.accountProxy, 'tokenOfOwnerByIndex', inputs);

  this.accountIds = accountIds;
  if (accountIds.length > 0) {
      this.defaultAccountId = accountIds[0];
  }
  return accountIds;
}

getMarginInfo(accountId = null) {
  if (!accountId) {
      accountId = this.defaultAccountId;
  }

  // get fresh prices to provide to the oracle
  const oracleCall = this.erc7412Enabled ? this._prepareOracleCall() : null;
  const calls = oracleCall ? [oracleCall] : [];

  // TODO: expand multicall capability to handle multiple functions
  const totalCollateralValue = callErc7412(this.snx, this.marketProxy, 'totalCollateralValue', [accountId], { calls });
  const availableMargin = callErc7412(this.snx, this.marketProxy, 'getAvailableMargin', [accountId], { calls });
  const withdrawableMargin = callErc7412(this.snx, this.marketProxy, 'getWithdrawableMargin', [accountId], { calls });
  const [
      initialMarginRequirement,
      maintenanceMarginRequirement,
      totalAccumulatedLiquidationRewards,
      maxLiquidationReward
  ] = callErc7412(
      this.snx,
      this.marketProxy,
      'getRequiredMargins',
      [accountId],
      { calls }
  );

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
  if (!accountId) {
      accountId = this.defaultAccountId;
  }

  const inputs = Object.values(COLLATERALS_BY_ID[this.snx.networkId]).map(marketId => [accountId, marketId]);

  // call for the balances
  const balances = multicallErc7412(this.snx, this.marketProxy, 'getCollateralAmount', inputs);

  // make a clean dictionary
  const collateralBalances = {};
  inputs.forEach((input, ind) => {
      collateralBalances[COLLATERALS_BY_ID[this.snx.networkId][input[1]]] = weiToEther(balances[ind]);
  });

  return collateralBalances;
}


getCanLiquidate(accountId = null) {
  if (!accountId) {
      accountId = this.defaultAccountId;
  }

  // get fresh prices to provide to the oracle
  const oracleCall = this.erc7412Enabled ? this._prepareOracleCall() : null;
  const calls = oracleCall ? [oracleCall] : [];

  const canLiquidate = callErc7412(
      this.snx, this.marketProxy, 'canLiquidate', [accountId], { calls });

  return canLiquidate;
}

getCanLiquidates(accountIds = [null]) {
  accountIds = accountIds.map(accountId => [accountId]);

  // get fresh prices to provide to the oracle
  const oracleCall = this.erc7412Enabled ? this._prepareOracleCall() : null;
  const calls = oracleCall ? [oracleCall] : [];

  const canLiquidates = multicallErc7412(
      this.snx, this.marketProxy, 'canLiquidate', accountIds, { calls });

  // combine the results with the account ids, return tuples like (accountId, canLiquidate)
  return canLiquidates.map((canLiquidate, ind) => [accountIds[ind][0], canLiquidate]);
}

getOpenPosition(marketId = null, marketName = null, accountId = null) {
  const [resolvedMarketId, resolvedMarketName] = this._resolveMarket(marketId, marketName);
  if (!accountId) {
      accountId = this.defaultAccountId;
  }

  // get a fresh price to provide to the oracle
  const oracleCall = this.erc7412Enabled ? this._prepareOracleCall([resolvedMarketName]) : null;
  const calls = oracleCall ? [oracleCall] : [];

  const [pnl, accruedFunding, positionSize] = callErc7412(
      this.snx, this.marketProxy, 'getOpenPosition', [accountId, resolvedMarketId], { calls });

  return {
      pnl: weiToEther(pnl),
      accruedFunding: weiToEther(accruedFunding),
      positionSize: weiToEther(positionSize),
  };
}

getOpenPositions(marketNames = null, marketIds = null, accountId = null) {
  if (!accountId) {
      accountId = this.defaultAccountId;
  }

  // if no market names or ids are provided, fetch all markets
  if (!marketNames && !marketIds) {
      marketIds = Object.keys(this.marketsById);
      marketNames = Object.keys(this.marketsByName);
  } else if (marketNames && !marketIds) {
      marketIds = marketNames.map(marketName => this._resolveMarket(null, marketName)[0]);
  }

  // make the function inputs
  const cleanInputs = marketIds.map(marketId => [accountId, marketId]);

  // get a fresh price to provide to the oracle
  const oracleCall = this.erc7412Enabled ? this._prepareOracleCall(marketNames) : null;
  const calls = oracleCall ? [oracleCall] : [];

  const openPositions = multicallErc7412(
      this.snx, this.marketProxy, 'getOpenPosition', cleanInputs, { calls });

  const filteredOpenPositions = {};
  openPositions.forEach(([pnl, accruedFunding, positionSize], ind) => {
      const marketName = marketNames[ind];
      const marketId = marketIds[ind];
      if (Math.abs(positionSize) > 0) {
          filteredOpenPositions[marketName] = {
              marketId,
              marketName,
              pnl: weiToEther(pnl),
              accruedFunding: weiToEther(accruedFunding),
              positionSize: weiToEther(positionSize),
          };
      }
  });

  return filteredOpenPositions;
}

createAccount(accountId = null, submit = false) {
  const txArgs = accountId ? [accountId] : [];
  const marketProxy = this.marketProxy;
  let txParams = this.snx._getTxParams();
  txParams = marketProxy.functions.createAccount(...txArgs).buildTransaction(txParams);

  if (submit) {
      const txHash = this.snx.executeTransaction(txParams);
      this.logger.info(`Creating account for ${this.snx.address}`);
      this.logger.info(`createAccount tx: ${txHash}`);
      return txHash;
  } else {
      return txParams;
  }
}

modifyCollateral(amount, marketId = null, marketName = null, accountId = null, submit = false) {
  const [resolvedMarketId, resolvedMarketName] = this._resolveMarket(marketId, marketName, true);
  if (!accountId) {
      accountId = this.defaultAccountId;
  }

  // TODO: check approvals
  const marketProxy = this.marketProxy;
  const txData = marketProxy.interface.encodeFunctionData(
      'modifyCollateral', [accountId, resolvedMarketId, etherToWei(amount)]
  );

  const txParams = writeErc7412(
      this.snx, this.marketProxy, 'modifyCollateral', [accountId, resolvedMarketId, etherToWei(amount)]
  );

  if (submit) {
      const txHash = this.snx.executeTransaction(txParams);
      this.logger.info(`Transferring ${amount} ${resolvedMarketName} for account ${accountId}`);
      this.logger.info(`modifyCollateral tx: ${txHash}`);
      return txHash;
  } else {
      return txParams;
  }
}
commitOrder(size, settlementStrategyId = 1, marketId = null, marketName = null, accountId = null, desiredFillPrice = null, maxPriceImpact = null, submit = false) {
  const [resolvedMarketId, resolvedMarketName] = this._resolveMarket(marketId, marketName);

  // set acceptable price
  if (desiredFillPrice && maxPriceImpact) {
      throw new Error("Cannot set both desiredFillPrice and maxPriceImpact");
  }

  const isShort = size < 0 ? -1 : 1;
  const sizeWei = etherToWei(Math.abs(size)) * isShort;

  let acceptablePrice;
  if (desiredFillPrice) {
      acceptablePrice = desiredFillPrice;
  } else {
      // fetch market summary to get index price
      const marketSummary = this.getMarketSummary(resolvedMarketId);

      if (!maxPriceImpact) {
          maxPriceImpact = this.snx.maxPriceImpact;
      }
      const priceImpact = 1 + isShort * maxPriceImpact / 100;
      // TODO: check that this price is skew-adjusted
      acceptablePrice = marketSummary.indexPrice * priceImpact;
  }

  if (!accountId) {
      accountId = this.defaultAccountId;
  }

  // prepare the transaction
  const txArgs = {
      marketId: resolvedMarketId,
      accountId: accountId,
      sizeDelta: sizeWei,
      settlementStrategyId: settlementStrategyId,
      acceptablePrice: etherToWei(acceptablePrice),
      trackingCode: this.snx.trackingCode,
      referrer: this.snx.referrer,
  };

  const txParams = writeErc7412(
      this.snx, this.marketProxy, 'commitOrder', [txArgs]
  );

  if (submit) {
      const txHash = this.snx.executeTransaction(txParams);
      this.logger.info(`Committing order size ${sizeWei} (${size}) to ${resolvedMarketName} (id: ${resolvedMarketId}) for account ${accountId}`);
      this.logger.info(`commitOrder tx: ${txHash}`);
      return txHash;
  } else {
      return txParams;
  }
}

liquidate(accountId = null, submit = false, isStatic = false) {
  if (!accountId) {
      accountId = this.defaultAccountId;
  }

  if (submit && isStatic) {
      throw new Error("Cannot submit and use static in the same transaction");
  }

  const marketProxy = this.marketProxy;
  if (isStatic) {
      const liquidationReward = callErc7412(
          this.snx, marketProxy, 'liquidate', [accountId]
      );

      return weiToEther(liquidationReward);
  } else {
      const txParams = writeErc7412(
          this.snx, marketProxy, 'liquidate', [accountId]
      );

      if (submit) {
          const txHash = this.snx.executeTransaction(txParams);
          this.logger.info(`Liquidating account ${accountId}`);
          this.logger.info(`liquidate tx: ${txHash}`);
          return txHash;
      } else {
          return txParams;
      }
  }
}

async settlePythOrder(accountId = null, maxPythTries = 10, pythDelay = 2, submit = false, maxTxTries = 3, txDelay = 2) {
  if (!accountId) {
      accountId = this.defaultAccountId;
  }

  const order = this.getOrder(accountId);
  const settlementStrategy = order.settlement_strategy;

  // check if the order is ready to be settled
  this.logger.info(`settlement time: ${order.settlement_time}`);
  this.logger.info(`current time: ${Math.floor(Date.now() / 1000)}`);
  if (order.settlement_time > Math.floor(Date.now() / 1000)) {
      const duration = order.settlement_time - Math.floor(Date.now() / 1000);
      this.logger.info(`Waiting ${duration} seconds until the order can be settled`);
      await this.sleep(duration * 1000);
  } else {
      // TODO: check if expired
      this.logger.info('Order is ready to be settled');
  }

  // create hex inputs
  const feedIdHex = settlementStrategy.feed_id.toHexString();
  const settlementTimeHex = this.snx.utils.hexlify(order.settlement_time);

  // Concatenate the hex strings with '0x' prefix
  const dataParam = `0x${feedIdHex}${settlementTimeHex.slice(2)}`;

  // query Pyth for the price update data
  const url = settlementStrategy.url.replace('{data}', dataParam);

  let pythTries = 0;
  let priceUpdateData = null;
  while (!priceUpdateData && pythTries < maxPythTries) {
      try {
          const response = await axios.get(url);

          if (response.status === 200) {
              priceUpdateData = response.data.data;
          }
      } catch (error) {
          this.logger.error(error.message);
      }

      pythTries++;
      if (!priceUpdateData && pythTries < maxPythTries) {
          this.logger.info(`Price update data not available, waiting ${pythDelay} seconds and retrying`);
          await this.sleep(pythDelay * 1000);
      }
  }

  // encode the extra data
  const accountBytes = this.snx.utils.hexlify(accountId);
  const marketBytes = this.snx.utils.hexlify(order.market_id);

  // Concatenate the bytes and convert to hex
  const extraData = this.snx.utils.hexlify(this.snx.utils.concat([accountBytes, marketBytes]));

  // log the data
  this.logger.info(`priceUpdateData: ${priceUpdateData}`);
  this.logger.info(`extraData: ${extraData}`);

  // get fresh prices to provide to the oracle
  const marketName = this._resolveMarket(order.market_id)[1];
  const oracleCall = this._prepareOracleCall([marketName]);
  const calls = [oracleCall];

  // prepare the transaction
  let txTries = 0;
  while (txTries < maxTxTries) {
      const txParams = this.writeErc7412(
          'settlePythOrder', [priceUpdateData, extraData], { value: 1 }, calls
      );

      if (submit) {
        this.logger.info(`tx params: ${util.inspect(txParams, { showHidden: false, depth: null })}`);

          try {
              const txHash = await this.snx.executeTransaction(txParams);
              this.logger.info(`Settling order for account ${accountId}`);
              this.logger.info(`settle tx: ${txHash}`);

              const receipt = await this.snx.wait(txHash);
              this.logger.info(`settle receipt: ${util.inspect(receipt, { showHidden: false, depth: null })}`);

              // check the order
              const updatedOrder = this.getOrder(accountId);
              if (updatedOrder.size_delta === 0) {
                  this.logger.info(`Order settlement successful for account ${accountId}`);
                  return txHash;
              }

              txTries++;
              if (txTries >= maxTxTries) {
                  throw new Error("Failed to settle order");
              } else {
                  this.logger.info("Failed to settle order, waiting 2 seconds and retrying");
                  await this.sleep(txDelay * 1000);
              }
          } catch (error) {
              this.logger.error(error.message);
              txTries++;
              if (txTries >= maxTxTries) {
                  throw new Error("Failed to settle order");
              } else {
                  this.logger.info("Failed to settle order, waiting 2 seconds and retrying");
                  await this.sleep(txDelay * 1000);
              }
          }
      } else {
          return txParams;
      }
  }
}



  
}

export default Perps;


