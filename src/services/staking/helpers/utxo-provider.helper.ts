/**
 * UTXO Provider Helper
 * Handles UTXO finding and selection logic
 */

import { Logger, findSuitableUtxo, UtxoForStaking } from "../../../utils/index.js";
import { SdkApiError } from "../../../types/index.js";
import { FireblocksService, IagonApiService } from "../../index.js";
import {
  INetworkConfiguration,
  IUtxoProvider,
  AddressWithUtxo,
} from "../types/staking.interfaces.js";

export class UtxoProvider implements IUtxoProvider {
  constructor(
    private readonly fireblocksService: FireblocksService,
    private readonly iagonApiService: IagonApiService,
    private readonly networkConfig: INetworkConfiguration,
    private readonly logger: Logger
  ) {}

  async findAddressWithSuitableUtxo(
    vaultAccountId: string,
    minAmount: number
  ): Promise<AddressWithUtxo> {
    const addresses = await this.getVaultAddresses(vaultAccountId);

    for (const addressObj of addresses) {
      if (addressObj.addressFormat !== "BASE" || !addressObj.address) {
        continue;
      }

      const utxo = await this.findUtxoForAddress(addressObj.address, minAmount);

      if (utxo) {
        return {
          address: addressObj.address,
          addressIndex: addressObj.bip44AddressIndex ?? 0,
          utxo,
        };
      }

      this.logger.debug(`No suitable UTXO for address ${addressObj.address}`);
    }

    throw this.createInsufficientFundsError(vaultAccountId, minAmount);
  }

  private async getVaultAddresses(vaultAccountId: string) {
    const addresses = await this.fireblocksService.getVaultAccountAddresses(
      vaultAccountId,
      this.networkConfig.assetId
    );

    if (!addresses || addresses.length === 0) {
      throw new SdkApiError(
        "No addresses found for vault account",
        400,
        "NO_ADDRESSES",
        { vaultAccountId },
        "staking-service"
      );
    }

    return addresses;
  }

  private async findUtxoForAddress(
    address: string,
    minAmount: number
  ): Promise<UtxoForStaking | null> {
    const utxosResponse = await this.iagonApiService.getUtxosByAddress(address);

    if (!utxosResponse.data || utxosResponse.data.length === 0) {
      return null;
    }

    return findSuitableUtxo(utxosResponse.data, minAmount);
  }

  private createInsufficientFundsError(vaultAccountId: string, minAmount: number): SdkApiError {
    const requiredAda = this.formatAda(minAmount);
    return new SdkApiError(
      `No address with pure ADA UTXO of at least ${requiredAda} ADA found. ` +
        `Please send ${requiredAda} ADA (without tokens) to this vault.`,
      400,
      "INSUFFICIENT_PURE_ADA",
      { vaultAccountId, requiredAmount: minAmount },
      "staking-service"
    );
  }

  private formatAda(lovelace: number): string {
    const bigLovelace = BigInt(Math.trunc(lovelace));
    const whole = bigLovelace / 1_000_000n;
    const frac = bigLovelace % 1_000_000n;
    return `${whole}.${frac.toString().padStart(6, "0").slice(0, 1)}`;
  }
}
