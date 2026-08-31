/**
 * UTXO Provider Helper
 * Handles UTXO finding and selection logic
 */

import {
  Logger,
  selectPureAdaUtxos,
  sumPureAdaLovelace,
  formatWithDecimals,
  utxoLocks,
  filterSpendableUtxos,
} from "../../../utils/index.js";
import { SdkApiError } from "../../../types/index.js";
import { CardanoConstants } from "../../../constants.js";
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

    // Track the largest single-address pure-ADA balance AND the vault-wide total, to
    // produce an actionable error: fragmentation (vault has enough, just split across
    // addresses) is a different remedy from genuine shortfall (audit finding S-4).
    let bestPureAdaOnAnyAddress = 0;
    let totalPureAdaAcrossVault = 0;

    for (const addressObj of addresses) {
      if (addressObj.addressFormat !== "BASE" || !addressObj.address) {
        continue;
      }

      const utxosResponse = await this.iagonApiService.getUtxosByAddress(addressObj.address);
      const data = utxosResponse.data ?? [];

      // Exclude script/datum UTXOs (not spendable with a simple Ed25519 witness) and any
      // UTXOs currently locked by a concurrent operation, then aggregate pure-ADA UTxOs
      // from this single address to cover the amount (audit finding S-4).
      const spendable = filterSpendableUtxos(data, "staking").filter(
        (u) => !utxoLocks.isLocked(u.transaction_id, u.output_index)
      );

      // Account for this address's spendable pure-ADA up front, so the vault-wide total
      // (used to distinguish fragmentation from a real shortfall in the error path) stays
      // accurate even if we select this address but then fail to lock it below.
      const addressPureAda = sumPureAdaLovelace(spendable);
      bestPureAdaOnAnyAddress = Math.max(bestPureAdaOnAnyAddress, addressPureAda);
      totalPureAdaAcrossVault += addressPureAda;

      const selection = selectPureAdaUtxos(spendable, minAmount);
      if (selection) {
        // Atomically lock all selected UTxOs. A concurrent operation may have locked one
        // between the availability check above and here, so skip the address if so.
        const release = utxoLocks.tryLock(
          selection.utxos.map((u) => ({ transaction_id: u.txHash, output_index: u.indexInTx }))
        );
        if (release === null) {
          this.logger.debug(
            `Selected UTxOs on address ${addressObj.address} were locked concurrently, skipping`
          );
          continue;
        }

        this.logger.info(
          `Selected ${selection.utxos.length} pure-ADA UTxO(s) totaling ` +
            `${formatWithDecimals(selection.total, 6).value} ADA from address ${addressObj.address}`
        );
        return {
          address: addressObj.address,
          addressIndex: addressObj.bip44AddressIndex ?? 0,
          utxos: selection.utxos,
          totalAmount: selection.total,
          release,
        };
      }

      this.logger.debug(`No sufficient pure-ADA UTxOs on address ${addressObj.address}`);
    }

    throw this.createInsufficientFundsError(
      vaultAccountId,
      minAmount,
      bestPureAdaOnAnyAddress,
      totalPureAdaAcrossVault
    );
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

  private createInsufficientFundsError(
    vaultAccountId: string,
    minAmount: number,
    bestPureAdaOnAnyAddress: number,
    totalPureAdaAcrossVault: number
  ): SdkApiError {
    const requiredAda = formatWithDecimals(minAmount, 6).value;
    const bestAda = formatWithDecimals(bestPureAdaOnAnyAddress, 6).value;
    const totalAda = formatWithDecimals(totalPureAdaAcrossVault, 6).value;

    // Distinct cases, each with a different remedy (audit finding S-4):
    //  1a. Over-fragmented single address: one address already holds enough pure ADA, but
    //      spread over more than MAX_TX_INPUTS UTxOs, so it cannot be spent in one tx.
    //      Remedy: consolidate THAT address's UTxOs first. (Must be checked before 1b,
    //      otherwise the cross-address message would falsely claim "no single address
    //      covers it" while the largest balance is >= the requirement.)
    //  1b. Fragmented across addresses: the vault holds enough pure ADA in total, but it is
    //      split across addresses so no single address can cover the amount.
    //      Remedy: consolidate onto one address.
    //  2.  Insufficient: the whole vault's pure-ADA balance is below the requirement.
    //      Remedy: fund the vault with more pure ADA. (Do NOT tell them to consolidate —
    //      consolidating what they have would still not be enough.)
    //  3.  None: no pure-ADA UTxOs at all — a special case of (2), same remedy.
    if (bestPureAdaOnAnyAddress >= minAmount) {
      // Reachable only when selectPureAdaUtxos returned null despite a sufficient
      // single-address balance, i.e. covering it needs more than MAX_TX_INPUTS UTxOs.
      return new SdkApiError(
        `An address holds enough pure ADA (${bestAda} ADA) to cover the required ${requiredAda} ` +
          `ADA, but across more than ${CardanoConstants.MAX_TX_INPUTS} UTxOs — too many to spend ` +
          `in one transaction. Consolidate that address's UTxOs first (e.g. run a UTxO ` +
          `consolidation) and retry.`,
        400,
        "FRAGMENTED_PURE_ADA",
        {
          vaultAccountId,
          requiredAmount: minAmount,
          bestPureAdaOnAnyAddress,
          totalPureAdaAcrossVault,
          maxTxInputs: CardanoConstants.MAX_TX_INPUTS,
        },
        "staking-service"
      );
    }

    if (totalPureAdaAcrossVault >= minAmount) {
      return new SdkApiError(
        `The vault holds enough pure ADA (${totalAda} ADA total) but it is split across ` +
          `addresses — no single address covers the required ${requiredAda} ADA (largest is ` +
          `${bestAda} ADA). Consolidate your UTxOs onto one address (or send ${requiredAda} ADA ` +
          `in a single output) and retry.`,
        400,
        "FRAGMENTED_PURE_ADA",
        { vaultAccountId, requiredAmount: minAmount, bestPureAdaOnAnyAddress, totalPureAdaAcrossVault },
        "staking-service"
      );
    }

    const shortfall = formatWithDecimals(minAmount - totalPureAdaAcrossVault, 6).value;
    return new SdkApiError(
      `Insufficient pure ADA in the vault: ${totalAda} ADA available across all addresses, ` +
        `but ${requiredAda} ADA is required (short ${shortfall} ADA). Send more ADA (without ` +
        `tokens) to this vault.`,
      400,
      "INSUFFICIENT_PURE_ADA",
      { vaultAccountId, requiredAmount: minAmount, bestPureAdaOnAnyAddress, totalPureAdaAcrossVault },
      "staking-service"
    );
  }
}
