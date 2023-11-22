const { assert } = require('chai');
const { synthetix } = require('@synthetixio/js');
const dotenv = require('dotenv');
const logging = require('logging');

dotenv.config();

// Replace these with your actual environment variables
const RPC = process.env.BASE_TESTNET_RPC;
const ADDRESS = process.env.ADDRESS;

describe('Synthetix Configuration Test', () => {
  it('Connects to Synthetix and gets sUSD balance', async () => {
    try {
      const snxjs = synthetix({
        provider: RPC,
        networkId: 84531,
      });

      const balance = await snxjs.sUSD.balanceOf(ADDRESS);
      console.log('sUSD Balance:', balance.toString());
      assert.ok(balance.gte(0), 'Expected a valid sUSD balance');
    } catch (error) {
      console.error('Error fetching sUSD balance:', error);
      assert.fail('Failed to fetch sUSD balance');
    }
  });
});
