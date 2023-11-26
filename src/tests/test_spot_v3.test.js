import { assert } from 'chai';
import Synthetix from '../synthetix/synthetix.js';

const logInfo = (message) => console.log(`INFO: ${message}`);

async function testSpotModule(snx) {
  assert.isNotNull(snx.spot);
  assert.isNotNull(snx.perps.marketProxy);
}

async function testSpotBalances(snx) {
  const usdBalance = await snx.spot.getBalance(snx.address, undefined, 'sUSD');
  const ethBalance = await snx.spot.getBalance(snx.address, undefined, 'ETH');

  logInfo(`Address: ${snx.address} - USD balance: ${usdBalance}`);
  logInfo(`Address: ${snx.address} - ETH balance: ${ethBalance}`);
  assert.isNotNull(usdBalance);
  assert.isNotNull(ethBalance);
}

async function testSpotAllowances(snx) {
  const targetAddress = snx.perps.marketProxy.address;

  const usdAllowance = await snx.spot.getAllowance({
    targetAddress,
    marketName: 'sUSD',
  });
  const ethAllowance = await snx.spot.getAllowance({
    targetAddress,
    marketName: 'ETH',
  });

  logInfo(`Address: ${snx.address} - USD allowance: ${usdAllowance}`);
  logInfo(`Address: ${snx.address} - ETH allowance: ${ethAllowance}`);
  assert.isNotNull(usdAllowance);
  assert.isNotNull(ethAllowance);
}

async function testSpotApproval(snx) {
  const approve = await snx.spot.approve({
    spender: snx.perps.marketProxy.address,
    marketName: 'ETH',
  });

  logInfo(`Address: ${snx.address} - tx: ${JSON.stringify(approve)}`);
  assert.isNotNull(approve);
  assert.strictEqual(approve.from, snx.address);
  assert.isNotNull(approve.data);
}

const snx = new Synthetix({
  providerRpc: 'https://base-goerli.infura.io/v3/f997a699e47c4d7495dbd0cc4e1f5aa1',
  address: '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
  privateKey: '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
  networkId: 84531,
});

await testSpotModule(snx);
await testSpotBalances(snx);
await testSpotAllowances(snx);
await testSpotApproval(snx);
