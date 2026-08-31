/**
 * Protocol Parameters Store
 *
 * Holds Cardano protocol parameter overrides supplied at SDK
 * initialization.
 *
 * Consumed by the API fee validation floor (api/validation.ts) only.
 * Transaction building, minimum-UTxO calculation, and deposit amounts
 * read the constants in constants.ts (runtime wiring tracked as H-04).
 *
 * Process-global: every SDK instance in the process reads the same
 * values and the last override wins. Overriding previously customized
 * values emits a warning.
 */

import { ProtocolParams } from "../types/config.js";
import { CardanoConstants, CardanoAmounts } from "../constants.js";
import { Logger } from "./logger.js";

const logger = new Logger("protocol-params");

/**
 * Default protocol parameters based on current Cardano mainnet values.
 * These serve as fallbacks when no custom params are provided.
 */
const DEFAULT_PROTOCOL_PARAMS: ProtocolParams = {
  minFeeA: CardanoConstants.MIN_FEE_A, // 44
  minFeeB: CardanoConstants.MIN_FEE_B, // 155381
  coinsPerUtxoByte: CardanoAmounts.COINS_PER_UTXO_BYTE, // 4310
  stakeKeyDeposit: CardanoAmounts.DEPOSIT_AMOUNT, // 2_000_000
  drepDeposit: CardanoAmounts.DREP_REGISTRATION_DEPOSIT, // 500_000_000
};

let currentParams: ProtocolParams = { ...DEFAULT_PROTOCOL_PARAMS };
let customized = false;

/**
 * Get current protocol parameters.
 * Returns a copy to prevent accidental mutation.
 */
export const getProtocolParams = (): Readonly<ProtocolParams> => {
  return { ...currentParams };
};

/**
 * Update protocol parameters.
 * Merges provided values with current params (partial update supported).
 *
 * The store is process-global; changing values a previous caller
 * customized affects every SDK instance in the process and logs a
 * warning.
 *
 * @param params - Partial protocol parameters to update
 */
export const setProtocolParams = (params: Partial<ProtocolParams>): void => {
  // Explicitly-undefined fields (e.g. from spreading a partial config
  // object) must not overwrite a previously set value in the store.
  const definedEntries = (
    Object.entries(params) as Array<[keyof ProtocolParams, number | undefined]>
  ).filter((entry): entry is [keyof ProtocolParams, number] => entry[1] !== undefined);
  const changedKeys = definedEntries
    .filter(([key, value]) => value !== currentParams[key])
    .map(([key]) => key);

  if (customized && changedKeys.length > 0) {
    logger.warn(
      `Protocol parameters are process-global; overriding ${changedKeys.join(", ")} ` +
        "affects every SDK instance in this process, including previously created ones."
    );
  }

  currentParams = {
    ...currentParams,
    ...Object.fromEntries(definedEntries),
  };
  if (changedKeys.length > 0) customized = true;
};

/**
 * Reset protocol parameters to defaults.
 * Useful for testing or when switching networks.
 */
export const resetProtocolParams = (): void => {
  currentParams = { ...DEFAULT_PROTOCOL_PARAMS };
  customized = false;
};

/**
 * Get the default protocol parameters (immutable).
 * Useful for reference or resetting to known values.
 */
export const getDefaultProtocolParams = (): Readonly<ProtocolParams> => {
  return { ...DEFAULT_PROTOCOL_PARAMS };
};
