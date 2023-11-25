import { assert } from 'chai';
import { ethers } from 'ethers';
import Synthetix from '../synthetix/synthetix.js';

describe('Synthetix', () => {
  let snx;

  before(async () => {
    snx = new Synthetix({
      providerRpc: 'https://base-goerli.infura.io/v3/f997a699e47c4d7495dbd0cc4e1f5aa1',
      address: '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
      privateKey: '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
      networkId: 84531,
    });

    console.info('Synthetix instance created:', snx);
  });

  it('should initialize Synthetix', () => {
    assert.isNotNull(snx);
  });

  it('should have v2 markets', () => {
    console.info(`${Object.keys(snx.v2Markets).length} Markets: ${Object.keys(snx.v2Markets)}`);
    assert.isAbove(Object.keys(snx.v2Markets).length, 0);
  });

  it('should have a functioning ethers provider', async () => {
    try {
      console.log('snx:', snx);

      // Use the provider directly to get the block
      const provider = new ethers.providers.JsonRpcProvider(snx.providerRpc);
      const block = await provider.getBlock('latest');

      console.info(`Block: ${JSON.stringify(block)}`);
      assert.isNotNull(block);
    } catch (error) {
      console.error('Error fetching block:', error);
      assert.fail('Failed to fetch block');
    }
  });
});
