import {
  Fireblocks,
  FireblocksResponse,
  TransactionResponse,
  TransactionStateEnum,
} from "@fireblocks/ts-sdk";
import { Logger, LogLevel } from "./logger.js";

const logLevel = "INFO";
Logger.setLogLevel(LogLevel[logLevel as keyof typeof LogLevel] || LogLevel.INFO);
const logger = new Logger("utils:fireblocks");

/**
 * Polls a Fireblocks transaction until it reaches a terminal state.
 *
 * Continuously monitors transaction status and waits for completion or broadcasting state.
 * Logs status changes and throws errors for failure states (blocked, cancelled, failed, rejected).
 *
 * @param txId - The Fireblocks transaction ID to monitor
 * @param fireblocks - Initialized Fireblocks SDK instance for API calls
 * @param pollingInterval - Optional interval between status checks in milliseconds (default: 1000ms)
 *
 * @returns Promise resolving to the final TransactionResponse when completed or broadcasting
 *
 * @throws {Error} If transaction is blocked - policy or compliance issue
 * @throws {Error} If transaction is cancelled - user or system cancellation
 * @throws {Error} If transaction fails - signature failure or network error
 * @throws {Error} If transaction is rejected - approval policy rejection
 *
 * @remarks
 * **Terminal Success States:**
 * - `COMPLETED` - Transaction fully processed and confirmed
 * - `BROADCASTING` - Transaction submitted to blockchain network
 *
 * **Terminal Failure States:**
 * - `BLOCKED` - Blocked by policy or compliance
 * - `CANCELLED` - Manually cancelled
 * - `FAILED` - Technical failure during processing
 * - `REJECTED` - Rejected by approval policy
 *
 * **Transient States** (will continue polling):
 * - `SUBMITTED` - Submitted for processing
 * - `QUEUED` - Waiting in queue
 * - `PENDING_SIGNATURE` - Awaiting signature
 * - `PENDING_AUTHORIZATION` - Awaiting approval
 * - `PENDING_3RD_PARTY_MANUAL_APPROVAL` - Waiting for external approval
 * - `PENDING_3RD_PARTY` - Processing with third party
 *
 * @example
 * ```typescript
 * const txResponse = await fireblocks.transactions.createTransaction({...});
 * const completedTx = await getTxStatus(txResponse.data.id, fireblocks, 2000);
 * const signature = completedTx.signedMessages?.[0]?.signature;
 * ```
 */
export const getTxStatus = async (
  txId: string,
  fireblocks: Fireblocks,
  pollingInterval: number = 1000
): Promise<TransactionResponse> => {
  try {
    let txResponse: FireblocksResponse<TransactionResponse> =
      await fireblocks.transactions.getTransaction({ txId });
    let lastStatus = txResponse.data.status;

    logger.info(
      `Transaction ${txResponse.data.id} is currently at status - ${txResponse.data.status}`
    );

    // Poll until terminal state
    while (
      txResponse.data.status !== TransactionStateEnum.Completed &&
      txResponse.data.status !== TransactionStateEnum.Broadcasting
    ) {
      await new Promise((resolve) => setTimeout(resolve, pollingInterval));

      txResponse = await fireblocks.transactions.getTransaction({
        txId: txId,
      });

      if (txResponse.data.status !== lastStatus) {
        logger.info(
          `Transaction ${txResponse.data.id} status changed: ${lastStatus} → ${txResponse.data.status}`
        );
        lastStatus = txResponse.data.status;
      }

      switch (txResponse.data.status) {
        case TransactionStateEnum.Blocked:
        case TransactionStateEnum.Cancelled:
        case TransactionStateEnum.Failed:
        case TransactionStateEnum.Rejected:
          throw new Error(
            `Transaction ${txResponse.data.id} failed with status: ${txResponse.data.status}\nSub-Status: ${txResponse.data.subStatus}`
          );
        default:
          break;
      }
    }

    logger.info(
      `Transaction ${txResponse.data.id} reached terminal state: ${txResponse.data.status}`
    );

    return txResponse.data;
  } catch (error) {
    logger.error(
      `Error polling transaction ${txId}:`,
      error instanceof Error ? error.message : error
    );
    throw error;
  }
};
