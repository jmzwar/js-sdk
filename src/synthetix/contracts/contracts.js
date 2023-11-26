import { readdirSync, readFileSync } from 'fs';
import { join, parse, dirname } from 'path';
import { fileURLToPath } from 'url';

function loadContracts(networkId) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  const deploymentDir = join(__dirname, 'deployments', networkId.toString());
  const deploymentFiles = readdirSync(deploymentDir);

  const contracts = {};

  deploymentFiles.forEach((contract) => {
    try {
      const contractData = JSON.parse(readFileSync(join(deploymentDir, contract)));

      // Ensure contractData is an object before accessing properties
      if (contractData && typeof contractData === 'object') {
        const contractName = parse(contract).name;
        contracts[contractName] = contractData;
      } else {
        console.error(`Invalid data in ${contract}. Skipping...`);
      }
    } catch (error) {
      console.error(`Error reading ${contract}: ${error.message}. Skipping...`);
    }
  });

  return contracts;
}

export { loadContracts };
