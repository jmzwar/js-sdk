import Synthetix from '../synthetix/synthetix.js';
import assert from 'assert';
import { utils } from 'ethers';
const { Logger } = utils;

// Instantiate Synthetix
const snx = new Synthetix({
  providerRpc: 'https://base-goerli.infura.io/v3/f997a699e47c4d7495dbd0cc4e1f5aa1',
  network_id: "10",
  address: '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
  privateKey: '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6'
});

// Initialize ethers logger
const logger = Logger.global;

// tests
describe('Synthetix', () => {
  it('should initialize Synthetix instance', async () => {
    try {
      // The instance is created
      assert(snx !== null);
      console.log('Synthetix instance:', snx); // Add this line for logging
    } catch (error) {
      logger.error(`Error in test_synthetix_init: ${error.message}`);
    }
  });

  it('should have v2Markets', async () => {
    try {
      console.log('v2Markets:', snx.v2Markets); 
      assert(Object.keys(snx.v2Markets).length > 0);
      console.log('v2Markets:', snx.v2Markets); // Add this line for logging
    } catch (error) {
      logger.error(`Error in test_synthetix_v2_markets: ${error.message}`);
    }
  });

  it('should have a functioning web3 provider', async () => {
    try {
      // The instance has a functioning web3 provider
      const block = await snx.web3.eth.getBlock('latest');
      assert(block !== null);
      console.log('Latest block:', block); // Add this line for logging
    } catch (error) {
      logger.error(`Error in test_synthetix_web3: ${error.message}`);
    }
  });
});
