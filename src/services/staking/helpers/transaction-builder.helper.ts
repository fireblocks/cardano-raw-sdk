/**
 * Transaction Builder and Submitter Helpers
 * Handles transaction building and submission to the blockchain
 */

import {
  Logger,
  buildPayload,
  calculateTtl,
  assertFeeCoversSize,
  assertOutputMeetsMinUtxo,
} from "../../../utils/index.js";
import { TransferResponse } from "../../../types/index.js";
import { IagonApiService } from "../../index.js";
import {
  INetworkConfiguration,
  ITransactionSubmitter,
  TransactionBuildContext,
  EXPECTED_SIGNATURE_COUNT,
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
    // Reject a change output below the protocol min-UTxO before signing, so an
    // underfunded input set fails fast instead of after a Fireblocks signing op (S-4/S-7).
    assertOutputMeetsMinUtxo(context.netAmount);

    const payload = buildPayload({
      toAddress: context.toAddress,
      netAmount: context.netAmount,
      txInputs: context.utxos.map((u) => ({
        txHash: Buffer.from(u.txHash, "hex"),
        indexInTx: u.indexInTx,
      })),
      feeAmount: context.fee,
      ttl: context.ttl,
      certificates: context.certificates,
      withdrawals: context.withdrawals,
      votingProcedures: context.votingProcedures,
      network: context.network,
    });

    // Validate the allocated fee against the size-aware network minimum BEFORE signing,
    // so an underpriced fee is rejected locally instead of after a Fireblocks signing
    // operation is consumed (audit finding S-7). Staking/gov txs always carry 2 witnesses.
    const minFee = assertFeeCoversSize(
      payload.serialized.length,
      EXPECTED_SIGNATURE_COUNT,
      context.fee
    );
    this.logger.info(
      `Fee validated: allocated ${context.fee} lovelace, network minimum ${minFee} lovelace`
    );

    return payload;
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
