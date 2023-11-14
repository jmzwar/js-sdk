const axios = require('axios');
const { ContractCustomError } = require('web3');
const { getAbiOutputTypes } = require('web3-utils');
const { decode, encode } = require('ethereumjs-abi');
const { toBuffer, toHex } = require('ethereumjs-util');

const ORACLE_DATA_REQUIRED = '0xcf2cabdf';

function decodeResult(contract, function_name, result) {
    const funcAbi = contract.getFunctionByName(function_name).abi;
    const outputTypes = getAbiOutputTypes(funcAbi);

    return decode(outputTypes, toBuffer(result));
}

function decodeErc7412Error(snx, error) {
    const errorData = decode_hex(`0x${error.slice(10)}`);

    const outputTypes = ['address', 'bytes'];
    const [address, data] = decode(outputTypes, errorData);
    const checksumAddress = snx.web3.utils.toChecksumAddress(address);

    const outputTypesOracle = ['uint8', 'uint64', 'bytes32[]'];
    const [tag, stalenessTolerance, rawFeedIds] = decode(outputTypesOracle, data);
    const feedIds = rawFeedIds.map((rawFeedId) => toHex(rawFeedId));
    return checksumAddress, feedIds, [tag, stalenessTolerance, rawFeedIds];
}

async function makeFulfillmentRequest(snx, address, priceUpdateData, args) {
    const ercContract = new snx.web3.eth.Contract(snx.contracts['ERC7412'].abi, address);

    const encodedArgs = encode(['uint8', 'uint64', 'bytes32[]', 'bytes[]'], [
        ...args,
        priceUpdateData,
    ]);

    const value = priceUpdateData.length * 1;

    const updateTx = ercContract.methods.fulfillOracleQuery(encodedArgs).encodeABI();
    const gas = await ercContract.methods.fulfillOracleQuery(encodedArgs).estimateGas();

    return { to: address, data: updateTx, value, gas };
}

async function writeErc7412(snx, contract, functionName, args, txParams = {}, calls = []) {
    const thisCall = [
        {
            to: contract.options.address,
            value: 'value' in txParams ? txParams.value : 0,
            data: toBuffer(contract.methods[functionName](...args).encodeABI()).toString('hex'),
        },
    ];

    calls = [...calls, ...thisCall];

    while (true) {
        try {
            const totalValue = calls.reduce((acc, call) => acc + call.value, 0);

            const gas = await snx.multicall.methods.aggregate3Value(calls).estimateGas();
            const gasBuffered = Math.ceil(gas * 1.15);

            snx.logger.info(`Simulated tx successfully: { gas: ${gasBuffered} }`);
            return { gas: gasBuffered };
        } catch (e) {
            if (e instanceof ContractCustomError && e.data.startsWith(ORACLE_DATA_REQUIRED)) {
                const [address, feedIds, args] = decodeErc7412Error(snx, e.data);

                const priceUpdateData = await snx.pyth.getFeedsData(feedIds);

                const { to, data, value, gas } = await makeFulfillmentRequest(
                    snx,
                    address,
                    priceUpdateData,
                    args
                );

                calls = [...calls.slice(0, -1), { to, value, data }, ...calls.slice(-1)];

            } else {
                snx.logger.error(`Error is not related to oracle data: ${e}`);
                throw e;
            }
        }
    }
}

async function callErc7412(snx, contract, functionName, args, calls = [], block = 'latest') {
    args = Array.isArray(args) ? args : [args];

    const thisCall = {
        to: contract.options.address,
        value: 0,
        data: toBuffer(contract.methods[functionName](...args).encodeABI()).toString('hex'),
    };

    calls = [...calls, thisCall];

    while (true) {
        try {
            const totalValue = calls.reduce((acc, call) => acc + call.value, 0);

            const gas = await snx.multicall.methods.aggregate3Value(calls).estimateGas();
            const gasBuffered = Math.ceil(gas * 1.15);

            const callResult = await snx.multicall.methods
                .aggregate3Value(calls)
                .call({ value: totalValue, gas: gasBuffered }, block);

            const decodedResult = decodeResult(contract, functionName, callResult[callResult.length - 1][1]);
            return Array.isArray(decodedResult) && decodedResult.length > 1 ? decodedResult : decodedResult[0];
        } catch (e) {
            if (e instanceof ContractCustomError && e.data.startsWith(ORACLE_DATA_REQUIRED)) {
                const [address, feedIds, args] = decodeErc7412Error(snx, e.data);

                const priceUpdateData = await snx.pyth.getFeedsData(feedIds);

                const { to, data, value, gas } = await makeFulfillmentRequest(
                    snx,
                    address,
                    priceUpdateData,
                    args
                );

                calls = [...calls.slice(0, -1), { to, value, data }, ...calls.slice(-1)];

            } else {
                snx.logger.error(`Error is not related to oracle data: ${e}`);
                throw e;
            }
        }
    }
}

async function multicallErc7412(snx, contract, functionName, argsList, calls = [], block = 'latest') {

    argsList = Array.isArray(argsList[0]) ? argsList : [argsList];
    const numPrependedCalls = calls.length;

    const theseCalls = argsList.map((args) => ({
        to: contract.options.address,
        value: 0,
        data: toBuffer(contract.methods[functionName](...args).encodeABI()).toString('hex'),
    }));

    calls = [...calls, ...theseCalls];
    const numCalls = calls.length - numPrependedCalls;

    while (true) {
        try {
            const totalValue = calls.reduce((acc, call) => acc + call.value, 0);

            const callResult = await snx.multicall.methods
                .aggregate3Value(calls)
                .call({ value: totalValue }, block);

            const callsToDecode = callResult.slice(-numCalls);

            const decodedResults = callsToDecode.map((result) =>
                decodeResult(contract, functionName, result[1])
            );

            return decodedResults.map(
                (decodedResult) => (Array.isArray(decodedResult) && decodedResult.length > 1 ? decodedResult : decodedResult[0])
            );
        } catch (e) {
            if (e instanceof ContractCustomError && e.data.startsWith(ORACLE_DATA_REQUIRED)) {
                const [address, feedIds, args] = decodeErc7412Error(snx, e.data);

                const priceUpdateData = await snx.pyth.getFeedsData(feedIds);

                const { to, data, value, gas } = await makeFulfillmentRequest(
                    snx,
                    address,
                    priceUpdateData,
                    args
                );

                calls = [{ to, value, data }, ...calls];

            } else {
                snx.logger.error(`Error is not related to oracle data: ${e}`);
                throw e;
            }
        }
    }
}

module.exports = {
    decodeResult,
    decodeErc7412Error,
    makeFulfillmentRequest,
    writeErc7412,
    callErc7412,
    multicallErc7412,
};
