import base64 from 'base-64';
import axios from 'axios';

import { PRICE_FEED_IDS } from '../pyth/constants.js';

class Pyth {
    constructor(snx, priceServiceEndpoint = null) {
        this.snx = snx;
        this._priceServiceEndpoint = priceServiceEndpoint;

        if (snx.networkId in PRICE_FEED_IDS) {
            this.priceFeedIds = PRICE_FEED_IDS[snx.networkId];
        }
    }

    getTokensData(tokens) {
        this.snx.logger.info(`Fetching data for tokens: ${tokens}`);
        const feedIds = tokens.map(token => this.priceFeedIds[token]);

        const priceUpdateData = this.getFeedsData(feedIds);
        return priceUpdateData;
    }

    async getFeedsData(feedIds) {
        this.snx.logger.info(`Fetching data for feed ids: ${feedIds}`);
        const url = `${this._priceServiceEndpoint}/api/latest_vaas`;
        const params = {
            'ids[]': feedIds,
        };

        try {
            const response = await axios.get(url, { params, timeout: 10000 });
            const priceUpdateData = response.data.map(rawPud => base64.decode(rawPud));
            return priceUpdateData;
        } catch (err) {
            console.error(err);
            return null;
        }
    }
}

export default Pyth;
