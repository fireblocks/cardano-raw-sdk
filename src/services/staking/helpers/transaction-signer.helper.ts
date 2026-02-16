/**
 * Transaction Signer Helper
 * Manages transaction signing with Fireblocks
 */

import { Logger, ErrorHandler } from "../../../utils/index.js";
import { SdkApiError, CardanoWitness } from "../../../types/index.js";
import { TransactionRequest, TransactionOperation, TransferPeerPathType } from "@fireblocks/ts-sdk";
import { FireblocksService } from "../../index.js";
import {
  INetworkConfiguration,
  ITransactionSigner,
  SigningContext,
  STAKE_KEY_PATH_INDEX,
  PAYMENT_KEY_CHANGE_INDEX,
  EXPECTED_SIGNATURE_COUNT,
} from "../types/staking.interfaces.js";

export class TransactionSigner implements ITransactionSigner {
  constructor(
    private readonly fireblocksService: FireblocksService,
    private readonly networkConfig: INetworkConfiguration,
    private readonly logger: Logger,
    private readonly errorHandler: ErrorHandler
  ) {}

  async signTransaction(context: SigningContext): Promise<CardanoWitness[]> {
    try {
      const payload = this.buildSigningPayload(context);

      this.logger.info(`Sending transaction for signing: ${context.operation}`);

      const transactionResponse = await this.fireblocksService.signTransaction(payload);

      if (!transactionResponse) {
        throw new SdkApiError("Transaction response is null", 503, "NULL_RESPONSE");
      }

      this.validateTransactionData(transactionResponse.data);

      const [paymentPubKey, stakePubKey] = await this.fetchPublicKeys(
        context.vaultAccountId,
        context.addressIndex
      );

      this.logPublicKeys(paymentPubKey, stakePubKey);

      return this.mapResponseToWitnesses(transactionResponse.data);
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, "sending transaction for signing");
    }
  }

  private buildSigningPayload(context: SigningContext): TransactionRequest {
    return {
      assetId: this.networkConfig.assetId,
      operation: TransactionOperation.Raw,
      source: {
        type: TransferPeerPathType.VaultAccount,
        id: context.vaultAccountId,
      },
      note: `Cardano ${context.operation} for vault account ${context.vaultAccountId}`,
      extraParameters: {
        rawMessageData: {
          messages: [
            { content: context.txHash, bip44addressIndex: context.addressIndex },
            { content: context.txHash, bip44change: STAKE_KEY_PATH_INDEX },
          ],
        },
      },
    };
  }

  private validateTransactionData(txData: any): void {
    if (!txData || txData.length !== EXPECTED_SIGNATURE_COUNT) {
      throw new SdkApiError(
        `Expected ${EXPECTED_SIGNATURE_COUNT} signatures, got ${txData?.length ?? 0}`,
        500,
        "INVALID_SIGNATURE_COUNT"
      );
    }
  }

  private async fetchPublicKeys(
    vaultAccountId: string,
    addressIndex: number
  ): Promise<[string, string]> {
    const [paymentPubKey, stakePubKey] = await Promise.all([
      this.fireblocksService.getAssetPublicKey(
        vaultAccountId,
        this.networkConfig.assetId,
        PAYMENT_KEY_CHANGE_INDEX,
        addressIndex
      ),
      this.fireblocksService.getAssetPublicKey(
        vaultAccountId,
        this.networkConfig.assetId,
        STAKE_KEY_PATH_INDEX,
        0 // Stake key always uses addressIndex 0
      ),
    ]);

    return [paymentPubKey, stakePubKey];
  }

  private logPublicKeys(paymentPubKey: string, stakePubKey: string): void {
    this.logger.info(`Expected payment key: ${paymentPubKey}`);
    this.logger.info(`Expected stake key: ${stakePubKey}`);
  }

  private mapResponseToWitnesses(txData: any[]): CardanoWitness[] {
    const witnesses: CardanoWitness[] = txData.map((sig) => ({
      pubKey: Buffer.from(sig.publicKey!, "hex"),
      signature: Buffer.from(sig.signature!.fullSig!, "hex"),
    }));

    witnesses.forEach((w, i) => {
      this.logger.info(`Received witness ${i} - PubKey: ${w.pubKey.toString("hex")}`);
    });

    return witnesses;
  }
}
