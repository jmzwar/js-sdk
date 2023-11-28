import Synthetix from '../synthetix/synthetix.js';
import assert from 'assert';
import 'dotenv/config';

// Constants
const TEST_MARKET_ID = 100;
const TEST_SETTLEMENT_STRATEGY_ID = 1;
const snx = new Synthetix();
const logger = console;

// Tests
async function testPerpsModule() {
  try {
    const perpsModule = snx.perps;
    assert(perpsModule !== null);
    assert(perpsModule.marketProxy !== null);
    assert(perpsModule.accountProxy !== null);
    assert(perpsModule.accountIds !== null);
    assert(perpsModule.marketsById !== null);
    assert(perpsModule.marketsByName !== null);
  } catch (error) {
    logger.error(`Error in test_perps_module: ${error}`);
  }
}

async function testPerpsMarkets() {
  try {
    // The instance can fetch markets
    const { marketsById, marketsByName } = await snx.perps.getMarkets();
    logger.info(`Markets by id: ${JSON.stringify(marketsById)}`);
    logger.info(`Markets by name: ${JSON.stringify(marketsByName)}`);
    assert(marketsById !== null);
    assert(marketsByName !== null);
  } catch (error) {
    logger.error(`Error in test_perps_markets: ${error.message}`);
  }
}

async function testPerpsAccountFetch() {
  try {
    // The instance can fetch account ids
    const accountIds = await snx.perps.getAccountIds();
    logger.info(
      `Address: ${snx.address} - accounts: ${accountIds.length} - account_ids: ${JSON.stringify(
        accountIds
      )}`
    );
    assert(accountIds.length > 0);
  } catch (error) {
    logger.error(`Error in test_perps_account_fetch: ${error.message}`);
  }
}

async function testPerpsAccountCreate() {
  try {
    // The instance can create perps accounts
    const createAccountTx = await snx.perps.createAccount();
    logger.info(`Address: ${snx.address} - tx: ${createAccountTx}`);
    assert(createAccountTx !== null);
  } catch (error) {
    logger.error(`Error in test_perps_account_create: ${error.message}`);
  }
}

async function testPerpsAccountMarginInfo() {
  try {
    // The instance can fetch margin balances and requirements for an account
    const marginInfo = await snx.perps.getMarginInfo();
    logger.info(`Address: ${snx.address} - margin info: ${JSON.stringify(marginInfo)}`);
    assert(marginInfo !== null);
    assert(marginInfo.totalCollateralValue !== null);
    assert(marginInfo.availableMargin !== null);
    assert(marginInfo.withdrawableMargin !== null);
    assert(marginInfo.initialMarginRequirement !== null);
    assert(marginInfo.maintenanceMarginRequirement !== null);
  } catch (error) {
    logger.error(`Error in test_perps_account_margin_info: ${error.message}`);
  }
}

async function testPerpsOpenPosition() {
  try {
    // The instance can fetch the open position for an account
    const position = await snx.perps.getOpenPosition(TEST_MARKET_ID);
    logger.info(`Address: ${snx.address} - position: ${JSON.stringify(position)}`);
    assert(position !== null);
    assert(position.pnl !== null);
    assert(position.accruedFunding !== null);
    assert(position.positionSize !== null);
  } catch (error) {
    logger.error(`Error in test_perps_open_position: ${error.message}`);
  }
}

async function testPerpsOpenPositionsById() {
  try {
    // The instance can fetch all open positions for an account
    const positions = await snx.perps.getOpenPositions();
    logger.info(`Address: ${snx.address} - positions: ${JSON.stringify(positions)}`);
    assert(positions !== null);
    if (Object.keys(positions).length > 0) {
      const key = Object.keys(positions)[0];
      assert(positions[key].marketId !== null);
      assert(positions[key].marketName !== null);
      assert(positions[key].pnl !== null);
      assert(positions[key].accruedFunding !== null);
      assert(positions[key].positionSize !== null);
    }
  } catch (error) {
    logger.error(`Error in test_perps_open_positions_by_id: ${error.message}`);
  }
}

async function testPerpsOpenPositionsByName() {
  try {
    // The instance can fetch the open position for a list of markets
    const positions = await snx.perps.getOpenPositions({ marketNames: ['ETH', 'BTC'] });
    logger.info(`Address: ${snx.address} - positions: ${JSON.stringify(positions)}`);
    assert(positions !== null);
    if (Object.keys(positions).length > 0) {
      const key = Object.keys(positions)[0];
      assert(positions[key].marketId !== null);
      assert(positions[key].marketName !== null);
      assert(positions[key].pnl !== null);
      assert(positions[key].accruedFunding !== null);
      assert(positions[key].positionSize !== null);
    }
  } catch (error) {
    logger.error(`Error in test_perps_open_positions_by_name: ${error.message}`);
  }
}

async function testPerpsAccountCollateralBalances() {
  try {
    // The instance can fetch collateral balances for an account
    const balances = await snx.perps.getCollateralBalances();
    logger.info(`Address: ${snx.address} - balances: ${JSON.stringify(balances)}`);
    assert(balances !== null);
    assert(balances.sUSD !== null);
    assert(balances.ETH !== null);
    assert(balances.BTC !== null);
  } catch (error) {
    logger.error(`Error in test_perps_account_collateral_balances: ${error.message}`);
  }
}

async function testPerpsCanLiquidate() {
  try {
    // The instance can fetch an account's liquidation status
    const canLiquidate = await snx.perps.getCanLiquidate();
    logger.info(`Account: ${snx.perps.defaultAccountId} - can liquidate: ${canLiquidate}`);
    assert(canLiquidate !== null);
    assert(typeof canLiquidate === 'boolean');
  } catch (error) {
    logger.error(`Error in test_perps_can_liquidate: ${error.message}`);
  }
}

async function testPerpsCanLiquidates() {
  try {
    // The instance can fetch liquidation status for a list of accounts
    const accountIds = snx.perps.accountIds.slice(0, 10);
    const canLiquidates = await snx.perps.getCanLiquidates(accountIds);
    logger.info(`Accounts: ${accountIds} - can liquidate: ${JSON.stringify(canLiquidates)}`);
    assert(canLiquidates !== null);
    assert(Array.isArray(canLiquidates));
    for (const canLiquidate of canLiquidates) {
      assert(canLiquidate.length === 2);
      assert(typeof canLiquidate[0] === 'number');
      assert(typeof canLiquidate[1] === 'boolean');
    }
  } catch (error) {
    logger.error(`Error in test_perps_can_liquidates: ${error.message}`);
  }
}

async function testPerpsMarketSummary() {
  try {
    // The instance can fetch a market summary
    const marketSummary = await snx.perps.getMarketSummary(TEST_MARKET_ID);
    logger.info(`Market: ${TEST_MARKET_ID} - summary: ${JSON.stringify(marketSummary)}`);
    assert(marketSummary !== null);
    assert(marketSummary.skew !== null);
    assert(marketSummary.size !== null);
    assert(marketSummary.maxOpenInterest !== null);
    assert(marketSummary.currentFundingRate !== null);
    assert(marketSummary.currentFundingVelocity !== null);
    assert(marketSummary.indexPrice !== null);
  } catch (error) {
    logger.error(`Error in test_perps_market_summary: ${error.message}`);
  }
}

async function testPerpsSettlementStrategy() {
  try {
    // The instance can fetch a settlement strategy
    const settlementStrategy = await snx.perps.getSettlementStrategy(
      TEST_SETTLEMENT_STRATEGY_ID,
      TEST_MARKET_ID
    );
    logger.info(
      `id: ${TEST_SETTLEMENT_STRATEGY_ID} - settlement strategy: ${JSON.stringify(
        settlementStrategy
      )}`
    );
    assert(settlementStrategy !== null);
    assert(settlementStrategy.strategyType !== null);
    assert(settlementStrategy.settlementDelay !== null);
    assert(settlementStrategy.settlementWindowDuration !== null);
    assert(settlementStrategy.priceWindowDuration !== null);
    assert(settlementStrategy.priceVerificationContract !== null);
    assert(settlementStrategy.feedId !== null);
    assert(settlementStrategy.url !== null);
    assert(settlementStrategy.settlementReward !== null);
    assert(settlementStrategy.disabled !== null);
  } catch (error) {
    logger.error(`Error in test_perps_settlement_strategy: ${error.message}`);
  }
}

async function testPerpsOrder() {
  try {
    // The instance can fetch an order for an account
    const order = await snx.perps.getOrder({ fetchSettlementStrategy: false });
    logger.info(`Address: ${snx.address} - order: ${JSON.stringify(order)}`);
    assert(order !== null);
    assert(order.settlementTime !== null);
    assert(order.marketId !== null);
    assert(order.accountId !== null);
    assert(order.sizeDelta !== null);
    assert(order.settlementStrategyId !== null);
    assert(order.acceptablePrice !== null);
    assert(order.trackingCode !== null);
    assert(order.referrer !== null);
    assert(!order.settlementStrategy);
  } catch (error) {
    logger.error(`Error in test_perps_order: ${error.message}`);
  }
}

async function testPerpsOrderWithSettlementStrategy() {
  try {
    // The instance can fetch an order for an account including the settlement strategy
    const order = await snx.perps.getOrder();
    logger.info(`Address: ${snx.address} - order: ${JSON.stringify(order)}`);
    assert(order !== null);
    assert(order.settlementTime !== null);
    assert(order.marketId !== null);
    assert(order.accountId !== null);
    assert(order.sizeDelta !== null);
    assert(order.settlementStrategyId !== null);
    assert(order.acceptablePrice !== null);
    assert(order.trackingCode !== null);
    assert(order.referrer !== null);
    assert(order.settlementStrategy !== null);
    assert(order.settlementStrategy.strategyType !== null);
    assert(order.settlementStrategy.settlementDelay !== null);
    assert(order.settlementStrategy.settlementWindowDuration !== null);
    assert(order.settlementStrategy.priceWindowDuration !== null);
    assert(order.settlementStrategy.priceVerificationContract !== null);
    assert(order.settlementStrategy.feedId !== null);
    assert(order.settlementStrategy.url !== null);
    assert(order.settlementStrategy.settlementReward !== null);
    assert(order.settlementStrategy.disabled !== null);
  } catch (error) {
    logger.error(`Error in test_perps_order_with_settlement_strategy: ${error.message}`);
  }
}

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);
const { expect } = chai;

async function testPerpsModifyCollateral() {
  try {
    // Users can deposit and withdraw collateral
    await expect(snx.perps.modifyCollateral(1, { marketName: 'WRONG' })).to.be.rejected;

    await expect(snx.perps.modifyCollateral(1, { marketId: 123 })).to.be.rejected;

    const depositTx = await snx.perps.modifyCollateral(1, { marketName: 'sUSD' });
    logger.info(`Address: ${snx.address} - deposit: ${JSON.stringify(depositTx)}`);

    assert(depositTx !== null);
  } catch (error) {
    logger.error(`Error in testPerpsModifyCollateral: ${error.message}`);
  }
}

async function testPerpsCommitOrder() {
  try {
    // User can prepare a commit order transaction
    const order = await snx.perps.commitOrder(1, { marketName: 'ETH' });

    assert(order !== null);
    assert(order.from === snx.address);
    assert(order.data !== null);
  } catch (error) {
    logger.error(`Error in test_perps_commit_order: ${error.message}`);
  }
}

async function testPerpsLiquidate() {
  try {
    // User can call the static liquidate function
    const liquidate = await snx.perps.liquidate();

    logger.info(`Account: ${snx.perps.defaultAccountId} - liquidate: ${JSON.stringify(liquidate)}`);
    assert(liquidate !== null);
    assert(liquidate.from === snx.address);
    assert(liquidate.data !== null);
  } catch (error) {
    logger.error(`Error in test_perps_liquidate: ${error.message}`);
  }
}

async function testPerpsSettlePythOrder() {
  try {
    // User can prepare a settlement transaction using Pyth
    const settle = await snx.perps.settlePythOrder();

    assert(settle !== null);
    assert(settle.from === snx.address);
    assert(settle.data !== null);
  } catch (error) {
    logger.error(`Error in test_perps_settle_pyth_order: ${error.message}`);
  }
}

// Run the tests
testPerpsModule();
testPerpsMarkets();
testPerpsAccountFetch();
testPerpsAccountCreate();
testPerpsAccountMarginInfo();
testPerpsOpenPosition();
testPerpsOpenPositionsById();
testPerpsOpenPositionsByName();
testPerpsAccountCollateralBalances();
testPerpsCanLiquidate();
testPerpsCanLiquidates();
testPerpsMarketSummary();
testPerpsSettlementStrategy();
testPerpsOrder();
testPerpsOrderWithSettlementStrategy();
testPerpsModifyCollateral();
testPerpsCommitOrder();
testPerpsLiquidate();
testPerpsSettlePythOrder();