import { Router } from "express";
import { SdkManager } from "../pool/sdkManager.js";
import { ApiController } from "./controllers/controller.js";

export const configureRouter = (sdkManager: SdkManager): Router => {
  const router: Router = Router();
  const apiController = new ApiController(sdkManager);

  /**
   * @swagger
   * /api/balance/address/{vaultAccountId}:
   *   get:
   *     summary: Get balance by address
   *     description: Retrieves the balance for a vault account address.
   *     tags: [Balance]
   *     parameters:
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: The vault account ID
   *       - in: query
   *         name: index
   *         schema:
   *           type: integer
   *           default: 0
   *         description: The address index
   *       - in: query
   *         name: groupByPolicy
   *         schema:
   *           type: boolean
   *           default: true
   *         description: Whether to group results by policy
   *     responses:
   *       200:
   *         description: Balance retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *       500:
   *         description: Internal server error
   */
  router.get("/balance/address/:vaultAccountId", apiController.getBalanceByAddress);

  /**
   * @swagger
   * /api/balance/vault/{vaultAccountId}:
   *   get:
   *     summary: Get total balance for vault account
   *     description: Retrieves the aggregated balance for all addresses in a vault account. Supports multiple grouping options to view balances by token, address, or policy.
   *     tags: [Balance]
   *     parameters:
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: The vault account ID
   *       - in: query
   *         name: groupBy
   *         schema:
   *           type: string
   *           enum: [token, address, policy]
   *           default: token
   *         description: |
   *           How to group the balance results:
   *           - `token`: Groups all balances by token/asset (default). Returns total ADA and all tokens across all addresses.
   *           - `address`: Groups balances by address. Shows per-address breakdown with totals.
   *           - `policy`: Groups tokens by their policy ID. Useful for NFT collections and token families.
   *     responses:
   *       200:
   *         description: Vault balance retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               oneOf:
   *                 - type: object
   *                   description: Response when groupBy=token (default)
   *                   properties:
   *                     balances:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           assetId:
   *                             type: string
   *                             description: Asset identifier (ADA or policy.tokenName)
   *                             example: "ADA"
   *                           amount:
   *                             type: string
   *                             description: Total amount as string (to handle large numbers)
   *                             example: "1500000000"
   *                   example:
   *                     balances:
   *                       - assetId: "ADA"
   *                         amount: "1500000000"
   *                       - assetId: "policy1.token1"
   *                         amount: "100"
   *                       - assetId: "policy2.token2"
   *                         amount: "50"
   *                 - type: object
   *                   description: Response when groupBy=address
   *                   properties:
   *                     addresses:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           address:
   *                             type: string
   *                             description: Cardano address
   *                           index:
   *                             type: integer
   *                             description: BIP44 address index
   *                           ada:
   *                             type: string
   *                             description: ADA balance in lovelace
   *                           tokens:
   *                             type: array
   *                             items:
   *                               type: object
   *                               properties:
   *                                 assetId:
   *                                   type: string
   *                                 amount:
   *                                   type: string
   *                     totals:
   *                       type: object
   *                       properties:
   *                         ada:
   *                           type: string
   *                           description: Total ADA across all addresses
   *                         tokens:
   *                           type: array
   *                           items:
   *                             type: object
   *                             properties:
   *                               assetId:
   *                                 type: string
   *                               amount:
   *                                 type: string
   *                   example:
   *                     addresses:
   *                       - address: "addr1..."
   *                         index: 0
   *                         ada: "1000000000"
   *                         tokens:
   *                           - assetId: "policy1.token1"
   *                             amount: "50"
   *                       - address: "addr2..."
   *                         index: 1
   *                         ada: "500000000"
   *                         tokens:
   *                           - assetId: "policy1.token1"
   *                             amount: "50"
   *                     totals:
   *                       ada: "1500000000"
   *                       tokens:
   *                         - assetId: "policy1.token1"
   *                           amount: "100"
   *                 - type: object
   *                   description: Response when groupBy=policy
   *                   properties:
   *                     balances:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           policyId:
   *                             type: string
   *                             description: Token policy ID
   *                           tokens:
   *                             type: object
   *                             additionalProperties:
   *                               type: string
   *                             description: Map of token names to amounts
   *                     totalAda:
   *                       type: string
   *                       description: Total ADA in lovelace
   *                   example:
   *                     balances:
   *                       - policyId: "policy1"
   *                         tokens:
   *                           token1: "100"
   *                           token2: "50"
   *                       - policyId: "policy2"
   *                         tokens:
   *                           nft1: "1"
   *                     totalAda: "1500000000"
   *       500:
   *         description: Internal server error
   */
  router.get("/balance/vault/:vaultAccountId", apiController.getVaultBalance);

  /**
   * @swagger
   * /api/balance/credential/{vaultAccountId}/{credential}:
   *   get:
   *     summary: Get balance by credential
   *     description: Retrieves the balance for a vault account using a specific credential
   *     tags: [Balance]
   *     parameters:
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: The vault account ID
   *       - in: path
   *         name: credential
   *         required: true
   *         schema:
   *           type: string
   *         description: The credential identifier
   *       - in: query
   *         name: groupByPolicy
   *         schema:
   *           type: boolean
   *           default: true
   *         description: Whether to group results by policy
   *     responses:
   *       200:
   *         description: Balance retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *       500:
   *         description: Internal server error
   */
  router.get(
    "/balance/credential/:vaultAccountId/:credential",
    apiController.getBalanceByCredential
  );

  /**
   * @swagger
   * /api/balance/stake-key/{vaultAccountId}/{stakeKey}:
   *   get:
   *     summary: Get balance by stake key
   *     description: Retrieves the balance for a vault account using a stake key
   *     tags: [Balance]
   *     parameters:
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: The vault account ID
   *       - in: path
   *         name: stakeKey
   *         required: true
   *         schema:
   *           type: string
   *         description: The stake key
   *       - in: query
   *         name: groupByPolicy
   *         schema:
   *           type: boolean
   *           default: true
   *         description: Whether to group results by policy
   *     responses:
   *       200:
   *         description: Balance retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *       500:
   *         description: Internal server error
   */
  router.get("/balance/stake-key/:vaultAccountId/:stakeKey", apiController.getBalanceByStakeKey);

  /**
   * @swagger
   * /api/tx/hash/{hash}:
   *   get:
   *     summary: Get transaction details by hash
   *     description: Retrieves detailed information about a specific transaction using its hash
   *     tags: [Transactions]
   *     parameters:
   *       - in: path
   *         name: hash
   *         required: true
   *         schema:
   *           type: string
   *         description: The transaction hash
   *     responses:
   *       200:
   *         description: Transaction details retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   description: Indicates if the request was successful
   *                 data:
   *                   type: object
   *                   description: Detailed transaction information
   *                   properties:
   *                     tx_hash:
   *                       type: string
   *                       description: Transaction hash
   *                     block_hash:
   *                       type: string
   *                       description: Block hash where transaction was included
   *                     slot_no:
   *                       type: integer
   *                       description: Slot number
   *                     block_no:
   *                       type: integer
   *                       description: Block number
   *                     block_time:
   *                       type: string
   *                       description: Block timestamp
   *                     fee:
   *                       type: integer
   *                       description: Transaction fee in lovelace
   *                     size:
   *                       type: integer
   *                       description: Transaction size in bytes
   *                     inputs:
   *                       type: array
   *                       description: Transaction inputs
   *                     outputs:
   *                       type: array
   *                       description: Transaction outputs
   *       404:
   *         description: Transaction not found
   *       500:
   *         description: Internal server error
   */
  router.get("/tx/hash/:hash", apiController.getTransactionDetails);

  /**
   * @swagger
   * /api/utxos/{vaultAccountId}:
   *   get:
   *     summary: Get UTXOs by vault account address
   *     description: Retrieves unspent transaction outputs (UTXOs) for a vault account address. The network (mainnet/preprod) is determined by the server configuration.
   *     tags: [UTXOs]
   *     parameters:
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: The vault account ID
   *       - in: query
   *         name: index
   *         schema:
   *           type: integer
   *           default: 0
   *         description: The address index
   *     responses:
   *       200:
   *         description: UTXOs retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   description: Indicates if the request was successful
   *                 data:
   *                   type: array
   *                   description: Array of UTXO objects
   *                   items:
   *                     type: object
   *                     properties:
   *                       transaction_id:
   *                         type: string
   *                         description: Transaction hash
   *                       output_index:
   *                         type: integer
   *                         description: Output index
   *                       address:
   *                         type: string
   *                         description: Address
   *                       value:
   *                         type: object
   *                         properties:
   *                           lovelace:
   *                             type: integer
   *                             description: Lovelace amount
   *                           assets:
   *                             type: object
   *                             description: Native assets
   *                       datum_hash:
   *                         type: string
   *                         nullable: true
   *                         description: Datum hash
   *                       script_hash:
   *                         type: string
   *                         nullable: true
   *                         description: Script hash
   *                       created_at:
   *                         type: object
   *                         properties:
   *                           slot_no:
   *                             type: integer
   *                           header_hash:
   *                             type: string
   *       500:
   *         description: Internal server error
   */
  router.get("/utxos/:vaultAccountId", apiController.getUtxosByAddress);

  /**
   * @swagger
   * /api/tx/history/{vaultAccountId}:
   *   get:
   *     summary: Get transaction history
   *     description: Retrieves basic transaction history for a vault account address with pagination and filtering
   *     tags: [Transactions]
   *     parameters:
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: The vault account ID
   *       - in: query
   *         name: index
   *         schema:
   *           type: integer
   *           default: 0
   *         description: The address index to query transactions for
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *         description: Maximum number of transactions to return per page
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *         description: Number of transactions to skip for pagination
   *       - in: query
   *         name: fromSlot
   *         schema:
   *           type: integer
   *         description: Filter transactions from this slot number onwards
   *     responses:
   *       200:
   *         description: Transaction history retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   description: Indicates if the request was successful
   *                 data:
   *                   type: array
   *                   description: Array of basic transaction objects
   *                   items:
   *                     type: object
   *                     properties:
   *                       tx_hash:
   *                         type: string
   *                         description: Transaction hash
   *                       block_hash:
   *                         type: string
   *                         description: Block hash where transaction was included
   *                       slot_no:
   *                         type: integer
   *                         description: Slot number
   *                       block_no:
   *                         type: integer
   *                         description: Block number
   *                       block_time:
   *                         type: string
   *                         description: Block timestamp
   *                 pagination:
   *                   type: object
   *                   description: Pagination metadata
   *                   properties:
   *                     limit:
   *                       type: integer
   *                       description: Items per page
   *                     offset:
   *                       type: integer
   *                       description: Current offset
   *                     total:
   *                       type: integer
   *                       description: Total number of transactions
   *                     hasMore:
   *                       type: boolean
   *                       description: Whether more results are available
   *                     next_cursor:
   *                       type: integer
   *                       description: Cursor for next page (optional)
   *                 last_updated:
   *                   type: object
   *                   description: Last update information
   *                   properties:
   *                     slot_no:
   *                       type: integer
   *                     block_hash:
   *                       type: string
   *                     block_time:
   *                       type: string
   *       500:
   *         description: Internal server error
   */
  router.get("/tx/history/:vaultAccountId", apiController.getTransactionHistory);

  /**
   * @swagger
   * /api/tx/address/{vaultAccountId}:
   *   get:
   *     summary: Get detailed transaction history
   *     description: Retrieves detailed transaction history for a vault account address with full input/output information, pagination, and filtering
   *     tags: [Transactions]
   *     parameters:
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: The vault account ID
   *       - in: query
   *         name: index
   *         schema:
   *           type: integer
   *           default: 0
   *         description: The address index to query transactions for
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *         description: Maximum number of transactions to return per page
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *         description: Number of transactions to skip for pagination
   *       - in: query
   *         name: fromSlot
   *         schema:
   *           type: integer
   *         description: Filter transactions from this slot number onwards
   *     responses:
   *       200:
   *         description: Detailed transaction history retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   description: Indicates if the request was successful
   *                 data:
   *                   type: array
   *                   description: Array of detailed transaction objects
   *                   items:
   *                     type: object
   *                     properties:
   *                       tx_hash:
   *                         type: string
   *                         description: Transaction hash
   *                       block_hash:
   *                         type: string
   *                         description: Block hash where transaction was included
   *                       slot_no:
   *                         type: integer
   *                         description: Slot number
   *                       block_no:
   *                         type: integer
   *                         description: Block number
   *                       block_time:
   *                         type: string
   *                         description: Block timestamp
   *                       fee:
   *                         type: integer
   *                         description: Transaction fee in lovelace
   *                       size:
   *                         type: integer
   *                         description: Transaction size in bytes
   *                       inputs:
   *                         type: array
   *                         description: Transaction inputs
   *                         items:
   *                           type: object
   *                           properties:
   *                             tx_hash:
   *                               type: string
   *                             output_index:
   *                               type: integer
   *                             address:
   *                               type: string
   *                             value:
   *                               type: object
   *                               properties:
   *                                 lovelace:
   *                                   type: integer
   *                                 assets:
   *                                   type: object
   *                                   additionalProperties:
   *                                     type: integer
   *                       outputs:
   *                         type: array
   *                         description: Transaction outputs
   *                         items:
   *                           type: object
   *                           properties:
   *                             output_index:
   *                               type: integer
   *                             address:
   *                               type: string
   *                             value:
   *                               type: object
   *                               properties:
   *                                 lovelace:
   *                                   type: integer
   *                                 assets:
   *                                   type: object
   *                                   additionalProperties:
   *                                     type: integer
   *                 pagination:
   *                   type: object
   *                   description: Pagination metadata
   *                   properties:
   *                     limit:
   *                       type: integer
   *                       description: Items per page
   *                     offset:
   *                       type: integer
   *                       description: Current offset
   *                     total:
   *                       type: integer
   *                       description: Total number of transactions
   *                     hasMore:
   *                       type: boolean
   *                       description: Whether more results are available
   *                     next_cursor:
   *                       type: integer
   *                       description: Cursor for next page (optional)
   *                 last_updated:
   *                   type: object
   *                   description: Last update information
   *                   properties:
   *                     slot_no:
   *                       type: integer
   *                     block_hash:
   *                       type: string
   *                     block_time:
   *                       type: string
   *       500:
   *         description: Internal server error
   */
  router.get("/tx/address/:vaultAccountId", apiController.getDetailedTxHistory);

  /**
   * @swagger
   * /api/transfers:
   *   post:
   *     summary: Execute a transfer
   *     description: |
   *       Executes a transfer of tokens between accounts.
   *
   *       Two transfer modes are supported:
   *       1. **Vault-to-address transfer**: Specify `recipientAddress` to send tokens to a specific Cardano address
   *       2. **Vault-to-vault transfer**: Specify `recipientVaultAccountId` (and optionally `recipientIndex`) to transfer between vault accounts
   *
   *       **Note**: You must provide exactly one of `recipientAddress` or `recipientVaultAccountId`, not both.
   *     tags: [Transactions]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - vaultAccountId
   *               - tokenPolicyId
   *               - tokenName
   *               - requiredTokenAmount
   *             properties:
   *               vaultAccountId:
   *                 type: string
   *                 description: The source vault account ID
   *               index:
   *                 type: number
   *                 description: Source address index to use (optional, defaults to 0)
   *               recipientAddress:
   *                 type: string
   *                 description: The recipient Cardano address to send tokens to (use this OR recipientVaultAccountId)
   *               recipientVaultAccountId:
   *                 type: string
   *                 description: The recipient vault account ID for vault-to-vault transfers (use this OR recipientAddress)
   *               recipientIndex:
   *                 type: number
   *                 description: Recipient address index to use when using recipientVaultAccountId (optional, defaults to 0)
   *               tokenPolicyId:
   *                 type: string
   *                 description: The policy ID of the token to transfer
   *               tokenName:
   *                 type: string
   *                 description: The token name (asset name)
   *               requiredTokenAmount:
   *                 type: number
   *                 description: The amount of tokens to transfer
   *           examples:
   *             addressTransfer:
   *               summary: Transfer to a specific address
   *               value:
   *                 vaultAccountId: "0"
   *                 index: 0
   *                 recipientAddress: "addr1qxy..."
   *                 tokenPolicyId: "policy123..."
   *                 tokenName: "4e49..."
   *                 requiredTokenAmount: 100
   *             vaultTransfer:
   *               summary: Transfer between vault accounts
   *               value:
   *                 vaultAccountId: "0"
   *                 index: 0
   *                 recipientVaultAccountId: "1"
   *                 recipientIndex: 0
   *                 tokenPolicyId: "policy123..."
   *                 tokenName: "4e49..."
   *                 requiredTokenAmount: 100
   *     responses:
   *       200:
   *         description: Transfer executed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 txHash:
   *                   type: string
   *                   description: The transaction hash
   *                 senderAddress:
   *                   type: string
   *                   description: The sender's address
   *                 tokenName:
   *                   type: string
   *                   description: The token name that was transferred
   *       400:
   *         description: Validation error (e.g., both or neither recipient options specified)
   *       404:
   *         description: Address not found for the specified vault account
   *       500:
   *         description: Internal server error
   */
  router.post("/transfers", apiController.transfer);

  /**
   * @swagger
   * /api/webhook:
   *   post:
   *     summary: Enrich webhook payload
   *     description: Enriches the incoming webhook payload with additional data, including CNT (Cardano Native Token) details.
   *     tags: [Webhooks]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: Webhook payload enriched successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *       500:
   *         description: Internal server error
   */
  router.post("/webhook", apiController.enrichWebhookPayload);
  router.post("/staking/register", apiController.registerStaking);

  router.post("/staking/delegate", apiController.delegateToPool);

  router.post("/staking/deregister", apiController.deregisterStaking);

  router.post("/staking/withdraw-rewards", apiController.withdrawRewards);

  router.get("/staking/rewards/:vaultAccountId", apiController.queryStakingRewards);

  router.post("/governance/delegate-drep", apiController.delegateToDRep);

  return router;
};
