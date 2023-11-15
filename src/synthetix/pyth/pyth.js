const base64 = require('base-64');
const axios = require('axios');

const { PRICE_FEED_IDS } = require('./constants');

class Pyth {
    // Class for interacting with the Pyth price service. The price service is
    // connected to the endpoint specified as ``price_service_endpoint`` when
    // initializing the ``Synthetix`` class::
    
    //     snx = Synthetix(
    //         ...,
    //         price_service_endpoint='https://api.pyth.network'
    //     )
    
    // If an endpoint isn't specified, the default endpoint is used. The default
    // endpoint should be considered unreliable for production applications.
    
    // The ``Pyth`` class is used to fetch the latest price update data for a list
    // of tokens or feed ids::
    
    //     price_update_token = snx.pyth.get_tokens_data(['SNX', 'ETH'])
    //     price_update_feed = snx.pyth.get_feeds_data(['0x12345...', '0xabcde...'])
    
    // :param Synthetix snx: Synthetix class instance
    // :param str price_service_endpoint: Pyth price service endpoint
    // :return: Pyth class instance
    // :rtype: Pyth
    constructor(snx, priceServiceEndpoint = null) {
        this.snx = snx;
        this._priceServiceEndpoint = priceServiceEndpoint;

        if (snx.networkId in PRICE_FEED_IDS) {
            this.priceFeedIds = PRICE_FEED_IDS[snx.networkId];
        }
    }

    getTokensData(tokens) {
        // Fetch the pyth data for a list of tokens. The tokens must be in the constant
        // file stored at the time the package is built. For a more reliable approach,
        // specify the ``feed_id`` using the ``get_feeds_data`` method.
        
        // Usage::

        //     >>> snx.pyth.get_tokens_data(['ETH', 'SNX'])
        //     [b'...', b'...']
    
        // :param [str] tokens: List of tokens to fetch data for
        // :return: List of price update data
        // :rtype: [bytes] | None
        this.snx.logger.info(`Fetching data for tokens: ${tokens}`);
        const feedIds = tokens.map((token) => this.priceFeedIds[token]);

        const priceUpdateData = this.getFeedsData(feedIds);
        return priceUpdateData;
    }

    async getFeedsData(feedIds) {
   s
        this.snx.logger.info(`Fetching data for feed ids: ${feedIds}`);
        const url = `${this._priceServiceEndpoint}/api/latest_vaas`;
        const params = {
            'ids[]': feedIds,
        };

        try {
            const response = await axios.get(url, { params, timeout: 10000 });
            const priceUpdateData = response.data.map((rawPud) => base64.decode(rawPud));
            return priceUpdateData;
        } catch (err) {
            console.error(err);
            return null;
        }
    }
}

module.exports = Pyth;
