/**
 * Test script for ADA transfers between vault accounts.
 * Run via: npx tsx scripts/test-ada-transfer.ts
 *
 * Required environment variables:
 *   FIREBLOCKS_API_USER_KEY
 *   FIREBLOCKS_API_USER_SECRET_KEY or FIREBLOCKS_API_USER_SECRET_KEY_PATH
 *   IAGON_API_KEY
 *   CARDANO_NETWORK (mainnet | preprod)
 *   TRANSFER_AMOUNT_ADA
 *   SOURCE_VAULT
 *   DEST_VAULT
 */

import fs from "fs";
import { FireblocksCardanoRawSDK } from "../src/FireblocksCardanoRawSDK.js";
import { Networks } from "../src/types/index.js";

function resolveSecretKey(): string {
  const directKey = process.env.FIREBLOCKS_API_USER_SECRET_KEY;
  if (directKey) {
    const trimmed = directKey.trim();
    if (trimmed.startsWith("-----BEGIN")) {
      return trimmed;
    }
    // try base64 decode
    try {
      const decoded = Buffer.from(trimmed, "base64").toString("utf-8");
      if (decoded.startsWith("-----BEGIN")) {
        return decoded;
      }
    } catch {
      // not base64
    }
    return trimmed;
  }

  // file path
  const path = process.env.FIREBLOCKS_API_USER_SECRET_KEY_PATH;
  if (path) {
    return fs.readFileSync(path, "utf-8");
  }

  throw new Error("FIREBLOCKS_API_USER_SECRET_KEY or FIREBLOCKS_API_USER_SECRET_KEY_PATH required");
}

async function main() {
  const apiKey = process.env.FIREBLOCKS_API_USER_KEY;
  const iagonApiKey = process.env.IAGON_API_KEY;
  const networkStr = process.env.CARDANO_NETWORK || "preprod";
  const amountAda = parseFloat(process.env.TRANSFER_AMOUNT_ADA || "50");
  const sourceVault = process.env.SOURCE_VAULT || "0";
  const destVault = process.env.DEST_VAULT || "1";

  // validations
  if (!apiKey) throw new Error("FIREBLOCKS_API_USER_KEY is required");
  if (!iagonApiKey) throw new Error("IAGON_API_KEY is required");

  // Validate network
  const validNetworks = ["mainnet", "preprod"];
  if (!validNetworks.includes(networkStr.toLowerCase())) {
    throw new Error(
      `Invalid CARDANO_NETWORK: "${networkStr}". Must be one of: ${validNetworks.join(", ")}`
    );
  }

  const secretKey = resolveSecretKey();

  const network = networkStr.toLowerCase() === "mainnet" ? Networks.MAINNET : Networks.PREPROD;
  const lovelaceAmount = Math.floor(amountAda * 1_000_000);

  console.log(`\n=== ADA Transfer Test ===`);
  console.log(`Network: ${networkStr}`);
  console.log(`Amount: ${amountAda} ADA (${lovelaceAmount} lovelace)`);
  console.log(`Source vault: ${sourceVault}`);
  console.log(`Destination vault: ${destVault}`);
  console.log(`========================\n`);

  console.log("Initializing SDK...");
  const sdk = await FireblocksCardanoRawSDK.createInstance({
    fireblocksConfig: {
      apiKey,
      secretKey,
      basePath: process.env.FIREBLOCKS_BASE_PATH
    },
    vaultAccountId: sourceVault,
    network,
    iagonApiKey,
  });


  console.log("Estimating fee...");
  const estimate = await sdk.estimateAdaTransactionFee({
    lovelaceAmount,
    recipientVaultAccountId: destVault,
  });
  console.log(`Estimated fee: ${estimate.fee.ada} ADA`);
  console.log(`Recipient receives: ${estimate.recipientReceives.ada} ADA`);


  console.log("\nExecuting transfer...");
  const result = await sdk.transferAda({
    lovelaceAmount,
    recipientVaultAccountId: destVault,
  });

  console.log(`\n=== Transfer Complete ===`);
  console.log(`Transaction hash: ${result.txHash}`);
  console.log(`Sender: ${result.senderAddress}`);
  console.log(`Recipient: ${result.recipientAddress}`);
  console.log(`Amount: ${result.lovelaceAmount} lovelace`);
  console.log(`Fee: ${result.fee.ada} ADA (${result.fee.lovelace} lovelace)`);
  console.log(`=========================\n`);

  const explorerBase =
    network === Networks.MAINNET
      ? "https://cardanoscan.io"
      : "https://preprod.cardanoscan.io";
  console.log(`View on explorer: ${explorerBase}/transaction/${result.txHash}`);
}

main().catch((err) => {
  console.error("Transfer failed:", err);
  process.exit(1);
});
