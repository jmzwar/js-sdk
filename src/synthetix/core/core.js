// core.js
const { etherToWei, weiToEther } = require('../utils/wei');
const { callErc7412, multicallErc7412, writeErc7412 } = require('../utils/multicall');
const axios = require('axios');

class Core {
  constructor(snx, pyth, defaultAccountId = null) {
    this.snx = snx;
    this.pyth = pyth;
    this.logger = snx.logger;

    if ('CoreProxy' in snx.contracts) {
      const coreProxyAddress = snx.contracts['CoreProxy']['address'];
      const coreProxyAbi = snx.contracts['CoreProxy']['abi'];
      const accountProxyAddress = snx.contracts['AccountProxy']['address'];
      const accountProxyAbi = snx.contracts['AccountProxy']['abi'];

      this.coreProxy = new snx.web3.eth.Contract(coreProxyAbi, coreProxyAddress);
      this.accountProxy = new snx.web3.eth.Contract(accountProxyAbi, accountProxyAddress);

      try {
        this.getAccountIds();
      } catch (e) {
        this.accountIds = [];
        this.logger.warning(`Failed to fetch core accounts: ${e}`);
      }

      this.defaultAccountId = defaultAccountId || (this.accountIds.length > 0 ? this.accountIds[0] : null);
    }
  }

  getUsdToken() {
    const usdToken = callErc7412(this.snx, this.coreProxy, 'getUsdToken', []);
    return this.snx.web3.utils.toChecksumAddress(usdToken);
  }

  getAccountIds(address = null) {
    if (!address) {
      address = this.snx.address;
    }

    const balance = this.accountProxy.methods.balanceOf(address).call();
    const inputs = Array.from({ length: balance }, (_, i) => [address, i]);

    const accountIds = multicallErc7412(this.snx, this.accountProxy, 'tokenOfOwnerByIndex', inputs);
    this.accountIds = accountIds;
    return accountIds;
  }

  getMarketPool(marketId) {
    const pool = this.coreProxy.methods.getMarketPool(marketId).call();
    return pool;
  }

  getAvailableCollateral(tokenAddress, accountId = null) {
    if (!accountId) {
      accountId = this.defaultAccountId;
    }

    const availableCollateral = callErc7412(this.snx, this.coreProxy, 'getAccountAvailableCollateral', [accountId, tokenAddress]);
    return weiToEther(availableCollateral);
  }

  createAccount(accountId = null, submit = false) {
    const txArgs = !accountId ? [] : [accountId];
    const txParams = this.snx._getTxParams();
    const txData = this.coreProxy.methods.createAccount(...txArgs).encodeABI();
    txParams.data = txData;

    if (submit) {
      const txHash = this.snx.executeTransaction(txParams);
      this.logger.info(`Creating account for ${this.snx.address}`);
      this.logger.info(`create_account tx: ${txHash}`);
      return txHash;
    } else {
      return txParams;
    }
  }

  async deposit(tokenAddress, amount, accountId = null, submit = false) {
    if (!accountId) {
      accountId = this.defaultAccountId;
    }

    const amountWei = etherToWei(amount);
    const txParams = this.snx._getTxParams();
    const txData = this.coreProxy.methods.deposit(accountId, tokenAddress, amountWei).encodeABI();
    txParams.data = txData;

    if (submit) {
      const txHash = this.snx.executeTransaction(txParams);
      this.logger.info(`Depositing ${amount} ${tokenAddress} for account ${accountId}`);
      this.logger.info(`deposit tx: ${txHash}`);
      return txHash;
    } else {
      return txParams;
    }
  }

  async withdraw(amount, tokenAddress = null, accountId = null, submit = false) {
    if (!accountId) {
      accountId = this.defaultAccountId;
    }

    if (!tokenAddress) {
      tokenAddress = this.getUsdToken();
    }

    const amountWei = etherToWei(amount);
    const txArgs = [accountId, tokenAddress, amountWei];
    const txParams = writeErc7412(this.snx, this.coreProxy, 'withdraw', txArgs);

    if (submit) {
      const txHash = this.snx.executeTransaction(txParams);
      this.logger.info(`Withdrawing ${amount} ${tokenAddress} from account ${accountId}`);
      this.logger.info(`withdraw tx: ${txHash}`);
      return txHash;
    } else {
      return txParams;
    }
  }

  async delegateCollateral(tokenAddress, amount, poolId, leverage = 1, accountId = null, submit = false) {
    if (!accountId) {
      accountId = this.defaultAccountId;
    }

    const amountWei = etherToWei(amount);
    const leverageWei = etherToWei(leverage);
    const txParams = writeErc7412(
      this.snx,
      this.coreProxy,
      'delegateCollateral',
      [accountId, poolId, tokenAddress, amountWei, leverageWei]
    );

    if (submit) {
      const txHash = this.snx.executeTransaction(txParams);
      this.logger.info(`Delegating ${amount} ${tokenAddress} to pool id ${poolId} for account ${accountId}`);
      this.logger.info(`delegate tx: ${txHash}`);
      return txHash;
    } else {
      return txParams;
    }
  }

  async mintUsd(tokenAddress, amount, poolId, accountId = null, submit = false) {
    if (!accountId) {
      accountId = this.defaultAccountId;
    }

    const amountWei = etherToWei(amount);
    const txParams = writeErc7412(
      this.snx,
      this.coreProxy,
      'mintUsd',
      [accountId, poolId, tokenAddress, amountWei]
    );

    if (submit) {
      const txHash = this.snx.executeTransaction(txParams);
      this.logger.info(`Minting ${amount} sUSD with ${tokenAddress} collateral against pool id ${poolId} for account ${accountId}`);
      this.logger.info(`mint tx: ${txHash}`);
      return txHash;
    } else {
      return txParams;
    }
  }
}

module.exports = Core;
