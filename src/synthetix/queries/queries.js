import Decimal from 'decimal.js';
import axios from 'axios';
import { request, gql } from 'graphql-request';

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

export const convertWei = (x) => {
  try {
    return new Decimal(x).dividedBy(new Decimal(10).pow(18)).toNumber();
  } catch (error) {
    return x;
  }
};

export const convertInt = (x) => {
  try {
    const result = new Decimal(x);
    return result.isFinite() ? result.toNumber() : x;
  } catch (error) {
    return x;
  }
};

export const convertToBytes = (inputString) => {
  const hexString = Buffer.from(inputString, 'utf-8').toString('hex');
  const paddedHexString = hexString.padEnd(64, '0');
  return '0x' + paddedHexString;
};

export const convertFromBytes = (x) => {
  // Check if the input starts with '0x' and if so, treat it as a hexadecimal string
  if (x.startsWith('0x')) {
    const hexString = x.substring(2); // Remove the '0x' prefix
    const decodedString = Buffer.from(hexString, 'hex').toString('utf-8');

    console.log('Decoded string:', decodedString);

    // Filter out non-printable characters and trim
    return decodedString.replace(/[^ -~]/g, '').trim() || 'N/A'; // return 'N/A' if the result is an empty string
  } else {
    // If the input is not a hexadecimal string, return it as is
    return x;
  }
};

export const camelToSnake = (name) => {
  const snakeName = name.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
  console.log(`Transformed ${name} to ${snakeName}`);
  return snakeName;
};

export const cleanDF = (df, config) => {
  const newColumns = df.columns.map(camelToSnake);
  console.log('Transformed Columns:', newColumns);

  for (const col of df.columns) {
    const type = config[col];
    console.log(`Processing column: ${col}, Type: ${type}`);

    const snakeCol = camelToSnake(col); // Transform column name to snake_case
    if (type === 'Wei') {
      df[snakeCol] = df[col].map(convertWei);
    } else if (type === 'BigInt') {
      df[snakeCol] = df[col].map(convertInt);
    } else if (type === 'Bytes') {
      df[snakeCol] = df[col].map(convertFromBytes);
    }
  }

  df.columns = newColumns;
  console.log('Cleaned Columns:', df.columns);
  console.log('DataFrame after cleaning:', df);

  return df;
};

class Queries {
  constructor(synthetix, gqlEndpointPerps = null, gqlEndpointRates = null, apiKey = null) {
    this.synthetix = synthetix;
    this._gqlEndpointRates = gqlEndpointRates;

    if (gqlEndpointPerps && gqlEndpointPerps.includes('satsuma')) {
      this._gqlEndpointPerps = gqlEndpointPerps.replace('{api_key}', apiKey);
    } else {
      this._gqlEndpointPerps = gqlEndpointPerps || ''; // Set to empty string if null
    }

    // set logging for gql
    // Assuming you have a logging library like Winston or you can use console.log
    // For simplicity, we use console.log here
    console.log('Setting logging level for gql to WARNING');
  }

  _getHeaders() {
    return {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json',
    };
  }

  async _makeRequest(url, payload) {
    try {
      const response = await axios.post(url, payload, { headers: this._getHeaders() });
      return response.data.data;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async _runQuery(query, params, accessor, url) {
    const transport = new AIOHTTPTransport(url);

    try {
      let doneFetching = false;
      let allResults = [];

      while (!doneFetching) {
        const result = await request(url, query, params);

        if (result[accessor].length > 0) {
          allResults = [...allResults, ...result[accessor]];
          params.last_id = allResults[allResults.length - 1].id;
        } else {
          doneFetching = true;
        }
      }

      const df = pd.DataFrame(allResults);
      return df;
    } catch (error) {
      console.error(error);
      return null;
    }
  }
  async _runQuerySync(query, params, accessor, url) {
    const transport = new RequestsHTTPTransport({ url });

    try {
      const session = new Client({
        transport,
        fetchSchemaFromTransport: true,
      });

      let doneFetching = false;
      const allResults = [];

      while (!doneFetching) {
        const result = session.execute(query, { variableValues: params });
        if (result[accessor].length > 0) {
          allResults.push(...result[accessor]);
          params.last_id = allResults[allResults.length - 1].id;
        } else {
          doneFetching = true;
        }
      }

      const df = pd.DataFrame(allResults);
      return df;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async candles(asset, hoursBack = 72, period = 1800) {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const dayAgo = currentTimestamp - hoursBack * 60 * 60;

    const url = this._gqlEndpointRates;
    const params = {
      last_id: '',
      asset,
      min_timestamp: dayAgo,
      max_timestamp: currentTimestamp,
      period,
    };

    const result = await this._runQuery(queries.candles, params, 'candles', url);
    return cleanDF(result, config.candles);
  }

  async tradesForMarket(
    asset = null,
    minTimestamp = 0,
    maxTimestamp = Math.floor(Date.now() / 1000)
  ) {
    let marketKeys;

    if (!asset) {
      marketKeys = Object.values(this.synthetix.v2_markets).map((market) => market.key.hex());
    } else {
      marketKeys = [this.synthetix.v2_markets[asset].key.hex()];
    }

    const url = this._gqlEndpointPerps;
    const params = {
      last_id: '',
      market_keys: marketKeys,
      min_timestamp: minTimestamp,
      max_timestamp: maxTimestamp,
    };

    const result = await this._runQuery(queries.trades_market, params, 'futuresTrades', url);
    return cleanDF(result, config.trades);
  }

  async tradesForAccount(
    account = ADDRESS_ZERO,
    minTimestamp = 0,
    maxTimestamp = Math.floor(Date.now() / 1000)
  ) {
    if (!account) {
      throw new Error('No account specified');
    }

    const url = this._gqlEndpointPerps;
    const params = {
      last_id: '',
      account,
      min_timestamp: minTimestamp,
      max_timestamp: maxTimestamp,
    };

    const result = await this._runQuery(queries.trades_account, params, 'futuresTrades', url);
    return cleanDF(result, config.trades);
  }

  async positionsForMarket(asset = null, openOnly = false) {
    let marketKeys;

    if (!asset) {
      marketKeys = Object.values(this.synthetix.v2_markets).map((market) => market.key.hex());
    } else {
      marketKeys = [this.synthetix.v2_markets[asset].key.hex()];
    }

    const url = this._gqlEndpointPerps;
    const params = {
      last_id: '',
      market_keys: marketKeys,
      is_open: [true] || [true, false],
    };

    const result = await this._runQuery(queries.positions_market, params, 'futuresPositions', url);
    return cleanDF(result, config.positions);
  }

  async positionsForAccount(account = ADDRESS_ZERO, openOnly = false) {
    if (!account) {
      throw new Error('No account specified');
    }

    if (this.synthetix.address !== null && account === ADDRESS_ZERO) {
      account = this.synthetix.address;
    } else if (account === ADDRESS_ZERO) {
      throw new Error('No account specified');
    }

    const url = this._gqlEndpointPerps;
    const params = {
      last_id: '',
      account,
      is_open: [true] || [true, false],
    };

    const result = await this._runQuery(queries.positions_account, params, 'futuresPositions', url);
    return cleanDF(result, config.positions);
  }

  async transfersForMarket(
    asset = null,
    minTimestamp = 0,
    maxTimestamp = Math.floor(Date.now() / 1000)
  ) {
    let marketKeys;

    if (!asset) {
      marketKeys = Object.values(this.synthetix.v2_markets).map((market) => market.key.hex());
    } else {
      marketKeys = [this.synthetix.v2_markets[asset].key.hex()];
    }

    const url = this._gqlEndpointPerps;
    const params = {
      last_id: '',
      market_keys: marketKeys,
      min_timestamp: minTimestamp,
      max_timestamp: maxTimestamp,
    };

    const result = await this._runQuery(
      queries.transfers_market,
      params,
      'futuresMarginTransfers',
      url
    );
    return cleanDF(result, config.transfers);
  }

  async transfersForAccount(
    account = ADDRESS_ZERO,
    minTimestamp = 0,
    maxTimestamp = Math.floor(Date.now() / 1000)
  ) {
    if (this.synthetix.address !== null && account === ADDRESS_ZERO) {
      account = this.synthetix.address;
    } else if (account === ADDRESS_ZERO) {
      throw new Error('No account specified');
    }

    const url = this._gqlEndpointPerps;
    const params = {
      last_id: '',
      account,
      min_timestamp: minTimestamp,
      max_timestamp: maxTimestamp,
    };

    const result = await this._runQuery(
      queries.transfers_account,
      params,
      'futuresMarginTransfers',
      url
    );
    return cleanDF(result, config.transfers);
  }

  async fundingRates(asset = null, minTimestamp = 0, maxTimestamp = Math.floor(Date.now() / 1000)) {
    let marketKeys;

    if (!asset) {
      marketKeys = Object.values(this.synthetix.v2_markets).map((market) => market.key.hex());
    } else {
      marketKeys = [this.synthetix.v2_markets[asset].key.hex()];
    }

    const url = this._gqlEndpointPerps;
    const params = {
      last_id: '',
      market_keys: marketKeys,
      min_timestamp: minTimestamp,
      max_timestamp: maxTimestamp,
    };

    const result = await this._runQuery(queries.funding_rates, params, 'fundingRateUpdates', url);
    return cleanDF(result, config.funding_rates);
  }
}

export default Queries;
