import axios from "axios";
import { Logger } from "./logger.js";
import { SdkApiError } from "../types/index.js";

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
  handleApiError(error: unknown, context: string): SdkApiError {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;

      // Log detailed error information
      this.logger.error(`Error ${context}`);
      this.logger.error("Status:", status);
      this.logger.error("Response Data:", data);
      this.logger.error("Request URL:", error.config?.url);

      // Log additional axios error details for non-response errors
      if (!error.response) {
        this.logger.error("Error Code:", error.code);
        this.logger.error("Error Message:", error.message);
        if (error.request) {
          this.logger.error("Request was made but no response received");
        } else {
          this.logger.error("Error setting up request");
        }
      }

      const message =
        data?.message ||
        data?.info ||
        error.response?.statusText ||
        error.message ||
        `Error ${context}`;

      return new SdkApiError(message, status, data?.type, data?.info, this.serviceName);
    }

    // Handle ApiError - pass through unchanged
    if (error instanceof SdkApiError) {
      return error;
    }

    this.logger.error(`Unexpected error ${context}:`, error);
    return new SdkApiError(
      error instanceof Error ? error.message : `Error ${context}`,
      undefined,
      undefined,
      error,
      this.serviceName
    );
  }
}
