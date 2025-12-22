import axios from "axios";
import { Logger } from "./logger.js";
import { IagonApiError } from "../types/index.js";

export class ErrorHandler {
  constructor(
    private readonly serviceName: string,
    private readonly logger: Logger
  ) {}

  /**
   * Handles API errors consistently
   * @param error - The caught error
   * @param context - Description of what operation failed
   * @returns ApiError with structured error information
   */
  handleApiError(error: unknown, context: string): IagonApiError {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;

      // Log detailed error information
      this.logger.error(`Error ${context}`);
      this.logger.error("Status:", status);
      this.logger.error("Response Data:", data);
      this.logger.error("Request URL:", error.config?.url);

      const message =
        data?.message || data?.info || error.response?.statusText || `Error ${context}`;

      return new IagonApiError(message, status, data?.type, data?.info, this.serviceName);
    }

    // Handle ApiError - pass through unchanged
    if (error instanceof IagonApiError) {
      return error;
    }

    this.logger.error(`Unexpected error ${context}:`, error);
    return new IagonApiError(
      error instanceof Error ? error.message : `Error ${context}`,
      undefined,
      undefined,
      error,
      this.serviceName
    );
  }
}
