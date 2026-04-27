/**
 * Test script for staking operations.
 * Run via: npx tsx scripts/test-staking.ts
 *
 * Required environment variables:
 *   FIREBLOCKS_API_USER_KEY
 *   FIREBLOCKS_API_USER_SECRET_KEY or FIREBLOCKS_API_USER_SECRET_KEY_PATH
 *   IAGON_API_KEY
 *   CARDANO_NETWORK (mainnet | preprod)
 *   VAULT_ACCOUNT_ID
 *   STAKING_ACTION (info | register | delegate | withdraw)
 *   POOL_ID (required for delegate action)
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

async function main() {
  const apiKey = process.env.FIREBLOCKS_API_USER_KEY;
  const iagonApiKey = process.env.IAGON_API_KEY;
  const networkStr = process.env.CARDANO_NETWORK || "preprod";
  const vaultAccountId = process.env.VAULT_ACCOUNT_ID || "1";
  const action = process.env.STAKING_ACTION || "info";
  const poolId = process.env.POOL_ID;

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

  console.log(`\n=== Staking Test ===`);
  console.log(`Network: ${networkStr}`);
  console.log(`Vault: ${vaultAccountId}`);
  console.log(`Action: ${action}`);
  if (poolId) console.log(`Pool ID: ${poolId}`);
  console.log(`====================\n`);

  console.log("Initializing SDK...");
  const sdk = await FireblocksCardanoRawSDK.createInstance({
    fireblocksConfig: { apiKey, secretKey },
    vaultAccountId,
    network,
    iagonApiKey,
  });

  // always show stake account info first
  console.log("Fetching stake account info...");
  const stakeAddress = await sdk.getStakeAddress(vaultAccountId);
  console.log(`Stake address: ${stakeAddress}`);

  const stakeInfo = await sdk.getStakeAccountInfo(vaultAccountId);
  console.log(`\n=== Stake Account Status ===`);
  console.log(`Active: ${stakeInfo.active}`);
  console.log(`Delegated to: ${stakeInfo.pool_id || "(not delegated)"}`);
  console.log(`Rewards available: ${stakeInfo.available_rewards} lovelace`);
  console.log(`Active stake: ${stakeInfo.active_stake} lovelace`);
  console.log(`============================\n`);

  if (action === "info") {
    console.log("Info-only mode, no transaction executed.");
    return;
  }

  const explorerBase =
    network === Networks.MAINNET ? "https://cardanoscan.io" : "https://preprod.cardanoscan.io";

  if (action === "register") {
    if (stakeInfo.active) {
      console.log("Stake key is already registered.");
      return;
    }

    console.log("Registering stake key (2 ADA deposit)...");
    const result = await sdk.registerStakingCredential({
      vaultAccountId,
    });

    if (!result) {
      console.log("Registration returned no result");
      return;
    }

    console.log(`\n=== Registration Complete ===`);
    console.log(`Transaction hash: ${result.txHash}`);
    console.log(`Status: ${result.status}`);
    console.log(`Operation: ${result.operation}`);
    console.log(`Deposit: 2 ADA (refundable on deregistration)`);
    console.log(`=============================\n`);
    console.log(`View on explorer: ${explorerBase}/transaction/${result.txHash}`);
    return;
  }

  if (action === "delegate") {
    if (!poolId) {
      throw new Error("POOL_ID is required for delegate action");
    }

    if (!stakeInfo.active) {
      console.log("Stake key not registered. Registering first (2 ADA deposit)...");
      const regResult = await sdk.registerStakingCredential({ vaultAccountId });
      if (!regResult) {
        console.log("Registration failed (no result returned)");
        return;
      }
      console.log(`Registration TX: ${regResult.txHash}`);
      console.log("Waiting 30s for registration to confirm...");
      await new Promise((r) => setTimeout(r, 30_000));
    }

    console.log(`Delegating to pool ${poolId}...`);
    const result = await sdk.delegateToPool({
      vaultAccountId,
      poolId,
      fee: 300000,
    });

    console.log(`\n=== Delegation Complete ===`);
    console.log(`Transaction hash: ${result.txHash}`);
    console.log(`Status: ${result.status}`);
    console.log(`Operation: ${result.operation}`);
    console.log(`===========================\n`);
    console.log(`View on explorer: ${explorerBase}/transaction/${result.txHash}`);
    return;
  }

  if (action === "withdraw") {
    const availableRewards = Number(stakeInfo.available_rewards);
    if (availableRewards === 0) {
      console.log("No rewards available to withdraw.");
      return;
    }

    console.log(`Withdrawing ${stakeInfo.available_rewards} lovelace in rewards...`);
    const result = await sdk.withdrawRewards({
      vaultAccountId,
      fee: 300000,
    });

    console.log(`\n=== Withdrawal Complete ===`);
    console.log(`Transaction hash: ${result.txHash}`);
    console.log(`Status: ${result.status}`);
    if (result.rewardAmount) {
      console.log(`Reward amount: ${result.rewardAmount} lovelace`);
    }
    console.log(`===========================\n`);
    console.log(`View on explorer: ${explorerBase}/transaction/${result.txHash}`);
    return;
  }

  throw new Error(`Unknown action: ${action}. Use 'info', 'register', 'delegate', or 'withdraw'.`);
}

main().catch((err) => {
  console.error("Staking operation failed:", err);
  process.exit(1);
});
