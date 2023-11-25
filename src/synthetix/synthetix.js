import { ethers, providers, Wallet } from 'ethers';
import { DEFAULT_NETWORK_ID, DEFAULT_TRACKING_CODE, DEFAULT_SLIPPAGE, DEFAULT_GQL_ENDPOINT_PERPS, DEFAULT_GQL_ENDPOINT_RATES, DEFAULT_PRICE_SERVICE_ENDPOINTS, DEFAULT_REFERRER } from './constants.js';
import { weiToEther, etherToWei } from './utils/wei.js';
import { loadContracts } from './contracts/contracts.js';
import Pyth from './pyth/pyth.js';
import Core from './core/core.js';
import Perps from './perps/perps.js';
import Spot from './spot/spot.js';
import Queries from './queries/queries.js';

class Synthetix {
  constructor({
    providerRpc,
    address = ethers.constants.AddressZero,
    privateKey = null,
    networkId = null,
    coreAccountId = null,
    perpsAccountId = null,
    trackingCode = null,
    referrer = null,
    maxPriceImpact = DEFAULT_SLIPPAGE,
    useEstimateGas = true,
    gqlEndpointPerps = null,
    gqlEndpointRates = null,
    satsumaApiKey = null,
    priceServiceEndpoint = null,
    telegramToken = null,
    telegramChannelName = null
  }) {
    this.logger = new ethers.utils.Logger(this.constructor.name);
    this.logger.level = ethers.utils.Logger.levels.INFO;

    if (!privateKey) {
      throw new Error('Private key is required to initialize Synthetix.');
    }

    if (!providerRpc) {
      throw new Error('Provider RPC is required to initialize Synthetix.');
    }

    const chainId = networkId || DEFAULT_NETWORK_ID;

    if (!chainId) {
      throw new Error('No chainid in body');
    }

    this.networkId = 84531;
    this.trackingCode = trackingCode || DEFAULT_TRACKING_CODE;
    this.referrer = referrer || DEFAULT_REFERRER;
    this.maxPriceImpact = maxPriceImpact || DEFAULT_SLIPPAGE;
    this.privateKey = privateKey;
    this.address = address;
    this.useEstimateGas = useEstimateGas;
    this.providerRpc = providerRpc;

    if (providerRpc.startsWith('http')) {
      this.providerClass = providers.JsonRpcProvider;
    } else if (providerRpc.startsWith('wss')) {
      this.providerClass = providers.WebSocketProvider;
    } else {
      throw new Error('RPC endpoint is invalid');
    }

    const provider = new this.providerClass(providerRpc);
    const signer = new Wallet(privateKey, provider);

    if (!signer.network || !signer.network.chainId) {
      console.warn('ChainId not available, setting to default:', 84531);
      this.networkId = 84531;
    } else if (signer.network.chainId !== chainId) {
      throw new Error('The RPC `chainId` must match the stored `networkId`');
    } else {
      this.networkId = chainId;
      this.nonce =  signer.getTransactionCount();
    }
    
    this.signer = signer;
    this.networkId = networkId;

    this.contracts = loadContracts(networkId);
    this.v2Markets = this.susdLegacyToken = this.susdToken = this.multicall = this._loadContracts();

    if (!gqlEndpointPerps && this.networkId in DEFAULT_GQL_ENDPOINT_PERPS) {
      gqlEndpointPerps = DEFAULT_GQL_ENDPOINT_PERPS[this.networkId];
    }

    if (!gqlEndpointRates && this.networkId in DEFAULT_GQL_ENDPOINT_RATES) {
      gqlEndpointRates = DEFAULT_GQL_ENDPOINT_RATES[this.networkId];
    }

    this.queries = new Queries({
      synthetix: this,
      gqlEndpointPerps,
      gqlEndpointRates,
      apiKey: satsumaApiKey
    });

    if (!priceServiceEndpoint && this.networkId in DEFAULT_PRICE_SERVICE_ENDPOINTS) {
      priceServiceEndpoint = DEFAULT_PRICE_SERVICE_ENDPOINTS[this.networkId];
    }

    this.pyth = new Pyth(this, { priceServiceEndpoint });
    this.core = new Core(this, this.pyth, coreAccountId);
    this.perps = new Perps(this, this.pyth, perpsAccountId);
    this.spot = new Spot(this, this.pyth);

    this.logger.info('Synthetix instance initialized.');
  }

  _loadContracts() {
    const w3 = ethers; // Use ethers here

    const markets = 'PerpsV2MarketData' in this.contracts ?
      (async () => {
        const dataDefinition = this.contracts['PerpsV2MarketData'];
        const dataAddress = dataDefinition['address'];
        const dataAbi = dataDefinition['abi'];

        const marketdataContract = new w3.ethers.Contract(dataAddress, dataAbi);

        try {
          const allMarketsData = await marketdataContract.methods.allProxiedMarketSummaries().call();
          return allMarketsData.map(market => ({
            market_address: market[0],
            asset: market[1].toString('utf-8').trim("\x00"),
            key: market[2],
            maxLeverage: w3.utils.formatUnits(market[3].toString(), 'ether'),
            price: market[4],
            marketSize: market[5],
            marketSkew: market[6],
            marketDebt: market[7],
            currentFundingRate: market[8],
            currentFundingVelocity: market[9],
            takerFee: market[DEFAULT_NETWORK_ID][0],
            makerFee: market[DEFAULT_NETWORK_ID][1],
            takerFeeDelayedOrder: market[DEFAULT_NETWORK_ID][2],
            makerFeeDelayedOrder: market[DEFAULT_NETWORK_ID][3],
            takerFeeOffchainDelayedOrder: market[DEFAULT_NETWORK_ID][4],
            makerFeeOffchainDelayedOrder: market[DEFAULT_NETWORK_ID][5]
          }));
        } catch (e) {
          return [];
        }
      })() :
      [];

    const susdLegacyToken = 'sUSD' in this.contracts ?
      (() => {
        const susdLegacyDefinition = this.contracts['sUSD'];
        const susdLegacyAddress = susdLegacyDefinition['address'];

        return new w3.ethers.Contract(susdLegacyAddress, susdLegacyDefinition['abi']);
      })() :
      null;

    const susdToken = 'USDProxy' in this.contracts ?
      (() => {
        const susdDefinition = this.contracts['USDProxy'];
        const susdAddress = susdDefinition['address'];

        return new w3.Contract(susdAddress, susdDefinition['abi']);
      })() :
      null;

    const multicall = 'TrustedMulticallForwarder' in this.contracts ?
      (() => {
        const mcDefinition = this.contracts['TrustedMulticallForwarder'];
        const mcAddress = mcDefinition['address'];

        return new w3.Contract(mcAddress, mcDefinition['abi']);
      })() :
      null;

    return {
      markets,
      susdLegacyToken,
      susdToken,
      multicall
    };
  }

  _getTxParams(value = 0, to = null) {
    const params = {
      from: this.address,
      chainId: this.networkId,
      value: value,
      nonce: this.nonce
    };

    if (to !== null) {
      params.to = to;
    }

    return params;
  }

  async wait(txHash, timeout = 120) {
    const receipt = await this.providerRpc.waitForTransaction(txHash, { timeout });
    return receipt;
  }

  async executeTransaction(txData) {
    if (this.privateKey === null) {
      throw new Error("No private key specified.");
    }

    if (!("gas" in txData)) {
      txData.gas = this.useEstimateGas ?
        parseInt(await this.signer.estimateGas(txData) * 1.2) :
        1500000;
    }

    const signedTxn = await this.signer.signTransaction(txData);
    const txToken = await this.providerRpc.sendTransaction(signedTxn);

    this.nonce += 1;

    return ethers.utils.hexlify(txToken);
  }

  async getSusdBalance(address = null, legacy = false) {
    if (!address) {
      address = this.address;
    }

    const token = legacy ? this.susdLegacyToken : this.susdToken;

    const balance = await token.methods.balanceOf(address).call();
    return { balance: weiToEther(balance) };
  }

  async getEthBalance(address = null) {
    if (!address) {
      address = this.address;
    }

    const wethContract = new ethers.Contract(
      this.contracts.WETH.address, this.contracts.WETH.abi, this.signer);

    const ethBalance = await this.signer.getBalance(address);
    const wethBalance = await wethContract.methods.balanceOf(address).call();

    return { eth: weiToEther(ethBalance), weth: weiToEther(wethBalance) };
  }

  approve(tokenAddress, targetAddress, amount = null, submit = false) {
    amount = amount === null ? '115792089237316195423570985008687907853269984665640564039457584007913129639935' : etherToWei(amount);
    const tokenContract = new ethers.Contract(tokenAddress, this.contracts.USDProxy.abi, this.signer);

    let txParams = this._getTxParams();
    txParams = { ...txParams, data: tokenContract.methods.approve(targetAddress, amount).encodeABI() };

    if (submit) {
      const txHash =  this.executeTransaction(txParams);
      this.logger.info(`Approving ${targetAddress} to spend ${amount / 1e18} ${tokenAddress} for ${this.address}`);
      this.logger.info(`approve tx: ${txHash}`);
      return txHash;
    } else {
      return txParams;
    }
  }

  async wrapEth(amount, submit = false) {
    const valueWei = etherToWei(Math.max(amount, 0));
    const wethContract = new ethers.Contract(this.contracts.WETH.address, this.contracts.WETH.abi, this.signer);

    let fnName, txArgs;
    if (amount < 0) {
      fnName = 'withdraw';
      txArgs = [etherToWei(Math.abs(amount))];
    } else {
      fnName = 'deposit';
      txArgs = [];
    }

    let txParams = this._getTxParams({ value: valueWei });
    txParams = wethContract.methods[fnName](...txArgs).encodeABI(txParams);

    if (submit) {
      const txHash = await this.executeTransaction(txParams);
      this.logger.info(`Wrapping ${amount} ETH for ${this.address}`);
      this.logger.info(`wrap_eth tx: ${txHash}`);
      return txHash;
    } else {
      return txParams;
    }
  }
}

export default Synthetix;
