const COLLATERALS_BY_ID = {
    420: {
        0: 'sUSD',
        1: 'BTC',
        2: 'ETH',
    },
    84531: {
        0: 'sUSD',
        1: 'BTC',
        2: 'ETH',
        3: 'LINK'
    }
};


const COLLATERALS_BY_NAME = {};
for (const network in COLLATERALS_BY_ID) {
    COLLATERALS_BY_NAME[network] = {};
    for (const [k, v] of Object.entries(COLLATERALS_BY_ID[network])) {
        COLLATERALS_BY_NAME[network][v] = parseInt(k);
    }
}

const PERPS_MARKETS_BY_ID = {
    420: {
        100: 'ETH',
        200: 'BTC'
    },
    84531: {
        100: 'ETH',
        200: 'BTC',
        300: 'LINK',
        400: 'OP',
        500: 'SNX',
    }
};

const PERPS_MARKETS_BY_NAME = {};
for (const network in PERPS_MARKETS_BY_ID) {
    PERPS_MARKETS_BY_NAME[network] = {};
    for (const [k, v] of Object.entries(PERPS_MARKETS_BY_ID[network])) {
        PERPS_MARKETS_BY_NAME[network][v] = parseInt(k);
    }
}

console.log('COLLATERALS_BY_NAME:', COLLATERALS_BY_NAME);
console.log('PERPS_MARKETS_BY_NAME:', PERPS_MARKETS_BY_NAME);
