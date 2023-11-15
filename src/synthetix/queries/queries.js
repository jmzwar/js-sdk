const axios = require('axios');
const { Decimal } = require('decimal.js');
const { fromHex, toHex } = require('web3-utils');
const { GraphQLClient } = require('graphql-request');
const { config } = require('./config');

function convert_wei(x) {
    try {
        return parseFloat(new Decimal(x).div(Decimal(10).pow(18)));
    } catch (error) {
        return x;
    }
}

function convert_int(x) {
    try {
        return new Decimal(x);
    } catch (error) {
        return x;
    }
}

function convert_from_bytes(x) {
    return Buffer.from(x.slice(2), 'hex').toString().replace(/\x00/g, '');
}

function convert_to_bytes(inputString) {
    const hexString = Buffer.from(inputString, 'utf-8').toString('hex');
    return '0x' + hexString.padEnd(64, '0');
}

function camel_to_snake(name) {
    let snake = '';
    for (const char of name) {
        if (char.toUpperCase() === char) {
            snake += snake !== '' ? '_' + char.toLowerCase() : char.toLowerCase();
        } else {
            snake += char;
        }
    }
    return snake;
}

function clean_df(df, config) {
    const newColumns = df.columns.map(col => camel_to_snake(col));
    for (const col of df.columns) {
        const type = config[col];
        if (type === 'Wei') {
            df[col] = df[col].map(convert_wei);
        } else if (type === 'BigInt') {
            df[col] = df[col].map(convert_int);
        } else if (type === 'Bytes') {
            df[col] = df[col].map(convert_from_bytes);
        }
    }
    df.columns = newColumns;
    return df;
}

class Queries {
    constructor(synthetix, gqlEndpointPerps = null, gqlEndpointRates = null, apiKey = null) {
        this.synthetix = synthetix;
        this._gqlEndpointRates = gqlEndpointRates;

        if (gqlEndpointPerps.includes('satsuma')) {
            this._gqlEndpointPerps = gqlEndpointPerps.replace('{api_key}', apiKey);
        } else {
            this._gqlEndpointPerps = gqlEndpointPerps;
        }

        // set logging for gql
        const gqlLogger = require('graphql-request/dist/src/utils/logger');
        gqlLogger.default.setLevel(gqlLogger.levels.WARN);
    }

    _getHeaders() {
        return {
            'accept': 'application/json, text/plain, */*',
            'content-type': 'application/json'
        };
    }

    _makeRequest(url, payload) {
        try {
            const response = axios.post(url, payload, { headers: this._getHeaders() });
            return response.data['data'];
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    async _runQuery(query, params, accessor, url) {
        const transport = new AIOHTTPTransport(url);

        const session = new Client({
            transport,
            fetchSchemaFromTransport: true,
        });

        let doneFetching = false;
        let allResults = [];

        while (!doneFetching) {
            const result = await session.request(query, params);
            if (result[accessor].length > 0) {
                allResults.push(...result[accessor]);
                params['last_id'] = allResults[allResults.length - 1]['id'];
            } else {
                doneFetching = true;
            }
        }

        const df = createDataFrame(allResults);
        return df;
    }

    _runQuerySync(query, params, accessor, url) {
        const transport = new RequestsHTTPTransport(url);

        const session = new Client({
            transport,
            fetchSchemaFromTransport: true,
        });

        let doneFetching = false;
        let allResults = [];

        while (!doneFetching) {
            const result = session.request(query, params);
            if (result[accessor].length > 0) {
                allResults.push(...result[accessor]);
                params['last_id'] = allResults[allResults.length - 1]['id'];
            } else {
                doneFetching = true;
            }
        }

        const df = createDataFrame(allResults);
        return df;
    }

    async candles(asset, hoursBack = 72, period = 1800) {
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const dayAgo = currentTimestamp - hoursBack * 60 * 60;

        const url = this._gqlEndpointRates;
        const params = {
            'last_id': '',
            'asset': asset,
            'min_timestamp': dayAgo,
            'max_timestamp': currentTimestamp,
            'period': period
        };

        const result = await this._runQuery(queries['candles'], params, 'candles', url);
        return cleanDf(result, config['candles']);
    }

    async tradesForMarket(asset = null, minTimestamp = 0, maxTimestamp = Math.floor(Date.now() / 1000)) {
        let marketKeys;
        if (!asset) {
            marketKeys = Object.values(this.synthetix.v2Markets).map((market) => market.key.toString('hex'));
        } else {
            marketKeys = [this.synthetix.v2Markets[asset].key.toString('hex')];
        }

        const url = this._gqlEndpointPerps;
        const params = {
            'last_id': '',
            'market_keys': marketKeys,
            'min_timestamp': minTimestamp,
            'max_timestamp': maxTimestamp
        };

        const result = await this._runQuery(queries['tradesMarket'], params, 'futuresTrades', url);
        return cleanDf(result, config['trades']);
    }

    async tradesForAccount(account = ADDRESS_ZERO, minTimestamp = 0, maxTimestamp = Math.floor(Date.now() / 1000)) {
        if (this.synthetix.address !== null && account === ADDRESS_ZERO) {
            account = this.synthetix.address;
        } else if (account === ADDRESS_ZERO) {
            throw new Error('No account specified');
        }
    
        const url = this._gqlEndpointPerps;
        const params = {
            'last_id': '',
            'account': account,
            'min_timestamp': minTimestamp,
            'max_timestamp': maxTimestamp,
        };
        const result = await this._runQuery(queries['trades_account'], params, 'futuresTrades', url);
        return cleanDf(result, config['trades']);
    }
    
    async positionsForMarket(asset = null, openOnly = false) {
        let marketKeys;
        if (!asset) {
            marketKeys = Object.values(this.synthetix.v2Markets).map((market) => market.key.toString('hex'));
        } else {
            marketKeys = [this.synthetix.v2Markets[asset].key.toString('hex')];
        }
    
        const url = this._gqlEndpointPerps;
        const params = {
            'last_id': '',
            'market_keys': marketKeys,
            'is_open': [openOnly]
        };
        const result = await this._runQuery(queries['positions_market'], params, 'futuresPositions', url);
        return cleanDf(result, config['positions']);
    }
    
    async positionsForAccount(account = ADDRESS_ZERO, openOnly = false) {
        if (this.synthetix.address !== null && account === ADDRESS_ZERO) {
            account = this.synthetix.address;
        } else if (account === ADDRESS_ZERO) {
            throw new Error('No account specified');
        }
    
        const url = this._gqlEndpointPerps;
        const params = {
            'last_id': '',
            'account': account,
            'is_open': [openOnly]
        };
        const result = await this._runQuery(queries['positions_account'], params, 'futuresPositions', url);
        return cleanDf(result, config['positions']);
    }
    
    async transfersForMarket(asset = null, minTimestamp = 0, maxTimestamp = Math.floor(Date.now() / 1000)) {
        let marketKeys;
        if (!asset) {
            marketKeys = Object.values(this.synthetix.v2Markets).map((market) => market.key.toString('hex'));
        } else {
            marketKeys = [this.synthetix.v2Markets[asset].key.toString('hex')];
        }
    
        const url = this._gqlEndpointPerps;
        const params = {
            'last_id': '',
            'market_keys': marketKeys,
            'min_timestamp': minTimestamp,
            'max_timestamp': maxTimestamp,
        };
        const result = await this._runQuery(queries['transfers_market'], params, 'futuresMarginTransfers', url);
        return cleanDf(result, config['transfers']);
    }

    async transfersForAccount(account = ADDRESS_ZERO, minTimestamp = 0, maxTimestamp = Math.floor(Date.now() / 1000)) {
        if (this.synthetix.address !== null && account === ADDRESS_ZERO) {
            account = this.synthetix.address;
        } else if (account === ADDRESS_ZERO) {
            throw new Error('No account specified');
        }
    
        const url = this._gqlEndpointPerps;
        const params = {
            'last_id': '',
            'account': account,
            'min_timestamp': minTimestamp,
            'max_timestamp': maxTimestamp,
        };
        const result = await this._runQuery(queries['transfers_account'], params, 'futuresMarginTransfers', url);
        return cleanDf(result, config['transfers']);
    }
    
    async fundingRates(asset = null, minTimestamp = 0, maxTimestamp = Math.floor(Date.now() / 1000)) {
        let marketKeys;
        if (!asset) {
            marketKeys = Object.values(this.synthetix.v2Markets).map((market) => market.key.toString('hex'));
        } else {
            marketKeys = [this.synthetix.v2Markets[asset].key.toString('hex')];
        }
    
        const url = this._gqlEndpointPerps;
        const params = {
            'last_id': '',
            'market_keys': marketKeys,
            'min_timestamp': minTimestamp,
            'max_timestamp': maxTimestamp,
        };
        const result = await this._runQuery(queries['funding_rates'], params, 'fundingRateUpdates', url);
        return cleanDf(result, config['funding_rates']);
    }
    
    
}
