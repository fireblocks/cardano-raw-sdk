/**
 * Staking Service for Cardano
 * Orchestrates staking operations with clear separation of concerns
 */

import { FireblocksService, IagonApiService } from "../index.js";

import {
  Logger,
  ErrorHandler,
  getCertificateFromBaseAddress,
  getStakeAddressFromBaseAddress,
  buildRegistrationCertificate,
  buildDelegationCertificate,
  buildDeregistrationCertificate,
  buildVoteDelegationCertificate,
  serializeWithdrawals,
  embedSignaturesInTx,
  getSigningPayload,
  drepActionToDRepInfo,
} from "../../utils/index.js";

import {
  RegisterStakingOptions,
  DelegationOptions,
  DeregisterStakingOptions,
  WithdrawRewardsOptions,
  DRepDelegationOptions,
  StakingTransactionResult,
  RewardsData,
  Networks,
  TransferResponse,
  StakingOperation,
  SdkApiError,
} from "../../types/index.js";

import {
  INetworkConfiguration,
  IStakeAddressResolver,
  IUtxoProvider,
  ITransactionSigner,
  ITransactionSubmitter,
  IStakingValidator,
  AddressWithUtxo,
  MIN_DREP_DELEGATION_AMOUNT_MULTIPLIER,
} from "./types/staking.interfaces.js";

import {
  NetworkConfiguration,
  StakeAddressResolver,
  UtxoProvider,
  TransactionSigner,
  TransactionBuilder,
  TransactionSubmitter,
  StakingValidator,
  RewardsQueryService,
  TransactionLogger,
  RegistrationVerifier,
} from "./helpers/index.js";

import { CardanoAmounts } from "../../constants.js";

/**
 * Main Staking Service
 * Orchestrates staking operations by coordinating specialized helper services
 */
export class StakingService {
  private readonly logger = new Logger("services:staking-service");
  private readonly errorHandler = new ErrorHandler("staking-service", this.logger);

  // Dependencies
  private readonly networkConfig: INetworkConfiguration;
  private readonly addressResolver: IStakeAddressResolver;
  private readonly utxoProvider: IUtxoProvider;
  private readonly transactionSigner: ITransactionSigner;
  private readonly transactionSubmitter: ITransactionSubmitter;
  private readonly validator: IStakingValidator;
  private readonly transactionBuilder: TransactionBuilder;
  private readonly transactionLogger: TransactionLogger;
  private readonly rewardsService: RewardsQueryService;
  private readonly registrationVerifier: RegistrationVerifier;

  // External services
  private readonly iagonApiService: IagonApiService;

  constructor(
    fireblocksService: FireblocksService,
    iagonApiService: IagonApiService,
    network: Networks = Networks.MAINNET
  ) {
    this.iagonApiService = iagonApiService;

    // Initialize configuration and dependencies
    this.networkConfig = new NetworkConfiguration(network);
    this.addressResolver = new StakeAddressResolver(
      fireblocksService,
      this.networkConfig,
      this.logger
    );
    this.utxoProvider = new UtxoProvider(
      fireblocksService,
      iagonApiService,
      this.networkConfig,
      this.logger
    );
    this.transactionSigner = new TransactionSigner(
      fireblocksService,
      this.networkConfig,
      this.logger,
      this.errorHandler
    );
    this.transactionSubmitter = new TransactionSubmitter(iagonApiService);
    this.validator = new StakingValidator(iagonApiService, this.addressResolver, this.logger);
    this.transactionBuilder = new TransactionBuilder(
      iagonApiService,
      this.networkConfig,
      this.logger
    );
    this.transactionLogger = new TransactionLogger(this.logger);
    this.rewardsService = new RewardsQueryService(iagonApiService, this.logger);
    this.registrationVerifier = new RegistrationVerifier(iagonApiService, this.logger);
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Register staking credential for a vault account
   * Automatically finds an address with suitable pure ADA UTXO
   */
  async registerStakingCredential(
    options: RegisterStakingOptions
  ): Promise<StakingTransactionResult & { stakeAddress: string; addressIndex: number }> {
    const {
      vaultAccountId,
      depositAmount = CardanoAmounts.DEPOSIT_AMOUNT,
      fee = CardanoAmounts.DEFAULT_NATIVE_TX_FEE,
    } = options;

    this.logger.info(`Registering staking credential for vault account ${vaultAccountId}`);

    try {
      const existingRegistration = await this.validator.checkRegistrationStatus(vaultAccountId);

      if (existingRegistration) {
        return await this.handleAlreadyRegistered(vaultAccountId);
      }

      const minInputAmount = depositAmount + fee;
      const addressWithUtxo = await this.utxoProvider.findAddressWithSuitableUtxo(
        vaultAccountId,
        minInputAmount
      );

      const txHash = await this.executeRegistration(
        vaultAccountId,
        addressWithUtxo,
        depositAmount,
        fee
      );

      const stakeAddress = await this.addressResolver.getStakeAddress(vaultAccountId);
      this.registrationVerifier.verifyAsync(stakeAddress);

      return {
        txHash,
        status: "submitted",
        operation: StakingOperation.REGISTER,
        stakeAddress,
        addressIndex: addressWithUtxo.addressIndex,
      };
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, "registering staking credential");
    }
  }

  /**
   * Delegate to a stake pool
   */
  async delegateToPool(options: DelegationOptions): Promise<StakingTransactionResult> {
    const { vaultAccountId, poolId, fee = CardanoAmounts.DEFAULT_NATIVE_TX_FEE } = options;

    this.logger.info(`Delegating to pool ${poolId} for vault account ${vaultAccountId}`);

    try {
      await this.validator.validateDelegationPrerequisites(vaultAccountId, poolId);

      const minAmount = CardanoAmounts.MIN_UTXO_VALUE_ADA_ONLY + fee;
      const addressWithUtxo = await this.utxoProvider.findAddressWithSuitableUtxo(
        vaultAccountId,
        minAmount
      );

      this.logger.info(
        `Using address: ${addressWithUtxo.address}, index: ${addressWithUtxo.addressIndex}`
      );

      const certificate = getCertificateFromBaseAddress(
        addressWithUtxo.address,
        this.networkConfig.isMainnet()
      );
      const delegationCertificate = buildDelegationCertificate(certificate, poolId);

      const txHash = await this.buildSignAndSubmit({
        vaultAccountId,
        addressInfo: addressWithUtxo,
        netAmount: addressWithUtxo.utxo.nativeAmount - fee,
        fee,
        certificates: [delegationCertificate],
        operation: "delegate to pool",
        skipValidation: true,
      });

      this.logger.info(`Delegation transaction submitted: ${txHash.data.txHash}`);

      return {
        txHash: txHash.data.txHash,
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
  async deregisterStakingCredential(
    options: DeregisterStakingOptions
  ): Promise<StakingTransactionResult> {
    const { vaultAccountId, fee = CardanoAmounts.DEFAULT_NATIVE_TX_FEE } = options;

    this.logger.info(`Deregistering staking credential for vault account ${vaultAccountId}`);

    try {
      const isRegistered = await this.validator.checkRegistrationStatus(vaultAccountId);

      if (!isRegistered) {
        this.logger.info(`Staking credential not registered for vault ${vaultAccountId}`);
        return {
          txHash: "",
          status: "not_registered",
          operation: StakingOperation.DEREGISTER,
        };
      }

      const minInputAmount = CardanoAmounts.MIN_UTXO_VALUE_ADA_ONLY + fee;
      const addressWithUtxo = await this.utxoProvider.findAddressWithSuitableUtxo(
        vaultAccountId,
        minInputAmount
      );

      const txHash = await this.executeDeregistration(vaultAccountId, addressWithUtxo, fee);

      return {
        txHash,
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
  async withdrawRewards(
    options: WithdrawRewardsOptions
  ): Promise<StakingTransactionResult & { rewardAmount?: number }> {
    try {
      const { vaultAccountId, limit, fee } = options;

      this.validateWithdrawalLimit(limit);
      await this.validator.validateRegistrationStatus(vaultAccountId, true);

      this.logger.info(`Withdrawing rewards for vault account ${vaultAccountId}`);

      const minInputAmount = CardanoAmounts.MIN_UTXO_VALUE_ADA_ONLY + fee;
      const addressWithUtxo = await this.utxoProvider.findAddressWithSuitableUtxo(
        vaultAccountId,
        minInputAmount
      );

      const certificate = getCertificateFromBaseAddress(
        addressWithUtxo.address,
        this.networkConfig.isMainnet()
      );
      const stakeAddress = await this.addressResolver.getStakeAddress(vaultAccountId);

      const maxWithdrawal = limit ?? Infinity;
      const { withdrawal, rewardAmount } = await this.rewardsService.getWithdrawals(
        stakeAddress,
        certificate,
        maxWithdrawal,
        this.networkConfig.isMainnet()
      );

      if (rewardAmount === 0) {
        return {
          txHash: "",
          status: "no_rewards",
          operation: StakingOperation.WITHDRAW_REWARDS,
        };
      }

      const netAmount = addressWithUtxo.utxo.nativeAmount - fee + rewardAmount;
      const withdrawalsDict = serializeWithdrawals([withdrawal]);

      const submitResponse = await this.buildSignAndSubmit({
        vaultAccountId,
        addressInfo: addressWithUtxo,
        netAmount,
        fee,
        withdrawals: withdrawalsDict,
        requiredSigners: [certificate],
        operation: "withdraw staking rewards",
      });

      this.logger.info(`Reward withdrawal transaction submitted: ${submitResponse.data.txHash}`);

      return {
        txHash: submitResponse.data.txHash,
        status: "submitted",
        operation: StakingOperation.WITHDRAW_REWARDS,
        rewardAmount,
      };
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, "withdrawing staking rewards");
    }
  }

  /**
   * Delegate voting power to a DRep (Conway era governance)
   */
  async delegateToDRep(options: DRepDelegationOptions): Promise<StakingTransactionResult> {
    try {
      const {
        vaultAccountId,
        drepAction,
        drepId,
        fee = CardanoAmounts.DEFAULT_NATIVE_TX_FEE,
      } = options;

      this.logger.info(`Delegating to DRep (${drepAction}) for vault account ${vaultAccountId}`);

      this.validateDRepOptions(drepAction, drepId);
      await this.validator.validateRegistrationStatus(vaultAccountId, true);

      const minInputAmount = fee * MIN_DREP_DELEGATION_AMOUNT_MULTIPLIER;
      const addressWithUtxo = await this.utxoProvider.findAddressWithSuitableUtxo(
        vaultAccountId,
        minInputAmount
      );

      const certificate = getCertificateFromBaseAddress(
        addressWithUtxo.address,
        this.networkConfig.isMainnet()
      );
      const drepInfo = drepActionToDRepInfo(drepAction, drepId);
      const voteDelegationCertificate = buildVoteDelegationCertificate(certificate, drepInfo);

      const netAmount = addressWithUtxo.utxo.nativeAmount - fee;

      const submitResponse = await this.buildSignAndSubmit({
        vaultAccountId,
        addressInfo: addressWithUtxo,
        netAmount,
        fee,
        certificates: [voteDelegationCertificate],
        operation: `delegate to DRep (${drepAction})`,
      });

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
   * Get stake address for a vault account
   */
  async getStakeAddress(vaultAccountId: string): Promise<string> {
    return await this.addressResolver.getStakeAddress(vaultAccountId);
  }

  /**
   * Query staking rewards for a vault account
   */
  async queryStakingRewards(vaultAccountId: string): Promise<RewardsData> {
    try {
      this.logger.info(`Querying staking rewards for vault account ${vaultAccountId}`);
      const stakeAddress = await this.addressResolver.getStakeAddress(vaultAccountId);
      return await this.rewardsService.queryRewards(stakeAddress);
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, "querying staking rewards");
    }
  }

  /**
   * Get delegation history for a vault account
   */
  async getDelegationHistory(vaultAccountId: string, limit: number = 100) {
    try {
      this.logger.info(`Getting delegation history for vault account ${vaultAccountId}`);
      const stakeAddress = await this.addressResolver.getStakeAddress(vaultAccountId);
      return await this.iagonApiService.getDelegationHistory(stakeAddress, 0, limit);
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, "getting delegation history");
    }
  }

  /**
   * Get registration/deregistration history for a vault account
   */
  async getRegistrationHistory(vaultAccountId: string, limit: number = 100) {
    try {
      this.logger.info(`Getting registration history for vault account ${vaultAccountId}`);
      const stakeAddress = await this.addressResolver.getStakeAddress(vaultAccountId);
      return await this.iagonApiService.getRegistrationHistory(stakeAddress, limit);
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, "getting registration history");
    }
  }

  /**
   * Get complete stake account information
   */
  async getStakeAccountInfo(vaultAccountId: string) {
    try {
      this.logger.info(`Getting stake account info for vault account ${vaultAccountId}`);
      const stakeAddress = await this.addressResolver.getStakeAddress(vaultAccountId);
      return await this.iagonApiService.getStakeAccountInfo(stakeAddress);
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, "getting stake account info");
    }
  }

  // ============================================================================
  // Private Methods (Orchestration)
  // ============================================================================

  private async handleAlreadyRegistered(
    vaultAccountId: string
  ): Promise<StakingTransactionResult & { stakeAddress: string; addressIndex: number }> {
    const stakeAddress = await this.addressResolver.getStakeAddress(vaultAccountId);
    const accountInfo = await this.iagonApiService.getStakeAccountInfo(stakeAddress);

    this.logger.info(`Stake key already registered at epoch ${accountInfo.data.active_epoch}`);

    return {
      txHash: "",
      status: "already_registered",
      operation: StakingOperation.REGISTER,
      stakeAddress,
      addressIndex: 0,
    };
  }

  /**
   * Common transaction execution workflow
   * Handles: TTL calculation, transaction building, signing, logging, and submission
   */
  private async executeTransaction(params: {
    vaultAccountId: string;
    addressWithUtxo: AddressWithUtxo;
    netAmount: number;
    fee: number;
    certificates?: Array<any>;
    withdrawals?: Map<Uint8Array, number>;
    requiredSigners?: Buffer[];
    operation: string;
    skipValidation?: boolean;
  }): Promise<string> {
    const {
      vaultAccountId,
      addressWithUtxo,
      netAmount,
      fee,
      certificates,
      withdrawals,
      requiredSigners,
      operation,
      skipValidation = false,
    } = params;

    // Get TTL and build transaction
    const ttl = await this.transactionBuilder.getCurrentTtl();
    const { serialized, deserialized } = await this.transactionBuilder.buildTransaction({
      toAddress: addressWithUtxo.address,
      netAmount,
      utxo: addressWithUtxo.utxo,
      fee,
      ttl,
      certificates,
      withdrawals,
      requiredSigners,
      network: this.networkConfig.network,
    });

    // Sign transaction
    const txHash = getSigningPayload(serialized);
    const witnesses = await this.transactionSigner.signTransaction({
      txHash: txHash.toString("hex"),
      vaultAccountId,
      operation,
      addressIndex: addressWithUtxo.addressIndex,
    });

    // Embed signatures and log
    const signedTx = embedSignaturesInTx(deserialized, witnesses);
    this.transactionLogger.logTransactionDetails(serialized, txHash, witnesses, signedTx);

    // Submit transaction
    const submitResponse = await this.transactionSubmitter.submitTransaction(
      signedTx,
      skipValidation
    );

    this.logger.info(`${operation} transaction submitted: ${submitResponse.data.txHash}`);

    return submitResponse.data.txHash;
  }

  private async executeRegistration(
    vaultAccountId: string,
    addressWithUtxo: AddressWithUtxo,
    depositAmount: number,
    fee: number
  ): Promise<string> {
    const certificate = getCertificateFromBaseAddress(
      addressWithUtxo.address,
      this.networkConfig.isMainnet()
    );
    const netAmount = addressWithUtxo.utxo.nativeAmount - fee - depositAmount;
    const registrationCertificate = buildRegistrationCertificate(certificate);

    return await this.executeTransaction({
      vaultAccountId,
      addressWithUtxo,
      netAmount,
      fee,
      certificates: [registrationCertificate],
      operation: "register staking credential",
      skipValidation: true,
    });
  }

  private async executeDeregistration(
    vaultAccountId: string,
    addressWithUtxo: AddressWithUtxo,
    fee: number
  ): Promise<string> {
    const certificate = getCertificateFromBaseAddress(
      addressWithUtxo.address,
      this.networkConfig.isMainnet()
    );
    const stakeAddress = getStakeAddressFromBaseAddress(
      addressWithUtxo.address,
      this.networkConfig.isMainnet()
    );

    const { withdrawal, rewardAmount } = await this.rewardsService.getWithdrawals(
      stakeAddress,
      certificate,
      Infinity,
      this.networkConfig.isMainnet()
    );

    const withdrawalsDict = rewardAmount > 0 ? serializeWithdrawals([withdrawal]) : undefined;
    const netAmount =
      addressWithUtxo.utxo.nativeAmount - fee + CardanoAmounts.DEPOSIT_AMOUNT + rewardAmount;
    const deregistrationCertificate = buildDeregistrationCertificate(certificate);

    return await this.executeTransaction({
      vaultAccountId,
      addressWithUtxo,
      netAmount,
      fee,
      certificates: [deregistrationCertificate],
      withdrawals: withdrawalsDict,
      operation: "deregister staking credential",
      skipValidation: true,
    });
  }

  private async buildSignAndSubmit(params: {
    vaultAccountId: string;
    addressInfo: AddressWithUtxo;
    netAmount: number;
    fee: number;
    certificates?: Array<any>;
    withdrawals?: Map<Uint8Array, number>;
    requiredSigners?: Buffer[];
    operation: string;
    skipValidation?: boolean;
  }): Promise<TransferResponse> {
    const {
      vaultAccountId,
      addressInfo,
      netAmount,
      fee,
      certificates,
      withdrawals,
      requiredSigners,
      operation,
      skipValidation = false,
    } = params;

    const txHash = await this.executeTransaction({
      vaultAccountId,
      addressWithUtxo: addressInfo,
      netAmount,
      fee,
      certificates,
      withdrawals,
      requiredSigners,
      operation,
      skipValidation,
    });

    // Return the full response for methods that need it
    return { data: { txHash } } as TransferResponse;
  }

  private validateWithdrawalLimit(limit: number | undefined): void {
    if (limit !== undefined && limit < 0) {
      throw new SdkApiError(
        "Withdrawal limit must be positive",
        400,
        "INVALID_LIMIT",
        { limit },
        "staking-service"
      );
    }
  }

  private validateDRepOptions(drepAction: string, drepId: string | undefined): void {
    if (drepAction === "custom-drep" && !drepId) {
      throw new SdkApiError(
        "drepId is required for custom-drep action",
        400,
        "MISSING_DREP_ID",
        { drepAction },
        "staking-service"
      );
    }
  }
}
