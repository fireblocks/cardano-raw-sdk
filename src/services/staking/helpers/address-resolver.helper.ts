/**
 * Address Resolver Helper
 * Responsible for address resolution and stake address derivation
 */

import { Logger, getStakeAddressFromBaseAddress } from "../../../utils/index.js";
import { SdkApiError } from "../../../types/index.js";
import { FireblocksService } from "../../index.js";
import {
  INetworkConfiguration,
  IStakeAddressResolver,
  AddressInfo,
} from "../types/staking.interfaces.js";
import { VaultWalletAddress } from "@fireblocks/ts-sdk";

export class StakeAddressResolver implements IStakeAddressResolver {
  constructor(
    private readonly fireblocksService: FireblocksService,
    private readonly networkConfig: INetworkConfiguration,
    private readonly logger: Logger
  ) {}

  async getStakeAddress(vaultAccountId: string): Promise<string> {
    const { address } = await this.getBaseAddress(vaultAccountId);
    return getStakeAddressFromBaseAddress(address, this.networkConfig.isMainnet());
  }

  async getBaseAddress(vaultAccountId: string, addressIndex?: number): Promise<AddressInfo> {
    const addresses = await this.fireblocksService.getVaultAccountAddresses(
      vaultAccountId,
      this.networkConfig.assetId
    );

    const baseAddress = this.findBaseAddress(addresses, addressIndex);

    if (!baseAddress?.address) {
      throw new SdkApiError(
        "No BASE address found for vault account",
        400,
        "NO_BASE_ADDRESS",
        { vaultAccountId, addressIndex },
        "staking-service"
      );
    }

    return {
      address: baseAddress.address,
      addressIndex: baseAddress.bip44AddressIndex ?? 0,
    };
  }

  private findBaseAddress(addresses: VaultWalletAddress[], addressIndex?: number) {
    if (addressIndex !== undefined) {
      return addresses.find(
        (addr) => addr.addressFormat === "BASE" && addr.bip44AddressIndex === addressIndex
      );
    }
    return addresses.find((addr) => addr.addressFormat === "BASE");
  }
}
