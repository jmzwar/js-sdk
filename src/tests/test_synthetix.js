const { SynthetixJs } = require('synthetix-js');
const os = require('os');

// Instantiate Synthetix
const snx = new SynthetixJs();

// tests
async function testSynthetixInit() {
  try {
    // The instance is created
    assert(snx !== null);
  } catch (error) {
    logger.error(`Error in test_synthetix_init: ${error.message}`);
  }
}

async function testSynthetixV2Markets() {
  try {
    // The instance has markets
    logger.info(`${Object.keys(snx.v2Markets).length} Markets: ${Object.keys(snx.v2Markets)}`);
    assert(Object.keys(snx.v2Markets).length > 0);
  } catch (error) {
    logger.error(`Error in test_synthetix_v2_markets: ${error.message}`);
  }
}

async function testSynthetixWeb3() {
  try {
    // The instance has a functioning web3 provider
    const block = await snx.web3.eth.getBlock('latest');
    logger.info(`Block: ${block}`);
    assert(block !== null);
  } catch (error) {
    logger.error(`Error in test_synthetix_web3: ${error.message}`);
  }
}

// Run the tests
// testSynthetixInit();
// testSynthetixV2Markets();
// testSynthetixWeb3();
