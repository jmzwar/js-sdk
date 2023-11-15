const { Synthetix } = require('synthetix'); // Assuming a Synthetix library for JavaScript

require('dotenv').config();

// Constants
const RPC = process.env.BASE_TESTNET_RPC;
const ADDRESS = process.env.ADDRESS;

// Fixtures
const snx = new Synthetix({
    providerRpc: RPC,
    address: ADDRESS,
    networkId: 84531,
});

const logger = () => {
    const logg = console;
    logg.log = logg.info; 
    return logg;
};

// Usage
// describe('Your test suite', () => {
//     it('Your test case', () => {
//         // Write your test case using the snx and logger objects
//     });
// });
