import { ethers } from 'ethers';
import { etherToWei, weiToEther } from '../utils/wei.js';
import { callErc7412, multicallErc7412, writeErc7412 } from '../utils/multicall.js';


export class Core {
  constructor(snx, pyth, defaultAccountId = null) {
    this.snx = snx;
    this.pyth = pyth;
    this.logger = snx.logger;

    (async () => {
      if ('CoreProxy' in snx.contracts) {
        const coreProxyAddress = snx.contracts['CoreProxy']['address'];
        const coreProxyAbi = snx.contracts['CoreProxy']['abi'];
        const accountProxyAddress = snx.contracts['AccountProxy']['address'];
        const accountProxyAbi = snx.contracts['AccountProxy']['abi'];

        this.coreProxy = new ethers.Contract(coreProxyAddress, coreProxyAbi, snx.signer);
        this.accountProxy = new ethers.Contract(accountProxyAddress, accountProxyAbi, snx.signer);

        try {
          await this.getAccountId();
        } catch (error) {
          this.accountId = [];
          this.logger.warning(`Failed to fetch core accounts: ${error}`);
        }

        this.defaultAccountId = defaultAccountId || (this.accountId.length > 0 ? this.accountId[0] : null);
      }
    })();
  }

  

  // Read methods

  getUsdToken() {
    const usdToken = callErc7412(this.snx, this.coreProxy, 'getUsdToken', []);
    return this.snx.ethers.utils.toChecksumAddress(usdToken);
  }

  async getAccountId(address) {
    if (!address) {
      address = this.snx.address;
    }

    const balance = await this.accountProxy.methods.balanceOf(address).call();

    const inputs = Array.from({ length: balance }, (_, i) => [address, i]);
    const accountIds = await multicallErc7412(this.snx, this.accountProxy, 'tokenOfOwnerByIndex', inputs);

    this.accountId = accountIds;
    return accountIds;
  }

  async getMarketPool(marketId) {
    const pool = await this.coreProxy.methods.getMarketPool(marketId).call();
    return pool;
  }

  async getAvailableCollateral(tokenAddress, accountId) {
    if (!accountId) {
      accountId = this.defaultAccountId;
    }

    const availableCollateral = await callErc7412(
      this.snx,
      this.coreProxy,
      'getAccountAvailableCollateral',
      [accountId, tokenAddress]
    );

    return weiToEther(availableCollateral);
  }

  // Write methods

  async createAccount(accountId, submit) {
    let txArgs = [];

    if (accountId) {
      txArgs = [accountId];
    }

    const txParams = this.snx._getTxParams();
    const createAccountTxParams = this.coreProxy.methods.createAccount(...txArgs).encodeABI(txParams);

    if (submit) {
      const txHash = await this.snx.executeTransaction(createAccountTxParams);
      this.logger.info(`Creating account for ${this.snx.address}`);
      this.logger.info(`create_account tx: ${txHash}`);
      return txHash;
    } else {
      return createAccountTxParams;
    }
  }

  async deposit(tokenAddress, amount, accountId, submit) {
    if (!accountId) {
      accountId = this.defaultAccountId;
    }

    const amountWei = etherToWei(amount);

    const txParams = this.snx._getTxParams();
    const depositTxParams = this.coreProxy.methods.deposit(accountId, tokenAddress, amountWei).encodeABI(txParams);

    if (submit) {
      const txHash = await this.snx.executeTransaction(depositTxParams);
      this.logger.info(`Depositing ${amount} ${tokenAddress} for account ${accountId}`);
      this.logger.info(`deposit tx: ${txHash}`);
      return txHash;
    } else {
      return depositTxParams;
    }
  }

  async withdraw(amount, tokenAddress, accountId, submit) {
    if (!accountId) {
      accountId = this.defaultAccountId;
    }

    if (!tokenAddress) {
      tokenAddress = this.getUsdToken();
    }

    const amountWei = etherToWei(amount);

    const withdrawTxArgs = [accountId, tokenAddress, amountWei];
    const withdrawTxParams = writeErc7412(
      this.snx,
      this.coreProxy,
      'withdraw',
      withdrawTxArgs
    );

    if (submit) {
      const txHash = await this.snx.executeTransaction(withdrawTxParams);
      this.logger.info(`Withdrawing ${amount} ${tokenAddress} from account ${accountId}`);
      this.logger.info(`withdraw tx: ${txHash}`);
      return txHash;
    } else {
      return withdrawTxParams;
    }
  }

  async delegateCollateral(tokenAddress, amount, poolId, leverage = 1, accountId, submit) {
    if (!accountId) {
      accountId = this.defaultAccountId;
    }

    const amountWei = etherToWei(amount);
    const leverageWei = etherToWei(leverage);

    const delegateTxParams = writeErc7412(
      this.snx,
      this.coreProxy,
      'delegateCollateral',
      [accountId, poolId, tokenAddress, amountWei, leverageWei]
    );

    if (submit) {
      const txHash = await this.snx.executeTransaction(delegateTxParams);
      this.logger.info(`Delegating ${amount} ${tokenAddress} to pool id ${poolId} for account ${accountId}`);
      this.logger.info(`delegate tx: ${txHash}`);
      return txHash;
    } else {
      return delegateTxParams;
    }
  }

  async mintUsd(tokenAddress, amount, poolId, accountId, submit) {
    if (!accountId) {
      accountId = this.defaultAccountId;
    }

    const amountWei = etherToWei(amount);

    const mintUsdTxParams = writeErc7412(
      this.snx,
      this.coreProxy,
      'mintUsd',
      [accountId, poolId, tokenAddress, amountWei]
    );

    if (submit) {
      const txHash = await this.snx.executeTransaction(mintUsdTxParams);
      this.logger.info(`Minting ${amount} sUSD with ${tokenAddress} collateral against pool id ${poolId} for account ${accountId}`);
      this.logger.info(`mint tx: ${txHash}`);
      return txHash;
    } else {
      return mintUsdTxParams;
    }
  }
}

export default Core;
