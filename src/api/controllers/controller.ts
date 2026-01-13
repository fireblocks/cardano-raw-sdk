import { Request, Response } from "express";
import { Logger } from "../../utils/index.js";
import { SdkManager } from "../../pool/sdkManager.js";
import { GroupByOptions, IagonApiError } from "../../types/index.js";

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

  public getBalanceByAddress = async (req: Request, res: Response) => {
    const { vaultAccountId } = req.params;
    const index = req.query.index ? parseInt(req.query.index as string, 10) : 0;
    const groupByPolicy = req.query.groupByPolicy === "true";

    try {
      const sdk = await this.sdkManager.getSdk(vaultAccountId);
      const result = await sdk.getBalanceByAddress({
        index,
        groupByPolicy,
      });

      res.status(200).json(result);
    } catch (error: any) {
      this.handleError(error, res, "getBalanceByAddress");
    }
  };

  public getVaultBalance = async (req: Request, res: Response) => {
    const { vaultAccountId } = req.params;
    const groupBy = req.query.groupBy as GroupByOptions | undefined;

    try {
      const sdk = await this.sdkManager.getSdk(vaultAccountId);
      const result = await sdk.getVaultBalance({ groupBy });

      res.status(200).json(result);
    } catch (error: any) {
      this.handleError(error, res, "getVaultBalance");
    }
  };

  public getBalanceByCredential = async (req: Request, res: Response) => {
    const { vaultAccountId, credential } = req.params;
    const groupByPolicy = req.query.groupByPolicy === "true";

    try {
      const sdk = await this.sdkManager.getSdk(vaultAccountId);
      const result = await sdk.getBalanceByCredential({
        credential,
        groupByPolicy,
      });

      res.status(200).json(result);
    } catch (error: any) {
      this.handleError(error, res, "getBalanceByCredential");
    }
  };

  public getBalanceByStakeKey = async (req: Request, res: Response) => {
    const { vaultAccountId, stakeKey } = req.params;
    const groupByPolicy = req.query.groupByPolicy === "true";

    try {
      const sdk = await this.sdkManager.getSdk(vaultAccountId);
      const result = await sdk.getBalanceByStakeKey({
        stakeKey,
        groupByPolicy,
      });

      res.status(200).json(result);
    } catch (error: any) {
      this.handleError(error, res, "getBalanceByStakeKey");
    }
  };

  public getTransactionDetails = async (req: Request, res: Response) => {
    const { hash } = req.params;
    try {
      const sdk = await this.sdkManager.getSdk("0"); // Using a default vaultAccountId as hash is global
      const result = await sdk.getTransactionDetails(hash);
      this.logger.info(`Transaction details retrieved successfully`);
      res.status(200).json(result);
    } catch (error: any) {
      this.handleError(error, res, "getTransactionDetails");
    }
  };

  public getUtxosByAddress = async (req: Request, res: Response) => {
    const { vaultAccountId } = req.params;
    const index = req.query.index ? parseInt(req.query.index as string, 10) : 0;

    try {
      const sdk = await this.sdkManager.getSdk(vaultAccountId);
      const result = await sdk.getUtxosByAddress(index);
      this.logger.info(`UTXOs retrieved successfully for vault ${vaultAccountId}`);
      res.status(200).json(result);
    } catch (error: any) {
      this.handleError(error, res, "getUtxosByAddress");
    }
  };

  /**
   * Helper method to parse transaction history query parameters
   */
  private parseTransactionHistoryParams(req: Request) {
    const { vaultAccountId } = req.params;
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
      const sdk = await this.sdkManager.getSdk(vaultAccountId);
      const result = await sdk.getTransactionHistory(index, options);
      this.logger.info(`Transactions history retrieved successfully`);
      res.status(200).json(result);
    } catch (error: any) {
      this.handleError(error, res, "getTransactionHistory");
    }
  };

  public getDetailedTxHistory = async (req: Request, res: Response) => {
    const { vaultAccountId, index, options } = this.parseTransactionHistoryParams(req);
    try {
      const sdk = await this.sdkManager.getSdk(vaultAccountId);
      const result = await sdk.getDetailedTxHistory(index, options);
      this.logger.info(`Detailed transactions history retrieved successfully`);
      res.status(200).json(result);
    } catch (error: any) {
      this.handleError(error, res, "getDetailedTxHistory");
    }
  };

  public transfer = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId } = req.body;
      const sdk = await this.sdkManager.getSdk(vaultAccountId);
      const result = await sdk.transfer(req.body);
      this.logger.info(`Transfer executed successfully`);
      res.status(200).json(result);
    } catch (error: any) {
      this.handleError(error, res, "transfer");
    }
  };

  public enrichWebhookPayload = async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      const vaultAccountId = payload.data.destination.id;
      const sdk = await this.sdkManager.getSdk(vaultAccountId);
      const result = await sdk.enrichWebhookPayload(payload);
      this.logger.info(`Webhook enrichment executed successfully`);
      res.status(200).json(result);
    } catch (error: any) {
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
      const { vaultAccountId, index, depositAmount, fee } = req.body;

      if (!vaultAccountId) {
        return res.status(400).json({
          success: false,
          error: "vaultAccountId is required",
        });
      }

      const sdk = await this.sdkManager.getSdk(vaultAccountId);
      const result = await sdk.registerStakingCredential({
        vaultAccountId,
        index,
        depositAmount,
        fee,
      });

      this.logger.info(`Staking registration successful for vault ${vaultAccountId}`);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      this.handleError(error, res, "registerStaking");
    }
  };

  /**
   * Delegate to a stake pool
   * POST /api/staking/delegate
   */
  public delegateToPool = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId, poolId, index, fee } = req.body;

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

      const sdk = await this.sdkManager.getSdk(vaultAccountId);
      const result = await sdk.delegateToPool({
        vaultAccountId,
        poolId,
        index,
        fee,
      });

      this.logger.info(`Pool delegation successful for vault ${vaultAccountId} to pool ${poolId}`);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      this.handleError(error, res, "delegateToPool");
    }
  };

  /**
   * Deregister staking credential
   * POST /api/staking/deregister
   */
  public deregisterStaking = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId, index, fee } = req.body;

      if (!vaultAccountId) {
        return res.status(400).json({
          success: false,
          error: "vaultAccountId is required",
        });
      }

      const sdk = await this.sdkManager.getSdk(vaultAccountId);
      const result = await sdk.deregisterStakingCredential({
        vaultAccountId,
        index,
        fee,
      });

      this.logger.info(`Staking deregistration successful for vault ${vaultAccountId}`);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      this.handleError(error, res, "deregisterStaking");
    }
  };

  /**
   * Withdraw staking rewards
   * POST /api/staking/withdraw-rewards
   */
  public withdrawRewards = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId, limit, index, fee } = req.body;

      if (!vaultAccountId) {
        return res.status(400).json({
          success: false,
          error: "vaultAccountId is required",
        });
      }

      const sdk = await this.sdkManager.getSdk(vaultAccountId);
      const result = await sdk.withdrawRewards({
        vaultAccountId,
        limit,
        index,
        fee,
      });
      if (!result.success) {
        // No rewards or insufficient balance - client error
        return res.status(400).json({
          success: false,
          error: result.error,
        });
      }

      this.logger.info(`Reward withdrawal successful for vault ${vaultAccountId}`);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      this.handleError(error, res, "withdrawRewards");
    }
  };

  /**
   * Query staking rewards for a vault account
   * GET /api/staking/rewards/:vaultAccountId
   */
  public queryStakingRewards = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId } = req.params;

      if (!vaultAccountId) {
        return res.status(400).json({
          success: false,
          error: "vaultAccountId is required",
        });
      }

      const sdk = await this.sdkManager.getSdk(vaultAccountId);
      const result = await sdk.queryStakingRewards(vaultAccountId);

      this.logger.info(`Staking rewards queried successfully for vault ${vaultAccountId}`);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      this.handleError(error, res, "queryStakingRewards");
    }
  };

  /**
   * Delegate to a DRep (Conway governance)
   * POST /api/governance/delegate-drep
   */
  public delegateToDRep = async (req: Request, res: Response) => {
    try {
      const { vaultAccountId, drepAction, drepId, index, fee } = req.body;

      if (!vaultAccountId) {
        return res.status(400).json({
          success: false,
          error: "vaultAccountId is required",
        });
      }

      if (!drepAction) {
        return res.status(400).json({
          success: false,
          error: "drepAction is required (always-abstain, always-no-confidence, or custom-drep)",
        });
      }

      if (drepAction === "custom-drep" && !drepId) {
        return res.status(400).json({
          success: false,
          error: "drepId is required when drepAction is custom-drep",
        });
      }

      const sdk = await this.sdkManager.getSdk(vaultAccountId);
      const result = await sdk.delegateToDRep({
        vaultAccountId,
        drepAction,
        drepId,
        index,
        fee,
      });

      this.logger.info(`DRep delegation successful for vault ${vaultAccountId}`);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      this.handleError(error, res, "delegateToDRep");
    }
  };

  /**
   * Handles errors that occur during API operations.
   *
   * This private method provides centralized error handling, distinguishing between
   * IagonApiError instances (which have structured error information) and generic
   * errors. It logs the error details and sends an appropriate HTTP response.
   *
   * @param error - The error that occurred
   * @param res - Express response object
   * @param endpoint - The name of the endpoint where the error occurred (for logging)
   * @returns void
   *
   * @remarks
   * For IagonApiError instances, returns a structured JSON response with statusCode,
   * errorType, service, message, and additional error info.
   * For generic errors, returns a 500 status with a simple error message.
   */
  /**
   * Handles errors that occur during API operations.
   *
   * This private method provides centralized error handling, distinguishing between
   * ApiError instances (which have structured error information) and generic
   * errors. It logs the error details and sends an appropriate HTTP response.
   *
   * @param error - The error that occurred
   * @param res - Express response object
   * @param endpoint - The name of the endpoint where the error occurred (for logging)
   * @returns void
   *
   * @remarks
   * For ApiError instances, returns a structured JSON response with statusCode,
   * errorType, service, message, and additional error info.
   * For generic errors, returns a 500 status with a simple error message.
   */
  private handleError(error: unknown, res: Response, endpoint: string): void {
    if (error instanceof IagonApiError) {
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
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }
}
