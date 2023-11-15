const Decimal = require('decimal.js');

// default
const DEFAULT_NETWORK_ID = 10;
const DEFAULT_TRACKING_CODE = '0x53594e5448455449585f53444b00000000000000000000000000000000000000';
const DEFAULT_REFERRER = '0x0000000000000000000000000000000000000000';
const DEFAULT_SLIPPAGE = 2.0;

const DEFAULT_GQL_ENDPOINT_PERPS = {
    10: 'https://api.thegraph.com/subgraphs/name/kwenta/optimism-perps',
    420: 'https://api.thegraph.com/subgraphs/name/kwenta/optimism-goerli-perps',
    84531: 'https://subgraph.satsuma-prod.com/{api_key}/synthetix/perps-market-base-testnet/api'
};

const DEFAULT_GQL_ENDPOINT_RATES = {
    10: 'https://api.thegraph.com/subgraphs/name/kwenta/optimism-latest-rates',
    420: 'https://api.thegraph.com/subgraphs/name/kwenta/optimism-goerli-latest-rates',
};

const DEFAULT_PRICE_SERVICE_ENDPOINTS = {
    10: 'https://xc-mainnet.pyth.network',
    420: 'https://xc-testnet.pyth.network',
    84531: 'https://xc-testnet.pyth.network'
};

const ETH_DECIMAL = new Decimal('1e18');
