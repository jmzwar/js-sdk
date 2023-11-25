import { config as dotenvConfig } from 'dotenv';
import { default as Web3 } from 'web3';
import { default as Synthetix } from 'synthetix'; 

dotenvConfig();

const RPC = process.env.BASE_TESTNET_RPC;
const ADDRESS = process.env.ADDRESS;

import { default as chai } from 'chai';
import { default as chaiAsPromised } from 'chai-as-promised';

chai.use(chaiAsPromised);

const { expect } = chai;

const snx = async () => {
    const provider = new Web3.providers.HttpProvider(RPC);
    const synthetix = new Synthetix({
        provider,
        address: ADDRESS,
        networkId: 84531,
    });
    return synthetix;
};

const logger = () => {
    const logg = console;
    return logg;
};

export { snx, logger };
