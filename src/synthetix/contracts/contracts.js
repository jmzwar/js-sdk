const fs = require('fs');
const path = require('path');

function loadContracts(networkId) {
  const deploymentDir = path.join(__dirname, 'deployments', networkId);
  const deploymentFiles = fs.readdirSync(deploymentDir);

  const contracts = {};

  deploymentFiles.forEach((contract) => {
    const contractData = JSON.parse(fs.readFileSync(path.join(deploymentDir, contract)));
    const contractName = path.parse(contract).name;
    contracts[contractName] = contractData;
  });

  return contracts;
}

// function testLoadContracts() {
//   const networkId = '420';
//   const contracts = loadContracts(networkId);

//   console.log(JSON.stringify(contracts, null, 2));
// }

// if (require.main === module) {
//   testLoadContracts();
// }
