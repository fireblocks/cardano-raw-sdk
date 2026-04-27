import {
  Address,
  TransactionInput,
  TransactionHash,
  BigNum,
  TransactionOutput,
  MultiAsset,
  Assets,
  Value,
  ScriptHash,
  AssetName,
  TransactionBody,
  TransactionInputs,
  TransactionOutputs,
  Transaction,
  LinearFee,
  min_fee,
  min_ada_for_output,
  DataCost,
} from "@emurgo/cardano-serialization-lib-nodejs";
import { toHex } from "./general.js";
import { IagonApiService } from "../services/index.js";
import {
  CntTransactionOutputsParams,
  MultiTokenTransactionOutputsParams,
  ConsolidationTransactionOutputParams,
  UtxoData,
  fetchAndSelectUtxosForCntParams,
  fetchAndSelectUtxosForAdaParams,
  fetchAndSelectUtxosForMultiTokenParams,
  SupportedAssets,
} from "../types/index.js";
import { Logger } from "./logger.js";
import { CardanoAmounts, CardanoConstants } from "../constants.js";
import { utxoLocks } from "./utxoLock.js";

const logger = new Logger("utils:cardano");

/**
 * Cardano protocol parameters for fee calculation
 * Based on mainnet parameters:
 * - txFeePerByte (a): 44 lovelace/byte
 * - txFeeFixed (b): 155,381 lovelace
 * Formula: min_fee = (a × tx_size_bytes) + b
 */
const _feeA = BigNum.from_str("44");
const _feeB = BigNum.from_str("155381");
const CARDANO_LINEAR_FEE = LinearFee.new(
  _feeA, // coefficient (lovelace per byte)
  _feeB // constant (base fee in lovelace)
);
_feeA.free();
_feeB.free();

/**
 * Protocol constant for computing the minimum ADA per UTxO output.
 * Created once at module level to avoid recreating on every call.
 */
const _coinsPerByte = BigNum.from_str(CardanoAmounts.COINS_PER_UTXO_BYTE.toString());
const DATA_COST = DataCost.new_coins_per_byte(_coinsPerByte);
_coinsPerByte.free();

/**
 * Calculate the minimum required lovelace for a UTXO based on number of policies
 *
 * The minimum ADA required for a UTXO scales with the number of distinct token policies:
 * - Base: 1 ADA (1,000,000 lovelace) for ADA-only or single policy
 * - Additional: ~0.15 ADA (150,000 lovelace) per additional policy
 *
 * This implements the Cardano protocol's minUTxO requirement which prevents
 * UTXOs from being too small and bloating the blockchain state.
 *
 * @param numPolicies - Number of distinct token policies in the UTXO
 * @returns The minimum lovelace required for the UTXO
 * @example
 * calculateMinLovelaceForUtxo(0) // 1,000,000 (ADA-only)
 * calculateMinLovelaceForUtxo(1) // 1,150,000 (1 token policy)
 * calculateMinLovelaceForUtxo(3) // 1,450,000 (3 token policies)
 */
export const calculateMinLovelaceForUtxo = (numPolicies: number): number => {
  if (numPolicies === 0) {
    return CardanoConstants.MIN_UTXO_BASE_LOVELACE;
  }
  return (
    CardanoConstants.MIN_UTXO_BASE_LOVELACE +
    numPolicies * CardanoAmounts.MIN_UTXO_PER_POLICY_LOVELACE
  );
};

/**
 * Count distinct token policies from a collection of assets
 * @param assets - Record of assetUnit (policyId.tokenName) to amount
 * @returns Number of distinct policies
 */
export const countDistinctPolicies = (assets: Record<string, number>): number => {
  const policies = new Set<string>();
  for (const assetUnit of Object.keys(assets)) {
    const [policyId] = assetUnit.split(".");
    if (policyId) {
      policies.add(policyId);
    }
  }
  return policies.size;
};

// find policy ids in change that weren't part of the intended transfer
export const getExtraPolicies = (
  changeAssets: Record<string, number>,
  intendedPolicies: string[]
): string[] => {
  const intent = new Set(intendedPolicies);
  const extra: string[] = [];
  for (const assetUnit of Object.keys(changeAssets)) {
    const [pid] = assetUnit.split(".");
    if (pid && !intent.has(pid) && !extra.includes(pid)) {
      extra.push(pid);
    }
  }
  return extra;
};

/**
 * Calculate the minimum required fee for a transaction based on its size
 * @param tx - The transaction to calculate fee for
 * @returns The calculated fee in lovelace
 */
export const calculateTransactionFee = (tx: Transaction): number => {
  const calculatedFee = min_fee(tx, CARDANO_LINEAR_FEE);
  return parseInt(calculatedFee.to_str());
};

export const fetchAndSelectUtxosForCnt = async (params: fetchAndSelectUtxosForCntParams) => {
  const {
    iagonApiService,
    address,
    tokenPolicyId,
    requiredTokenAmount,
    transactionFee,
    tokenName,
    lock = false,
  } = params;
  try {
    const rawUtxos = await fetchUtxos(iagonApiService, address);
    const utxos = rawUtxos.filter((u) => !utxoLocks.isLocked(u.transaction_id, u.output_index));

    const tokenUtxosWithAmounts = filterUtxos(utxos, tokenPolicyId, tokenName)
      .map((utxo) => ({
        utxo,
        tokenAmount: calculateTokenAmount(utxo, tokenPolicyId, tokenName),
        adaAmount: getLovelaceAmount(utxo),
      }))
      .sort((a, b) => b.tokenAmount - a.tokenAmount);
    let selectedUtxos: UtxoData[] = [];
    let accumulatedTokenAmount = 0;
    let accumulatedAda = 0;

    // Phase 1: Initial UTXO selection with heuristic
    // Use 1-policy estimate (1.15 ADA) as heuristic for performance
    // Most token transfers have 1-3 policies, so this covers the common case
    // Phase 2 below will add more UTXOs if we underestimated
    const initialMinRecipient = calculateMinLovelaceForUtxo(1);

    // Accumulate token UTXOs until we have enough tokens and estimated ADA
    for (const { utxo, tokenAmount, adaAmount } of tokenUtxosWithAmounts) {
      if (selectedUtxos.length >= CardanoConstants.MAX_TX_INPUTS) {
        logger.warn(
          `Input limit (${CardanoConstants.MAX_TX_INPUTS}) reached during token UTXO selection - address may be dust-attacked`
        );
        break;
      }
      selectedUtxos.push(utxo);
      accumulatedTokenAmount += tokenAmount;
      accumulatedAda += adaAmount;

      if (
        accumulatedTokenAmount >= requiredTokenAmount &&
        accumulatedAda >= initialMinRecipient + transactionFee
      ) {
        break;
      }
    }

    // Collect all assets from selected UTXOs to calculate actual minimums
    const allAssets: Record<string, number> = {};
    selectedUtxos.forEach((utxo) => {
      if (utxo.value.assets) {
        Object.entries(utxo.value.assets).forEach(([assetUnit, amount]) => {
          allAssets[assetUnit] = (allAssets[assetUnit] || 0) + amount;
        });
      }
    });

    // Phase 2: Calculate actual minimum lovelace based on real policy count
    // Recipient gets the transferred token (1 policy), change gets all remaining assets
    const numChangePolicies = countDistinctPolicies(allAssets);
    const actualMinRecipient = calculateMinLovelaceForUtxo(tokenPolicyId ? 1 : 0);
    const actualMinChange = calculateMinLovelaceForUtxo(numChangePolicies);

    logger.info(
      `Calculated minimums - Recipient: ${actualMinRecipient}, Change: ${actualMinChange} (${numChangePolicies} policies)`
    );

    const adaTarget = actualMinRecipient + transactionFee + actualMinChange;
    if (accumulatedAda < adaTarget) {
      const remainingUtxos = utxos.filter((u) => !selectedUtxos.includes(u));
      const adaUtxos = remainingUtxos
        .map((utxo) => ({
          utxo,
          adaAmount: getLovelaceAmount(utxo),
        }))
        .sort((a, b) => b.adaAmount - a.adaAmount);

      for (const { utxo, adaAmount } of adaUtxos) {
        if (selectedUtxos.length >= CardanoConstants.MAX_TX_INPUTS) {
          logger.warn(
            `Input limit (${CardanoConstants.MAX_TX_INPUTS}) reached during ADA supplement selection - address may be dust-attacked`
          );
          break;
        }
        selectedUtxos.push(utxo);
        accumulatedAda += adaAmount;
        if (accumulatedAda >= adaTarget) break;
      }
    }

    // If the input cap was hit and ADA is still insufficient, surface a clear error.
    if (selectedUtxos.length >= CardanoConstants.MAX_TX_INPUTS && accumulatedAda < adaTarget) {
      throw new Error(
        `Input cap (${CardanoConstants.MAX_TX_INPUTS} UTxOs) reached but only ${accumulatedAda} of ${adaTarget} lovelace accumulated. ` +
          `This address may be dust-attacked with many small UTxOs. Consider consolidating UTxOs first.`
      );
    }

    const release = lock ? utxoLocks.lock(selectedUtxos) : () => {};

    return {
      selectedUtxos,
      accumulatedAda,
      accumulatedTokenAmount,
      minRecipientLovelace: actualMinRecipient,
      minChangeLovelace: actualMinChange,
      release,
    };
  } catch (error) {
    throw new Error(
      `Error fetching and selecting UTXOs: ${error instanceof Error ? error.message : error}`,
      { cause: error }
    );
  }
};

export const fetchUtxos = async (
  iagonApiService: IagonApiService,
  address: string
): Promise<UtxoData[]> => {
  try {
    logger.info(`Fetching UTXOs for address: ${address}`);
    const response = await iagonApiService.getUtxosByAddress(address);

    logger.info(`API Response:`, JSON.stringify(response, null, 2));

    if (response.success) {
      const utxos = response.data;

      if (!utxos || utxos.length === 0) {
        logger.warn(`No UTXOs found for address: ${address}`);
        return [];
      }

      logger.info(`Found ${utxos.length} UTXOs`);
      if (utxos.length > 0) {
        logger.info(`Sample UTXO assets:`, JSON.stringify(utxos[0].value.assets, null, 2));
      }

      return utxos;
    } else {
      logger.warn(`API returned success=false for address: ${address}`);
      return [];
    }
  } catch (error: unknown) {
    logger.error(
      `Error fetching UTXOs for ${address}: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.stack : undefined
    );
    return [];
  }
};

export const calculateTokenAmount = (
  utxo: UtxoData,
  policyId: string,
  tokenName: string
): number => {
  // Handle ADA detection (native currency)
  // Note: While native ADA transfers are blocked at the SDK level,
  // ADA amount calculation is still needed for:
  // - Fee payment verification
  // - UTXO selection for token transfers (UTXOs contain both tokens and ADA)
  // - Change calculation
  if (
    (tokenName === SupportedAssets.ADA || tokenName === SupportedAssets.ADA_TEST) &&
    policyId === ""
  ) {
    return utxo.value.lovelace;
  }

  // Handle native token transfers
  // Check if assets exist
  if (!utxo.value.assets || Object.keys(utxo.value.assets).length === 0) {
    return 0;
  }

  // Token name is expected to be in hex format
  const assetUnit = `${policyId}.${tokenName}`;
  return utxo.value.assets[assetUnit] || 0;
};

export const getLovelaceAmount = (utxo: UtxoData): number => {
  return utxo.value.lovelace;
};

export const filterUtxos = (
  utxos: UtxoData[],
  tokenPolicyId: string,
  tokenName: string
): UtxoData[] => {
  try {
    logger.info(`Filtering ${utxos.length} UTXOs for token: ${tokenPolicyId}.${tokenName}`);

    // Check if this is an ADA transfer
    const isAdaTransfer =
      (tokenName === SupportedAssets.ADA || tokenName === SupportedAssets.ADA_TEST) &&
      tokenPolicyId === "";

    // Log all available asset keys in the first UTXO for debugging
    if (utxos.length > 0 && utxos[0].value.assets) {
      logger.info(`Available asset keys in first UTXO:`, Object.keys(utxos[0].value.assets));
    }

    const filtered = utxos.filter((utxo) => {
      // For ADA transfers, we don't need to check the assets field
      // For native tokens, skip UTXOs without assets
      if (!isAdaTransfer && !utxo.value.assets) {
        return false;
      }

      const tokenAmount = calculateTokenAmount(utxo, tokenPolicyId, tokenName);
      return tokenAmount > 0;
    });

    logger.info(`Found ${filtered.length} UTXOs with the token`);

    if (filtered.length === 0) {
      throw new Error(
        `No UTXOs found containing token '${tokenName}' with policy ID '${tokenPolicyId}'.`
      );
    }

    return filtered;
  } catch (err: unknown) {
    throw new Error(
      `An unexpected error occurred while filtering UTXOs. ${err instanceof Error ? err.message : String(err)}`,
      { cause: err }
    );
  }
};

export const createTransactionInputs = (selectedUtxos: UtxoData[]): TransactionInput[] => {
  return selectedUtxos.map((utxo) => {
    const txHashBytes = Buffer.from(utxo.transaction_id, "hex");
    const txHash = TransactionHash.from_bytes(txHashBytes);
    const input = TransactionInput.new(txHash, utxo.output_index);
    txHash.free();
    return input;
  });
};

export const createTransactionOutputs = (
  params: CntTransactionOutputsParams
): TransactionOutput[] => {
  const {
    requiredLovelace,
    fee,
    recipientAddress,
    senderAddress,
    tokenPolicyId,
    tokenName,
    transferAmount,
    selectedUtxos,
  } = params;

  const tokenUnit = `${tokenPolicyId}.${tokenName}`;

  logger.info("=== COLLECTING ALL ASSETS FROM SELECTED UTXOs ===");
  logger.info("Policy ID:", tokenPolicyId, "Token Name (hex):", tokenName, "Unit:", tokenUnit);

  const allAssets = collectAllAssets(selectedUtxos);
  const totalLovelace = selectedUtxos.reduce((sum, u) => sum + u.value.lovelace, 0);
  const totalTokenAmount = allAssets[tokenUnit] || 0;

  logger.info("All assets collected:", allAssets, "Total tokens for transfer:", totalTokenAmount);

  if (totalTokenAmount < transferAmount) {
    throw new Error(`Insufficient tokens: have ${totalTokenAmount}, need ${transferAmount}`);
  }

  // --- Recipient output ---
  // Compute min-ADA for the recipient, adjusting up if the protocol requires more than requested.
  let recipientMultiAsset: MultiAsset | null = null;
  let tempLovelaceBN: BigNum | null = null;
  let tempRecipientValue: Value | null = null;
  let tempRecipientOutput: TransactionOutput | null = null;
  let minRecipientBN: BigNum | null = null;
  let recipientLovelace: number;

  try {
    recipientMultiAsset = buildMultiAssetFromGrouped({
      [tokenPolicyId]: { [tokenName]: transferAmount },
    })!;
    tempLovelaceBN = BigNum.from_str(requiredLovelace.toString());
    tempRecipientValue = Value.new(tempLovelaceBN);
    tempLovelaceBN.free();
    tempLovelaceBN = null;
    tempRecipientValue.set_multiasset(recipientMultiAsset);
    tempRecipientOutput = TransactionOutput.new(recipientAddress, tempRecipientValue);
    tempRecipientValue.free();
    tempRecipientValue = null;
    minRecipientBN = min_ada_for_output(tempRecipientOutput, DATA_COST);
    const actualMinRecipient = parseInt(minRecipientBN.to_str());
    minRecipientBN.free();
    minRecipientBN = null;
    tempRecipientOutput.free();
    tempRecipientOutput = null;
    recipientLovelace = Math.max(requiredLovelace, actualMinRecipient);
  } catch (e) {
    // Clean up WASM objects in case of error
    if (recipientMultiAsset) recipientMultiAsset.free();
    if (tempLovelaceBN) tempLovelaceBN.free();
    if (tempRecipientValue) tempRecipientValue.free();
    if (tempRecipientOutput) tempRecipientOutput.free();
    if (minRecipientBN) minRecipientBN.free();
    throw e;
  }

  if (recipientLovelace > requiredLovelace) {
    logger.info(`Adjusting recipient min ADA: ${requiredLovelace} → ${recipientLovelace}`);
  }

  const changeLovelace = totalLovelace - recipientLovelace - fee;

  if (changeLovelace < 0) {
    recipientMultiAsset.free();
    throw new Error(
      `Insufficient funds: inputs ${totalLovelace} lovelace < recipient ${recipientLovelace} + fee ${fee} = ${recipientLovelace + fee} lovelace`
    );
  }

  logger.info("=== CREATING OUTPUTS ===", "Change ADA:", changeLovelace);

  // Build recipient output with the confirmed lovelace amount
  const recipientLovelaceBN = BigNum.from_str(recipientLovelace.toString());
  const recipientValue = Value.new(recipientLovelaceBN);
  recipientLovelaceBN.free();
  recipientValue.set_multiasset(recipientMultiAsset);
  recipientMultiAsset.free();
  const recipientOutput = TransactionOutput.new(recipientAddress, recipientValue);
  recipientValue.free();

  // --- Change output: all input assets minus the transferred token ---
  const changeTokensFlat: Record<string, number> = {};
  for (const [assetUnit, amount] of Object.entries(allAssets)) {
    if (assetUnit === tokenUnit) {
      const remaining = amount - transferAmount;
      if (remaining > 0) {
        changeTokensFlat[assetUnit] = remaining;
        logger.info(`Change for ${assetUnit}: ${remaining}`);
      }
    } else {
      changeTokensFlat[assetUnit] = amount;
      logger.info(`Returning full amount for ${assetUnit}: ${amount}`);
    }
  }

  const changeMultiAsset = buildMultiAssetFromGrouped(groupAssetsByPolicy(changeTokensFlat));
  const changeOutput = buildValidatedOutput(
    senderAddress,
    changeLovelace,
    changeMultiAsset,
    "change"
  );

  logger.info("=== FINAL VALIDATION ===", "Recipient gets:", transferAmount, "of", tokenUnit);
  for (const [assetUnit, amount] of Object.entries(changeTokensFlat)) {
    logger.info(`Change includes: ${assetUnit} = ${amount}`);
  }

  return [recipientOutput, changeOutput];
};

/**
 * Number of witnesses (signatures) required per transaction type.
 * Token transfers only need the payment key; staking operations also require the stake key.
 * Pass the appropriate constant to buildCntTransactionWithCalculatedFee to get an accurate fee.
 */
export const WITNESS_COUNT_PAYMENT_KEY_ONLY = 1; // Token transfers: payment key signature only
export const WITNESS_COUNT_PAYMENT_AND_STAKE_KEY = 2; // Staking: payment key + stake key signatures

/**
 * Builds CNT transaction outputs with dynamically calculated fees.
 * Uses iterative fee convergence - see convergeTransactionFee for the algorithm.
 *
 * @param params               - Parameters for createTransactionOutputs (excluding fee)
 * @param txInputs             - Transaction inputs
 * @param ttl                  - Slot deadline for the transaction
 * @param estimatedWitnessCount - Number of signatures - use WITNESS_COUNT_* constants
 */
export const buildCntTransactionWithCalculatedFee = (
  params: Omit<CntTransactionOutputsParams, "fee">,
  txInputs: TransactionInput[],
  ttl: number,
  estimatedWitnessCount: number
): { outputs: TransactionOutput[]; fee: number; txBody: TransactionBody } => {
  return convergeTransactionFee(
    (fee) => createTransactionOutputs({ ...params, fee }),
    txInputs,
    ttl,
    estimatedWitnessCount,
    "CNT"
  );
};

export const buildTransaction = ({
  txInputs,
  txOutputs,
  fee,
  ttl,
}: {
  txInputs: TransactionInput[];
  txOutputs: TransactionOutput[];
  fee: number;
  ttl: number;
}): TransactionBody => {
  const inputs = TransactionInputs.new();
  txInputs.forEach((input) => inputs.add(input));

  const outputs = TransactionOutputs.new();
  txOutputs.forEach((output) => outputs.add(output));

  const feeBigNum = BigNum.from_str(fee.toString());
  const txBody = TransactionBody.new_tx_body(inputs, outputs, feeBigNum);
  feeBigNum.free();
  inputs.free();
  outputs.free();

  const ttlBigNum = BigNum.from_str(ttl.toString());
  txBody.set_ttl(ttlBigNum);
  ttlBigNum.free();

  return txBody;
};

export const submitTransaction = async (
  iagonApiService: IagonApiService,
  signedTx: Transaction
): Promise<string> => {
  try {
    const txCbor = Buffer.from(signedTx.to_bytes()).toString("hex");

    logger.info(`=== TRANSACTION CBOR DEBUG ===`);
    logger.info(`CBOR length: ${txCbor.length} chars (${txCbor.length / 2} bytes)`);
    logger.info(`CBOR hex (first 200 chars): ${txCbor.substring(0, 200)}`);
    logger.info(`CBOR hex (full): ${txCbor}`);

    // Submit transaction using Iagon API
    const response = await iagonApiService.submitTransfer(txCbor, false);

    if (response.success) {
      logger.info(`Transaction successfully submitted. Transaction ID: ${response.data.txHash}`);
      return response.data.txHash;
    }

    throw new Error("Transaction submission failed");
  } catch (error) {
    throw new Error(
      `Error submitting transaction: ${error instanceof Error ? error.message : error}`,
      { cause: error }
    );
  }
};

/**
 * Collects all token assets from a list of UTxOs into a single flat map.
 * Key format: "policyId.tokenNameHex" → total amount.
 * Module-private helper - not exported.
 */
const collectAllAssets = (utxos: UtxoData[]): Record<string, number> => {
  const result: Record<string, number> = {};
  for (const utxo of utxos) {
    if (utxo.value.assets) {
      for (const [assetUnit, amount] of Object.entries(utxo.value.assets)) {
        result[assetUnit] = (result[assetUnit] || 0) + amount;
      }
    }
  }
  return result;
};

/**
 * Groups a flat asset map ("policyId.tokenNameHex" → amount) by policy ID.
 * Result: policyId → tokenNameHex → amount.
 * Module-private helper - not exported.
 */
const groupAssetsByPolicy = (
  assets: Record<string, number>
): Record<string, Record<string, number>> => {
  const result: Record<string, Record<string, number>> = {};
  for (const [assetUnit, amount] of Object.entries(assets)) {
    const [policyId, tokenNameHex] = assetUnit.split(".");
    if (!result[policyId]) result[policyId] = {};
    result[policyId][tokenNameHex] = amount;
  }
  return result;
};

/**
 * Builds a CSL MultiAsset from a policy-grouped asset map.
 * Returns null when the map is empty (i.e. for pure-ADA outputs).
 * Module-private helper - not exported.
 */
const buildMultiAssetFromGrouped = (
  assetsByPolicy: Record<string, Record<string, number>>
): MultiAsset | null => {
  const nonEmpty = Object.entries(assetsByPolicy).filter(
    ([, tokens]) => Object.keys(tokens).length > 0
  );
  if (nonEmpty.length === 0) return null;

  const multiAsset = MultiAsset.new();
  for (const [policyId, tokens] of nonEmpty) {
    const policy = ScriptHash.from_hex(policyId);
    const assets = Assets.new();
    for (const [tokenNameHex, amount] of Object.entries(tokens)) {
      const assetName = AssetName.new(Buffer.from(tokenNameHex, "hex"));
      const amountBigNum = BigNum.from_str(amount.toString());
      assets.insert(assetName, amountBigNum);
      assetName.free();
      amountBigNum.free();
    }
    multiAsset.insert(policy, assets);
    policy.free();
    assets.free();
  }
  return multiAsset;
};

/**
 * Creates a TransactionOutput and validates it meets the protocol min-ADA rule.
 * Throws if the supplied lovelace is below the calculated minimum.
 * Module-private helper - not exported.
 */
const buildValidatedOutput = (
  address: Address,
  lovelace: number,
  multiAsset: MultiAsset | null,
  label: string
): TransactionOutput => {
  const lovelaceBigNum = BigNum.from_str(lovelace.toString());
  const value = Value.new(lovelaceBigNum);
  lovelaceBigNum.free();
  if (multiAsset) value.set_multiasset(multiAsset);
  const output = TransactionOutput.new(address, value);
  // Defer value.free() until after min_ada_for_output
  const minAdaBigNum = min_ada_for_output(output, DATA_COST);
  value.free();
  const minLovelace = parseInt(minAdaBigNum.to_str());
  minAdaBigNum.free();
  if (lovelace < minLovelace) {
    output.free();
    throw new Error(
      `${label} output: insufficient ADA - ${lovelace} lovelace available, ` +
        `minimum required is ${minLovelace} lovelace`
    );
  }
  return output;
};

/**
 * Shared fee-convergence loop used by all transaction types.
 * Iteratively rebuilds outputs until the fee stabilises within TX_FEE_TOLERANCE.
 *
 * @param buildOutputsFn - Builds transaction outputs for a given fee
 * @param txInputs       - Transaction inputs
 * @param ttl            - Slot deadline for the transaction
 * @param witnessCount   - Expected number of signatures (use WITNESS_COUNT_* constants)
 * @param label          - Short label for log messages (e.g. "CNT", "ADA", "multi-token")
 */
const convergeTransactionFee = (
  buildOutputsFn: (fee: number) => TransactionOutput[],
  txInputs: TransactionInput[],
  ttl: number,
  witnessCount: number,
  label: string
): { outputs: TransactionOutput[]; fee: number; txBody: TransactionBody } => {
  let currentFee = CardanoAmounts.TX_FEE_INITIAL_ESTIMATE;

  for (let i = 0; i < CardanoConstants.TX_FEE_MAX_ITERATIONS; i++) {
    logger.info(`[${label}] fee iteration ${i + 1}, current fee: ${currentFee}`);

    const outputs = buildOutputsFn(currentFee);
    const txBody = buildTransaction({ txInputs, txOutputs: outputs, fee: currentFee, ttl });

    const txBodySize = txBody.to_bytes().length;
    const totalSize = txBodySize + witnessCount * CardanoConstants.TX_WITNESS_SIZE_BYTES + 10;
    const calculatedFee = CardanoConstants.MIN_FEE_A * totalSize + CardanoConstants.MIN_FEE_B;

    logger.info(
      `[${label}] body: ${txBodySize}B, total: ${totalSize}B, fee: ${calculatedFee} lovelace`
    );

    if (Math.abs(calculatedFee - currentFee) <= CardanoAmounts.TX_FEE_TOLERANCE) {
      logger.info(`[${label}] fee converged at ${calculatedFee} after ${i + 1} iterations`);
      return { outputs, fee: calculatedFee, txBody };
    }
    currentFee = calculatedFee;
  }

  logger.warn(
    `[${label}] fee did not converge after ${CardanoConstants.TX_FEE_MAX_ITERATIONS} iterations`
  );
  const finalOutputs = buildOutputsFn(currentFee);
  const finalTxBody = buildTransaction({ txInputs, txOutputs: finalOutputs, fee: currentFee, ttl });
  return { outputs: finalOutputs, fee: currentFee, txBody: finalTxBody };
};

/**
 * Selects UTxOs for a native ADA transfer.
 *
 * Selection priority:
 *   1. ADA-only UTxOs (no native tokens) - preferred, keeps change output clean
 *   2. Multi-asset UTxOs only if ADA-only selection is insufficient
 *
 * When multi-asset UTxOs are consumed, ALL their tokens MUST appear in the
 * change output (Cardano protocol requirement). The returned `changeTokenAssets`
 * captures the full token inventory the change output must carry.
 */
export const fetchAndSelectUtxosForAda = async (
  params: fetchAndSelectUtxosForAdaParams
): Promise<{
  selectedUtxos: UtxoData[];
  accumulatedAda: number;
  changeTokenAssets: Record<string, number>;
  minChangeLovelace: number;
  release: () => void;
}> => {
  const { iagonApiService, address, lovelaceAmount, transactionFee, lock = false } = params;

  const rawUtxos = await fetchUtxos(iagonApiService, address);
  const utxos = rawUtxos.filter((u) => !utxoLocks.isLocked(u.transaction_id, u.output_index));
  if (!utxos || utxos.length === 0) {
    throw new Error(`No UTxOs found for address: ${address}`);
  }

  // Partition UTxOs: ADA-only first, multi-asset second - both sorted largest-first
  const adaOnlyUtxos = utxos
    .filter((u) => !u.value.assets || Object.keys(u.value.assets).length === 0)
    .sort((a, b) => b.value.lovelace - a.value.lovelace);

  const multiAssetUtxos = utxos
    .filter((u) => u.value.assets && Object.keys(u.value.assets).length > 0)
    .sort((a, b) => b.value.lovelace - a.value.lovelace);

  const selectedUtxos: UtxoData[] = [];
  let accumulatedAda = 0;

  // Phase 1: exhaust ADA-only UTxOs first
  // Target includes 1 ADA minimum for a pure-ADA change output
  const phase1Target = lovelaceAmount + transactionFee + CardanoConstants.MIN_UTXO_BASE_LOVELACE;
  for (const utxo of adaOnlyUtxos) {
    if (selectedUtxos.length >= CardanoConstants.MAX_TX_INPUTS) {
      logger.warn(
        `Input limit (${CardanoConstants.MAX_TX_INPUTS}) reached during ADA-only UTXO selection - address may be dust-attacked`
      );
      break;
    }
    selectedUtxos.push(utxo);
    accumulatedAda += utxo.value.lovelace;
    if (accumulatedAda >= phase1Target) break;
  }

  // Phase 2: fall back to multi-asset UTxOs only if ADA-only is insufficient
  if (accumulatedAda < phase1Target) {
    for (const utxo of multiAssetUtxos) {
      if (selectedUtxos.length >= CardanoConstants.MAX_TX_INPUTS) {
        logger.warn(
          `Input limit (${CardanoConstants.MAX_TX_INPUTS}) reached during multi-asset UTXO selection - address may be dust-attacked`
        );
        break;
      }
      selectedUtxos.push(utxo);
      accumulatedAda += utxo.value.lovelace;
      // Re-evaluate minimum after each addition - change output min grows with policy count
      const currentTokens = collectAllAssets(selectedUtxos);
      const numPolicies = countDistinctPolicies(currentTokens);
      const tokenChangeMin = calculateMinLovelaceForUtxo(numPolicies);
      if (accumulatedAda >= lovelaceAmount + transactionFee + tokenChangeMin) break;
    }
  }

  const changeTokenAssets = collectAllAssets(selectedUtxos);
  const numChangePolicies = countDistinctPolicies(changeTokenAssets);
  const minChangeLovelace = calculateMinLovelaceForUtxo(numChangePolicies);

  // give a clear error if hit the input cap and still have insufficient funds.
  const required = lovelaceAmount + transactionFee + CardanoConstants.MIN_UTXO_BASE_LOVELACE;
  if (selectedUtxos.length >= CardanoConstants.MAX_TX_INPUTS && accumulatedAda < required) {
    throw new Error(
      `Input cap (${CardanoConstants.MAX_TX_INPUTS} UTxOs) reached but only ${accumulatedAda} of ${required} lovelace accumulated. ` +
        `This address may be dust-attacked with many small UTxOs. Consider consolidating UTxOs first.`
    );
  }

  logger.info(
    `ADA UTXO selection: ${selectedUtxos.length} selected (${adaOnlyUtxos.length} ADA-only available), ` +
      `${accumulatedAda} lovelace accumulated, ` +
      `${numChangePolicies} token policies in change, ` +
      `min change lovelace: ${minChangeLovelace}`
  );

  const release = lock ? utxoLocks.lock(selectedUtxos) : () => {};

  return { selectedUtxos, accumulatedAda, changeTokenAssets, minChangeLovelace, release };
};

export interface createAdaTransactionOutputsParams {
  lovelaceAmount: number;
  fee: number;
  recipientAddress: Address;
  senderAddress: Address;
  selectedUtxos: UtxoData[];
}

/**
 * Builds transaction outputs for a native ADA transfer.
 *
 * Recipient output: pure ADA only.
 * Change output:    remaining ADA + ALL tokens from spent UTxOs (token preservation).
 *
 * Throws if either output would violate the Cardano min-UTxO rule.
 */
export const createAdaTransactionOutputs = (
  params: createAdaTransactionOutputsParams
): TransactionOutput[] => {
  const { lovelaceAmount, fee, recipientAddress, senderAddress, selectedUtxos } = params;

  const totalInputLovelace = selectedUtxos.reduce((sum, u) => sum + u.value.lovelace, 0);
  const changeLovelace = totalInputLovelace - lovelaceAmount - fee;

  // Recipient output (pure ADA) - throws if below protocol minimum
  const recipientOutput = buildValidatedOutput(
    recipientAddress,
    lovelaceAmount,
    null,
    "ADA recipient"
  );

  // Change output: remaining ADA + ALL tokens from spent UTxOs
  const allTokens = collectAllAssets(selectedUtxos);
  const changeMultiAsset =
    Object.keys(allTokens).length > 0
      ? buildMultiAssetFromGrouped(groupAssetsByPolicy(allTokens))
      : null;
  const changeOutput = buildValidatedOutput(
    senderAddress,
    changeLovelace,
    changeMultiAsset,
    "ADA change"
  );

  logger.info(
    `ADA outputs: recipient ${lovelaceAmount} lovelace, change ${changeLovelace} lovelace` +
      (Object.keys(allTokens).length > 0
        ? ` (with ${Object.keys(allTokens).length} token assets in change)`
        : "")
  );

  return [recipientOutput, changeOutput];
};

/**
 * Builds a native ADA transaction with iteratively calculated fee.
 * Uses the shared convergeTransactionFee loop.
 *
 * @param params               - Parameters for createAdaTransactionOutputs (excluding fee)
 * @param txInputs             - Transaction inputs
 * @param ttl                  - Slot deadline for the transaction
 * @param estimatedWitnessCount - Number of signatures - use WITNESS_COUNT_* constants
 */
export const buildAdaTransactionWithCalculatedFee = (
  params: Omit<createAdaTransactionOutputsParams, "fee">,
  txInputs: TransactionInput[],
  ttl: number,
  estimatedWitnessCount: number
): { outputs: TransactionOutput[]; fee: number; txBody: TransactionBody } => {
  return convergeTransactionFee(
    (fee) => createAdaTransactionOutputs({ ...params, fee }),
    txInputs,
    ttl,
    estimatedWitnessCount,
    "ADA"
  );
};

// ─── Multi-token transfer utilities ───────────────────────────────────────────

/**
 * Selects UTxOs for a multi-token transfer (one or more CNTs in a single transaction).
 *
 * Selection strategy:
 *   Phase 1: Pick UTxOs that satisfy all required token amounts (coverage-score heuristic).
 *   Phase 2: Supplement with ADA-only UTxOs (preferred) if the total ADA is insufficient
 *            to cover fee + minRecipient + minChange.
 *
 * Throws if any required token cannot be fully covered.
 */
export const fetchAndSelectUtxosForMultiToken = async (
  params: fetchAndSelectUtxosForMultiTokenParams
): Promise<{
  selectedUtxos: UtxoData[];
  accumulatedAda: number;
  changeTokenAssets: Record<string, number>;
  minChangeLovelace: number;
  release: () => void;
}> => {
  const { iagonApiService, address, tokens, transactionFee, lovelaceAmount, lock = false } = params;

  const rawUtxos = await fetchUtxos(iagonApiService, address);
  const utxos = rawUtxos.filter((u) => !utxoLocks.isLocked(u.transaction_id, u.output_index));
  if (!utxos || utxos.length === 0) {
    throw new Error(`No UTxOs found for address: ${address}`);
  }

  // Build required amounts map: "policyId.tokenName" → required amount
  const required: Record<string, number> = {};
  for (const t of tokens) {
    const key = `${t.tokenPolicyId}.${t.tokenName}`;
    required[key] = (required[key] || 0) + t.amount;
  }

  // UTxOs that hold at least one required token, sorted by coverage score (most tokens first)
  const tokenUtxos = utxos
    .filter(
      (u) => u.value.assets && Object.keys(u.value.assets).some((k) => required[k] !== undefined)
    )
    .sort((a, b) => {
      const score = (u: UtxoData) =>
        Object.keys(u.value.assets || {}).filter((k) => required[k] !== undefined).length;
      return score(b) - score(a);
    });

  const selectedUtxos: UtxoData[] = [];
  const accumulated: Record<string, number> = {};
  let accumulatedAda = 0;

  // Phase 1: select UTxOs until all token requirements are met
  for (const utxo of tokenUtxos) {
    if (selectedUtxos.length >= CardanoConstants.MAX_TX_INPUTS) {
      logger.warn(
        `Input limit (${CardanoConstants.MAX_TX_INPUTS}) reached during multi-token UTXO selection - address may be dust-attacked`
      );
      break;
    }
    selectedUtxos.push(utxo);
    accumulatedAda += utxo.value.lovelace;
    if (utxo.value.assets) {
      for (const [key, amount] of Object.entries(utxo.value.assets)) {
        accumulated[key] = (accumulated[key] || 0) + amount;
      }
    }
    if (Object.keys(required).every((k) => (accumulated[k] || 0) >= required[k])) break;
  }

  // Validate all token requirements are met
  for (const [key, needed] of Object.entries(required)) {
    if ((accumulated[key] || 0) < needed) {
      throw new Error(
        `Insufficient balance for token ${key}: have ${accumulated[key] || 0}, need ${needed}`
      );
    }
  }

  // Phase 2: supplement with ADA if needed - ADA-only UTxOs first
  const recipientPolicyCount = new Set(tokens.map((t) => t.tokenPolicyId)).size;
  const minRecipient = Math.max(
    lovelaceAmount ?? 0,
    calculateMinLovelaceForUtxo(recipientPolicyCount)
  );

  const getMinChange = () =>
    calculateMinLovelaceForUtxo(countDistinctPolicies(collectAllAssets(selectedUtxos)));

  if (accumulatedAda < minRecipient + transactionFee + getMinChange()) {
    const remaining = utxos.filter((u) => !selectedUtxos.includes(u));
    const supplementals = [
      ...remaining.filter((u) => !u.value.assets || Object.keys(u.value.assets).length === 0),
      ...remaining.filter((u) => u.value.assets && Object.keys(u.value.assets).length > 0),
    ].sort((a, b) => b.value.lovelace - a.value.lovelace);

    for (const utxo of supplementals) {
      if (selectedUtxos.length >= CardanoConstants.MAX_TX_INPUTS) {
        logger.warn(
          `Input limit (${CardanoConstants.MAX_TX_INPUTS}) reached during ADA supplement selection - address may be dust-attacked`
        );
        break;
      }
      selectedUtxos.push(utxo);
      accumulatedAda += utxo.value.lovelace;
      if (accumulatedAda >= minRecipient + transactionFee + getMinChange()) break;
    }
  }

  const changeTokenAssets = collectAllAssets(selectedUtxos);
  const numChangePolicies = countDistinctPolicies(changeTokenAssets);
  const minChangeLovelace = calculateMinLovelaceForUtxo(numChangePolicies);

  // If the input cap was hit and ADA is still insufficient, surface a clear error.
  const adaRequired = minRecipient + transactionFee + minChangeLovelace;
  if (selectedUtxos.length >= CardanoConstants.MAX_TX_INPUTS && accumulatedAda < adaRequired) {
    throw new Error(
      `Input cap (${CardanoConstants.MAX_TX_INPUTS} UTxOs) reached but only ${accumulatedAda} of ${adaRequired} lovelace accumulated. ` +
        `This address may be dust-attacked with many small UTxOs. Consider consolidating UTxOs first.`
    );
  }

  logger.info(
    `Multi-token UTXO selection: ${selectedUtxos.length} selected, ` +
      `${accumulatedAda} lovelace accumulated, ` +
      `${numChangePolicies} change policies, min change: ${minChangeLovelace}`
  );

  const release = lock ? utxoLocks.lock(selectedUtxos) : () => {};

  return { selectedUtxos, accumulatedAda, changeTokenAssets, minChangeLovelace, release };
};

/**
 * Builds transaction outputs for a multi-token transfer.
 *
 * Recipient output: all requested tokens + minimum required ADA.
 * Change output:    remaining ADA + all unrequested (or partially-used) tokens.
 *
 * Throws if either output would violate the Cardano min-UTxO rule.
 */
export const createMultiTokenTransactionOutputs = (
  params: MultiTokenTransactionOutputsParams
): TransactionOutput[] => {
  const { tokens, fee, recipientAddress, senderAddress, selectedUtxos, minRecipientLovelace } =
    params;

  const totalInputLovelace = selectedUtxos.reduce((sum, u) => sum + u.value.lovelace, 0);

  // Build recipient MultiAsset (group token specs by policy)
  const recipientAssetsByPolicy: Record<string, Record<string, number>> = {};
  for (const t of tokens) {
    if (!recipientAssetsByPolicy[t.tokenPolicyId]) recipientAssetsByPolicy[t.tokenPolicyId] = {};
    recipientAssetsByPolicy[t.tokenPolicyId][t.tokenName] =
      (recipientAssetsByPolicy[t.tokenPolicyId][t.tokenName] || 0) + t.amount;
  }
  const recipientMultiAsset = buildMultiAssetFromGrouped(recipientAssetsByPolicy)!;

  // Compute actual minimum ADA for the recipient output
  const numRecipientPolicies = Object.keys(recipientAssetsByPolicy).length;
  const estimatedMinLovelace = calculateMinLovelaceForUtxo(numRecipientPolicies);
  const tempLovelaceBN = BigNum.from_str(estimatedMinLovelace.toString());
  const tempValue = Value.new(tempLovelaceBN);
  tempLovelaceBN.free();
  tempValue.set_multiasset(recipientMultiAsset);
  const tempOutput = TransactionOutput.new(recipientAddress, tempValue);
  const minRecipientBN = min_ada_for_output(tempOutput, DATA_COST);
  tempValue.free(); // deferred until after min_ada calculation
  const actualMinRecipient = parseInt(minRecipientBN.to_str());
  minRecipientBN.free();
  tempOutput.free();
  const recipientLovelace = Math.max(minRecipientLovelace ?? 0, actualMinRecipient);

  // Change tokens: all input tokens minus what the recipient receives
  const allInputTokens = collectAllAssets(selectedUtxos);
  const changeTokensFlat: Record<string, number> = {};
  for (const [assetUnit, amount] of Object.entries(allInputTokens)) {
    const [policyId, tokenNameHex] = assetUnit.split(".");
    const transferred = recipientAssetsByPolicy[policyId]?.[tokenNameHex] ?? 0;
    const remaining = amount - transferred;
    if (remaining > 0) changeTokensFlat[assetUnit] = remaining;
  }

  const changeLovelace = totalInputLovelace - recipientLovelace - fee;
  const changeMultiAsset = buildMultiAssetFromGrouped(groupAssetsByPolicy(changeTokensFlat));

  const recipientOutput = buildValidatedOutput(
    recipientAddress,
    recipientLovelace,
    recipientMultiAsset,
    "multi-token recipient"
  );
  recipientMultiAsset.free();
  const changeOutput = buildValidatedOutput(
    senderAddress,
    changeLovelace,
    changeMultiAsset,
    "change"
  );
  changeMultiAsset?.free();

  logger.info(
    `Multi-token outputs: recipient gets ${tokens.length} token type(s) with ${recipientLovelace} lovelace, ` +
      `change: ${changeLovelace} lovelace with ${Object.keys(changeTokensFlat).length} token assets`
  );

  return [recipientOutput, changeOutput];
};

/**
 * Builds a multi-token transaction with iteratively calculated fee.
 *
 * @param params               - Parameters for createMultiTokenTransactionOutputs (excluding fee)
 * @param txInputs             - Transaction inputs
 * @param ttl                  - Slot deadline for the transaction
 * @param estimatedWitnessCount - Number of signatures - use WITNESS_COUNT_* constants
 */
export const buildMultiTokenTransactionWithCalculatedFee = (
  params: Omit<MultiTokenTransactionOutputsParams, "fee">,
  txInputs: TransactionInput[],
  ttl: number,
  estimatedWitnessCount: number
): { outputs: TransactionOutput[]; fee: number; txBody: TransactionBody } => {
  return convergeTransactionFee(
    (fee) => createMultiTokenTransactionOutputs({ ...params, fee }),
    txInputs,
    ttl,
    estimatedWitnessCount,
    "multi-token"
  );
};

// ─── UTxO consolidation utilities ─────────────────────────────────────────────

/**
 * Builds a single consolidation output that sweeps all UTxOs into one.
 *
 * Unlike regular transfers there is no change output - the single output IS the result.
 * All ADA (minus fee) and ALL tokens from the input UTxOs are merged into it.
 *
 * Throws if the remaining lovelace after the fee is below the protocol minimum.
 */
export const createConsolidationOutput = (
  params: ConsolidationTransactionOutputParams
): TransactionOutput[] => {
  const { fee, senderAddress, selectedUtxos } = params;

  const totalInputLovelace = selectedUtxos.reduce((sum, u) => sum + u.value.lovelace, 0);
  const outputLovelace = totalInputLovelace - fee;

  if (outputLovelace < CardanoConstants.MIN_UTXO_BASE_LOVELACE) {
    throw new Error(
      `Insufficient ADA for consolidation: fee (${fee} lovelace) leaves only ` +
        `${outputLovelace} lovelace, below the ${CardanoConstants.MIN_UTXO_BASE_LOVELACE} lovelace minimum`
    );
  }

  const allTokens = collectAllAssets(selectedUtxos);
  const multiAsset =
    Object.keys(allTokens).length > 0
      ? buildMultiAssetFromGrouped(groupAssetsByPolicy(allTokens))
      : null;

  const output = buildValidatedOutput(senderAddress, outputLovelace, multiAsset, "consolidation");

  logger.info(
    `Consolidation output: ${outputLovelace} lovelace with ${Object.keys(allTokens).length} token assets`
  );

  return [output];
};

/**
 * Builds a UTxO consolidation transaction with iteratively calculated fee.
 *
 * @param params               - Parameters for createConsolidationOutput (excluding fee)
 * @param txInputs             - Transaction inputs (all UTxOs at the address)
 * @param ttl                  - Slot deadline for the transaction
 * @param estimatedWitnessCount - Number of signatures - use WITNESS_COUNT_* constants
 */
export const buildConsolidationTransactionWithCalculatedFee = (
  params: Omit<ConsolidationTransactionOutputParams, "fee">,
  txInputs: TransactionInput[],
  ttl: number,
  estimatedWitnessCount: number
): { outputs: TransactionOutput[]; fee: number; txBody: TransactionBody } => {
  return convergeTransactionFee(
    (fee) => createConsolidationOutput({ ...params, fee }),
    txInputs,
    ttl,
    estimatedWitnessCount,
    "consolidation"
  );
};

/**
 * Calculate token balance for given addresses
 * @param iagonApiService - Iagon API service instance
 * @param policyId - Token policy ID
 * @param tokenName - Token name
 * @param addresses - Array of ADA addresses to calculate balance for
 * @returns Promise resolving to balance information including total, confirmed and unconfirmed amounts
 */
export const calculateBalance = async (
  iagonApiService: IagonApiService,
  policyId: string,
  tokenName: string,
  addresses: string[]
): Promise<{
  total: number;
  confirmed: number;
  unconfirmed: number;
}> => {
  try {
    if (!addresses || addresses.length === 0) {
      logger.error("No addresses provided");
      throw new Error("No addresses provided");
    }

    const assetNameHex = toHex(tokenName);
    const targetUnit = `${policyId}${assetNameHex}`;

    // Fetch UTXOs for the provided addresses
    const allUtxos = await Promise.all(
      addresses.map((address) => fetchUtxos(iagonApiService, address))
    );
    const utxos = allUtxos.flat();

    let totalTokenAmount = 0;
    utxos.forEach((utxo) => {
      totalTokenAmount += utxo.value.assets[targetUnit] || 0;
    });

    return {
      total: totalTokenAmount,
      confirmed: totalTokenAmount,
      unconfirmed: 0,
    };
  } catch (error) {
    logger.error("Error calculating token balance:", error);
    throw error;
  }
};
