/**
 * Transaction Builder and Submitter Helpers
 * Handles transaction building and submission to the blockchain
 */

import { Logger, buildPayload, calculateTtl } from "../../../utils/index.js";
import { TransferResponse } from "../../../types/index.js";
import { IagonApiService } from "../../index.js";
import {
  INetworkConfiguration,
  ITransactionSubmitter,
  TransactionBuildContext,
} from "../types/staking.interfaces.js";

export class TransactionBuilder {
  constructor(
    private readonly iagonApiService: IagonApiService,
    private readonly networkConfig: INetworkConfiguration,
    private readonly logger: Logger
  ) {}

  async buildTransaction(
    context: TransactionBuildContext
  ): Promise<{ serialized: Buffer; deserialized: Map<number, unknown> }> {
    return buildPayload({
      toAddress: context.toAddress,
      netAmount: context.netAmount,
      txInputs: [
        { txHash: Buffer.from(context.utxo.txHash, "hex"), indexInTx: context.utxo.indexInTx },
      ],
      feeAmount: context.fee,
      ttl: context.ttl,
      certificates: context.certificates,
      withdrawals: context.withdrawals,
      votingProcedures: context.votingProcedures,
      network: context.network,
    });
  }

  async getCurrentTtl(): Promise<number> {
    const epochResponse = await this.iagonApiService.getCurrentEpoch();
    const currentSlot = epochResponse.data.tip.slot;
    this.logger.info(`Current slot: ${currentSlot}`);
    return calculateTtl(currentSlot);
  }
}

export class TransactionSubmitter implements ITransactionSubmitter {
  constructor(private readonly iagonApiService: IagonApiService) {}

  async submitTransaction(signedTx: Buffer, skipValidation: boolean): Promise<TransferResponse> {
    return await this.iagonApiService.submitTransfer(signedTx.toString("hex"), skipValidation);
  }
}
