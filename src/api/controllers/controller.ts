import { Request, Response } from "express";
import { BasePath } from "@fireblocks/ts-sdk";
import { Logger, config } from "../../utils/index.js";
import { SdkManager } from "../../pool/sdkManager.js";
import { GroupByOptions, SdkApiError } from "../../types/index.js";
import { CardanoAmounts } from "../../constants.js";

// standard success envelope
const ok = <T>(res: Response, data: T, status = 200) =>
  res.status(status).json({ success: true, data });

/**
 * Map Fireblocks BasePath to webhook environment
 */
const getWebhookEnvironment = (basePath: BasePath): "US" | "EU" | "EU2" | "SANDBOX" => {
  // Handle string or enum values
  const path = basePath as string;

  if (path === BasePath.EU2) {
    return "EU2";
  } else if (path === BasePath.EU) {
    return "EU";
  } else if (path === BasePath.Sandbox) {
    return "SANDBOX";
  } else {
    return "US"; // Default for US or any other value
  }
};

/**
 * Controller class that handles HTTP requests for Fireblocks operations.
 *
 * This controller serves as the interface between Express routes and the SdkManager,
 * handling the four core operations:
 * 1. Get vault account address
 * 2. Get vault account addresses
 * 3. Submit transaction
 * 4. Get transaction history
 *
 * @class ApiController
 * @example
 * ```typescript
 * const sdkManager = new SdkManager(config);
 * const controller = new ApiController(sdkManager);
 *
 * app.use('/api', controller.getRouter());
 * ```
 */
export class ApiController {
  private sdkManager: SdkManager;
  private readonly logger = new Logger("api:controller");

  /**
   * Creates an instance of ApiController.
   *
   * @param sdkManager - The SdkManager instance to use for SDK operations
   */
  constructor(sdkManager: SdkManager) {
    this.sdkManager = sdkManager;
  }

  public getIagonHealth = async (req: Request, res: Response) => {
    try {
      const iagonApiKey = process.env.IAGON_API_KEY;
      if (!iagonApiKey) {
        return res.status(500).json({
          success: false,
          error: "IAGON_API_KEY is not configured",
        });
      }

      const result = await this.sdkManager.withSdk("0", (sdk) => sdk.checkIagonHealth());

      this.logger.info(`Iagon health check successful`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "getIagonHealth");
    }
  };

  public getBalanceByAddress = async (req: Request, res: Response) => {
    const { vaultAccountId } = req.params as { vaultAccountId: string };
    const index = req.query.index ? parseInt(req.query.index as string, 10) : 0;
    const groupByPolicy = req.query.groupByPolicy === "true";
    const includeMetadata = req.query.includeMetadata === "true";

    try {
      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.getBalanceByAddress({ index, groupByPolicy, includeMetadata })
      );

      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "getBalanceByAddress");
    }
  };

  public getVaultBalance = async (req: Request, res: Response) => {
    const { vaultAccountId } = req.params as { vaultAccountId: string };
    const groupBy = req.query.groupBy as GroupByOptions | undefined;
    const includeMetadata = req.query.includeMetadata === "true";

    try {
      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.getVaultBalance({ groupBy, includeMetadata })
      );

      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "getVaultBalance");
    }
  };

  public getBalanceByCredential = async (req: Request, res: Response) => {
    const { vaultAccountId, credential } = req.params as {
      vaultAccountId: string;
      credential: string;
    };
    const groupByPolicy = req.query.groupByPolicy === "true";
    const includeMetadata = req.query.includeMetadata === "true";

    try {
      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.getBalanceByCredential({ credential, groupByPolicy, includeMetadata })
      );

      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "getBalanceByCredential");
    }
  };

  public getBalanceByStakeKey = async (req: Request, res: Response) => {
    const { vaultAccountId } = req.params as { vaultAccountId: string };
    const groupByPolicy = req.query.groupByPolicy === "true";
    const includeMetadata = req.query.includeMetadata === "true";

    try {
      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.getBalanceByStakeKey({ groupByPolicy, includeMetadata })
      );

      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "getBalanceByStakeKey");
    }
  };

  public getTransactionDetails = async (req: Request, res: Response) => {
    const { hash } = req.params as { hash: string };
    try {
      const result = await this.sdkManager.withSdk("0", (sdk) => sdk.getTransactionDetails(hash));
      this.logger.info(`Transaction details retrieved successfully`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "getTransactionDetails");
    }
  };

  /**
   * Get asset information including metadata and decimals
   * GET /api/assets/:policyId/:assetName
   */
  public getAssetInfo = async (req: Request, res: Response) => {
    const { policyId, assetName } = req.params as { policyId: string; assetName: string };
    try {
      if (!policyId || !assetName) {
        return res.status(400).json({
          success: false,
          error: "policyId and assetName are required",
        });
      }

      const result = await this.sdkManager.withSdk("0", (sdk) =>
        sdk.getAssetInfo(policyId, assetName)
      );

      this.logger.info(`Asset info retrieved successfully for ${policyId}.${assetName}`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "getAssetInfo");
    }
  };

  public getUtxosByAddress = async (req: Request, res: Response) => {
    const { vaultAccountId } = req.params as { vaultAccountId: string };
    const index = req.query.index ? parseInt(req.query.index as string, 10) : 0;

    try {
      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.getUtxosByAddress(index)
      );
      this.logger.info(`UTXOs retrieved successfully for vault ${vaultAccountId}`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "getUtxosByAddress");
    }
  };

  public getVaultUtxos = async (req: Request, res: Response) => {
    const { vaultAccountId } = req.params as { vaultAccountId: string };
    try {
      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.getUtxosByVaultAccountId()
      );
      this.logger.info(`Vault UTxOs retrieved for vault ${vaultAccountId}`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "getVaultUtxos");
    }
  };

  /**
   * Helper method to parse transaction history query parameters
   */
  private parseTransactionHistoryParams(req: Request) {
    const { vaultAccountId } = req.params as { vaultAccountId: string };
    const index = req.query.index ? parseInt(req.query.index as string, 10) : 0;
    const options = {
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      fromSlot: req.query.fromSlot ? Number(req.query.fromSlot) : undefined,
    };

    return { vaultAccountId, index, options };
  }

  public getTransactionHistory = async (req: Request, res: Response) => {
    const { vaultAccountId, index, options } = this.parseTransactionHistoryParams(req);
    try {
      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.getTransactionHistory(index, options)
      );
      this.logger.info(`Transactions history retrieved successfully`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "getTransactionHistory");
    }
  };

  public getDetailedTxHistory = async (req: Request, res: Response) => {
    const { vaultAccountId, index, options } = this.parseTransactionHistoryParams(req);
    try {
      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.getDetailedTxHistory(index, options)
      );
      this.logger.info(`Detailed transactions history retrieved successfully`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "getDetailedTxHistory");
    }
  };

  public getAllTransactionHistory = async (req: Request, res: Response) => {
    const { vaultAccountId } = req.params as { vaultAccountId: string };
    const options = {
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      fromSlot: req.query.fromSlot ? Number(req.query.fromSlot) : undefined,
      groupByAddress: req.query.groupByAddress === "true",
    };

    try {
      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.getAllTransactionHistory(options)
      );
      this.logger.info(
        `All transactions history retrieved successfully for vault ${vaultAccountId}`
      );
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "getAllTransactionHistory");
    }
  };

  public getAllDetailedTxHistory = async (req: Request, res: Response) => {
    const { vaultAccountId } = req.params as { vaultAccountId: string };
    const options = {
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      fromSlot: req.query.fromSlot ? Number(req.query.fromSlot) : undefined,
      groupByAddress: req.query.groupByAddress === "true",
    };

    try {
      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.getAllDetailedTxHistory(options)
      );
      this.logger.info(
        `All detailed transactions history retrieved successfully for vault ${vaultAccountId}`
      );
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "getAllDetailedTxHistory");
    }
  };

  public transfer = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId } = req.body;
      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) => sdk.transfer(req.body));
      this.logger.info(`Transfer executed successfully`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "transfer");
    }
  };

  public estimateFee = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId } = req.body;
      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.estimateTransactionFee(req.body)
      );
      this.logger.info(`Fee estimation completed successfully`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "estimateFee");
    }
  };

  public transferAda = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId } = req.body;
      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.transferAda(req.body)
      );
      this.logger.info(`ADA transfer executed successfully: ${result.txHash}`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "transferAda");
    }
  };

  public estimateAdaFee = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId } = req.body;
      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.estimateAdaTransactionFee(req.body)
      );
      this.logger.info(`ADA fee estimation completed successfully`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "estimateAdaFee");
    }
  };

  public transferMultipleTokens = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId } = req.body;
      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.transferMultipleTokens(req.body)
      );
      this.logger.info(`Multi-token transfer executed successfully: ${result.txHash}`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "transferMultipleTokens");
    }
  };

  public estimateMultiTokenFee = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId } = req.body;
      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.estimateMultiTokenTransactionFee(req.body)
      );
      this.logger.info(`Multi-token fee estimation completed successfully`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "estimateMultiTokenFee");
    }
  };

  public consolidateUtxos = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId } = req.body;
      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.consolidateUtxos(req.body)
      );
      this.logger.info(`UTxO consolidation executed successfully: ${result.txHash}`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "consolidateUtxos");
    }
  };

  public enrichWebhookPayload = async (req: Request, res: Response) => {
    try {
      // Extract raw body (Buffer) for signature verification
      // rawBody is attached by express.json verify callback
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      if (!rawBody) {
        return res.status(400).json({
          success: false,
          error:
            "Missing raw request body - webhook endpoint requires Content-Type: application/json",
        });
      }

      // Body is already parsed by express.json
      const payload = req.body;

      // Extract headers for signature verification
      const headers: Record<string, string | undefined> = {
        "fireblocks-webhook-signature": req.headers["fireblocks-webhook-signature"] as
          | string
          | undefined,
        "fireblocks-signature": req.headers["fireblocks-signature"] as string | undefined,
      };

      // Get webhook environment from Fireblocks basePath config
      const environment = getWebhookEnvironment(
        (config.FIREBLOCKS.basePath as BasePath) || BasePath.US
      );

      const vaultAccountId = payload.data.destination.id;
      const sdk = await this.sdkManager.getSdk(vaultAccountId);
      try {
        // Step 1: Verify webhook signature
        const isValid = await sdk.verifyWebhook(rawBody, headers, environment);
        if (!isValid) {
          this.logger.error("Webhook signature verification failed");
          return res.status(401).json({
            success: false,
            error: "Webhook signature verification failed",
          });
        }

        // Step 2: Enrich webhook payload
        const result = await sdk.enrichWebhookPayload(payload);

        this.logger.info("Webhook verified and enriched successfully");
        ok(res, result);
      } finally {
        this.sdkManager.releaseSdk(vaultAccountId);
      }
    } catch (error: unknown) {
      this.handleError(error, res, "enrichWebhookPayload");
    }
  };

  // ======================
  // Staking Operations
  // ======================

  /**
   * Register staking credential for a vault account
   * POST /api/staking/register
   */
  public registerStaking = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId, index } = req.body;

      if (!vaultAccountId) {
        return res.status(400).json({
          success: false,
          error: "vaultAccountId is required",
        });
      }

      const depositAmount = CardanoAmounts.DEPOSIT_AMOUNT;
      const fee = CardanoAmounts.STAKING_TX_FEE;

      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.registerStakingCredential({ vaultAccountId, index, depositAmount, fee })
      );

      this.logger.info(`Staking registration successful for vault ${vaultAccountId}`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "registerStaking");
    }
  };

  /**
   * Deregister staking credential
   * POST /api/staking/deregister
   */
  public deregisterStaking = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId } = req.body;

      if (!vaultAccountId) {
        return res.status(400).json({
          success: false,
          error: "vaultAccountId is required",
        });
      }

      const fee = CardanoAmounts.STAKING_TX_FEE;
      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.deregisterStakingCredential({ vaultAccountId, fee })
      );

      this.logger.info(`Staking deregistration successful for vault ${vaultAccountId}`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "deregisterStaking");
    }
  };

  /**
   * Delegate to a stake pool
   * POST /api/staking/delegate
   */
  public delegateToPool = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId, poolId } = req.body;

      if (!vaultAccountId) {
        return res.status(400).json({
          success: false,
          error: "vaultAccountId is required",
        });
      }

      if (!poolId) {
        return res.status(400).json({
          success: false,
          error: "poolId is required",
        });
      }

      const fee = CardanoAmounts.STAKING_TX_FEE;

      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.delegateToPool({ vaultAccountId, poolId, fee })
      );

      this.logger.info(`Pool delegation successful for vault ${vaultAccountId} to pool ${poolId}`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "delegateToPool");
    }
  };

  /**
   * Withdraw staking rewards
   * POST /api/staking/withdraw-rewards
   */
  public withdrawRewards = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId, limit } = req.body;

      if (!vaultAccountId) {
        return res.status(400).json({
          success: false,
          error: "vaultAccountId is required",
        });
      }

      const fee = CardanoAmounts.STAKING_TX_FEE;

      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.withdrawRewards({ vaultAccountId, limit, fee })
      );

      this.logger.info(`Reward withdrawal successful for vault ${vaultAccountId}`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "withdrawRewards");
    }
  };

  public getStakeAccountInfo = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId } = req.params as { vaultAccountId: string };

      if (!vaultAccountId) {
        return res.status(400).json({
          success: false,
          error: "vaultAccountId is required",
        });
      }

      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.getStakeAccountInfo(vaultAccountId)
      );

      this.logger.info(`Staking account info retrieved successfully for vault ${vaultAccountId}`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "getStakeAccountInfo");
    }
  };

  public getCurrentEpoch = async (req: Request, res: Response) => {
    try {
      const result = await this.sdkManager.withSdk("0", (sdk) => sdk.getCurrentEpoch());

      this.logger.info(`Current epoch retrieved successfully`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "getCurrentEpoch");
    }
  };

  /**
   * Query staking rewards for a vault account
   * GET /api/staking/rewards/:vaultAccountId
   */
  public queryStakingRewards = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId } = req.params as { vaultAccountId: string };

      if (!vaultAccountId) {
        return res.status(400).json({
          success: false,
          error: "vaultAccountId is required",
        });
      }

      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.queryStakingRewards(vaultAccountId)
      );

      this.logger.info(`Staking rewards queried successfully for vault ${vaultAccountId}`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "queryStakingRewards");
    }
  };

  /**
   * Cast a governance vote as a DRep (Conway governance)
   * POST /api/governance/vote
   */
  public castGovernanceVote = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId, governanceActionId, vote, anchor, fee } = req.body;

      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.castGovernanceVote({ vaultAccountId, governanceActionId, vote, anchor, fee })
      );

      this.logger.info(
        `Governance vote "${vote}" submitted for vault ${vaultAccountId}: ${result.txHash}`
      );
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "castGovernanceVote");
    }
  };

  /**
   * Delegate to a DRep (Conway governance)
   * POST /api/governance/delegate-drep
   */
  public delegateToDRep = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId, drepAction, drepId } = req.body;
      const fee = CardanoAmounts.GOVERNANCE_TX_FEE;

      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.delegateToDRep({ vaultAccountId, drepAction, drepId, fee })
      );

      this.logger.info(`DRep delegation successful for vault ${vaultAccountId}`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "delegateToDRep");
    }
  };

  /**
   * Register a vault account as a DRep (Conway governance)
   * POST /api/governance/register-drep
   */
  public registerAsDRep = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId, anchor, depositAmount, fee } = req.body;

      const result = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.registerAsDRep({ vaultAccountId, anchor, depositAmount, fee })
      );

      this.logger.info(`DRep registration submitted for vault ${vaultAccountId}: ${result.txHash}`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "registerAsDRep");
    }
  };

  /**
   * Get pool information
   * GET /api/pool/info/:poolId
   */
  public getPoolInfo = async (req: Request, res: Response) => {
    try {
      const { poolId } = req.params as { poolId: string };
      const result = await this.sdkManager.withSdk("0", (sdk) => sdk.getPoolInfo(poolId));

      this.logger.info(`Pool info retrieved for ${poolId}`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "getPoolInfo");
    }
  };

  public getPoolMetadata = async (req: Request, res: Response) => {
    try {
      const { poolId } = req.params as { poolId: string };
      const result = await this.sdkManager.withSdk("0", (sdk) => sdk.getPoolMetadata(poolId));

      this.logger.info(`Pool metadata retrieved for ${poolId}`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "getPoolMetadata");
    }
  };

  public getPoolDelegators = async (req: Request, res: Response) => {
    try {
      const { poolId } = req.params as { poolId: string };
      const result = await this.sdkManager.withSdk("0", (sdk) => sdk.getPoolDelegators(poolId));

      this.logger.info(`Pool delegators retrieved for ${poolId}`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "getPoolDelegators");
    }
  };

  public getPoolDelegatorsList = async (req: Request, res: Response) => {
    try {
      const { poolId } = req.params as { poolId: string };
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;
      const result = await this.sdkManager.withSdk("0", (sdk) =>
        sdk.getPoolDelegatorsList(poolId, limit, offset)
      );

      this.logger.info(`Pool delegators list retrieved for ${poolId}`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "getPoolDelegatorsList");
    }
  };

  public getPoolBlocks = async (req: Request, res: Response) => {
    try {
      const { poolId } = req.params as { poolId: string };
      const result = await this.sdkManager.withSdk("0", (sdk) => sdk.getPoolBlocks(poolId));

      this.logger.info(`Pool blocks retrieved for ${poolId}`);
      ok(res, result);
    } catch (error: unknown) {
      this.handleError(error, res, "getPoolBlocks");
    }
  };

  /**
   * Get stake address for a vault account
   * GET /api/staking/stake-address/:vaultAccountId
   */
  public getStakeAddress = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId } = req.params as { vaultAccountId: string };

      if (!vaultAccountId) {
        return res.status(400).json({
          success: false,
          error: "vaultAccountId is required",
        });
      }

      const stakeAddress = await this.sdkManager.withSdk(vaultAccountId, (sdk) =>
        sdk.getStakeAddress(vaultAccountId)
      );

      this.logger.info(
        `Stake address retrieved successfully for vault ${vaultAccountId}: ${stakeAddress}`
      );
      ok(res, { stakeAddress });
    } catch (error: unknown) {
      this.handleError(error, res, "getStakeAddress");
    }
  };

  /**
   * Handles errors that occur during API operations.
   *
   * @param error - The error that occurred
   * @param res - Express response object
   * @param endpoint - The name of the endpoint where the error occurred (for logging)
   */
  private handleError(error: unknown, res: Response, endpoint: string): void {
    if (error instanceof SdkApiError) {
      const statusCode = error.statusCode || 500;

      this.logger.error(`${endpoint} - ApiError:`, {
        statusCode: error.statusCode,
        errorType: error.errorType,
        service: error.service,
        message: error.message,
      });

      res.status(statusCode).json({
        success: false,
        error: error.message,
        statusCode: error.statusCode,
        type: error.errorType,
        info: error.errorInfo,
        service: error.service,
      });
    } else {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`${endpoint} - Error:`, message);

      res.status(500).json({
        success: false,
        error: "Something went wrong",
      });
    }
  }
}
