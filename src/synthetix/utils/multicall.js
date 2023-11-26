import axios from 'axios';
import { Web3 } from 'web3';
import ContractCustomError from 'web3-core-helpers';
import { utils } from 'ethers';
import abi from 'ethereumjs-abi';
import hexConverter from 'hex-encode-decode';

// constants
const ORACLE_DATA_REQUIRED = '0xcf2cabdf';

export function decodeResult(contract, functionName, result) {
  // get the function ABI
  const funcAbi = contract.interface.getFunction(functionName);
  const outputTypes = funcAbi.outputs.map((arg) => arg.type);

  // decode the result
  const decodedResult = utils.defaultAbiCoder.decode(outputTypes, result);

  return decodedResult;
}

// ERC-7412 support
export function decodeErc7412Error(snx, error) {
  // remove the signature and decode the error data
  const errorData = hexConverter.decode(`0x${error.slice(10)}`);

  // decode the result
  const outputTypes = ['address', 'bytes'];
  const [address, data] = abi.rawDecode(outputTypes, errorData);
  const checksumAddress = snx.web3.utils.toChecksumAddress(address);

  // decode the bytes data into the arguments for the oracle
  const outputTypesOracle = ['uint8', 'uint64', 'bytes32[]'];
  const [tag, stalenessTolerance, rawFeedIds] = abi.rawDecode(outputTypesOracle, data);
  const feedIds = rawFeedIds.map((rawFeedId) => hexConverter.encode(rawFeedId));
  return { address: checksumAddress, feedIds, args: { tag, stalenessTolerance, rawFeedIds } };
}

export function makeFulfillmentRequest(snx, address, priceUpdateData, args) {
  const ercContract = new snx.web3.eth.Contract(snx.contracts['ERC7412'].abi, address);

  const encodedArgs = abi.rawEncode(
    ['uint8', 'uint64', 'bytes32[]', 'bytes[]'],
    [...args, priceUpdateData]
  );

  // assume 1 wei per price update
  const value = priceUpdateData.length * 1;

  const updateTx = ercContract.methods.fulfillOracleQuery(encodedArgs);
  return {
    to: updateTx._parent._address,
    data: updateTx.encodeABI(),
    value,
  };
}

export async function writeErc7412(snx, contract, functionName, args, txParams = {}, calls = []) {
  // prepare the initial call
  const thisCall = [
    {
      to: contract._address,
      value: 'value' in txParams ? txParams.value : 0,
      data:
        '0x' +
        contract.methods[functionName](...args)
          .encodeABI()
          .slice(2),
    },
  ];
  calls = calls.concat(thisCall);

  while (true) {
    try {
      // unpack calls into the multicallThrough inputs
      const totalValue = calls.reduce((acc, call) => acc + call.value, 0);

      // create the transaction and do a static call
      const txParams = snx._getTxParams({ value: totalValue });
      const aggregatedTx = snx.multicall.methods.aggregate3Value(calls);
      const txData = aggregatedTx.encodeABI();

      // buffer the gas limit
      const gasLimit = Math.ceil(txParams.gas * 1.15);
      const gasParams = { ...txParams, gas: gasLimit };

      // if simulation passes, return the transaction
      console.log(`Simulated tx successfully: ${JSON.stringify(gasParams)}`);
      return gasParams;
    } catch (error) {
      // check if the error is related to oracle data
      if (error instanceof ContractCustomError && error.data.startsWith(ORACLE_DATA_REQUIRED)) {
        // decode error data
        const { address, feedIds, args } = decodeErc7412Error(snx, error.data);

        // fetch the data from pyth for those feed ids
        const priceUpdateData = await snx.pyth.getFeedsData(feedIds);

        // create a new request
        const { to, data, value } = makeFulfillmentRequest(snx, address, priceUpdateData, args);
        calls = calls.slice(0, -1).concat([{ to, value, data }]).concat(calls.slice(-1));
      } else {
        console.error(`Error is not related to oracle data: ${error}`);
        throw error;
      }
    }
  }
}

export async function callErc7412(snx, contract, functionName, args, calls = [], block = 'latest') {
  // fix args
  args = Array.isArray(args) ? args : [args];

  // prepare the initial calls
  const thisCall = {
    to: contract._address,
    value: 0,
    data: contract.methods[functionName](...args).encodeABI(),
  };
  calls = calls.concat([thisCall]);

  while (true) {
    try {
      const totalValue = calls.reduce((acc, call) => acc + call.value, 0);

      // call it
      const txParams = snx._getTxParams({ value: totalValue });
      const aggregatedTx = snx.multicall.methods.aggregate3Value(calls);
      const callResult = await aggregatedTx.call(txParams, block);

      // call was successful, decode the result
      const decodedResult = decodeResult(
        contract,
        functionName,
        callResult[callResult.length - 1].input
      );
      return decodedResult.length > 1 ? decodedResult : decodedResult[0];
    } catch (error) {
      if (error instanceof ContractCustomError && error.data.startsWith(ORACLE_DATA_REQUIRED)) {
        // decode error data
        const { address, feedIds, args } = decodeErc7412Error(snx, error.data);

        // fetch the data from pyth for those feed ids
        const priceUpdateData = await snx.pyth.getFeedsData(feedIds);

        // create a new request
        const { to, data, value } = makeFulfillmentRequest(snx, address, priceUpdateData, args);
        calls = calls.slice(0, -1).concat([{ to, value, data }]).concat(calls.slice(-1));
      } else {
        console.error(`Error is not related to oracle data: ${error}`);
        throw error;
      }
    }
  }
}

export async function multicallErc7412(
  snx,
  contract,
  functionName,
  argsList,
  calls = [],
  block = 'latest'
) {
  // check if args is a list of lists or tuples
  // correct the format if it is not
  const argsListFixed = argsList.map((args) => (Array.isArray(args) ? args : [args]));
  const numPrependedCalls = calls.length;

  // prepare the initial calls
  const theseCalls = argsListFixed.map((args) => ({
    to: contract._address,
    value: 0,
    data: contract.methods[functionName](...args).encodeABI(),
  }));
  calls = calls.concat(theseCalls);
  const numCalls = calls.length - numPrependedCalls;

  while (true) {
    try {
      const totalValue = calls.reduce((acc, call) => acc + call.value, 0);

      // call it
      const aggregatedTx = snx.multicall.methods.aggregate3Value(calls);
      const callResult = await aggregatedTx.call({ value: totalValue }, block);

      // call was successful, decode the result
      const callsToDecode = callResult.slice(-numCalls);
      const decodedResults = callsToDecode.map((result) =>
        decodeResult(contract, functionName, result.input)
      );
      const flatDecodedResults = decodedResults.map((decodedResult) =>
        Array.isArray(decodedResult) ? decodedResult : [decodedResult]
      );
      return flatDecodedResults;
    } catch (error) {
      if (error instanceof ContractCustomError && error.data.startsWith(ORACLE_DATA_REQUIRED)) {
        // decode error data
        const { address, feedIds, args } = decodeErc7412Error(snx, error.data);

        // fetch the data from pyth for those feed ids
        const priceUpdateData = await snx.pyth.getFeedsData(feedIds);

        // create a new request
        const { to, data, value } = makeFulfillmentRequest(snx, address, priceUpdateData, args);
        calls = [{ to, value, data }].concat(calls);
      } else {
        console.error(`Error is not related to oracle data: ${error}`);
        throw error;
      }
    }
  }
}
