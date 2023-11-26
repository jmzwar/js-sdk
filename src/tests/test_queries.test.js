import Synthetix from '../synthetix/synthetix.js';

const os = require('os');

// Load environment variables if necessary
// You may need to set these variables manually or use a library like dotenv
// process.env.ETH_NODE_URL = 'your_ethereum_node_url';

// Instantiate Synthetix
const snx = new Synthetix();

// Constants
const TEST_ASSET = 'SOL';
const TEST_ACCOUNT = '0x48914229dedd5a9922f44441ffccfc2cb7856ee9';
const TEST_MIN_TIMESTAMP = 1680307200;
const TEST_MAX_TIMESTAMP = 1682899200;
const TEST_PERIOD = 3600;

function checkDf(df, uniqueColumn, uniqueValue = null, minTimestamp = null, maxTimestamp = null) {
  assert(df !== null);
  assert(df.length > 0);
  assert(uniqueValue ? df[uniqueColumn].length === 1 : df[uniqueColumn].length > 1);
  if (uniqueValue) {
    assert(df[uniqueColumn][0] === uniqueValue);
  }
  if (minTimestamp) {
    assert(df['timestamp'].min >= minTimestamp);
  }
  if (maxTimestamp) {
    assert(df['timestamp'].max <= maxTimestamp);
  }
  for (const col in df.columns) {
    assert(col.toLowerCase());
  }
}

// Candles
async function testQueriesCandlesMarket() {
  try {
    // The instance can query candles for a specified market
    const candlesMarket = await snx.queries.candles({ asset: TEST_ASSET });
    logger.info(`Asset: ${TEST_ASSET} - Candles: ${candlesMarket.length}`);
    checkDf(candlesMarket, 'synth', TEST_ASSET);
  } catch (error) {
    logger.error(`Error in test_queries_candles_market: ${error.message}`);
  }
}

async function testQueriesCandlesPeriod() {
  try {
    // The instance can query candles for a specified period
    const candlesMarket = await snx.queries.candles({ asset: TEST_ASSET, period: TEST_PERIOD });
    logger.info(`Asset: ${TEST_ASSET} - Candles: ${candlesMarket.length}`);
    checkDf(candlesMarket, 'period', TEST_PERIOD);
  } catch (error) {
    logger.error(`Error in test_queries_candles_period: ${error.message}`);
  }
}

// Trades for market
async function testQueriesTradesAllMarkets() {
  try {
    // The instance can query trades for all markets
    const tradesMarket = await snx.queries.tradesForMarket();
    logger.info(`Asset: All - Trades: ${tradesMarket.length}`);
    checkDf(tradesMarket, 'asset');
  } catch (error) {
    logger.error(`Error in test_queries_trades_all_markets: ${error.message}`);
  }
}

async function testQueriesTradesMarket() {
  try {
    // The instance can query trades for a specified market
    const tradesMarket = await snx.queries.tradesForMarket({ asset: TEST_ASSET });
    logger.info(`Asset: ${TEST_ASSET} - Trades: ${tradesMarket.length}`);
    checkDf(tradesMarket, 'asset', TEST_ASSET);
  } catch (error) {
    logger.error(`Error in test_queries_trades_market: ${error.message}`);
  }
}

async function testQueriesTradesMarketInputs() {
  try {
    // The instance can query trades with inputs for a specified market
    const tradesMarket = await snx.queries.tradesForMarket({
      asset: TEST_ASSET,
      minTimestamp: TEST_MIN_TIMESTAMP,
      maxTimestamp: TEST_MAX_TIMESTAMP,
    });
    logger.info(`Asset: ${TEST_ASSET} - Trades: ${tradesMarket.length}`);
    checkDf(tradesMarket, 'asset', TEST_ASSET, TEST_MIN_TIMESTAMP, TEST_MAX_TIMESTAMP);
  } catch (error) {
    logger.error(`Error in test_queries_trades_market_inputs: ${error.message}`);
  }
}

// Trades for account
async function testQueriesTradesAccountInternal() {
  try {
    // The instance can query trades for the connected account
    const tradesAccount = await snx.queries.tradesForAccount();
    logger.info(`Account: ${snx.address} - Trades: ${tradesAccount.length}`);
    checkDf(tradesAccount, 'account', snx.address.toLowerCase());
  } catch (error) {
    logger.error(`Error in test_queries_trades_account_internal: ${error.message}`);
  }
}

async function testQueriesTradesAccountSpecified() {
  try {
    // The instance can query trades for a specified account
    const tradesAccount = await snx.queries.tradesForAccount({ account: TEST_ACCOUNT });
    logger.info(`Account: ${TEST_ACCOUNT} - Trades: ${tradesAccount.length}`);
    checkDf(tradesAccount, 'account', TEST_ACCOUNT);
  } catch (error) {
    logger.error(`Error in test_queries_trades_account_specified: ${error.message}`);
  }
}

const testQueriesTradesAccountInputs = async (snx, logger) => {
  try {
    const tradesAccount = await snx.queries.tradesForAccount(TEST_ACCOUNT, {
      min_timestamp: TEST_MIN_TIMESTAMP,
      max_timestamp: TEST_MAX_TIMESTAMP,
    });

    logger.info(`Account: ${TEST_ACCOUNT} - Trades: ${tradesAccount.length}`);
    checkArray(tradesAccount, 'account', TEST_ACCOUNT, TEST_MIN_TIMESTAMP, TEST_MAX_TIMESTAMP);
  } catch (error) {
    console.error(error);
  }
};

const testQueriesTransfersAllMarkets = async (snx, logger) => {
  try {
    const transfersMarket = await snx.queries.transfersForMarket();
    logger.info(`Asset: All - Transfers: ${transfersMarket.length}`);
    checkArray(transfersMarket, 'asset');
  } catch (error) {
    console.error(error);
  }
};

const testQueriesTransfersMarket = async (snx, logger) => {
  try {
    const transfersMarket = await snx.queries.transfersForMarket(TEST_ASSET);
    logger.info(`Asset: ${TEST_ASSET} - Transfers: ${transfersMarket.length}`);
    checkArray(transfersMarket, 'asset', TEST_ASSET);
  } catch (error) {
    console.error(error);
  }
};

const testQueriesTransfersMarketInputs = async (snx, logger) => {
  try {
    const transfersMarket = await snx.queries.transfersForMarket(TEST_ASSET, {
      min_timestamp: TEST_MIN_TIMESTAMP,
      max_timestamp: TEST_MAX_TIMESTAMP,
    });

    logger.info(`Asset: ${TEST_ASSET} - Transfers: ${transfersMarket.length}`);
    checkArray(transfersMarket, 'asset', TEST_ASSET, TEST_MIN_TIMESTAMP, TEST_MAX_TIMESTAMP);
  } catch (error) {
    console.error(error);
  }
};

const testQueriesTransfersAccountInternal = async (snx, logger) => {
  try {
    const transfersAccount = await snx.queries.transfersForAccount();
    logger.info(`Account: ${snx.address} - Transfers: ${transfersAccount.length}`);
    checkArray(transfersAccount, 'account', snx.address.toLowerCase());
  } catch (error) {
    console.error(error);
  }
};

const testQueriesTransfersAccountSpecified = async (snx, logger) => {
  try {
    const transfersAccount = await snx.queries.transfersForAccount(TEST_ACCOUNT);
    logger.info(`Account: ${TEST_ACCOUNT} - Transfers: ${transfersAccount.length}`);
    checkArray(transfersAccount, 'account', TEST_ACCOUNT);
  } catch (error) {
    console.error(error);
  }
};

const testQueriesTransfersAccountInputs = async (snx, logger) => {
  try {
    const transfersAccount = await snx.queries.transfersForAccount(TEST_ACCOUNT, {
      min_timestamp: TEST_MIN_TIMESTAMP,
      max_timestamp: TEST_MAX_TIMESTAMP,
    });

    checkArray(transfersAccount, 'account', TEST_ACCOUNT, TEST_MIN_TIMESTAMP, TEST_MAX_TIMESTAMP);
  } catch (error) {
    console.error(error);
  }
};

const testQueriesPositionsAllMarkets = async (snx, logger) => {
  try {
    const positionsMarket = await snx.queries.positionsForMarket();
    logger.info(`Asset: All - Positions: ${positionsMarket.length}`);

    if (new Set(positionsMarket.map((item) => item.is_open)).size === 2) {
      checkArray(positionsMarket, 'asset');
    } else {
      console.error('Not exactly two unique values for "is_open" in positionsMarket.');
    }
  } catch (error) {
    console.error(error);
  }
};

const testQueriesPositionsMarket = async (snx, logger) => {
  try {
    const positionsMarket = await snx.queries.positionsForMarket(TEST_ASSET);
    logger.info(`Asset: ${TEST_ASSET} - Positions: ${positionsMarket.length}`);

    if (new Set(positionsMarket.map((item) => item.is_open)).size === 2) {
      checkArray(positionsMarket, 'asset', TEST_ASSET);
    } else {
      console.error('Not exactly two unique values for "is_open" in positionsMarket.');
    }
  } catch (error) {
    console.error(error);
  }
};

const testQueriesPositionsMarketOpen = async (snx, logger) => {
  try {
    const positionsMarket = await snx.queries.positionsForMarket(TEST_ASSET, { open_only: true });
    logger.info(`Asset: ${TEST_ASSET} - Positions: ${positionsMarket.length}`);

    if (new Set(positionsMarket.map((item) => item.is_open)).size === 1) {
      checkArray(positionsMarket, 'is_open', true);
    } else {
      console.error('Not exactly one unique value for "is_open" in positionsMarket.');
    }
  } catch (error) {
    console.error(error);
  }
};

const testQueriesPositionsAccountInternal = async (snx, logger) => {
  try {
    const positionsAccount = await snx.queries.positionsForAccount();
    logger.info(`Account: ${snx.address} - Positions: ${positionsAccount.length}`);
    checkArray(positionsAccount, 'account', snx.address.toLowerCase());
  } catch (error) {
    console.error(error);
  }
};

const testQueriesPositionsAccountSpecified = async (snx, logger) => {
  try {
    const positionsAccount = await snx.queries.positionsForAccount(TEST_ACCOUNT);
    logger.info(`Account: ${TEST_ACCOUNT} - Positions: ${positionsAccount.length}`);
    checkArray(positionsAccount, 'account', TEST_ACCOUNT);
  } catch (error) {
    console.error(error);
  }
};

const testQueriesFundingRatesAllMarkets = async (snx, logger) => {
  try {
    const fundingRatesMarket = await snx.queries.fundingRates();
    logger.info(`Asset: All - Funding Rates: ${fundingRatesMarket.length}`);
    checkArray(fundingRatesMarket, 'asset');
  } catch (error) {
    console.error(error);
  }
};

const testQueriesFundingRatesMarket = async (snx, logger) => {
  try {
    const fundingRatesMarket = await snx.queries.fundingRates(TEST_ASSET);
    logger.info(`Asset: ${TEST_ASSET} - Funding Rates: ${fundingRatesMarket.length}`);
    checkArray(fundingRatesMarket, 'asset', TEST_ASSET);
  } catch (error) {
    console.error(error);
  }
};

const testQueriesFundingRatesInputs = async (snx, logger) => {
  try {
    const fundingRatesMarket = await snx.queries.fundingRates(TEST_ASSET, {
      min_timestamp: TEST_MIN_TIMESTAMP,
      max_timestamp: TEST_MAX_TIMESTAMP,
    });

    checkArray(fundingRatesMarket, 'asset', TEST_ASSET, TEST_MIN_TIMESTAMP, TEST_MAX_TIMESTAMP);
  } catch (error) {
    console.error(error);
  }
};

// Run the tests
testQueriesCandlesMarket();
testQueriesCandlesPeriod();
testQueriesTradesAllMarkets();
testQueriesTradesMarket();
testQueriesTradesMarketInputs();
testQueriesTradesAccountInternal();
testQueriesTradesAccountSpecified();
