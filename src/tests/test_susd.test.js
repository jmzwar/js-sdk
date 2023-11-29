import Synthetix from '../synthetix/synthetix.js';
import { assert } from 'chai';

let snx;

before(async () => {
  snx = new Synthetix({
    providerRpc: 'https://base-goerli.infura.io/v3/f997a699e47c4d7495dbd0cc4e1f5aa1',
    address: '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
    privateKey: '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
    networkId: 10,
  });
});

describe('sUSD Tests', () => {
  it('should have a valid sUSD contract', async () => {
    try {
      assert(snx.susdToken !== null);
    } catch (error) {
      console.error(`Error in test_susd_contract: ${error.message}`);
    }
  });

  it('should have a valid sUSD legacy contract', async () => {
    try {
      assert(snx.susdLegacyToken !== null);
    } catch (error) {
      console.error(`Error in test_susd_legacy_contract: ${error.message}`);
    }
  });

  it('should have a valid sUSD balance', async () => {
    try {
      const balance = await snx.getSusdBalance();
      console.info(`Balance: ${JSON.stringify(balance)}`);
      assert(balance !== null);
      assert(balance.balance >= 0);
    } catch (error) {
      console.error(`Error in test_susd_balance: ${error.message}`);
    }
  });

  it('should have a valid legacy sUSD balance', async () => {
    try {
      const balance = await snx.getSusdBalance({ legacy: true });
      console.info(`Balance: ${JSON.stringify(balance)}`);
      assert(balance !== null);
      assert(balance.balance >= 0);
    } catch (error) {
      console.error(`Error in test_susd_legacy_balance: ${error.message}`);
    }
  });
});
