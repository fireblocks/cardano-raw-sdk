/**
 * Registration Verifier Helper
 * Handles async verification of staking registration
 */

import { Logger } from "../../../utils/index.js";
import { IagonApiService } from "../../index.js";
import { REGISTRATION_VERIFICATION_DELAY_MS } from "../types/staking.interfaces.js";

export class RegistrationVerifier {
  constructor(
    private readonly iagonApiService: IagonApiService,
    private readonly logger: Logger
  ) {}

  verifyAsync(stakeAddress: string): void {
    setTimeout(() => {
      this.performVerification(stakeAddress).catch((error) => {
        this.logger.warn(`Background verification failed: ${error}`);
      });
    }, 0);
  }

  private async performVerification(stakeAddress: string): Promise<void> {
    await this.delay(REGISTRATION_VERIFICATION_DELAY_MS);

    const verifyInfo = await this.iagonApiService.getStakeAccountInfo(stakeAddress);

    if (verifyInfo.data.active) {
      this.logger.info("Registration verified! Stake key is active.");
      this.logger.info(`Stake address: ${stakeAddress}`);
      this.logger.info(`Active epoch: ${verifyInfo.data.active_epoch}`);
    } else {
      this.logger.warn("Registration pending. Check status later.");
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
