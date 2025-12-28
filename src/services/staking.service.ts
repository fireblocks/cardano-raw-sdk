/**
 * Staking Service for Cardano
 * Handles staking operations including registration, delegation, and rewards
 */

import { Logger } from "../utils/logger.js";
import { ErrorHandler } from "../utils/errorHandler.js";
import { FireblocksService } from "./fireblocks.service.js";
import { IagonApiService } from "./iagon.api.service.js";
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
} from "../types/staking.js";
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
  CHIMERIC_INDEX,
  DEFAULT_NATIVE_TX_FEE,
  DEPOSIT_AMOUNT,
  MIN_UTXO_VALUE_ADA_ONLY,
  stakeAddressBytesPrefix,
} from "../utils/staking.utils.js";
import { TransactionRequest, TransactionOperation, TransferPeerPathType } from "@fireblocks/ts-sdk";
import { Networks, SupportedAssets } from "../types/enums.js";

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
    operation: string
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
              { content: txHash }, // Payment key signature
              { content: txHash, bip44Change: CHIMERIC_INDEX }, // Staking key signature
            ],
          },
        },
      };

      this.logger.info(`Sending transaction for signing: ${operation}`);
      const signatureResponse = await this.fireblocksService.broadcastTransaction(payload);

      if (
        !signatureResponse ||
        !signatureResponse.publicKey ||
        !signatureResponse.signature ||
        !signatureResponse.signature.fullSig
      ) {
        throw new Error("Expected 2 signatures (payment + staking keys)");
      }

      const witnesses: CardanoWitness[] = [
        {
          pubKey: Buffer.from(signatureResponse.publicKey, "hex"),
          signature: Buffer.from(signatureResponse.signature.fullSig, "hex"),
        },
      ];

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
      const currentSlot = epochResponse.data.slot;
      this.logger.info(`Current slot: ${currentSlot}`);
      return calculateTtl(currentSlot);
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, `fetching current slot for TTL`);
    }
  }

  /**
   * Query rewards for a stake address
   */
  private async queryRewards(stakeAddress: string): Promise<RewardsData> {
    try {
      const rewardsResponse = await this.iagonApiService.getStakeAccountRewards(stakeAddress);

      return {
        rewards: rewardsResponse.data.rewards.map((r) => ({
          poolId: r.pool_id,
          amount: r.amount,
          epoch: r.epoch,
        })),
        withdrawals: rewardsResponse.data.withdrawals.map((w) => ({
          txHash: w.tx_hash,
          amount: w.amount,
        })),
        availableRewards: rewardsResponse.data.available_rewards,
        totalRewards: rewardsResponse.data.total_rewards,
        totalWithdrawals: rewardsResponse.data.total_withdrawals,
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
   * Register staking credential
   */
  public async registerStakingCredential(
    options: RegisterStakingOptions
  ): Promise<StakingTransactionResult> {
    try {
      const {
        vaultAccountId,
        index = 0,
        depositAmount = DEPOSIT_AMOUNT,
        fee = DEFAULT_NATIVE_TX_FEE,
      } = options;

      this.logger.info(`Registering staking credential for vault account ${vaultAccountId}`);

      // Get vault account addresses
      const addresses = await this.fireblocksService.getVaultAccountAddresses(
        vaultAccountId,
        this.assetId
      );

      if (!addresses || addresses.length < 2) {
        throw new Error("Vault account must have at least 2 addresses (including BASE address)");
      }

      // Find BASE address
      const baseAddressObj = addresses.find((addr) => addr.addressFormat === "BASE");
      if (!baseAddressObj) {
        throw new Error("No BASE address found for vault account");
      }
      const baseAddress = baseAddressObj.address;

      if (!baseAddress) {
        throw new Error("No BASE address found for vault account");
      }

      // Get stake credential
      const certificate = getCertificateFromBaseAddress(
        baseAddress,
        this.network === Networks.MAINNET
      );

      // Get UTXOs
      const utxosResponse = await this.iagonApiService.getUtxosByAddress(baseAddress);
      if (!utxosResponse.data || utxosResponse.data.length === 0) {
        throw new Error("No UTXOs available for transaction");
      }

      // Find suitable UTXO
      const minInputAmount = depositAmount + fee;
      const utxo = findSuitableUtxo(utxosResponse.data, minInputAmount);
      if (!utxo) {
        throw new Error(`No UTXO found with at least ${minInputAmount} Lovelace`);
      }

      const netAmount = utxo.nativeAmount - fee - depositAmount;

      // Build registration certificate
      const registrationCertificate = buildRegistrationCertificate(certificate);

      // Build transaction
      const ttl = await this.getTtl();
      const { serialized, deserialized } = buildPayload({
        toAddress: baseAddress,
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
        "register staking credential"
      );

      // Embed signatures
      const signedTx = embedSignaturesInTx(deserialized, witnesses);

      // Submit transaction
      const submitResponse = await this.iagonApiService.submitTransfer(signedTx.toString("hex"));

      this.logger.info(`Registration transaction submitted: ${submitResponse.data.txHash}`);

      return {
        txHash: submitResponse.data.txHash,
        status: "submitted",
        operation: "register",
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
        throw new Error("No BASE address found for vault account");
      }
      const baseAddress = baseAddressObj.address;

      if (!baseAddress) {
        throw new Error("No BASE address found for vault account");
      }

      // Get stake credential
      const certificate = getCertificateFromBaseAddress(
        baseAddress,
        this.network === Networks.MAINNET
      );

      // Get UTXOs
      const utxosResponse = await this.iagonApiService.getUtxosByAddress(baseAddress);
      if (!utxosResponse.data || utxosResponse.data.length === 0) {
        throw new Error("No UTXOs available for transaction");
      }

      // Find suitable UTXO
      const minInputAmount = MIN_UTXO_VALUE_ADA_ONLY + fee;
      const utxo = findSuitableUtxo(utxosResponse.data, minInputAmount);
      if (!utxo) {
        throw new Error(`No UTXO found with at least ${minInputAmount} Lovelace`);
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
        operation: "delegate",
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
        throw new Error("No BASE address found for vault account");
      }
      const baseAddress = baseAddressObj.address;

      if (!baseAddress) {
        throw new Error("No BASE address found for vault account");
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
        throw new Error("No UTXOs available for transaction");
      }

      // Find suitable UTXO
      const minInputAmount = MIN_UTXO_VALUE_ADA_ONLY + fee;
      const utxo = findSuitableUtxo(utxosResponse.data, minInputAmount);
      if (!utxo) {
        throw new Error(`No UTXO found with at least ${minInputAmount} Lovelace`);
      }

      const netAmount = utxo.nativeAmount - fee + DEPOSIT_AMOUNT + rewardAmount;

      // Build deregistration certificate
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
        operation: "deregister",
      };
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, "deregistering staking credential");
    }
  }

  /**
   * Withdraw staking rewards
   */
  public async withdrawRewards(options: WithdrawRewardsOptions): Promise<StakingTransactionResult> {
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
        throw new Error("No BASE address found for vault account");
      }
      const baseAddress = baseAddressObj.address;

      if (!baseAddress) {
        throw new Error("No BASE address found for vault account");
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
        throw new Error("No rewards available to withdraw");
      }

      // Get UTXOs
      const utxosResponse = await this.iagonApiService.getUtxosByAddress(baseAddress);
      if (!utxosResponse.data || utxosResponse.data.length === 0) {
        throw new Error("No UTXOs available for transaction");
      }

      // Find suitable UTXO
      const minInputAmount = MIN_UTXO_VALUE_ADA_ONLY + fee;
      const utxo = findSuitableUtxo(utxosResponse.data, minInputAmount);
      if (!utxo) {
        throw new Error(`No UTXO found with at least ${minInputAmount} Lovelace`);
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

      return {
        txHash: submitResponse.data.txHash,
        status: "submitted",
        operation: "withdraw-rewards",
      };
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
        throw new Error("No BASE address found for vault account");
      }
      const baseAddress = baseAddressObj.address;

      if (!baseAddress) {
        throw new Error("No BASE address found for vault account");
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
        throw new Error("No UTXOs available for transaction");
      }

      // Find suitable UTXO
      const minInputAmount = fee * 2; // At least 2 ADA
      const utxo = findSuitableUtxo(utxosResponse.data, minInputAmount);
      if (!utxo) {
        throw new Error(`No UTXO found with at least ${minInputAmount} Lovelace`);
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
        operation: "vote-delegate",
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

      // Get vault account addresses
      const addresses = await this.fireblocksService.getVaultAccountAddresses(
        vaultAccountId,
        this.assetId
      );

      const baseAddressObj = addresses.find((addr) => addr.addressFormat === "BASE");
      if (!baseAddressObj) {
        throw new Error("No BASE address found for vault account");
      }
      const baseAddress = baseAddressObj.address;

      if (!baseAddress) {
        throw new Error("No BASE address found for vault account");
      }

      // Get stake address
      const stakeAddress = getStakeAddressFromBaseAddress(
        baseAddress,
        this.network === Networks.MAINNET
      );

      // Query rewards
      return await this.queryRewards(stakeAddress);
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, "querying staking rewards");
    }
  }
}
