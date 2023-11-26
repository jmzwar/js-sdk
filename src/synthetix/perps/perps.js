import hexConverter from 'hex-encode-decode';
import { ethers } from 'ethers';
import { etherToWei, weiToEther } from '../utils/wei.js';
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
  // TODO: implement asyncio
  // TODO: add waiting for transaction receipt

  constructor(snx, pyth, defaultAccountId = null) {
    this.snx = snx;
    this.pyth = pyth;
    this.logger = snx.logger;

    this.erc7412Enabled = 'ERC7412' in snx.contracts;

    // check if perps is deployed on this network
    if ('PerpsMarketProxy' in snx.contracts) {
      const marketProxyAddress = snx.contracts['PerpsMarketProxy']['address'];
      const marketProxyAbi = snx.contracts['PerpsMarketProxy']['abi'];
      const accountProxyAddress = snx.contracts['PerpsAccountProxy']['address'];
      const accountProxyAbi = snx.contracts['PerpsAccountProxy']['abi'];

      this.marketProxy = new ethers.Contract(marketProxyAddress, marketProxyAbi, snx.signer);
      this.accountProxy = new ethers.Contract(accountProxyAddress, accountProxyAbi, snx.signer);

      (async () => {
        try {
          await this.getAccountIds();
        } catch (e) {
          this.accountIds = [];
          this.logger.warning(`Failed to fetch perps accounts: ${e}`);
        }

        try {
          await this.getMarkets();
        } catch (e) {
          this.logger.warning(`Failed to fetch markets: ${e}`);
        }

        this.defaultAccountId =
          defaultAccountId || (this.accountIds.length > 0 ? this.accountIds[0] : null);
      })();
    }
  }

  // internals
  async _resolveMarket(marketId, marketName, collateral = false) {
    if (!marketId && !marketName) {
      throw new Error('Must provide a marketId or marketName');
    }

    const ID_LOOKUP = collateral
      ? COLLATERALS_BY_ID[this.snx.networkId]
      : PERPS_MARKETS_BY_ID[this.snx.networkId];
    const NAME_LOOKUP = collateral
      ? COLLATERALS_BY_NAME[this.snx.networkId]
      : PERPS_MARKETS_BY_NAME[this.snx.networkId];

    const hasMarketId = !!marketId;
    const hasMarketName = !!marketName;

    if (!hasMarketId && hasMarketName) {
      if (!NAME_LOOKUP[marketName]) {
        throw new Error('Invalid marketName');
      }
      marketId = NAME_LOOKUP[marketName];
    } else if (hasMarketId && !hasMarketName) {
      if (!ID_LOOKUP[marketId]) {
        throw new Error('Invalid marketId');
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

  async _prepareOracleCall(marketNames = []) {
    if (marketNames.length === 0) {
      marketNames = Object.keys(PERPS_MARKETS_BY_NAME[this.snx.networkId]);
    }

    const feedIds = marketNames.map((marketName) => this.snx.pyth.priceFeedIds[marketName]);
    const priceUpdateData = this.snx.pyth.getFeedsData(feedIds);

    const rawFeedIds = feedIds.map((feedId) => hexConverter.decode(feedId));
    const args = [1, 30, rawFeedIds];

    const [to, , data] = makeFulfillmentRequest(
      this.snx,
      this.snx.contracts.ERC7412.address,
      priceUpdateData,
      args
    );
    const value = marketNames.length;

    return { to, data, value };
  }

  async getMarkets() {
    const marketIds = await this.marketProxy.getMarkets();
    const marketSummaries = await this.getMarketSummaries(marketIds);

    const marketsById = marketSummaries.reduce((acc, summary) => {
      acc[summary.marketId] = summary;
      return acc;
    }, {});

    const marketsByName = marketSummaries.reduce((acc, summary) => {
      acc[summary.marketName] = summary;
      return acc;
    }, {});

    this.marketsById = marketsById;
    this.marketsByName = marketsByName;

    return { marketsById, marketsByName };
  }

  async getOrder(accountId = null, fetchSettlementStrategy = true) {
    if (!accountId) {
      accountId = this.defaultAccountId;
    }

    const order = await callErc7412(this.snx, this.marketProxy, 'getOrder', [accountId]);
    const [settlementTime, request] = order;
    const [marketId, , sizeDelta, settlementStrategyId, acceptablePrice, trackingCode, referrer] =
      request;

    const orderData = {
      settlementTime,
      marketId,
      accountId,
      sizeDelta: weiToEther(sizeDelta),
      settlementStrategyId,
      acceptablePrice: weiToEther(acceptablePrice),
      trackingCode,
      referrer,
    };

    if (fetchSettlementStrategy) {
      const settlementStrategy = await this.getSettlementStrategy(settlementStrategyId, {
        marketId,
      });
      orderData.settlementStrategy = settlementStrategy;
    }

    return orderData;
  }

  async getMarketSummaries(marketIds = []) {
    // TODO: Fetch for market names
    // get fresh prices to provide to the oracle
    const oracleCall = this.erc7412Enabled ? await this._prepareOracleCall() : null;
    const calls = oracleCall ? [oracleCall] : [];

    const inputs = marketIds.map((marketId) => [marketId]);
    const markets = await multicallErc7412(this.snx, this.marketProxy, 'getMarketSummary', inputs, {
      calls,
    });

    if (marketIds.length !== markets.length) {
      console.warning('Failed to fetch some market summaries');
    }

    const marketSummaries = markets.map((market, ind) => {
      const [skew, size, maxOpenInterest, currentFundingRate, currentFundingVelocity, indexPrice] =
        market;
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
        indexPrice: weiToEther(indexPrice),
      };
    });

    return marketSummaries;
  }

  async getMarketSummaries(marketIds = []) {
    // TODO: Fetch for market names
    // get fresh prices to provide to the oracle
    const oracleCall = this.erc7412Enabled ? await this._prepareOracleCall() : null;
    const calls = oracleCall ? [oracleCall] : [];

    const inputs = marketIds.map((marketId) => [marketId]);
    const markets = await multicallErc7412(this.snx, this.marketProxy, 'getMarketSummary', inputs, {
      calls,
    });

    if (marketIds.length !== markets.length) {
      console.warning('Failed to fetch some market summaries');
    }

    const marketSummaries = markets.map((market, ind) => {
      const [skew, size, maxOpenInterest, currentFundingRate, currentFundingVelocity, indexPrice] =
        market;
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
        indexPrice: weiToEther(indexPrice),
      };
    });

    return marketSummaries;
  }

  async getSettlementStrategy(settlementStrategyId, { marketId, marketName }) {
    const { marketId: resolvedMarketId, marketName: resolvedMarketName } = this._resolveMarket(
      marketId,
      marketName
    );

    const [
      strategyType,
      settlementDelay,
      settlementWindowDuration,
      priceWindowDuration,
      priceVerificationContract,
      feedId,
      url,
      settlementReward,
      disabled,
    ] = await callErc7412(this.snx, this.marketProxy, 'getSettlementStrategy', [
      resolvedMarketId,
      settlementStrategyId,
    ]);

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

  async getAccountIds(address = null) {
    if (!address) {
      address = this.snx.address;
    }

    const balance = await this.accountProxy.balanceOf(address).call();

    const inputs = [...Array(balance).keys()].map((i) => [address, i]);

    const accountIds = await multicallErc7412(
      this.snx,
      this.accountProxy,
      'tokenOfOwnerByIndex',
      inputs
    );

    this.accountIds = accountIds;
    if (accountIds.length > 0) {
      this.defaultAccountId = accountIds[0];
    }

    return accountIds;
  }

  async getMarginInfo(accountId = null) {
    if (!accountId) {
      accountId = this.defaultAccountId;
    }

    if (this.erc7412Enabled) {
      const oracleCall = await this._prepareOracleCall();
      const calls = [oracleCall];
    } else {
      const calls = [];
    }

    const totalCollateralValue = await callErc7412(
      this.snx,
      this.marketProxy,
      'totalCollateralValue',
      [accountId],
      { calls }
    );
    const availableMargin = await callErc7412(
      this.snx,
      this.marketProxy,
      'getAvailableMargin',
      [accountId],
      { calls }
    );
    const withdrawableMargin = await callErc7412(
      this.snx,
      this.marketProxy,
      'getWithdrawableMargin',
      [accountId],
      { calls }
    );
    const [
      initialMarginRequirement,
      maintenanceMarginRequirement,
      totalAccumulatedLiquidationRewards,
      maxLiquidationReward,
    ] = await callErc7412(this.snx, this.marketProxy, 'getRequiredMargins', [accountId], { calls });

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

  async getCollateralBalances(accountId = null) {
    if (!accountId) {
      accountId = this.defaultAccountId;
    }

    const inputs = COLLATERALS_BY_ID[this.snx.networkId].map((marketId) => [accountId, marketId]);

    const balances = await multicallErc7412(
      this.snx,
      this.marketProxy,
      'getCollateralAmount',
      inputs
    );

    const collateralBalances = balances.reduce((result, balance, ind) => {
      const marketId = COLLATERALS_BY_ID[this.snx.networkId][ind];
      result[marketId] = weiToEther(balance);
      return result;
    }, {});

    return collateralBalances;
  }

  async getCanLiquidate(accountId = null) {
    if (!accountId) {
      accountId = this.defaultAccountId;
    }

    if (this.erc7412Enabled) {
      const oracleCall = await this._prepareOracleCall();
      const calls = [oracleCall];
    } else {
      const calls = [];
    }

    const canLiquidate = await callErc7412(this.snx, this.marketProxy, 'canLiquidate', accountId, {
      calls,
    });

    return canLiquidate;
  }
  async getMarketSummaries(marketIds = []) {
    // TODO: Fetch for market names
    // get fresh prices to provide to the oracle
    const oracleCall = this.erc7412Enabled ? await this._prepareOracleCall() : null;
    const calls = oracleCall ? [oracleCall] : [];

    const inputs = marketIds.map((marketId) => [marketId]);
    const markets = await multicallErc7412(this.snx, this.marketProxy, 'getMarketSummary', inputs, {
      calls,
    });

    if (marketIds.length !== markets.length) {
      console.warning('Failed to fetch some market summaries');
    }

    const marketSummaries = markets.map((market, ind) => {
      const [skew, size, maxOpenInterest, currentFundingRate, currentFundingVelocity, indexPrice] =
        market;
      const marketId = marketIds[ind];
      const [resolvedMarketId, marketName] = this._resolveMarket(marketId, null);
      return {
        marketId: resolvedMarketId,
        marketName,
        skew: ethers.utils.formatUnits(skew, 'ether'),
        size: ethers.utils.formatUnits(size, 'ether'),
        maxOpenInterest: ethers.utils.formatUnits(maxOpenInterest, 'ether'),
        currentFundingRate: ethers.utils.formatUnits(currentFundingRate, 'ether'),
        currentFundingVelocity: ethers.utils.formatUnits(currentFundingVelocity, 'ether'),
        indexPrice: ethers.utils.formatUnits(indexPrice, 'ether'),
      };
    });

    return marketSummaries;
  }

  async getSettlementStrategy(settlementStrategyId, { marketId, marketName }) {
    const { marketId: resolvedMarketId, marketName: resolvedMarketName } = this._resolveMarket(
      marketId,
      marketName
    );

    const [
      strategyType,
      settlementDelay,
      settlementWindowDuration,
      priceWindowDuration,
      priceVerificationContract,
      feedId,
      url,
      settlementReward,
      disabled,
    ] = await callErc7412(this.snx, this.marketProxy, 'getSettlementStrategy', [
      resolvedMarketId,
      settlementStrategyId,
    ]);

    return {
      strategyType,
      settlementDelay: ethers.utils.formatUnits(settlementDelay, 'ether'),
      settlementWindowDuration: ethers.utils.formatUnits(settlementWindowDuration, 'ether'),
      priceWindowDuration: ethers.utils.formatUnits(priceWindowDuration, 'ether'),
      priceVerificationContract,
      feedId,
      url,
      settlementReward: ethers.utils.formatUnits(settlementReward, 'ether'),
      disabled,
    };
  }
  async getCollateralBalances(accountId = null) {
    if (!accountId) {
      accountId = this.defaultAccountId;
    }

    const inputs = COLLATERALS_BY_ID[this.snx.networkId].map((marketId) => [accountId, marketId]);

    const balances = await multicallErc7412(
      this.snx,
      this.marketProxy,
      'getCollateralAmount',
      inputs
    );

    const collateralBalances = balances.reduce((result, balance, ind) => {
      const marketId = COLLATERALS_BY_ID[this.snx.networkId][ind];
      result[marketId] = ethers.utils.formatUnits(balance, 'ether');
      return result;
    }, {});

    return collateralBalances;
  }

  async getCanLiquidate(accountId = null) {
    if (!accountId) {
      accountId = this.defaultAccountId;
    }

    let calls = [];
    if (this.erc7412Enabled) {
      const oracleCall = await this._prepareOracleCall();
      calls = [oracleCall];
    }

    const canLiquidate = await callErc7412(this.snx, this.marketProxy, 'canLiquidate', accountId, {
      calls,
    });

    return canLiquidate;
  }

  async getCanLiquidates(accountIds = [null]) {
    accountIds = accountIds.map((accountId) => [accountId]);

    let calls = [];
    if (this.erc7412Enabled) {
      const oracleCall = this._prepareOracleCall();
      calls = [oracleCall];
    }

    const canLiquidates = multicallErc7412(this.snx, this.marketProxy, 'canLiquidate', accountIds, {
      calls,
    });

    const result = canLiquidates.map((canLiquidate, ind) => {
      return [accountIds[ind][0], canLiquidate];
    });

    return result;
  }

  async getOpenPosition(marketId = null, marketName = null, accountId = null) {
    const { marketId: resolvedMarketId, marketName: resolvedMarketName } = this._resolveMarket(
      marketId,
      marketName
    );

    if (!accountId) {
      accountId = this.defaultAccountId;
    }

    let calls = [];
    if (this.erc7412Enabled) {
      const oracleCall = this._prepareOracleCall([resolvedMarketName]);
      calls = [oracleCall];
    }

    const [pnl, accruedFunding, positionSize] = await callErc7412(
      this.snx,
      this.marketProxy,
      'getOpenPosition',
      [accountId, resolvedMarketId],
      { calls }
    );

    return {
      pnl: ethers.utils.formatUnits(pnl, 'ether'),
      accruedFunding: ethers.utils.formatUnits(accruedFunding, 'ether'),
      positionSize: ethers.utils.formatUnits(positionSize, 'ether'),
    };
  }

  async getOpenPositions(marketNames = null, marketIds = null, accountId = null) {
    if (!accountId) {
      accountId = this.defaultAccountId;
    }

    // if no market names or ids are provided, fetch all markets
    if (!marketNames && !marketIds) {
      marketIds = Object.keys(this.marketsById);
      marketNames = Object.keys(this.marketsByName);
    } else if (marketNames && !marketIds) {
      marketIds = marketNames.map((marketName) => this._resolveMarket(null, marketName)[0]);
    }

    // make the function inputs
    const cleanInputs = marketIds.map((marketId) => [accountId, marketId]);

    // get a fresh price to provide to the oracle
    let calls = [];
    if (this.erc7412Enabled) {
      const oracleCall = this._prepareOracleCall(marketNames);
      calls = [oracleCall];
    }

    const openPositions = await multicallErc7412(
      this.snx,
      this.marketProxy,
      'getOpenPosition',
      cleanInputs,
      { calls }
    );

    const result = openPositions.reduce((positions, [pnl, accruedFunding, positionSize], ind) => {
      const marketName = marketNames[ind];
      if (Math.abs(positionSize) > 0) {
        positions[marketName] = {
          marketId: marketIds[ind],
          marketName,
          pnl: ethers.utils.formatUnits(pnl, 'ether'),
          accruedFunding: ethers.utils.formatUnits(accruedFunding, 'ether'),
          positionSize: ethers.utils.formatUnits(positionSize, 'ether'),
        };
      }
      return positions;
    }, {});

    return result;
  }

  // transactions
  async createAccount(accountId = null, submit = false) {
    if (!accountId) {
      accountId = await this.snx.getDefaultAccountId();
    }

    const txArgs = accountId ? [accountId] : [];
    const marketProxy = this.marketProxy;
    let txParams = await this.snx.getTxParams();
    txParams = marketProxy.populateTransaction.createAccount(...txArgs, txParams);

    if (submit) {
      const txHash = await this.snx.executeTransaction(txParams);
      this.logger.info(`Creating account for ${await this.snx.getAddress()}`);
      this.logger.info(`create_account tx: ${txHash}`);
      return txHash;
    } else {
      return txParams;
    }
  }

  async modifyCollateral(amount, { marketId, marketName, accountId = null, submit = false }) {
    const { marketId: resolvedMarketId, marketName: resolvedMarketName } =
      await this._resolveMarket(marketId, marketName, true);

    if (!accountId) {
      accountId = await this.snx.getDefaultAccountId();
    }

    // TODO: check approvals
    const marketProxy = this.marketProxy;
    const txParams = await writeErc7412(this.snx, this.marketProxy, 'modifyCollateral', [
      accountId,
      resolvedMarketId,
      ethers.utils.parseUnits(amount, 'ether'),
    ]);

    if (submit) {
      const txHash = await this.snx.executeTransaction(txParams);
      this.logger.info(`Transferring ${amount} ${resolvedMarketName} for account ${accountId}`);
      this.logger.info(`modify_collateral tx: ${txHash}`);
      return txHash;
    } else {
      return txParams;
    }
  }

  async commitOrder({
    size,
    settlementStrategyId = 1,
    marketId = null,
    marketName = null,
    accountId = null,
    desiredFillPrice = null,
    maxPriceImpact = null,
    submit = false,
  }) {
    const { marketId: resolvedMarketId, marketName: resolvedMarketName } =
      await this._resolveMarket(marketId, marketName);

    // set acceptable price
    if (desiredFillPrice && maxPriceImpact) {
      throw new Error('Cannot set both desiredFillPrice and maxPriceImpact');
    }

    const isShort = size < 0 ? -1 : 1;
    const sizeWei = ethers.utils.parseUnits(Math.abs(size).toString(), 'ether').mul(isShort);

    let acceptablePrice;
    if (desiredFillPrice) {
      acceptablePrice = ethers.utils.parseUnits(desiredFillPrice.toString(), 'ether');
    } else {
      // fetch market summary to get index price
      const marketSummary = await this.getMarketSummary(resolvedMarketId);

      if (!maxPriceImpact) {
        maxPriceImpact = this.snx.maxPriceImpact;
      }
      const priceImpact = 1 + isShort * (maxPriceImpact / 100);
      // TODO: check that this price is skew-adjusted
      acceptablePrice = marketSummary.indexPrice.mul(priceImpact);
    }

    if (!accountId) {
      accountId = this.defaultAccountId;
    }

    // prepare the transaction
    const txArgs = {
      marketId: resolvedMarketId,
      accountId,
      sizeDelta: sizeWei,
      settlementStrategyId,
      acceptablePrice,
      trackingCode: this.snx.trackingCode,
      referrer: this.snx.referrer,
    };

    const txParams = await writeErc7412(this.snx, this.marketProxy, 'commitOrder', [txArgs]);

    if (submit) {
      const txHash = await this.snx.executeTransaction(txParams);
      this.logger.info(
        `Committing order size ${sizeWei} (${size}) to ${resolvedMarketName} (id: ${resolvedMarketId}) for account ${accountId}`
      );
      this.logger.info(`commitOrder tx: ${txHash}`);
      return txHash;
    } else {
      return txParams;
    }
  }

  async liquidate({ accountId = null, submit = false, staticCall = false }) {
    if (!accountId) {
      accountId = this.defaultAccountId;
    }

    const marketProxy = this.marketProxy;
    if (staticCall) {
      const liquidationReward = await callErc7412(this.snx, marketProxy, 'liquidate', [accountId]);
      return ethers.utils.formatUnits(liquidationReward, 'ether');
    } else {
      const txParams = await writeErc7412(this.snx, marketProxy, 'liquidate', [accountId]);

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

  async settlePythOrder({
    accountId = null,
    maxPythTries = 10,
    pythDelay = 2,
    submit = false,
    maxTxTries = 3,
    txDelay = 2,
  }) {
    if (!accountId) {
      accountId = this.defaultAccountId;
    }

    const order = await this.getOrder(accountId);
    const settlementStrategy = order.settlement_strategy;

    // check if order is ready to be settled
    console.log(`settlement time: ${order.settlement_time}`);
    console.log(`current time: ${Math.floor(new Date().getTime() / 1000)}`);
    if (order.settlement_time > Math.floor(new Date().getTime() / 1000)) {
      const duration = order.settlement_time - Math.floor(new Date().getTime() / 1000);
      console.log(`Waiting ${duration} seconds until order can be settled`);
      await new Promise((resolve) => setTimeout(resolve, duration * 1000));
    } else {
      // TODO: check if expired
      console.log('Order is ready to be settled');
    }

    // create hex inputs
    const feedIdHex = settlementStrategy.feed_id.toHexString();
    const settlementTimeHex = ethers.utils.hexZeroPad(order.settlement_time.toHexString(), 32);

    // Concatenate the hex strings with '0x' prefix
    const dataParam = `0x${feedIdHex}${settlementTimeHex.slice(2)}`;

    // query pyth for the price update data
    const url = settlementStrategy.url.replace('{data}', dataParam);

    let pythTries = 0;
    let priceUpdateData = null;
    while (!priceUpdateData && pythTries < maxPythTries) {
      try {
        const response = await axios.get(url);

        if (response.status === 200) {
          const responseJson = response.data;
          priceUpdateData = responseJson.data;
        } else {
          pythTries += 1;
          if (pythTries > maxPythTries) {
            throw new Error('Price update data not available');
          } else {
            console.log('Price update data not available, waiting 2 seconds and retrying');
            await new Promise((resolve) => setTimeout(resolve, pythDelay * 1000));
          }
        }
      } catch (error) {
        pythTries += 1;
        if (pythTries > maxPythTries) {
          throw new Error('Price update data not available');
        } else {
          console.log('Error fetching price update data, waiting 2 seconds and retrying');
          await new Promise((resolve) => setTimeout(resolve, pythDelay * 1000));
        }
      }
    }

    // encode the extra data
    const accountBytes = ethers.utils.hexZeroPad(
      ethers.BigNumber.from(accountId).toHexString(),
      32
    );
    const marketBytes = ethers.utils.hexZeroPad(
      ethers.BigNumber.from(order.market_id).toHexString(),
      32
    );

    // Concatenate the bytes and convert to hex
    const extraData = `0x${ethers.utils
      .hexlify(ethers.utils.concat([accountBytes, marketBytes]))
      .slice(2)}`;

    // log the data
    console.log(`priceUpdateData: ${priceUpdateData}`);
    console.log(`extraData: ${extraData}`);

    // get fresh prices to provide to the oracle
    const marketName = this._resolveMarket(order.market_id, null)[1];
    const oracleCall = this.erc7412Enabled ? this._prepareOracleCall([marketName]) : null;
    const calls = oracleCall ? [oracleCall] : [];

    // prepare the transaction
    let txTries = 0;
    while (txTries < maxTxTries) {
      const txParams = await this.writeErc7412(
        this.snx,
        this.marketProxy,
        'settlePythOrder',
        [priceUpdateData, extraData],
        { value: 1 },
        { calls }
      );

      if (submit) {
        console.log(`tx params: ${JSON.stringify(txParams)}`);

        const txHash = await this.snx.executeTransaction(txParams);
        console.log(`Settling order for account ${accountId}`);
        console.log(`settle tx: ${txHash}`);

        const receipt = await this.snx.wait(txHash);
        console.log(`settle receipt: ${JSON.stringify(receipt)}`);

        // check the order
        const updatedOrder = await this.getOrder(accountId);
        if (updatedOrder.size_delta === 0) {
          console.log(`Order settlement successful for account ${accountId}`);
          return txHash;
        }

        txTries += 1;
        if (txTries > maxTxTries) {
          throw new Error('Failed to settle order');
        } else {
          console.log('Failed to settle order, waiting 2 seconds and retrying');
          await new Promise((resolve) => setTimeout(resolve, txDelay * 1000));
        }
      } else {
        return txParams;
      }
    }
  }
}

export default Perps;
