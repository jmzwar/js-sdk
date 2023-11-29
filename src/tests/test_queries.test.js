import Synthetix from '../synthetix/synthetix.js';
import { assert } from 'chai';

const snx = new Synthetix({
  providerRpc: 'https://base-goerli.infura.io/v3/f997a699e47c4d7495dbd0cc4e1f5aa1',
  address: '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
  privateKey: '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
  networkId: 10,
});

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
describe('Queries - Candles', () => {
  it('should have a valid sUSD contract', async () => {
    try {
      // The instance can query candles for a specified market
      const candlesMarket = await snx.queries.candles({ asset: TEST_ASSET });
      console.info(`Asset: ${TEST_ASSET} - Candles: ${candlesMarket.length}`);
      checkDf(candlesMarket, 'synth', TEST_ASSET);
    } catch (error) {
      console.error(`Error in test_queries_candles_market: ${error.message}`);
    }
  });

  it('should have a valid sUSD legacy contract', async () => {
    try {
      // The instance can query candles for a specified period
      const candlesMarket = await snx.queries.candles({ asset: TEST_ASSET, period: TEST_PERIOD });
      console.info(`Asset: ${TEST_ASSET} - Candles: ${candlesMarket.length}`);
      checkDf(candlesMarket, 'period', TEST_PERIOD);
    } catch (error) {
      console.error(`Error in test_queries_candles_period: ${error.message}`);
    }
  });
});

// Trades for market
describe('Queries - Trades for Market', () => {
  it('should have a valid sUSD contract', async () => {
    try {
      // The instance can query trades for all markets
      const tradesMarket = await snx.queries.tradesForMarket();
      console.info(`Asset: All - Trades: ${tradesMarket.length}`);
      checkDf(tradesMarket, 'asset');
    } catch (error) {
      console.error(`Error in test_queries_trades_all_markets: ${error.message}`);
    }
  });

  it('should have a valid sUSD legacy contract', async () => {
    try {
      // The instance can query trades for a specified market
      const tradesMarket = await snx.queries.tradesForMarket({ asset: TEST_ASSET });
      console.info(`Asset: ${TEST_ASSET} - Trades: ${tradesMarket.length}`);
      checkDf(tradesMarket, 'asset', TEST_ASSET);
    } catch (error) {
      console.error(`Error in test_queries_trades_market: ${error.message}`);
    }
  });

  it('should have a valid sUSD legacy contract', async () => {
    try {
      // The instance can query trades with inputs for a specified market
      const tradesMarket = await snx.queries.tradesForMarket({
        asset: TEST_ASSET,
        minTimestamp: TEST_MIN_TIMESTAMP,
        maxTimestamp: TEST_MAX_TIMESTAMP,
      });
      console.info(`Asset: ${TEST_ASSET} - Trades: ${tradesMarket.length}`);
      checkDf(tradesMarket, 'asset', TEST_ASSET, TEST_MIN_TIMESTAMP, TEST_MAX_TIMESTAMP);
    } catch (error) {
      console.error(`Error in test_queries_trades_market_inputs: ${error.message}`);
    }
  });
});

// Trades for account
describe('Queries - Trades for Account', () => {
  it('should have a valid sUSD contract', async () => {
    try {
      // The instance can query trades for the connected account
      const tradesAccount = await snx.queries.tradesForAccount();
      console.info(`Account: ${snx.address} - Trades: ${tradesAccount.length}`);
      checkDf(tradesAccount, 'account', snx.address.toLowerCase());
    } catch (error) {
      console.error(`Error in test_queries_trades_account_internal: ${error.message}`);
    }
  });

  it('should have a valid sUSD legacy contract', async () => {
    try {
      // The instance can query trades for a specified account
      const tradesAccount = await snx.queries.tradesForAccount({ account: TEST_ACCOUNT });
      console.info(`Account: ${TEST_ACCOUNT} - Trades: ${tradesAccount.length}`);
      checkDf(tradesAccount, 'account', TEST_ACCOUNT);
    } catch (error) {
      console.error(`Error in test_queries_trades_account_specified: ${error.message}`);
    }
  });

  it('should have a valid sUSD legacy contract', async () => {
    try {
      const tradesAccount = await snx.queries.tradesForAccount(TEST_ACCOUNT, {
        min_timestamp: TEST_MIN_TIMESTAMP,
        max_timestamp: TEST_MAX_TIMESTAMP,
      });

      console.info(`Account: ${TEST_ACCOUNT} - Trades: ${tradesAccount.length}`);
      checkDf(tradesAccount, 'account', TEST_ACCOUNT, TEST_MIN_TIMESTAMP, TEST_MAX_TIMESTAMP);
    } catch (error) {
      console.error(`Error in test_queries_trades_account_inputs: ${error.message}`);
    }
  });
});

// Transfers
describe('Queries - Transfers', () => {
  it('should have a valid sUSD contract', async () => {
    try {
      const transfersMarket = await snx.queries.transfersForMarket();
      console.info(`Asset: All - Transfers: ${transfersMarket.length}`);
      checkDf(transfersMarket, 'asset');
    } catch (error) {
      console.error(`Error in test_queries_transfers_all_markets: ${error.message}`);
    }
  });

  it('should have a valid sUSD legacy contract', async () => {
    try {
      const transfersMarket = await snx.queries.transfersForMarket(TEST_ASSET);
      console.info(`Asset: ${TEST_ASSET} - Transfers: ${transfersMarket.length}`);
      checkDf(transfersMarket, 'asset', TEST_ASSET);
    } catch (error) {
      console.error(`Error in test_queries_transfers_market: ${error.message}`);
    }
  });

  it('should have a valid sUSD legacy contract', async () => {
    try {
      const transfersMarket = await snx.queries.transfersForMarket(TEST_ASSET, {
        min_timestamp: TEST_MIN_TIMESTAMP,
        max_timestamp: TEST_MAX_TIMESTAMP,
      });

      console.info(`Asset: ${TEST_ASSET} - Transfers: ${transfersMarket.length}`);
      checkDf(transfersMarket, 'asset', TEST_ASSET, TEST_MIN_TIMESTAMP, TEST_MAX_TIMESTAMP);
    } catch (error) {
      console.error(`Error in test_queries_transfers_market_inputs: ${error.message}`);
    }
  });

  it('should have a valid sUSD contract for the connected account', async () => {
    try {
      const transfersAccount = await snx.queries.transfersForAccount();
      console.info(`Account: ${snx.address} - Transfers: ${transfersAccount.length}`);
      checkDf(transfersAccount, 'account', snx.address.toLowerCase());
    } catch (error) {
      console.error(`Error in test_queries_transfers_account_internal: ${error.message}`);
    }
  });

  it('should have a valid sUSD contract for a specified account', async () => {
    try {
      const transfersAccount = await snx.queries.transfersForAccount({ account: TEST_ACCOUNT });
      console.info(`Account: ${TEST_ACCOUNT} - Transfers: ${transfersAccount.length}`);
      checkDf(transfersAccount, 'account', TEST_ACCOUNT);
    } catch (error) {
      console.error(`Error in test_queries_transfers_account_specified: ${error.message}`);
    }
  });

  it('should have a valid sUSD contract for a specified account with inputs', async () => {
    try {
      const transfersAccount = await snx.queries.transfersForAccount(TEST_ACCOUNT, {
        min_timestamp: TEST_MIN_TIMESTAMP,
        max_timestamp: TEST_MAX_TIMESTAMP,
      });

      console.info(`Account: ${TEST_ACCOUNT} - Transfers: ${transfersAccount.length}`);
      checkDf(transfersAccount, 'account', TEST_ACCOUNT, TEST_MIN_TIMESTAMP, TEST_MAX_TIMESTAMP);
    } catch (error) {
      console.error(`Error in test_queries_transfers_account_inputs: ${error.message}`);
    }
  });
});

// Positions
describe('Queries - Positions', () => {
  it('should have a valid sUSD contract for all markets', async () => {
    try {
      const positionsMarket = await snx.queries.positionsForMarket();
      console.info(`Asset: All - Positions: ${positionsMarket.length}`);

      if (new Set(positionsMarket.map((item) => item.is_open)).size === 2) {
        checkDf(positionsMarket, 'asset');
      } else {
        console.error('Not exactly two unique values for "is_open" in positionsMarket.');
      }
    } catch (error) {
      console.error(`Error in test_queries_positions_all_markets: ${error.message}`);
    }
  });

  it('should have a valid sUSD contract for a specified market', async () => {
    try {
      const positionsMarket = await snx.queries.positionsForMarket(TEST_ASSET);
      console.info(`Asset: ${TEST_ASSET} - Positions: ${positionsMarket.length}`);

      if (new Set(positionsMarket.map((item) => item.is_open)).size === 2) {
        checkDf(positionsMarket, 'asset', TEST_ASSET);
      } else {
        console.error('Not exactly two unique values for "is_open" in positionsMarket.');
      }
    } catch (error) {
      console.error(`Error in test_queries_positions_market: ${error.message}`);
    }
  });

  it('should have a valid sUSD contract for a specified market with open positions', async () => {
    try {
      const positionsMarket = await snx.queries.positionsForMarket(TEST_ASSET, { open_only: true });
      console.info(`Asset: ${TEST_ASSET} - Positions: ${positionsMarket.length}`);

      if (new Set(positionsMarket.map((item) => item.is_open)).size === 1) {
        checkDf(positionsMarket, 'is_open', true);
      } else {
        console.error('Not exactly one unique value for "is_open" in positionsMarket.');
      }
    } catch (error) {
      console.error(`Error in test_queries_positions_market_open: ${error.message}`);
    }
  });

  it('should have a valid sUSD contract for the connected account', async () => {
    try {
      const positionsAccount = await snx.queries.positionsForAccount();
      console.info(`Account: ${snx.address} - Positions: ${positionsAccount.length}`);
      checkDf(positionsAccount, 'account', snx.address.toLowerCase());
    } catch (error) {
      console.error(`Error in test_queries_positions_account_internal: ${error.message}`);
    }
  });

  it('should have a valid sUSD contract for a specified account', async () => {
    try {
      const positionsAccount = await snx.queries.positionsForAccount(TEST_ACCOUNT);
      console.info(`Account: ${TEST_ACCOUNT} - Positions: ${positionsAccount.length}`);
      checkDf(positionsAccount, 'account', TEST_ACCOUNT);
    } catch (error) {
      console.error(`Error in test_queries_positions_account_specified: ${error.message}`);
    }
  });
});

// Funding Rates
describe('Queries - Funding Rates', () => {
  it('should have a valid sUSD contract for all markets', async () => {
    try {
      const fundingRatesMarket = await snx.queries.fundingRates();
      console.info(`Asset: All - Funding Rates: ${fundingRatesMarket.length}`);
      checkDf(fundingRatesMarket, 'asset');
    } catch (error) {
      console.error(`Error in test_queries_funding_rates_all_markets: ${error.message}`);
    }
  });

  it('should have a valid sUSD contract for a specified market', async () => {
    try {
      const fundingRatesMarket = await snx.queries.fundingRates(TEST_ASSET);
      console.info(`Asset: ${TEST_ASSET} - Funding Rates: ${fundingRatesMarket.length}`);
      checkDf(fundingRatesMarket, 'asset', TEST_ASSET);
    } catch (error) {
      console.error(`Error in test_queries_funding_rates_market: ${error.message}`);
    }
  });

  it('should have a valid sUSD contract for a specified market with inputs', async () => {
    try {
      const fundingRatesMarket = await snx.queries.fundingRates(TEST_ASSET, {
        min_timestamp: TEST_MIN_TIMESTAMP,
        max_timestamp: TEST_MAX_TIMESTAMP,
      });

      console.info(`Asset: ${TEST_ASSET} - Funding Rates: ${fundingRatesMarket.length}`);
      checkDf(fundingRatesMarket, 'asset', TEST_ASSET, TEST_MIN_TIMESTAMP, TEST_MAX_TIMESTAMP);
    } catch (error) {
      console.error(`Error in test_queries_funding_rates_inputs: ${error.message}`);
    }
  });
});

