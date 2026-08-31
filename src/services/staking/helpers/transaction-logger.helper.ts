/**
 * Transaction Logger Helper
 * Handles transaction logging for debugging
 */

import { Logger, LogLevel, sortWitnesses } from "../../../utils/index.js";
import { CardanoWitness } from "../../../types/index.js";

export class TransactionLogger {
  constructor(private readonly logger: Logger) {}

  logTransactionDetails(
    serialized: Buffer,
    txHash: Buffer,
    witnesses: CardanoWitness[],
    signedTx: Buffer
  ): void {
    // Building these hex strings (full tx body, every witness, signed tx) is expensive
    // and wasted when INFO output is suppressed, so skip it entirely below INFO (S-6).
    if (Logger.getLogLevel() > LogLevel.INFO) return;

    this.logger.info("=== Transaction Details ===");
    this.logger.info(`Serialized TX body (hex): ${serialized.toString("hex")}`);
    this.logger.info(`TX hash for signing: ${txHash.toString("hex")}`);
    this.logger.info(`Witnesses count: ${witnesses.length}`);

    const sortedWitnesses = sortWitnesses(witnesses);
    sortedWitnesses.forEach((w, i) => {
      this.logger.info(`Sorted Witness ${i} - PubKey: ${w.pubKey.toString("hex")}`);
      this.logger.info(`Sorted Witness ${i} - Signature: ${w.signature.toString("hex")}`);
    });

    this.logger.info(`Final signed TX (hex): ${signedTx.toString("hex")}`);
    this.logger.info("===========================");
  }
}
