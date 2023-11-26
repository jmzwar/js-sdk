const SPOT_MARKETS_BY_ID = {
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
    4: 'OP',
    5: 'SNX',
  },
};

const SPOT_MARKETS_BY_NAME = {};
for (const network in SPOT_MARKETS_BY_ID) {
  SPOT_MARKETS_BY_NAME[network] = {};
  for (const key in SPOT_MARKETS_BY_ID[network]) {
    SPOT_MARKETS_BY_NAME[network][SPOT_MARKETS_BY_ID[network][key]] = key;
  }
}

export { SPOT_MARKETS_BY_ID, SPOT_MARKETS_BY_NAME };
