/**
 * Network Configuration Helper
 * Handles network-specific configuration and asset ID resolution
 */

import { Networks, SupportedAssets } from "../../../types/index.js";
import { INetworkConfiguration } from "../types/staking.interfaces.js";

export class NetworkConfiguration implements INetworkConfiguration {
  readonly network: Networks;
  readonly assetId: SupportedAssets;

  constructor(network: Networks) {
    this.network = network;
    this.assetId = network === Networks.MAINNET ? SupportedAssets.ADA : SupportedAssets.ADA_TEST;
  }

  isMainnet(): boolean {
    return this.network === Networks.MAINNET;
  }
}
