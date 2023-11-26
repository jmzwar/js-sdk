export const COLLATERALS_BY_ID = {
  420: {
    0: 'sUSD',
    1: 'BTC',
    2: 'ETH',
  },
  84531: {
    0: 'sUSD',
    1: 'BTC',
    2: 'ETH',
    3: 'LINK',
  },
};

export const COLLATERALS_BY_NAME = Object.fromEntries(
  Object.entries(COLLATERALS_BY_ID).map(([network, values]) => ({
    [network]: Object.fromEntries(Object.entries(values).map(([k, v]) => [v, k])),
  }))
);

export const PERPS_MARKETS_BY_ID = {
  420: {
    100: 'ETH',
    200: 'BTC',
  },
  84531: {
    100: 'ETH',
    200: 'BTC',
    300: 'LINK',
    400: 'OP',
    500: 'SNX',
  },
};

export const PERPS_MARKETS_BY_NAME = Object.fromEntries(
  Object.entries(PERPS_MARKETS_BY_ID).map(([network, values]) => ({
    [network]: Object.fromEntries(Object.entries(values).map(([k, v]) => [v, k])),
  }))
);
