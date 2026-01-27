/**
 * Rewards Query Helper
 * Queries and manages rewards information
 */

import { Logger, stakeAddressBytesPrefix } from "../../../utils/index.js";
import { RewardsData, CardanoRewardWithdrawal } from "../../../types/index.js";
import { IagonApiService } from "../../index.js";

export class RewardsQueryService {
  constructor(
    private readonly iagonApiService: IagonApiService,
    private readonly logger: Logger
  ) {}

  async queryRewards(stakeAddress: string): Promise<RewardsData> {
    const [accountInfo, rewardsResponse, withdrawalHistory] = await Promise.all([
      this.iagonApiService.getStakeAccountInfo(stakeAddress),
      this.iagonApiService.getStakeAccountRewards(stakeAddress),
      this.iagonApiService.getWithdrawalHistory(stakeAddress),
    ]);

    const rewards = rewardsResponse.data.map((reward) => ({
      poolId: reward.pool_id,
      amount: reward.amount,
      epoch: reward.epoch,
    }));

    const availableRewards = parseInt(accountInfo.data.available_rewards, 10);
    const totalRewards = parseInt(accountInfo.data.rewards_sum, 10);
    const totalWithdrawals = parseInt(accountInfo.data.withdrawn_rewards, 10);

    this.logger.info(
      `Rewards summary for ${stakeAddress}: Available: ${availableRewards}, Total: ${totalRewards}, Withdrawn: ${totalWithdrawals}`
    );

    return {
      rewards,
      availableRewards,
      totalRewards,
      totalWithdrawals,
    };
  }

  async getWithdrawals(
    stakeAddress: string,
    certificate: Buffer,
    maxWithdrawal: number,
    isMainnet: boolean
  ): Promise<{ withdrawal: CardanoRewardWithdrawal; rewardAmount: number }> {
    const rewardsData = await this.queryRewards(stakeAddress);
    const availableRewards = rewardsData.availableRewards;

    this.logger.info(`Total available rewards: ${availableRewards} Lovelace`);

    let rewardAmount = availableRewards;
    if (rewardAmount === 0) {
      this.logger.info("No rewards to withdraw");
    } else if (rewardAmount > maxWithdrawal) {
      rewardAmount = maxWithdrawal;
    }

    const withdrawalCertificate = Buffer.concat([stakeAddressBytesPrefix(isMainnet), certificate]);

    const withdrawal: CardanoRewardWithdrawal = {
      certificate: withdrawalCertificate,
      reward: rewardAmount,
    };

    return { withdrawal, rewardAmount };
  }
}
