import {
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
  createTransactionOutputsParams,
  UtxoData,
  fetchAndSelectUtxosParams,
  SupportedAssets,
} from "../types/index.js";
import { Logger } from "./logger.js";
import { CardanoAmounts } from "../constants.js";

const logger = new Logger("utils:cardano");

/**
 * Cardano protocol parameters for fee calculation
 * Based on mainnet parameters:
 * - txFeePerByte (a): 44 lovelace/byte
 * - txFeeFixed (b): 155,381 lovelace
 * Formula: min_fee = (a × tx_size_bytes) + b
 */
const CARDANO_LINEAR_FEE = LinearFee.new(
  BigNum.from_str("44"), // coefficient (lovelace per byte)
  BigNum.from_str("155381") // constant (base fee in lovelace)
);

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
    return CardanoAmounts.MIN_UTXO_BASE_LOVELACE;
  }
  return (
    CardanoAmounts.MIN_UTXO_BASE_LOVELACE +
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

/**
 * Calculate the minimum required fee for a transaction based on its size
 * @param tx - The transaction to calculate fee for
 * @returns The calculated fee in lovelace
 */
export const calculateTransactionFee = (tx: Transaction): number => {
  const calculatedFee = min_fee(tx, CARDANO_LINEAR_FEE);
  return parseInt(calculatedFee.to_str());
};

export const fetchAndSelectUtxos = async (params: fetchAndSelectUtxosParams) => {
  const {
    iagonApiService,
    address,
    tokenPolicyId,
    requiredTokenAmount,
    transactionFee,
    tokenName,
  } = params;
  try {
    const utxos = await fetchUtxos(iagonApiService, address);

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
        selectedUtxos.push(utxo);
        accumulatedAda += adaAmount;
        if (accumulatedAda >= adaTarget) break;
      }
    }

    return {
      selectedUtxos,
      accumulatedAda,
      accumulatedTokenAmount,
      minRecipientLovelace: actualMinRecipient,
      minChangeLovelace: actualMinChange,
    };
  } catch (error) {
    throw new Error(
      `Error fetching and selecting UTXOs: ${error instanceof Error ? error.message : error}`
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
  } catch (error: any) {
    logger.error(`Error fetching UTXOs for ${address}: ${error.message}`, error.stack);
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
  } catch (err: any) {
    throw new Error(`An unexpected error occurred while filtering UTXOs. ${err.message}`);
  }
};

export const createTransactionInputs = (selectedUtxos: UtxoData[]): TransactionInput[] => {
  const inputs = selectedUtxos.map((utxo) => {
    const txHashBytes = Buffer.from(utxo.transaction_id, "hex");
    const txHash = TransactionHash.from_bytes(txHashBytes);
    return TransactionInput.new(txHash, utxo.output_index);
  });

  return inputs;
};

export const createTransactionOutputs = (
  params: createTransactionOutputsParams
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

  // Token name is expected to be in hex format already
  const tokenUnit = `${tokenPolicyId}.${tokenName}`;

  logger.info("=== COLLECTING ALL ASSETS FROM SELECTED UTXOs ===");
  logger.info("Policy ID:", tokenPolicyId);
  logger.info("Token Name (hex):", tokenName);
  logger.info("Constructed Unit:", tokenUnit);

  // Collect ALL assets from selected UTXOs
  const allAssets: Record<string, number> = {};
  let totalLovelace = 0;
  let totalTokenAmount = 0;

  selectedUtxos.forEach((utxo) => {
    totalLovelace += utxo.value.lovelace;

    if (utxo.value.assets) {
      Object.entries(utxo.value.assets).forEach(([assetUnit, amount]) => {
        allAssets[assetUnit] = (allAssets[assetUnit] || 0) + amount;

        if (assetUnit === tokenUnit) {
          totalTokenAmount += amount;
        }

        logger.info(`Found asset: ${assetUnit} = ${amount}`);
      });
    }
  });

  logger.info("All assets collected:", allAssets);
  logger.info("Total tokens for transfer:", totalTokenAmount);

  // Validate we have enough tokens
  if (totalTokenAmount < transferAmount) {
    throw new Error(`Insufficient tokens: have ${totalTokenAmount}, need ${transferAmount}`);
  }

  // Calculate change
  let changeLovelace = totalLovelace - requiredLovelace - fee;

  logger.info("=== CREATING OUTPUTS ===");
  logger.info("Change ADA:", changeLovelace);

  // Create recipient output
  const recipientValue = Value.new(BigNum.from_str(requiredLovelace.toString()));
  if (transferAmount > 0) {
    const recipientMultiAsset = MultiAsset.new();
    const [policyId, tokenNameHex] = tokenUnit.split(".");
    const policy = ScriptHash.from_hex(policyId);
    const assetName = AssetName.new(Buffer.from(tokenNameHex, "hex"));
    const assets = Assets.new();
    assets.insert(assetName, BigNum.from_str(transferAmount.toString()));
    recipientMultiAsset.insert(policy, assets);
    recipientValue.set_multiasset(recipientMultiAsset);
  }
  let recipientOutput = TransactionOutput.new(recipientAddress, recipientValue);

  // Calculate actual minimum ADA required for recipient output
  const dataCost = DataCost.new_coins_per_byte(
    BigNum.from_str(CardanoAmounts.COINS_PER_UTXO_BYTE.toString())
  );
  const actualMinRecipient = parseInt(min_ada_for_output(recipientOutput, dataCost).to_str());

  // If actual minimum is higher than what we allocated, recreate the output with correct amount
  if (actualMinRecipient > requiredLovelace) {
    logger.info(
      `Adjusting recipient min ADA: ${requiredLovelace} → ${actualMinRecipient} (+${actualMinRecipient - requiredLovelace} lovelace)`
    );
    const adjustedRecipientValue = Value.new(BigNum.from_str(actualMinRecipient.toString()));
    if (transferAmount > 0) {
      const recipientMultiAsset = MultiAsset.new();
      const [policyId, tokenNameHex] = tokenUnit.split(".");
      const policy = ScriptHash.from_hex(policyId);
      const assetName = AssetName.new(Buffer.from(tokenNameHex, "hex"));
      const assets = Assets.new();
      assets.insert(assetName, BigNum.from_str(transferAmount.toString()));
      recipientMultiAsset.insert(policy, assets);
      adjustedRecipientValue.set_multiasset(recipientMultiAsset);
    }
    recipientOutput = TransactionOutput.new(recipientAddress, adjustedRecipientValue);

    // Adjust change to account for the additional ADA given to recipient
    const changeAdjustment = actualMinRecipient - requiredLovelace;
    changeLovelace = changeLovelace - changeAdjustment;
    logger.info(`Adjusted change ADA: ${changeLovelace + changeAdjustment} → ${changeLovelace}`);
  }

  // Create change output (ALL remaining assets)
  const changeValue = Value.new(BigNum.from_str(changeLovelace.toString()));
  const changeMultiAsset = MultiAsset.new();

  // Group assets by policy ID
  const assetsByPolicy: Record<string, Record<string, number>> = {};

  Object.entries(allAssets).forEach(([assetUnit, amount]) => {
    const [policyId, tokenNameHex] = assetUnit.split(".");

    if (!assetsByPolicy[policyId]) {
      assetsByPolicy[policyId] = {};
    }

    // If this is the token being transferred, subtract the transfer amount
    if (assetUnit === tokenUnit) {
      const remainingAmount = amount - transferAmount;
      if (remainingAmount > 0) {
        assetsByPolicy[policyId][tokenNameHex] = remainingAmount;
        logger.info(`Change for ${assetUnit}: ${remainingAmount}`);
      }
    } else {
      // For all other tokens, return the full amount to change
      assetsByPolicy[policyId][tokenNameHex] = amount;
      logger.info(`Returning full amount for ${assetUnit}: ${amount}`);
    }
  });

  // Build MultiAsset for change output
  Object.entries(assetsByPolicy).forEach(([policyId, tokens]) => {
    // Skip policies with no tokens (empty object)
    if (Object.keys(tokens).length === 0) {
      return;
    }

    const policy = ScriptHash.from_hex(policyId);
    const assets = Assets.new();

    Object.entries(tokens).forEach(([tokenNameHex, amount]) => {
      const assetName = AssetName.new(Buffer.from(tokenNameHex, "hex"));
      assets.insert(assetName, BigNum.from_str(amount.toString()));
    });

    changeMultiAsset.insert(policy, assets);
  });

  // Only set multiasset if there are actually tokens in the change
  if (Object.keys(assetsByPolicy).length > 0) {
    changeValue.set_multiasset(changeMultiAsset);
  }
  const changeOutput = TransactionOutput.new(senderAddress, changeValue);

  // Validate change output meets minimum ADA requirement (mirrors the recipient check above)
  const actualMinChange = parseInt(min_ada_for_output(changeOutput, dataCost).to_str());
  if (changeLovelace < actualMinChange) {
    throw new Error(
      `Insufficient ADA for change output: ${changeLovelace} lovelace available, ` +
        `minimum required is ${actualMinChange} lovelace. ` +
        `Consider adding more ADA UTXOs.`
    );
  }
  logger.info(
    `Change output min-ADA check passed: ${changeLovelace} lovelace ≥ ${actualMinChange} lovelace minimum`
  );

  // Final validation
  logger.info("=== FINAL VALIDATION ===");
  logger.info("Recipient gets:", transferAmount, "of", tokenUnit);
  Object.entries(assetsByPolicy).forEach(([policyId, tokens]) => {
    Object.entries(tokens).forEach(([tokenNameHex, amount]) => {
      logger.info(`Change includes: ${policyId}.${tokenNameHex} = ${amount}`);
    });
  });

  return [recipientOutput, changeOutput];
};

/**
 * Number of witnesses (signatures) required per transaction type.
 * Token transfers only need the payment key; staking operations also require the stake key.
 * Pass the appropriate constant to buildTransactionWithCalculatedFee to get an accurate fee.
 */
export const WITNESS_COUNT_PAYMENT_KEY_ONLY = 1; // Token transfers: payment key signature only
export const WITNESS_COUNT_PAYMENT_AND_STAKE_KEY = 2; // Staking: payment key + stake key signatures

/**
 * Builds transaction outputs with dynamically calculated fees
 * This function iteratively calculates the correct fee by:
 * 1. Building outputs with an estimated fee
 * 2. Creating a transaction body to measure size
 * 3. Calculating actual fee based on transaction size
 * 4. Rebuilding if fee changed significantly
 *
 * @param params - Same parameters as createTransactionOutputs except 'fee' (calculated internally)
 * @param txInputs - Transaction inputs needed for fee calculation
 * @param ttl - Time to live for the transaction
 * @param estimatedWitnessCount - Number of signatures — use WITNESS_COUNT_* constants
 * @returns Object containing the final outputs, calculated fee, and transaction body
 */
export const buildTransactionWithCalculatedFee = (
  params: Omit<createTransactionOutputsParams, "fee">,
  txInputs: TransactionInput[],
  ttl: number,
  estimatedWitnessCount: number
): { outputs: TransactionOutput[]; fee: number; txBody: TransactionBody } => {
  const WITNESS_SIZE_BYTES = 139; // Size of one Ed25519 signature witness
  const MAX_ITERATIONS = 5;
  const FEE_TOLERANCE = 1000; // 1000 lovelace tolerance to avoid infinite loops

  let currentFee = 200000; // Start with a reasonable estimate
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    logger.info(`Fee calculation iteration ${iteration + 1}, current fee: ${currentFee}`);

    // Build outputs with current fee estimate
    const outputs = createTransactionOutputs({
      ...params,
      fee: currentFee,
    });

    // Build transaction body
    const txBody = buildTransaction({
      txInputs,
      txOutputs: outputs,
      fee: currentFee,
      ttl,
    });

    // Estimate total transaction size including witnesses
    const txBodySize = txBody.to_bytes().length;
    const estimatedWitnessesSize = estimatedWitnessCount * WITNESS_SIZE_BYTES;
    const estimatedTotalSize = txBodySize + estimatedWitnessesSize + 10; // +10 for witness set overhead

    // Calculate actual required fee
    const calculatedFee =
      44 * estimatedTotalSize + // txFeePerByte × size
      155381; // txFeeFixed

    logger.info(`Transaction body size: ${txBodySize} bytes`);
    logger.info(`Estimated total size: ${estimatedTotalSize} bytes`);
    logger.info(`Calculated fee: ${calculatedFee} lovelace`);

    // Check if fee converged
    if (Math.abs(calculatedFee - currentFee) <= FEE_TOLERANCE) {
      logger.info(`Fee converged at ${calculatedFee} lovelace after ${iteration + 1} iterations`);
      return { outputs, fee: calculatedFee, txBody };
    }

    // Update fee for next iteration
    currentFee = calculatedFee;
    iteration++;
  }

  // If we hit max iterations, use the last calculated fee with a warning
  logger.warn(
    `Fee calculation did not converge after ${MAX_ITERATIONS} iterations, using ${currentFee}`
  );

  const finalOutputs = createTransactionOutputs({
    ...params,
    fee: currentFee,
  });

  const finalTxBody = buildTransaction({
    txInputs,
    txOutputs: finalOutputs,
    fee: currentFee,
    ttl,
  });

  return { outputs: finalOutputs, fee: currentFee, txBody: finalTxBody };
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

  const txBody = TransactionBody.new_tx_body(inputs, outputs, BigNum.from_str(fee.toString()));

  txBody.set_ttl(BigNum.from_str(ttl.toString()));

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
      `Error submitting transaction: ${error instanceof Error ? error.message : error}`
    );
  }
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
