import Synthetix from '../synthetix/synthetix.js';
import { assert } from 'chai';
import { config } from 'dotenv';

config();

let snx;
const address = process.env.ADDRESS;


before(async () => {
  console.log("Initializing Synthetix...");
  snx = new Synthetix({
    providerRpc: process.env.PROVIDER_RPC,
    address,
    privateKey: process.env.PRIVATE_KEY,
    networkId: process.env.NETWORK_ID,
  });
  console.log("Synthetix initialized successfully!");
});


describe('sUSD Tests', () => {
  it('should have a valid sUSD contract', async () => {
    assert(snx.susdToken !== null);
  });

  it('should have a valid sUSD legacy contract', async () => {
    assert(snx.susdLegacyToken !== null);
  });

  it('should have a valid sUSD balance', async () => {
    const balance = await snx.getSUSDBalance(address);

    console.info(`Balance: ${JSON.stringify(balance)}`);
    assert(balance !== null);
    assert(balance.balance >= 0);
  });

  it('should have a valid legacy sUSD balance', async () => {
    const balance = await snx.getSUSDBalance(address, true);
    console.info(`Balance: ${JSON.stringify(balance)}`);
    assert(balance !== null);
    assert(balance.balance >= 0);
  });  
});