const assert = require('assert');
const { ethers } = require('ethers');

const rpcUrl = 'http://127.0.0.1:8545';

const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

describe('Example', () => {
  it('Connects to RPC and gets block number', async () => {
    const isConnected = await provider.getNetwork();
    assert.strictEqual(isConnected.chainId !== null, true, 'Expected to be connected to RPC');

    const blockNumber = await provider.getBlockNumber();
    assert.ok(blockNumber >= 0, 'Expected a valid block number');
  });
});