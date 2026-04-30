/**
 * End-to-end test for Cardano native token transfers between vault accounts.
 * Run via: npx tsx scripts/test-token-transfer.ts
 *
 * Required environment variables:
 *   FIREBLOCKS_API_USER_KEY
 *   FIREBLOCKS_API_USER_SECRET_KEY or FIREBLOCKS_API_USER_SECRET_KEY_PATH
 *   IAGON_API_KEY
 *   CARDANO_NETWORK (mainnet | preprod)
 *   TOKEN_POLICY_ID - policy ID hex (56 chars on mainnet/preprod)
 *   TOKEN_NAME - asset name as hex (matches Iagon UTXO keys: policyId.tokenNameHex)
 *   TRANSFER_TOKEN_AMOUNT - integer amount in token base units
 *   SOURCE_VAULT
 *   DEST_VAULT
 *
 * Optional:
 *   TOKEN_NAME_UTF8 - if "1" or "true", TOKEN_NAME is treated as a UTF-8 label and encoded to hex
 *   ADDRESS_INDEX - source address index (default 0)
 *   RECIPIENT_INDEX - recipient address index when using DEST_VAULT (default 0)
 *   TOKEN_TRANSFER_MODE - "full" (default): estimate then transfer | "estimate": fee only | "transfer": skip estimate
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

  const path = process.env.FIREBLOCKS_API_USER_SECRET_KEY_PATH;
  if (path) {
    return fs.readFileSync(path, "utf-8");
  }

  throw new Error("FIREBLOCKS_API_USER_SECRET_KEY or FIREBLOCKS_API_USER_SECRET_KEY_PATH required");
}

function resolveTokenName(raw: string): string {
  const trimmed = raw.trim();
  const utf8Mode =
    process.env.TOKEN_NAME_UTF8 === "1" ||
    process.env.TOKEN_NAME_UTF8 === "true" ||
    process.env.TOKEN_NAME_UTF8 === "yes";

  if (utf8Mode) {
    return Buffer.from(trimmed, "utf8").toString("hex");
  }

  const hexOnly = /^[0-9a-fA-F]+$/;
  if (hexOnly.test(trimmed) && trimmed.length % 2 === 0) {
    return trimmed.toLowerCase();
  }

  throw new Error(
    "TOKEN_NAME must be hex (even length, 0-9a-f) matching on-chain asset name, or set TOKEN_NAME_UTF8=1 with a UTF-8 label"
  );
}

async function main() {
  const apiKey = process.env.FIREBLOCKS_API_USER_KEY;
  const iagonApiKey = process.env.IAGON_API_KEY;
  const networkStr = process.env.CARDANO_NETWORK || "preprod";
  const sourceVault = process.env.SOURCE_VAULT || "0";
  const destVault = process.env.DEST_VAULT || "1";
  const tokenPolicyId = (process.env.TOKEN_POLICY_ID || "").trim().toLowerCase();
  const tokenNameRaw = process.env.TOKEN_NAME || "";
  const amountRaw = process.env.TRANSFER_TOKEN_AMOUNT;
  const mode = (process.env.TOKEN_TRANSFER_MODE || "full").toLowerCase();
  const addressIndex = parseInt(process.env.ADDRESS_INDEX || "0", 10);
  const recipientIndex = parseInt(process.env.RECIPIENT_INDEX || "0", 10);

  if (!apiKey) throw new Error("FIREBLOCKS_API_USER_KEY is required");
  if (!iagonApiKey) throw new Error("IAGON_API_KEY is required");
  if (!tokenPolicyId) throw new Error("TOKEN_POLICY_ID is required");
  if (!tokenNameRaw) throw new Error("TOKEN_NAME is required");
  if (!amountRaw) throw new Error("TRANSFER_TOKEN_AMOUNT is required");

  const requiredTokenAmount = parseInt(amountRaw, 10);
  if (!Number.isFinite(requiredTokenAmount) || requiredTokenAmount <= 0) {
    throw new Error("TRANSFER_TOKEN_AMOUNT must be a positive integer");
  }

  const validNetworks = ["mainnet", "preprod"];
  if (!validNetworks.includes(networkStr.toLowerCase())) {
    throw new Error(
      `Invalid CARDANO_NETWORK: "${networkStr}". Must be one of: ${validNetworks.join(", ")}`
    );
  }

  if (!["full", "estimate", "transfer"].includes(mode)) {
    throw new Error(`Invalid TOKEN_TRANSFER_MODE: "${mode}". Use full, estimate, or transfer.`);
  }

  const tokenName = resolveTokenName(tokenNameRaw);
  const secretKey = resolveSecretKey();
  const network = networkStr.toLowerCase() === "mainnet" ? Networks.MAINNET : Networks.PREPROD;

  console.log(`\n=== CNT (native token) transfer test ===`);
  console.log(`Network: ${networkStr}`);
  console.log(`Policy: ${tokenPolicyId}`);
  console.log(`Token name (hex): ${tokenName}`);
  console.log(`Amount (base units): ${requiredTokenAmount}`);
  console.log(`Source vault: ${sourceVault} (index ${addressIndex})`);
  console.log(`Destination vault: ${destVault} (index ${recipientIndex})`);
  console.log(`Mode: ${mode}`);
  console.log(`========================================\n`);

  console.log("Initializing SDK...");
  const sdk = await FireblocksCardanoRawSDK.createInstance({
    fireblocksConfig: {
      apiKey,
      secretKey,
    },
    vaultAccountId: sourceVault,
    network,
    iagonApiKey,
  });

  const baseOpts = {
    tokenPolicyId,
    tokenName,
    requiredTokenAmount,
    recipientVaultAccountId: destVault,
    index: addressIndex,
    recipientIndex,
  };

  if (mode === "full" || mode === "estimate") {
    console.log("Estimating fee...");
    const estimate = await sdk.estimateTransactionFee(baseOpts);
    console.log(`Estimated fee: ${estimate.fee.ada} ADA (${estimate.fee.lovelace} lovelace)`);
    console.log(`Min ADA in recipient output: ${estimate.minAdaRequired.ada} ADA`);
    console.log(`Total cost (approx): ${estimate.totalCost.ada} ADA`);
    console.log(`Recipient receives token amount: ${estimate.recipientReceives.amount}`);
  }

  if (mode === "estimate") {
    console.log("\nEstimate-only mode; no transaction submitted.");
    return;
  }

  console.log("\nExecuting token transfer...");
  const result = await sdk.transfer(baseOpts);

  console.log(`\n=== Transfer complete ===`);
  console.log(`Transaction hash: ${result.txHash}`);
  console.log(`Sender: ${result.senderAddress}`);
  console.log(`Policy: ${result.tokenPolicyId}`);
  console.log(`Token name (hex): ${result.tokenName}`);
  console.log(`Amount: ${result.amount}`);
  console.log(`Fee: ${result.fee.ada} ADA (${result.fee.lovelace} lovelace)`);
  console.log(`=========================\n`);

  const explorerBase =
    network === Networks.MAINNET ? "https://cardanoscan.io" : "https://preprod.cardanoscan.io";
  console.log(`View on explorer: ${explorerBase}/transaction/${result.txHash}`);
}

main().catch((err) => {
  console.error("Token transfer failed:", err);
  process.exit(1);
});
