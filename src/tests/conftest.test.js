const { assert } = require('chai');
const { synthetix } = require('@synthetixio/js');
const dotenv = require('dotenv');
const logging = require('logging');

dotenv.config();

// Replace these with your actual environment variables
const RPC = process.env.BASE_TESTNET_RPC;
const ADDRESS = process.env.ADDRESS;
const NETWORK = process.env.NETWORK || 'mainnet'; 
const snxjs = synthetix({
  provider: RPC,
  networkId: 84531,
});

const logger = () => {
  const logg = logging.getLogger(__filename);
  if (!logg.hasHandlers()) {
    const handler = new logging.StreamHandler();
    handler.setFormatter(new logging.Formatter('%(name)s - %(levelname)s - %(message)s'));
    logg.addHandler(handler);
  }
  return logg;
};

