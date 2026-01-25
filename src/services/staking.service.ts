/**
 * Staking Service for Cardano
 * Handles staking operations including registration, delegation, and rewards
 */

import { Logger } from "../utils/logger.js";
import { ErrorHandler } from "../utils/errorHandler.js";
import { FireblocksService } from "./fireblocks.service.js";
import { IagonApiService } from "./iagon.api.service.js";

import {
  getCertificateFromBaseAddress,
  getStakeAddressFromBaseAddress,
  buildRegistrationCertificate,
  buildDelegationCertificate,
  buildDeregistrationCertificate,
  buildVoteDelegationCertificate,
  serializeWithdrawals,
  buildPayload,
  embedSignaturesInTx,
  getSigningPayload,
  calculateTtl,
  findSuitableUtxo,
  drepActionToDRepInfo,
  DEFAULT_NATIVE_TX_FEE,
  DEPOSIT_AMOUNT,
  MIN_UTXO_VALUE_ADA_ONLY,
  stakeAddressBytesPrefix,
} from "../utils/staking.utils.js";
import {
  RegisterStakingOptions,
  DelegationOptions,
  DeregisterStakingOptions,
  WithdrawRewardsOptions,
  DRepDelegationOptions,
  StakingTransactionResult,
  RewardsData,
  CardanoWitness,
  CardanoRewardWithdrawal,
  Networks,
  SupportedAssets,
  TransferResponse,
  StakingOperation,
  IagonApiError,
} from "../types/index.js";
import { TransactionRequest, TransactionOperation, TransferPeerPathType } from "@fireblocks/ts-sdk";

export class StakingService {
  private readonly logger = new Logger("services:staking-service");
  private readonly errorHandler = new ErrorHandler("staking-service", this.logger);
  private readonly fireblocksService: FireblocksService;
  private readonly iagonApiService: IagonApiService;
  private readonly network: Networks;
  private readonly assetId: SupportedAssets;

  constructor(
    fireblocksService: FireblocksService,
    iagonApiService: IagonApiService,
    network: Networks = Networks.MAINNET
  ) {
    this.fireblocksService = fireblocksService;
    this.iagonApiService = iagonApiService;
    this.network = network;
    this.assetId =
      this.network === Networks.MAINNET ? SupportedAssets.ADA : SupportedAssets.ADA_TEST;
  }

  /**
   * Send transaction hash for signing with Fireblocks
   */
  private async sendForSigning(
    txHash: string,
    vaultAccountId: string,
    operation: string,
    addressIndex: number = 0
  ): Promise<CardanoWitness[]> {
    try {
      const payload: TransactionRequest = {
        assetId: this.assetId,
        operation: TransactionOperation.Raw,
        source: {
          type: TransferPeerPathType.VaultAccount,
          id: vaultAccountId,
        },
        note: `Cardano ${operation} for vault account ${vaultAccountId}`,
        extraParameters: {
          rawMessageData: {
            messages: [
              { content: txHash, bip44addressIndex: addressIndex }, // Payment key signature
              { content: txHash, bip44addressIndex: 2 }, // Staking key signature
            ],
          },
        },
      };

      this.logger.info(`Sending transaction for signing: ${operation}`);

      // Need to use different method that returns ALL signed messages
      const transactionResponse = await this.fireblocksService.broadcastTransaction(payload);

      if (transactionResponse === null) {
        throw new IagonApiError(
          "Transaction response is null",
          503,
          "NULL_RESPONSE",
          {},
          "staking-service"
        );
      }

      const txData = transactionResponse.data;

      // Extract BOTH signatures
      if (!txData || txData.length !== 2) {
        throw new IagonApiError(
          `Expected 2 signatures (payment + staking keys), got ${txData?.length || 0}`,
          500,
          "INVALID_SIGNATURE_COUNT",
          {},
          "staking-service"
        );
      }

      const witnesses: CardanoWitness[] = txData.map((msg) => ({
        pubKey: Buffer.from(msg.publicKey!, "hex"),
        signature: Buffer.from(msg.signature!.fullSig!, "hex"),
      }));

      return witnesses;
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, `sending transaction for signing`);
    }
  }

  /**
   * Get current TTL based on latest slot
   */
  private async getTtl(): Promise<number> {
    try {
      const epochResponse = await this.iagonApiService.getCurrentEpoch();

      const currentSlot = epochResponse.data.tip.slot;
      this.logger.info(`Current slot: ${currentSlot}`);
      return calculateTtl(currentSlot);
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, `fetching current slot for TTL`);
    }
  }

  /**
   * Get stake address for a vault account
   * Extracts the BASE address and derives the stake address
   */
  public async getStakeAddress(vaultAccountId: string): Promise<string> {
    const addresses = await this.fireblocksService.getVaultAccountAddresses(
      vaultAccountId,
      this.assetId
    );

    const baseAddressObj = addresses.find((addr) => addr.addressFormat === "BASE");
    if (!baseAddressObj) {
      throw new IagonApiError(
        `No BASE address found for vault account ${vaultAccountId}`,
        400,
        "NO_BASE_ADDRESS",
        { vaultAccountId },
        "staking-service"
      );
    }
    const baseAddress = baseAddressObj.address;

    if (!baseAddress) {
      throw new IagonApiError(
        `No BASE address found for vault account ${vaultAccountId}`,
        400,
        "NO_BASE_ADDRESS",
        { vaultAccountId },
        "staking-service"
      );
    }

    return getStakeAddressFromBaseAddress(baseAddress, this.network === Networks.MAINNET);
  }

  /**
   * Query rewards for a stake address
   */
  private async queryRewards(stakeAddress: string): Promise<RewardsData> {
    try {
      const [accountInfo, rewardsResponse, withdrawalHistory] = await Promise.all([
        this.iagonApiService.getStakeAccountInfo(stakeAddress),
        this.iagonApiService.getStakeAccountRewards(stakeAddress),
        this.iagonApiService.getWithdrawalHistory(stakeAddress),
      ]);

      const rewards = rewardsResponse.data.map((reward) => ({
        poolId: reward.pool_id,
        amount: reward.amount,
        epoch: reward.epoch,
      }));

      const availableRewards = parseInt(accountInfo.data.available_rewards, 10);
      const totalRewards = parseInt(accountInfo.data.rewards_sum, 10);
      const totalWithdrawals = parseInt(accountInfo.data.withdrawn_rewards, 10);

      this.logger.info(
        `Rewards summary for ${stakeAddress}: Available: ${availableRewards}, Total: ${totalRewards}, Withdrawn: ${totalWithdrawals}, Withdrawal History: ${withdrawalHistory.data.length} records`
      );

      return {
        rewards,
        availableRewards,
        totalRewards,
        totalWithdrawals,
      };
    } catch (error: any) {
      throw this.errorHandler.handleApiError(
        error,
        `querying rewards for stake address ${stakeAddress}`
      );
    }
  }

  /**
   * Get withdrawals for deregistration or reward withdrawal
   */
  private async getWithdrawals(
    stakeAddress: string,
    certificate: Buffer,
    maxWithdrawal: number
  ): Promise<{ withdrawal: CardanoRewardWithdrawal; rewardAmount: number }> {
    const rewardsData = await this.queryRewards(stakeAddress);
    const availableRewards = rewardsData.availableRewards;

    this.logger.info(`Total available rewards: ${availableRewards} Lovelace`);

    let rewardAmount = availableRewards;
    if (rewardAmount === 0) {
      this.logger.info("No rewards to withdraw");
    } else if (rewardAmount > maxWithdrawal) {
      rewardAmount = maxWithdrawal;
    }

    const withdrawalCertificate = Buffer.concat([
      stakeAddressBytesPrefix(this.network === Networks.MAINNET),
      certificate,
    ]);

    const withdrawal: CardanoRewardWithdrawal = {
      certificate: withdrawalCertificate,
      reward: rewardAmount,
    };

    return { withdrawal, rewardAmount };
  }

  /**
   * Register staking credential for a vault account
   * Automatically finds an address with suitable pure ADA UTXO
   */
  public async registerStakingCredential(
    options: RegisterStakingOptions
  ): Promise<(StakingTransactionResult & { stakeAddress: string; addressIndex: number }) | null> {
    const { vaultAccountId, depositAmount = DEPOSIT_AMOUNT, fee = DEFAULT_NATIVE_TX_FEE } = options;

    this.logger.info(`Registering staking credential for vault account ${vaultAccountId}`);

    try {
      const existingRegistration = await this.checkExistingRegistration(vaultAccountId);
      if (existingRegistration) {
        return null;
      }

      const { address, addressIndex, utxo } = await this.findAddressWithSuitableUtxo(
        vaultAccountId,
        depositAmount + fee
      );

      const txHash = await this.buildAndSubmitRegistration({
        vaultAccountId,
        address,
        addressIndex,
        utxo,
        depositAmount,
        fee,
      });

      const stakeAddress = await this.getStakeAddress(vaultAccountId);

      this.verifyRegistrationAsync(stakeAddress);

      return {
        txHash,
        status: "submitted",
        operation: StakingOperation.REGISTER,
        stakeAddress,
        addressIndex,
      };
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, "registering staking credential");
    }
  }

  /**
   * Delegate to a stake pool
   */
  public async delegateToPool(options: DelegationOptions): Promise<StakingTransactionResult> {
    try {
      const { vaultAccountId, poolId, index = 0, fee = DEFAULT_NATIVE_TX_FEE } = options;

      this.logger.info(`Delegating to pool ${poolId} for vault account ${vaultAccountId}`);

      // Get vault account addresses
      const addresses = await this.fireblocksService.getVaultAccountAddresses(
        vaultAccountId,
        this.assetId
      );

      const baseAddressObj = addresses.find((addr) => addr.addressFormat === "BASE");
      if (!baseAddressObj) {
        throw new IagonApiError(
          "No BASE address found for vault account",
          400,
          "NO_BASE_ADDRESS",
          { vaultAccountId },
          "staking-service"
        );
      }
      const baseAddress = baseAddressObj.address;

      if (!baseAddress) {
        throw new IagonApiError(
          "No BASE address found for vault account",
          400,
          "NO_BASE_ADDRESS",
          { vaultAccountId },
          "staking-service"
        );
      }

      // Get stake credential
      const certificate = getCertificateFromBaseAddress(
        baseAddress,
        this.network === Networks.MAINNET
      );

      // Get UTXOs
      const utxosResponse = await this.iagonApiService.getUtxosByAddress(baseAddress);
      if (!utxosResponse.data || utxosResponse.data.length === 0) {
        throw new IagonApiError(
          "No UTXOs available for transaction",
          400,
          "NO_UTXOS",
          { vaultAccountId },
          "staking-service"
        );
      }

      // Find suitable UTXO
      const minInputAmount = MIN_UTXO_VALUE_ADA_ONLY + fee;
      const utxo = findSuitableUtxo(utxosResponse.data, minInputAmount);
      if (!utxo) {
        throw new IagonApiError(
          `No UTXO found with at least ${minInputAmount} Lovelace`,
          400,
          "NO_SUITABLE_UTXO",
          { vaultAccountId },
          "staking-service"
        );
      }

      const netAmount = utxo.nativeAmount - fee;

      // Build delegation certificate
      const delegationCertificate = buildDelegationCertificate(certificate, poolId);

      // Build transaction
      const ttl = await this.getTtl();
      const { serialized, deserialized } = buildPayload({
        toAddress: baseAddress,
        netAmount,
        txInputs: [{ txHash: Buffer.from(utxo.txHash, "hex"), indexInTx: utxo.indexInTx }],
        feeAmount: fee,
        ttl,
        certificates: [delegationCertificate],
        network: this.network,
      });

      // Sign transaction
      const txHash = getSigningPayload(serialized);
      const witnesses = await this.sendForSigning(
        txHash.toString("hex"),
        vaultAccountId,
        `delegate to pool ${poolId}`
      );

      // Embed signatures
      const signedTx = embedSignaturesInTx(deserialized, witnesses);

      // Submit transaction
      const submitResponse = await this.iagonApiService.submitTransfer(signedTx.toString("hex"));

      this.logger.info(`Delegation transaction submitted: ${submitResponse.data.txHash}`);

      return {
        txHash: submitResponse.data.txHash,
        status: "submitted",
        operation: StakingOperation.DELEGATE,
      };
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, "delegating to stake pool");
    }
  }

  /**
   * Deregister staking credential (includes reward withdrawal)
   */
  public async deregisterStakingCredential(
    options: DeregisterStakingOptions
  ): Promise<StakingTransactionResult> {
    try {
      const { vaultAccountId, index = 0, fee = DEFAULT_NATIVE_TX_FEE } = options;

      this.logger.info(`Deregistering staking credential for vault account ${vaultAccountId}`);

      // Get vault account addresses
      const addresses = await this.fireblocksService.getVaultAccountAddresses(
        vaultAccountId,
        this.assetId
      );

      const baseAddressObj = addresses.find((addr) => addr.addressFormat === "BASE");
      if (!baseAddressObj) {
        throw new IagonApiError(
          "No BASE address found for vault account",
          400,
          "NO_BASE_ADDRESS",
          { vaultAccountId },
          "staking-service"
        );
      }
      const baseAddress = baseAddressObj.address;

      if (!baseAddress) {
        throw new IagonApiError(
          "No BASE address found for vault account",
          400,
          "NO_BASE_ADDRESS",
          { vaultAccountId },
          "staking-service"
        );
      }

      // Get stake credential and stake address
      const certificate = getCertificateFromBaseAddress(
        baseAddress,
        this.network === Networks.MAINNET
      );
      const stakeAddress = getStakeAddressFromBaseAddress(
        baseAddress,
        this.network === Networks.MAINNET
      );

      // Get withdrawals
      const { withdrawal, rewardAmount } = await this.getWithdrawals(
        stakeAddress,
        certificate,
        Infinity
      );

      // Get UTXOs
      const utxosResponse = await this.iagonApiService.getUtxosByAddress(baseAddress);
      if (!utxosResponse.data || utxosResponse.data.length === 0) {
        throw new IagonApiError(
          "No UTXOs available for transaction",
          400,
          "NO_UTXOS",
          { vaultAccountId },
          "staking-service"
        );
      }

      // Find suitable UTXO
      const minInputAmount = MIN_UTXO_VALUE_ADA_ONLY + fee;
      const utxo = findSuitableUtxo(utxosResponse.data, minInputAmount);
      if (!utxo) {
        throw new IagonApiError(
          `No UTXO found with at least ${minInputAmount} Lovelace`,
          400,
          "NO_SUITABLE_UTXO",
          { vaultAccountId },
          "staking-service"
        );
      }

      const netAmount = utxo.nativeAmount - fee + DEPOSIT_AMOUNT + rewardAmount;

      // Build deregistration certificate (Conway era)
      const deregistrationCertificate = buildDeregistrationCertificate(certificate);

      // Serialize withdrawals
      const withdrawalsDict = serializeWithdrawals([withdrawal]);

      // Build transaction
      const ttl = await this.getTtl();
      const { serialized, deserialized } = buildPayload({
        toAddress: baseAddress,
        netAmount,
        txInputs: [{ txHash: Buffer.from(utxo.txHash, "hex"), indexInTx: utxo.indexInTx }],
        feeAmount: fee,
        ttl,
        certificates: [deregistrationCertificate],
        withdrawals: withdrawalsDict,
        network: this.network,
      });

      // Sign transaction
      const txHash = getSigningPayload(serialized);
      const witnesses = await this.sendForSigning(
        txHash.toString("hex"),
        vaultAccountId,
        "deregister staking credential"
      );

      // Embed signatures
      const signedTx = embedSignaturesInTx(deserialized, witnesses);

      // Submit transaction
      const submitResponse = await this.iagonApiService.submitTransfer(signedTx.toString("hex"));

      this.logger.info(`Deregistration transaction submitted: ${submitResponse.data.txHash}`);

      return {
        txHash: submitResponse.data.txHash,
        status: "submitted",
        operation: StakingOperation.DEREGISTER,
      };
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, "deregistering staking credential");
    }
  }

  /**
   * Withdraw staking rewards
   */
  public async withdrawRewards(options: WithdrawRewardsOptions): Promise<TransferResponse> {
    try {
      const { vaultAccountId, limit, index = 0, fee = DEFAULT_NATIVE_TX_FEE } = options;

      this.logger.info(`Withdrawing rewards for vault account ${vaultAccountId}`);

      // Get vault account addresses
      const addresses = await this.fireblocksService.getVaultAccountAddresses(
        vaultAccountId,
        this.assetId
      );

      const baseAddressObj = addresses.find((addr) => addr.addressFormat === "BASE");
      if (!baseAddressObj) {
        throw new IagonApiError(
          "No BASE address found for vault account",
          400,
          "NO_BASE_ADDRESS",
          { vaultAccountId },
          "staking-service"
        );
      }
      const baseAddress = baseAddressObj.address;

      if (!baseAddress) {
        throw new IagonApiError(
          "No BASE address found for vault account",
          400,
          "NO_BASE_ADDRESS",
          { vaultAccountId },
          "staking-service"
        );
      }

      // Get stake credential and stake address
      const certificate = getCertificateFromBaseAddress(
        baseAddress,
        this.network === Networks.MAINNET
      );
      const stakeAddress = getStakeAddressFromBaseAddress(
        baseAddress,
        this.network === Networks.MAINNET
      );

      // Get withdrawals
      const maxWithdrawal = limit !== undefined ? limit : Infinity;
      const { withdrawal, rewardAmount } = await this.getWithdrawals(
        stakeAddress,
        certificate,
        maxWithdrawal
      );

      if (rewardAmount === 0) {
        return {
          success: false,
          data: {
            txHash: "",
          },
          error: "No rewards available for withdrawal",
        };
      }

      // Get UTXOs
      const utxosResponse = await this.iagonApiService.getUtxosByAddress(baseAddress);
      if (!utxosResponse.data || utxosResponse.data.length === 0) {
        throw new IagonApiError(
          "No UTXOs available for transaction",
          400,
          "NO_UTXOS",
          { vaultAccountId },
          "staking-service"
        );
      }

      // Find suitable UTXO
      const minInputAmount = MIN_UTXO_VALUE_ADA_ONLY + fee;
      const utxo = findSuitableUtxo(utxosResponse.data, minInputAmount);
      if (!utxo) {
        throw new IagonApiError(
          `No UTXO found with at least ${minInputAmount} Lovelace`,
          400,
          "NO_SUITABLE_UTXO",
          { vaultAccountId },
          "staking-service"
        );
      }

      const netAmount = utxo.nativeAmount - fee + rewardAmount;

      // Serialize withdrawals
      const withdrawalsDict = serializeWithdrawals([withdrawal]);

      // Build transaction
      const ttl = await this.getTtl();
      const { serialized, deserialized } = buildPayload({
        toAddress: baseAddress,
        netAmount,
        txInputs: [{ txHash: Buffer.from(utxo.txHash, "hex"), indexInTx: utxo.indexInTx }],
        feeAmount: fee,
        ttl,
        withdrawals: withdrawalsDict,
        network: this.network,
      });

      // Sign transaction
      const txHash = getSigningPayload(serialized);
      const witnesses = await this.sendForSigning(
        txHash.toString("hex"),
        vaultAccountId,
        "withdraw staking rewards"
      );

      // Embed signatures
      const signedTx = embedSignaturesInTx(deserialized, witnesses);

      // Submit transaction
      const submitResponse = await this.iagonApiService.submitTransfer(signedTx.toString("hex"));

      this.logger.info(`Reward withdrawal transaction submitted: ${submitResponse.data.txHash}`);

      return submitResponse;
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, "withdrawing staking rewards");
    }
  }

  /**
   * Delegate voting power to a DRep (Conway era governance)
   */
  public async delegateToDRep(options: DRepDelegationOptions): Promise<StakingTransactionResult> {
    try {
      const { vaultAccountId, drepAction, drepId, index = 0, fee = 1000000 } = options;

      this.logger.info(`Delegating to DRep (${drepAction}) for vault account ${vaultAccountId}`);

      // Get vault account addresses
      const addresses = await this.fireblocksService.getVaultAccountAddresses(
        vaultAccountId,
        this.assetId
      );

      const baseAddressObj = addresses.find((addr) => addr.addressFormat === "BASE");
      if (!baseAddressObj) {
        throw new IagonApiError(
          "No BASE address found for vault account",
          400,
          "NO_BASE_ADDRESS",
          { vaultAccountId },
          "staking-service"
        );
      }
      const baseAddress = baseAddressObj.address;

      if (!baseAddress) {
        throw new IagonApiError(
          "No BASE address found for vault account",
          400,
          "NO_BASE_ADDRESS",
          { vaultAccountId },
          "staking-service"
        );
      }

      // Get stake credential
      const certificate = getCertificateFromBaseAddress(
        baseAddress,
        this.network === Networks.MAINNET
      );

      // Convert DRep action to DRepInfo
      const drepInfo = drepActionToDRepInfo(drepAction, drepId);

      // Get UTXOs
      const utxosResponse = await this.iagonApiService.getUtxosByAddress(baseAddress);
      if (!utxosResponse.data || utxosResponse.data.length === 0) {
        throw new IagonApiError(
          "No UTXOs available for transaction",
          400,
          "NO_UTXOS",
          { vaultAccountId },
          "staking-service"
        );
      }

      // Find suitable UTXO
      const minInputAmount = fee * 2; // At least 2 ADA
      const utxo = findSuitableUtxo(utxosResponse.data, minInputAmount);
      if (!utxo) {
        throw new IagonApiError(
          `No UTXO found with at least ${minInputAmount} Lovelace`,
          400,
          "NO_SUITABLE_UTXO",
          { vaultAccountId },
          "staking-service"
        );
      }

      const netAmount = utxo.nativeAmount - fee;

      // Build vote delegation certificate
      const voteDelegationCertificate = buildVoteDelegationCertificate(certificate, drepInfo);

      // Build transaction
      const ttl = await this.getTtl();
      const { serialized, deserialized } = buildPayload({
        toAddress: baseAddress,
        netAmount,
        txInputs: [{ txHash: Buffer.from(utxo.txHash, "hex"), indexInTx: utxo.indexInTx }],
        feeAmount: fee,
        ttl,
        certificates: [voteDelegationCertificate],
        network: this.network,
      });

      // Sign transaction
      const txHash = getSigningPayload(serialized);
      const witnesses = await this.sendForSigning(
        txHash.toString("hex"),
        vaultAccountId,
        `delegate to DRep (${drepAction})`
      );

      // Embed signatures
      const signedTx = embedSignaturesInTx(deserialized, witnesses);

      // Submit transaction
      const submitResponse = await this.iagonApiService.submitTransfer(signedTx.toString("hex"));

      this.logger.info(`DRep delegation transaction submitted: ${submitResponse.data.txHash}`);

      return {
        txHash: submitResponse.data.txHash,
        status: "submitted",
        operation: StakingOperation.VOTE_DELEGATE,
      };
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, "delegating to DRep");
    }
  }

  /**
   * Query staking rewards for a vault account
   */
  public async queryStakingRewards(vaultAccountId: string): Promise<RewardsData> {
    try {
      this.logger.info(`Querying staking rewards for vault account ${vaultAccountId}`);

      const stakeAddress = await this.getStakeAddress(vaultAccountId);

      // Query rewards
      return await this.queryRewards(stakeAddress);
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, "querying staking rewards");
    }
  }

  /**
   * Get delegation history for a vault account
   * Shows the history of pool delegations
   */
  public async getDelegationHistory(vaultAccountId: string, limit: number = 100) {
    try {
      this.logger.info(`Getting delegation history for vault account ${vaultAccountId}`);

      const stakeAddress = await this.getStakeAddress(vaultAccountId);

      return await this.iagonApiService.getDelegationHistory(stakeAddress, 0, limit);
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, "getting delegation history");
    }
  }

  /**
   * Get registration/deregistration history for a vault account
   * Shows when the stake key was registered or deregistered
   */
  public async getRegistrationHistory(vaultAccountId: string, limit: number = 100) {
    try {
      this.logger.info(`Getting registration history for vault account ${vaultAccountId}`);

      const stakeAddress = await this.getStakeAddress(vaultAccountId);

      return await this.iagonApiService.getRegistrationHistory(stakeAddress, limit);
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, "getting registration history");
    }
  }

  /**
   * Get complete stake account information
   * Includes active status, pool delegation, and reward totals
   */
  public async getStakeAccountInfo(vaultAccountId: string) {
    try {
      this.logger.info(`Getting stake account info for vault account ${vaultAccountId}`);

      const stakeAddress = await this.getStakeAddress(vaultAccountId);

      return await this.iagonApiService.getStakeAccountInfo(stakeAddress);
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, "getting stake account info");
    }
  }

  /**
   * Check if stake credential is already registered
   */
  private async checkExistingRegistration(vaultAccountId: string): Promise<boolean> {
    try {
      const stakeAddress = await this.getStakeAddress(vaultAccountId);
      const accountInfo = await this.iagonApiService.getStakeAccountInfo(stakeAddress);

      return accountInfo.data.active;
    } catch (error) {
      // Account doesn't exist - not registered yet
      this.logger.info("Stake key not yet registered");
    }

    return false;
  }

  /**
   * Find an address with a suitable pure ADA UTXO
   */
  private async findAddressWithSuitableUtxo(
    vaultAccountId: string,
    minAmount: number
  ): Promise<{ address: string; addressIndex: number; utxo: any }> {
    const addresses = await this.fireblocksService.getVaultAccountAddresses(
      vaultAccountId,
      this.assetId
    );

    if (!addresses || addresses.length === 0) {
      throw new IagonApiError(
        "No addresses found for vault account",
        400,
        "NO_ADDRESSES",
        { vaultAccountId },
        "staking-service"
      );
    }

    for (const addrObj of addresses) {
      if (addrObj.addressFormat !== "BASE" || !addrObj.address) {
        continue;
      }

      const result = await this.tryFindUtxoForAddress(addrObj.address, minAmount);

      if (result) {
        return {
          address: addrObj.address,
          addressIndex: addrObj.bip44AddressIndex || 0,
          utxo: result,
        };
      }
    }

    throw new IagonApiError(
      `No address with pure ADA UTXO of at least ${minAmount} Lovelace found. ` +
        `Please send ${(minAmount / 1000000).toFixed(1)} ADA (without tokens) to this vault.`,
      400,
      "INSUFFICIENT_FUNDS",
      { vaultAccountId },
      "staking-service"
    );
  }

  /**
   * Try to find suitable UTXO for a specific address
   */
  private async tryFindUtxoForAddress(address: string, minAmount: number): Promise<any | null> {
    try {
      const utxosResponse = await this.iagonApiService.getUtxosByAddress(address);

      if (!utxosResponse.data || utxosResponse.data.length === 0) {
        return null;
      }

      return findSuitableUtxo(utxosResponse.data, minAmount);
    } catch (error) {
      this.logger.warn(`Error fetching UTXOs for ${address}: ${error}`);
      return null;
    }
  }

  /**
   * Build, sign, and submit registration transaction
   */
  private async buildAndSubmitRegistration(params: {
    vaultAccountId: string;
    address: string;
    addressIndex: number;
    utxo: any;
    depositAmount: number;
    fee: number;
  }): Promise<string> {
    const { vaultAccountId, address, addressIndex, utxo, depositAmount, fee } = params;

    // Get stake credential
    const certificate = getCertificateFromBaseAddress(address, this.network === Networks.MAINNET);

    // Calculate output amount
    const netAmount = utxo.nativeAmount - fee - depositAmount;

    // Build certificate
    const registrationCertificate = buildRegistrationCertificate(certificate);

    // Build transaction body
    const ttl = await this.getTtl();
    const { serialized, deserialized } = buildPayload({
      toAddress: address,
      netAmount,
      txInputs: [{ txHash: Buffer.from(utxo.txHash, "hex"), indexInTx: utxo.indexInTx }],
      feeAmount: fee,
      ttl,
      certificates: [registrationCertificate],
      network: this.network,
    });

    // Sign transaction
    const txHash = getSigningPayload(serialized);
    const witnesses = await this.sendForSigning(
      txHash.toString("hex"),
      vaultAccountId,
      "register staking credential",
      addressIndex
    );

    // Create signed transaction
    const signedTx = embedSignaturesInTx(deserialized, witnesses);

    // Log transaction details (optional - could be extracted to a separate method)
    this.logTransactionDetails(serialized, txHash, witnesses, signedTx);

    // Submit to blockchain
    const submitResponse = await this.iagonApiService.submitTransfer(
      signedTx.toString("hex"),
      true
    );

    this.logger.info(`Registration transaction submitted: ${submitResponse.data.txHash}`);

    return submitResponse.data.txHash;
  }

  /**
   * Log transaction details for debugging
   */
  private logTransactionDetails(
    serialized: Buffer,
    txHash: Buffer,
    witnesses: CardanoWitness[],
    signedTx: Buffer
  ): void {
    this.logger.info("=== Transaction Details ===");
    this.logger.info(`Serialized TX body (hex): ${serialized.toString("hex")}`);
    this.logger.info(`TX hash for signing: ${txHash.toString("hex")}`);
    this.logger.info(`Witnesses count: ${witnesses.length}`);

    witnesses.forEach((w, i) => {
      this.logger.info(`Witness ${i} - PubKey: ${w.pubKey.toString("hex")}`);
      this.logger.info(`Witness ${i} - Signature: ${w.signature.toString("hex")}`);
    });

    this.logger.info(`Final signed TX (hex): ${signedTx.toString("hex")}`);
    this.logger.info("===========================");
  }

  /**
   * Verify registration asynchronously (non-blocking)
   */
  private verifyRegistrationAsync(stakeAddress: string): void {
    // Run verification in background without blocking
    setTimeout(async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait 30s

        const verifyInfo = await this.iagonApiService.getStakeAccountInfo(stakeAddress);

        if (verifyInfo.data.active) {
          this.logger.info("Registration verified! Stake key is active.");
          this.logger.info(`Stake address: ${stakeAddress}`);
          this.logger.info(`Active epoch: ${verifyInfo.data.active_epoch}`);
        } else {
          this.logger.warn("Registration pending. Check status later.");
        }
      } catch (error) {
        this.logger.warn(`Could not verify registration: ${error}`);
      }
    }, 0);
  }
}
