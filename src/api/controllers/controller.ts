import { Request, Response } from "express";
import { Logger } from "../../utils/logger.js";
import { SdkManager } from "../../pool/sdkManager.js";
import { IagonApiError } from "../../types/errors.js";
import { SupportedAssets } from "../../types/enums.js";

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
    const assetId = req.query.assetId
      ? (req.query.assetId as SupportedAssets)
      : SupportedAssets.ADA;
    const index = req.query.index ? parseInt(req.query.index as string, 10) : 0;
    const groupByPolicy = req.query.groupByPolicy === "true";

    try {
      const sdk = await this.sdkManager.getSdk(vaultAccountId);
      const result = await sdk.getBalanceByAddress(assetId, {
        index,
        groupByPolicy,
      });

      res.status(200).json(result);
    } catch (error: any) {
      this.handleError(error, res, "getBalanceByAddress");
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

  /**
   * Helper method to parse transaction history query parameters
   */
  private parseTransactionHistoryParams(req: Request) {
    const { vaultAccountId, assetId } = req.params;
    const index = req.query.index ? parseInt(req.query.index as string, 10) : 0;
    const options = {
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      fromSlot: req.query.fromSlot ? Number(req.query.fromSlot) : undefined,
    };

    return { vaultAccountId, assetId, index, options };
  }

  public getTransactionHistory = async (req: Request, res: Response) => {
    const { vaultAccountId, assetId, index, options } = this.parseTransactionHistoryParams(req);

    try {
      const sdk = await this.sdkManager.getSdk(vaultAccountId);
      const reqAssetId = (assetId as SupportedAssets) ?? SupportedAssets.ADA;
      const result = await sdk.getTransactionHistory(reqAssetId, index, options);
      this.logger.info(`Transactions history retrieved successfully`);
      res.status(200).json(result);
    } catch (error: any) {
      this.handleError(error, res, "getTransactionHistory");
    }
  };

  public getDetailedTxHistory = async (req: Request, res: Response) => {
    const { vaultAccountId, assetId, index, options } = this.parseTransactionHistoryParams(req);
    try {
      const sdk = await this.sdkManager.getSdk(vaultAccountId);
      const reqAssetId = (assetId as SupportedAssets) ?? SupportedAssets.ADA;
      const result = await sdk.getDetailedTxHistory(reqAssetId, index, options);
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
