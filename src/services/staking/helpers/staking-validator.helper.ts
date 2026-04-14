/**
 * Staking Validator Helper
 * Validates registration status and delegation prerequisites
 */

import { Logger } from "../../../utils/index.js";
import { SdkApiError } from "../../../types/index.js";
import { IagonApiService } from "../../index.js";
import { IStakeAddressResolver, IStakingValidator } from "../types/staking.interfaces.js";

export class StakingValidator implements IStakingValidator {
  constructor(
    private readonly iagonApiService: IagonApiService,
    private readonly addressResolver: IStakeAddressResolver,
    private readonly logger: Logger
  ) {}

  async validateRegistrationStatus(
    vaultAccountId: string,
    shouldBeRegistered: boolean
  ): Promise<void> {
    const isRegistered = await this.checkRegistrationStatus(vaultAccountId);

    if (shouldBeRegistered && !isRegistered) {
      throw new SdkApiError(
        "Stake credential must be registered first",
        400,
        "NOT_REGISTERED",
        { vaultAccountId },
        "staking-service"
      );
    }
  }

  async validateDelegationPrerequisites(vaultAccountId: string, poolId: string): Promise<void> {
    const stakeAddress = await this.addressResolver.getStakeAddress(vaultAccountId);
    const accountInfo = await this.iagonApiService.getStakeAccountInfo(stakeAddress);

    if (!accountInfo.data.active) {
      throw new SdkApiError(
        "Stake credential must be registered first",
        400,
        "NOT_REGISTERED",
        { vaultAccountId },
        "staking-service"
      );
    }

    if (accountInfo.data.pool_id === poolId) {
      this.logger.info(`Already delegated to pool ${poolId}`);
    }

    await this.iagonApiService.getPoolInfo(poolId);
  }

  async checkRegistrationStatus(vaultAccountId: string): Promise<boolean> {
    try {
      const stakeAddress = await this.addressResolver.getStakeAddress(vaultAccountId);
      const accountInfo = await this.iagonApiService.getStakeAccountInfo(stakeAddress);
      return accountInfo.data.active;
    } catch {
      this.logger.info("Stake key not yet registered");
      return false;
    }
  }
}
