import { assert } from 'chai';
import Synthetix from '../synthetix/synthetix.js';

describe('Synthetix Spot Module Tests', () => {
  let snx;

  before(async () => {
    snx = new Synthetix({
      providerRpc: 'https://base-goerli.infura.io/v3/f997a699e47c4d7495dbd0cc4e1f5aa1',
      address: '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
      privateKey: '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
      networkId: 84531,
    });

    // Additional setup or async operations if needed
    // e.g., await snx.setupAsyncOperations();
  });

  it('should have a spot module', async () => {
    assert.isNotNull(snx.spot);
    assert.isNotNull(snx.perps.marketProxy);
  });

  it('should fetch synth balances', async () => {
    const usdBalance = await snx.spot.getBalance({ marketName: 'sUSD' });
    const ethBalance = await snx.spot.getBalance({ marketName: 'ETH' });

    assert.isNotNull(usdBalance);
    assert.isNotNull(ethBalance);

    // Add more assertions if needed
  });

  it('should fetch allowances', async () => {
    const targetAddress = snx.perps.marketProxy.address;

    const usdAllowance = await snx.spot.getAllowance({ targetAddress, marketName: 'sUSD' });
    const ethAllowance = await snx.spot.getAllowance({ targetAddress, marketName: 'ETH' });

    assert.isNotNull(usdAllowance);
    assert.isNotNull(ethAllowance);

    // Add more assertions if needed
  });

  it('should approve tokens', async () => {
    const approve = await snx.spot.approve({
      spender: snx.perps.marketProxy.address,
      marketName: 'ETH',
    });

    assert.isNotNull(approve);
    assert.strictEqual(approve.from, snx.address);
    assert.isNotNull(approve.data);

    // Add more assertions if needed
  });
});
