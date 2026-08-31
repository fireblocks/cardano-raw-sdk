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

    const poolInfo = await this.iagonApiService.getPoolInfo(poolId);
    if (!poolInfo?.data) {
      throw new SdkApiError(
        `Pool ${poolId} not found`,
        404,
        "PoolNotFound",
        { poolId },
        "staking-service"
      );
    }
    // The Iagon pool-info contract reports retirement as a status field
    // ("active" | "retiring" | "retired") plus retiring_epoch.
    const { status, retiring_epoch } = poolInfo.data;
    if (status === "retiring" || status === "retired") {
      throw new SdkApiError(
        `Pool ${poolId} is ${status} and cannot accept new delegations`,
        400,
        "PoolRetired",
        { poolId, status, retiringEpoch: retiring_epoch },
        "staking-service"
      );
    }
  }

  async checkRegistrationStatus(vaultAccountId: string): Promise<boolean> {
    try {
      const stakeAddress = await this.addressResolver.getStakeAddress(vaultAccountId);
      const accountInfo = await this.iagonApiService.getStakeAccountInfo(stakeAddress);
      return accountInfo.data.active;
    } catch (err) {
      // 404 = the stake account legitimately does not exist on-chain.
      // Any other failure (network, 5xx, parse error) must propagate so
      // callers don't mistake an outage for "not registered" and skip a
      // deregistration / submit a duplicate registration.
      if (err instanceof SdkApiError && err.statusCode === 404) {
        this.logger.info("Stake key not yet registered");
        return false;
      }
      throw err;
    }
  }
}
