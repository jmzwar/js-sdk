
const { raises } = require('assert');

async function testSpotModule() {
  try {
    // The instance has a spot module
    assert(snx.spot !== null);
    assert(snx.perps.marketProxy !== null);
  } catch (error) {
    logger.error(`Error in test_spot_module: ${error.message}`);
  }
}

async function testSpotBalances() {
  try {
    // The instance can fetch a synth balance
    const usdBalance = await snx.spot.getBalance({ marketName: 'sUSD' });
    const ethBalance = await snx.spot.getBalance({ marketName: 'ETH' });

    logger.info(`Address: ${snx.address} - USD balance: ${JSON.stringify(usdBalance)}`);
    logger.info(`Address: ${snx.address} - ETH balance: ${JSON.stringify(ethBalance)}`);
    assert(usdBalance !== null);
    assert(ethBalance !== null);
  } catch (error) {
    logger.error(`Error in test_spot_balances: ${error.message}`);
  }
}

async function testSpotAllowances() {
  try {
    // The instance can fetch the allowance for a specified address
    const targetAddress = snx.perps.marketProxy.address;

    const usdAllowance = await snx.spot.getAllowance({ targetAddress, marketName: 'sUSD' });
    const ethAllowance = await snx.spot.getAllowance({ targetAddress, marketName: 'ETH' });

    logger.info(`Address: ${snx.address} - USD allowance: ${JSON.stringify(usdAllowance)}`);
    logger.info(`Address: ${snx.address} - ETH allowance: ${JSON.stringify(ethAllowance)}`);
    assert(usdAllowance !== null);
    assert(ethAllowance !== null);
  } catch (error) {
    logger.error(`Error in test_spot_allowances: ${error.message}`);
  }
}

async function testSpotApproval() {
  try {
    // The instance can approve a token
    const approve = await snx.spot.approve({
      spender: snx.perps.marketProxy.address,
      marketName: 'ETH',
    });

    logger.info(`Address: ${snx.address} - tx: ${JSON.stringify(approve)}`);
    assert(approve !== null);
    assert(approve.from === snx.address);
    assert(approve.data !== null);
  } catch (error) {
    logger.error(`Error in test_spot_approval: ${error.message}`);
  }
}


// Run the tests
// testSpotModule();
// testSpotBalances();
// testSpotAllowances();
// testSpotApproval();
