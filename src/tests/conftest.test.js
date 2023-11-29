import { config as dotenvConfig } from 'dotenv';
import { ethers } from 'ethers';
import { Synthetix } from '../synthetix';

dotenvConfig();

const RPC = process.env.PROVIDER_RPC;
const ADDRESS = process.env.ADDRESS;

import { default as chai } from 'chai';
import { default as chaiAsPromised } from 'chai-as-promised';

chai.use(chaiAsPromised);

const { providers } = ethers;

const snx = async () => {
  const provider = new providers.JsonRpcProvider(RPC);

  const synthetix = new Synthetix({
    provider,
    address: ADDRESS,
    networkId: 84531,
  });

  return synthetix;
};

export { snx };
