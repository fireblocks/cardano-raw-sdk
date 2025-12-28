import {
  TransactionInput,
  TransactionHash,
  BigNum,
  TransactionOutput,
  Address,
  MultiAsset,
  Assets,
  Value,
  ScriptHash,
  AssetName,
  TransactionBody,
  TransactionInputs,
  TransactionOutputs,
  Transaction,
} from "@emurgo/cardano-serialization-lib-nodejs";
import { toHex } from "./general.js";
import { IagonApiService } from "../services/iagon.api.service.js";
import {
  createTransactionOutputsParams,
  UtxoData,
  fetchAndSelectUtxosParams,
  SupportedAssets,
} from "../types/index.js";
import { Logger, LogLevel } from "./logger.js";
import { SupportedAssets } from "../types/enums.js";

const logLevel = "INFO";
Logger.setLogLevel(LogLevel[logLevel as keyof typeof LogLevel] || LogLevel.INFO);
const logger = new Logger("utils:cardano");

export const fetchAndSelectUtxos = async (params: fetchAndSelectUtxosParams) => {
  const {
    iagonApiService,
    address,
    tokenPolicyId,
    requiredTokenAmount,
    transactionFee,
    tokenName,
    minRecipientLovelace = 1_200_000,
    minChangeLovelace = 1_200_000,
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

    // Accumulate token UTXOs
    for (const { utxo, tokenAmount, adaAmount } of tokenUtxosWithAmounts) {
      selectedUtxos.push(utxo);
      accumulatedTokenAmount += tokenAmount;
      accumulatedAda += adaAmount;

      if (
        accumulatedTokenAmount >= requiredTokenAmount &&
        accumulatedAda >= minRecipientLovelace + transactionFee
      ) {
        break;
      }
    }
    const adaTarget = minRecipientLovelace + transactionFee + minChangeLovelace;
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
  if (
    (tokenName === SupportedAssets.ADA || tokenName === SupportedAssets.ADA_TEST) &&
    policyId === ""
  ) {
    return 0;
  }

  if (
    (tokenName === SupportedAssets.ADA || tokenName === SupportedAssets.ADA_TEST) &&
    policyId === ""
  ) {
    return utxo.value.lovelace;
  }

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

    // Log all available asset keys in the first UTXO for debugging
    if (utxos.length > 0 && utxos[0].value.assets) {
      logger.info(`Available asset keys in first UTXO:`, Object.keys(utxos[0].value.assets));
    }

    const filtered = utxos.filter((utxo) => {
      // Skip UTXOs without assets
      if (!utxo.value.assets) {
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
  const changeLovelace = totalLovelace - requiredLovelace - fee;

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
  const recipientOutput = TransactionOutput.new(recipientAddress, recipientValue);

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
    const policy = ScriptHash.from_hex(policyId);
    const assets = Assets.new();

    Object.entries(tokens).forEach(([tokenNameHex, amount]) => {
      const assetName = AssetName.new(Buffer.from(tokenNameHex, "hex"));
      assets.insert(assetName, BigNum.from_str(amount.toString()));
    });

    changeMultiAsset.insert(policy, assets);
  });

  changeValue.set_multiasset(changeMultiAsset);
  const changeOutput = TransactionOutput.new(senderAddress, changeValue);

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

export const calculateTtl = async (bufferSlots: number = 7200): Promise<number> => {
  try {
    // NOTE: Iagon API doesn't currently provide a "latest block" endpoint
    // Using a reasonable default based on current time
    // 1 slot = 1 second on Cardano mainnet
    // This is a temporary solution - consider using a dedicated blockchain data provider for this
    const currentSlot = Math.floor(Date.now() / 1000);
    const ttl = currentSlot + bufferSlots;

    logger.info(`Calculated TTL: ${ttl} (estimated slot: ${currentSlot}, buffer: ${bufferSlots})`);
    logger.warn(
      "WARNING: Using estimated slot number. Consider using a blockchain data provider for accurate slot information."
    );

    return ttl;
  } catch (error) {
    logger.error(`Failed to calculate TTL: ${error}`);
    throw new Error(`Unable to calculate TTL. ${error instanceof Error ? error.message : error}`);
  }
};

export const submitTransaction = async (
  iagonApiService: IagonApiService,
  signedTx: Transaction
): Promise<string> => {
  try {
    const txCbor = Buffer.from(signedTx.to_bytes()).toString("hex");

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
