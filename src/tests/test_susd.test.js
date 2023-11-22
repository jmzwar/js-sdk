const { SynthetixJs } = require('synthetix-js');
const os = require('os');


const snx = new SynthetixJs();

// tests
async function testSusdContract() {
  try {
    // The instance has an sUSD contract
    assert(snx.susdToken !== null);
  } catch (error) {
    logger.error(`Error in test_susd_contract: ${error.message}`);
  }
}

async function testSusdLegacyContract() {
  try {
    // The instance has an sUSD legacy contract
    assert(snx.susdLegacyToken !== null);
  } catch (error) {
    logger.error(`Error in test_susd_legacy_contract: ${error.message}`);
  }
}

async function testSusdBalance() {
  try {
    // The instance has an sUSD balance
    const balance = await snx.getSusdBalance();
    logger.info(`Balance: ${JSON.stringify(balance)}`);
    assert(balance !== null);
    assert(balance.balance >= 0);
  } catch (error) {
    logger.error(`Error in test_susd_balance: ${error.message}`);
  }
}

async function testSusdLegacyBalance() {
  try {
    // The instance has a legacy sUSD balance
    const balance = await snx.getSusdBalance({ legacy: true });
    logger.info(`Balance: ${JSON.stringify(balance)}`);
    assert(balance !== null);
    assert(balance.balance >= 0);
  } catch (error) {
    logger.error(`Error in test_susd_legacy_balance: ${error.message}`);
  }
}

// Run the tests
testSusdContract();
testSusdLegacyContract();
testSusdBalance();
testSusdLegacyBalance();
