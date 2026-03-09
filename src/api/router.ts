import { Router } from "express";
import { SdkManager } from "../pool/sdkManager.js";
import { ApiController } from "./controllers/controller.js";
import {
  validateRequest,
  validateParams,
  transferRequestSchema,
  feeEstimationRequestSchema,
  adaTransferRequestSchema,
  adaFeeEstimationRequestSchema,
  multiTokenTransferRequestSchema,
  multiTokenFeeEstimationRequestSchema,
  consolidateUtxosRequestSchema,
  registerAsDRepRequestSchema,
  castVoteRequestSchema,
  vaultAccountIdParamsSchema,
  credentialParamsSchema,
  hashParamsSchema,
  poolIdParamsSchema,
} from "./validation.js";

export const configureRouter = (sdkManager: SdkManager): Router => {
  const router: Router = Router();
  const apiController = new ApiController(sdkManager);

  /**
   * IAGON HEALTH CHECK
   */

  /**
   * @swagger
   * /api/services/iagon/health:
   *   get:
   *     summary: Check Iagon API health status
   *     description: Performs a health check on the Iagon API service to verify connectivity and availability
   *     tags: [Health]
   *     responses:
   *       200:
   *         description: Health check completed (check success field for actual status)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   description: Indicates if the Iagon API is healthy
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     status:
   *                       type: string
   *                       enum: [healthy, unhealthy]
   *                       description: Health status of the Iagon API
   *                       example: healthy
   *                     timestamp:
   *                       type: string
   *                       format: date-time
   *                       description: ISO 8601 timestamp of the health check
   *                       example: "2024-01-15T10:30:00.000Z"
   *       500:
   *         description: Health check failed
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: false
   *                 data:
   *                   type: object
   *                   properties:
   *                     status:
   *                       type: string
   *                       example: unhealthy
   *                     timestamp:
   *                       type: string
   *                       format: date-time
   */
  router.get("/services/iagon/health", apiController.getIagonHealth);

  /**
   * BALANCE
   */

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
   *       - in: query
   *         name: includeMetadata
   *         schema:
   *           type: boolean
   *           default: false
   *         description: Whether to enrich tokens with on-chain metadata (name, ticker, decimals, description, fingerprint)
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
    "/balance/address/:vaultAccountId",
    validateParams(vaultAccountIdParamsSchema),
    apiController.getBalanceByAddress
  );

  /**
   * @swagger
   * /api/balance/vault/{vaultAccountId}:
   *   get:
   *     summary: Get total balance for vault account
   *     description: Retrieves the aggregated balance for all addresses in a vault account. Supports multiple grouping options to view balances by token, address, or policy. Optionally enrich tokens with metadata (names, decimals, etc.).
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
   *       - in: query
   *         name: includeMetadata
   *         schema:
   *           type: boolean
   *           default: true
   *         description: |
   *           Whether to enrich tokens with on-chain metadata including:
   *           - Official token name
   *           - Ticker symbol
   *           - Decimals for proper formatting
   *           - Human-readable formatted amount
   *           - Description
   *           - Asset fingerprint
   *
   *           Set to `true` to include metadata. Note: This uses cached data (1-hour TTL) for performance.
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
   *                     totalLovelace:
   *                       type: string
   *                       description: Total balance in lovelace (1 ADA = 1,000,000 lovelace)
   *                   example:
   *                     balances:
   *                       - policyId: "policy1"
   *                         tokens:
   *                           token1: "100"
   *                           token2: "50"
   *                       - policyId: "policy2"
   *                         tokens:
   *                           nft1: "1"
   *                     totalLovelace: "1500000000"
   *       500:
   *         description: Internal server error
   */
  router.get(
    "/balance/vault/:vaultAccountId",
    validateParams(vaultAccountIdParamsSchema),
    apiController.getVaultBalance
  );

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
   *       - in: query
   *         name: includeMetadata
   *         schema:
   *           type: boolean
   *           default: false
   *         description: Whether to enrich tokens with on-chain metadata (name, ticker, decimals, description, fingerprint)
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
    validateParams(credentialParamsSchema),
    apiController.getBalanceByCredential
  );

  /**
   * @swagger
   * /api/balance/stake/{vaultAccountId}:
   *   get:
   *     summary: Get balance by stake key
   *     description: |
   *       Retrieves the balance for a vault account using the stake key.
   *       The stake key is automatically derived from the vault account's base address.
   *       Note: The stake key is shared across all addresses in the vault account.
   *     tags: [Balance]
   *     parameters:
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: The vault account ID
   *       - in: query
   *         name: groupByPolicy
   *         schema:
   *           type: boolean
   *           default: true
   *         description: Whether to group results by policy
   *       - in: query
   *         name: includeMetadata
   *         schema:
   *           type: boolean
   *           default: false
   *         description: Whether to enrich tokens with on-chain metadata (name, ticker, decimals, description, fingerprint)
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
    "/balance/stake/:vaultAccountId",
    validateParams(vaultAccountIdParamsSchema),
    apiController.getBalanceByStakeKey
  );

  /**
   * TRANSACTIONS
   */

  /**
   * @swagger
   * /api/tx/hash/{hash}:
   *   get:
   *     summary: Get transaction details by hash
   *     description: Retrieves detailed information about a specific transaction using its hash
   *     tags: [Transaction History]
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
  router.get(
    "/tx/hash/:hash",
    validateParams(hashParamsSchema),
    apiController.getTransactionDetails
  );

  /**
   * @swagger
   * /api/assets/{policyId}/{assetName}:
   *   get:
   *     summary: Get asset information
   *     description: Retrieve detailed information about a Cardano native token including metadata, decimals, and supply data
   *     tags: [Assets]
   *     parameters:
   *       - in: path
   *         name: policyId
   *         required: true
   *         schema:
   *           type: string
   *         description: The policy ID of the asset (hex string)
   *         example: f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a
   *       - in: path
   *         name: assetName
   *         required: true
   *         schema:
   *           type: string
   *         description: The asset name in hex format
   *         example: 4e4654
   *     responses:
   *       200:
   *         description: Asset information retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     policy_id:
   *                       type: string
   *                       description: Asset policy ID
   *                     asset_name:
   *                       type: string
   *                       description: Asset name (hex)
   *                     asset_name_ascii:
   *                       type: string
   *                       description: Asset name decoded to ASCII
   *                     fingerprint:
   *                       type: string
   *                       description: Asset fingerprint
   *                     total_supply:
   *                       type: string
   *                       description: Total supply of the asset
   *                     metadata:
   *                       type: object
   *                       nullable: true
   *                       properties:
   *                         name:
   *                           type: string
   *                           description: Human-readable token name
   *                         ticker:
   *                           type: string
   *                           description: Token ticker symbol
   *                         decimals:
   *                           type: number
   *                           description: Number of decimal places
   *                         description:
   *                           type: string
   *                           description: Token description
   *                         logo:
   *                           type: string
   *                           description: Logo URL or base64
   *       400:
   *         description: Invalid request parameters
   *       500:
   *         description: Internal server error
   */
  router.get("/assets/:policyId/:assetName", apiController.getAssetInfo);

  /**
   * @swagger
   * /api/utxos/{vaultAccountId}:
   *   get:
   *     summary: Get UTXOs by vault account address
   *     description: Retrieves unspent transaction outputs (UTXOs) for a vault account address. The network (mainnet/preprod) is determined by the server configuration.
   *     tags: [UTxOs]
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
  router.get(
    "/utxos/:vaultAccountId",
    validateParams(vaultAccountIdParamsSchema),
    apiController.getUtxosByAddress
  );

  /**
   * @swagger
   * /api/utxos/{vaultAccountId}/all:
   *   get:
   *     summary: Get UTXOs for all addresses in a vault account
   *     description: Retrieves all UTXOs across every address in the vault account, grouped by address. Useful for inspecting the full UTxO set when a vault has multiple addresses.
   *     tags: [UTxOs]
   *     parameters:
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: The vault account ID
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
   *                 data:
   *                   type: array
   *                   description: Addresses sorted by BIP44 index, each with their UTxOs
   *                   items:
   *                     type: object
   *                     properties:
   *                       index:
   *                         type: integer
   *                         description: BIP44 address index
   *                       address:
   *                         type: string
   *                         description: Bech32 Cardano address
   *                       utxos:
   *                         type: array
   *                         items:
   *                           type: object
   *                           properties:
   *                             transaction_id:
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
   *                             datum_hash:
   *                               type: string
   *                               nullable: true
   *                             script_hash:
   *                               type: string
   *                               nullable: true
   *                             created_at:
   *                               type: object
   *                               properties:
   *                                 slot_no:
   *                                   type: integer
   *                                 header_hash:
   *                                   type: string
   *       500:
   *         description: Internal server error
   */
  router.get(
    "/utxos/:vaultAccountId/all",
    validateParams(vaultAccountIdParamsSchema),
    apiController.getVaultUtxos
  );

  /**
   * @swagger
   * /api/tx/history/{vaultAccountId}/all:
   *   get:
   *     summary: Get transaction history for all addresses
   *     description: |
   *       Retrieves basic transaction history for all addresses in a vault account with pagination and filtering.
   *       When groupByAddress=false (default): Returns a flat array of transactions sorted by slot number (most recent first), with each transaction including an 'address' field. Duplicates are removed.
   *       When groupByAddress=true: Returns transactions grouped by address in a nested object structure.
   *     tags: [Transaction History]
   *     parameters:
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: The vault account ID
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
   *       - in: query
   *         name: groupByAddress
   *         schema:
   *           type: boolean
   *           default: false
   *         description: If true, groups transactions by address. If false (default), returns flat array with address field on each transaction.
   *     responses:
   *       200:
   *         description: Transaction history retrieved successfully for all addresses
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   description: Indicates if the request was successful
   *                 data:
   *                   oneOf:
   *                     - type: array
   *                       description: Flat array of transactions (when groupByAddress=false)
   *                       items:
   *                         type: object
   *                         properties:
   *                           tx_hash:
   *                             type: string
   *                             description: Transaction hash
   *                           block_hash:
   *                             type: string
   *                             description: Block hash where transaction was included
   *                           slot_no:
   *                             type: integer
   *                             description: Slot number
   *                           block_no:
   *                             type: integer
   *                             description: Block number
   *                           block_time:
   *                             type: string
   *                             description: Block timestamp
   *                           address:
   *                             type: string
   *                             description: The vault address this transaction belongs to
   *                     - type: object
   *                       description: Transactions grouped by address (when groupByAddress=true)
   *                       additionalProperties:
   *                         type: array
   *                         items:
   *                           type: object
   *                           properties:
   *                             tx_hash:
   *                               type: string
   *                             block_hash:
   *                               type: string
   *                             slot_no:
   *                               type: integer
   *                             block_no:
   *                               type: integer
   *                             block_time:
   *                               type: string
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
   *                       description: Total number of transactions across all addresses
   *                     hasMore:
   *                       type: boolean
   *                       description: Whether more results are available
   *                 last_updated:
   *                   type: object
   *                   description: Last update information (most recent across all addresses)
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
  router.get(
    "/tx/history/:vaultAccountId/all",
    validateParams(vaultAccountIdParamsSchema),
    apiController.getAllTransactionHistory
  );

  /**
   * @swagger
   * /api/tx/history/{vaultAccountId}:
   *   get:
   *     summary: Get transaction history
   *     description: Retrieves basic transaction history for a vault account address with pagination and filtering
   *     tags: [Transaction History]
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
  router.get(
    "/tx/history/:vaultAccountId",
    validateParams(vaultAccountIdParamsSchema),
    apiController.getTransactionHistory
  );

  /**
   * @swagger
   * /api/tx/address/{vaultAccountId}/all:
   *   get:
   *     summary: Get detailed transaction history for all addresses
   *     description: |
   *       Retrieves detailed transaction history for all addresses in a vault account with full input/output information, pagination, and filtering.
   *       When groupByAddress=false (default): Returns a flat array of transactions sorted by slot number (most recent first), with each transaction including an 'address' field. Duplicates are removed.
   *       When groupByAddress=true: Returns transactions grouped by address in a nested object structure.
   *     tags: [Transaction History]
   *     parameters:
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: The vault account ID
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
   *       - in: query
   *         name: groupByAddress
   *         schema:
   *           type: boolean
   *           default: false
   *         description: If true, groups transactions by address. If false (default), returns flat array with address field on each transaction.
   *     responses:
   *       200:
   *         description: Detailed transaction history retrieved successfully for all addresses
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   description: Indicates if the request was successful
   *                 data:
   *                   oneOf:
   *                     - type: array
   *                       description: Flat array of detailed transactions (when groupByAddress=false)
   *                       items:
   *                         type: object
   *                         properties:
   *                           tx_hash:
   *                             type: string
   *                             description: Transaction hash
   *                           block_hash:
   *                             type: string
   *                             description: Block hash where transaction was included
   *                           slot_no:
   *                             type: integer
   *                             description: Slot number
   *                           block_no:
   *                             type: integer
   *                             description: Block number
   *                           block_time:
   *                             type: string
   *                             description: Block timestamp
   *                           fee:
   *                             type: integer
   *                             description: Transaction fee in lovelace
   *                           size:
   *                             type: integer
   *                             description: Transaction size in bytes
   *                           address:
   *                             type: string
   *                             description: The vault address this transaction belongs to
   *                           inputs:
   *                             type: array
   *                             description: Transaction inputs
   *                             items:
   *                               type: object
   *                               properties:
   *                                 tx_hash:
   *                                   type: string
   *                                 output_index:
   *                                   type: integer
   *                                 address:
   *                                   type: string
   *                                 value:
   *                                   type: object
   *                                   properties:
   *                                     lovelace:
   *                                       type: integer
   *                                     assets:
   *                                       type: object
   *                                       additionalProperties:
   *                                         type: integer
   *                           outputs:
   *                             type: array
   *                             description: Transaction outputs
   *                             items:
   *                               type: object
   *                               properties:
   *                                 output_index:
   *                                   type: integer
   *                                 address:
   *                                   type: string
   *                                 value:
   *                                   type: object
   *                                   properties:
   *                                     lovelace:
   *                                       type: integer
   *                                     assets:
   *                                       type: object
   *                                       additionalProperties:
   *                                         type: integer
   *                     - type: object
   *                       description: Transactions grouped by address (when groupByAddress=true)
   *                       additionalProperties:
   *                         type: array
   *                         items:
   *                           type: object
   *                           properties:
   *                             tx_hash:
   *                               type: string
   *                             block_hash:
   *                               type: string
   *                             slot_no:
   *                               type: integer
   *                             block_no:
   *                               type: integer
   *                             block_time:
   *                               type: string
   *                             fee:
   *                               type: integer
   *                             size:
   *                               type: integer
   *                             inputs:
   *                               type: array
   *                               items:
   *                                 type: object
   *                             outputs:
   *                               type: array
   *                               items:
   *                                 type: object
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
   *                       description: Total number of transactions across all addresses
   *                     hasMore:
   *                       type: boolean
   *                       description: Whether more results are available
   *                 last_updated:
   *                   type: object
   *                   description: Last update information (most recent across all addresses)
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
  router.get(
    "/tx/address/:vaultAccountId/all",
    validateParams(vaultAccountIdParamsSchema),
    apiController.getAllDetailedTxHistory
  );

  /**
   * @swagger
   * /api/tx/address/{vaultAccountId}:
   *   get:
   *     summary: Get detailed transaction history
   *     description: Retrieves detailed transaction history for a vault account address with full input/output information, pagination, and filtering
   *     tags: [Transaction History]
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
  router.get(
    "/tx/address/:vaultAccountId",
    validateParams(vaultAccountIdParamsSchema),
    apiController.getDetailedTxHistory
  );

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
   *     tags: [Transfers]
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
   *                   example: "a1b2c3d4e5f6..."
   *                 senderAddress:
   *                   type: string
   *                   description: The sender's address
   *                   example: "addr1qxy..."
   *                 tokenPolicyId:
   *                   type: string
   *                   description: The policy ID of the token that was transferred
   *                   example: "0691b2f..."
   *                 tokenName:
   *                   type: string
   *                   description: The token name that was transferred (hex format)
   *                   example: "4e494..."
   *                 amount:
   *                   type: number
   *                   description: The amount of tokens that were transferred
   *                   example: 100000
   *                 fee:
   *                   type: object
   *                   description: Transaction fee information
   *                   properties:
   *                     lovelace:
   *                       type: string
   *                       description: Fee in lovelace (smallest ADA unit)
   *                       example: "170000"
   *                     ada:
   *                       type: string
   *                       description: Fee in ADA (human-readable, 6 decimal places)
   *                       example: "0.170000"
   *       400:
   *         description: Validation error (e.g., both or neither recipient options specified)
   *       404:
   *         description: Address not found for the specified vault account
   *       500:
   *         description: Internal server error
   */
  router.post("/transfers", validateRequest(transferRequestSchema), apiController.transfer);

  /**
   * @swagger
   * /api/fee-estimate:
   *   post:
   *     summary: Estimate transaction fee
   *     description: |
   *       Estimates the transaction fee for a token transfer WITHOUT creating or signing the transaction.
   *       This is useful for displaying estimated fees to users in a confirmation modal before executing the actual transfer.
   *
   *       Two transfer modes are supported:
   *       1. **Vault-to-address transfer**: Specify `recipientAddress` to estimate fee for sending tokens to a specific Cardano address
   *       2. **Vault-to-vault transfer**: Specify `recipientVaultAccountId` (and optionally `recipientIndex`) to estimate fee for transfers between vault accounts
   *
   *       **Note**: You must provide exactly one of `recipientAddress` or `recipientVaultAccountId`, not both.
   *
   *       **Gross Amount**: When `grossAmount: true`, the fee is deducted from the amount being sent (recipient receives less).
   *       When `grossAmount: false` (default), the fee is added to the total cost (recipient receives full amount).
   *     tags: [Transfers]
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
   *                 description: The recipient Cardano address (use this OR recipientVaultAccountId)
   *               recipientVaultAccountId:
   *                 type: string
   *                 description: The recipient vault account ID for vault-to-vault transfers (use this OR recipientAddress)
   *               recipientIndex:
   *                 type: number
   *                 description: Recipient address index when using recipientVaultAccountId (optional, defaults to 0)
   *               tokenPolicyId:
   *                 type: string
   *                 description: The policy ID of the token to transfer (hex format)
   *               tokenName:
   *                 type: string
   *                 description: The token name (hex format)
   *               requiredTokenAmount:
   *                 type: number
   *                 description: The amount of tokens to transfer
   *               grossAmount:
   *                 type: boolean
   *                 description: If true, fee is deducted from the amount being sent (optional, defaults to false)
   *           examples:
   *             addressTransfer:
   *               summary: Estimate fee for transfer to specific address
   *               value:
   *                 vaultAccountId: "0"
   *                 index: 0
   *                 recipientAddress: "addr1qxy..."
   *                 tokenPolicyId: "policy123..."
   *                 tokenName: "4e49..."
   *                 requiredTokenAmount: 100
   *                 grossAmount: false
   *             vaultTransfer:
   *               summary: Estimate fee for vault-to-vault transfer
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
   *         description: Fee estimation completed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 fee:
   *                   type: object
   *                   description: Transaction fee details
   *                   properties:
   *                     ada:
   *                       type: string
   *                       description: Fee in ADA (human-readable)
   *                       example: "0.170000"
   *                     lovelace:
   *                       type: string
   *                       description: Fee in lovelace (base units)
   *                       example: "170000"
   *                 minAdaRequired:
   *                   type: object
   *                   description: Minimum ADA required in output UTXO for CNT transfers
   *                   properties:
   *                     ada:
   *                       type: string
   *                       description: Minimum ADA in human-readable format
   *                       example: "1.000000"
   *                     lovelace:
   *                       type: string
   *                       description: Minimum ADA in lovelace
   *                       example: "1000000"
   *                 totalCost:
   *                   type: object
   *                   description: Total cost including fee (when grossAmount=false)
   *                   properties:
   *                     ada:
   *                       type: string
   *                       description: Total in ADA
   *                       example: "1.170000"
   *                     lovelace:
   *                       type: string
   *                       description: Total in lovelace
   *                       example: "1170000"
   *                 recipientReceives:
   *                   type: object
   *                   description: What the recipient will actually receive
   *                   properties:
   *                     amount:
   *                       type: string
   *                       description: Token amount recipient receives (in base units)
   *                       example: "100"
   *                     ada:
   *                       type: string
   *                       description: ADA amount recipient receives
   *                       example: "1.000000"
   *       400:
   *         description: Validation error (e.g., both or neither recipient options specified)
   *       404:
   *         description: Address not found for the specified vault account
   *       500:
   *         description: Internal server error
   */
  router.post(
    "/fee-estimate",
    validateRequest(feeEstimationRequestSchema),
    apiController.estimateFee
  );

  /**
   * @swagger
   * /api/transfers/ada:
   *   post:
   *     summary: Transfer native ADA
   *     description: |
   *       Transfers native ADA from a Fireblocks vault account to a recipient address or vault.
   *
   *       **UTXO Selection Strategy:**
   *       ADA-only UTxOs are consumed first to avoid touching native tokens.
   *       Multi-asset UTxOs are only selected if ADA-only UTxOs are insufficient.
   *
   *       **Token Preservation:**
   *       When multi-asset UTxOs are consumed, ALL their tokens are returned to the sender
   *       in the change output (Cardano protocol requirement — tokens cannot be dropped).
   *       The `tokensPresentedInChange` field in the response lists affected policy IDs.
   *     tags: [Transfers]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [vaultAccountId, lovelaceAmount]
   *             properties:
   *               vaultAccountId:
   *                 type: string
   *                 description: Sender Fireblocks vault account ID
   *               lovelaceAmount:
   *                 type: integer
   *                 minimum: 1000000
   *                 description: Amount to send in lovelace (1 ADA = 1,000,000 lovelace)
   *                 example: 5000000
   *               recipientAddress:
   *                 type: string
   *                 description: Recipient bech32 Cardano address (mutually exclusive with recipientVaultAccountId)
   *               recipientVaultAccountId:
   *                 type: string
   *                 description: Recipient Fireblocks vault account ID (mutually exclusive with recipientAddress)
   *               recipientIndex:
   *                 type: integer
   *                 default: 0
   *                 description: Address index on the recipient vault account
   *               index:
   *                 type: integer
   *                 default: 0
   *                 description: Address index on the sender vault account
   *     responses:
   *       200:
   *         description: ADA transfer executed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 txHash:
   *                   type: string
   *                   description: Submitted transaction hash
   *                 senderAddress:
   *                   type: string
   *                 recipientAddress:
   *                   type: string
   *                 lovelaceAmount:
   *                   type: integer
   *                 fee:
   *                   type: object
   *                   properties:
   *                     lovelace:
   *                       type: string
   *                     ada:
   *                       type: string
   *                 tokensPresentedInChange:
   *                   type: array
   *                   items:
   *                     type: string
   *                   description: Policy IDs of tokens returned to sender in change (only present when token UTxOs were consumed)
   *       400:
   *         description: Validation error or insufficient ADA balance
   *       404:
   *         description: Recipient vault account address not found
   *       500:
   *         description: Internal server error
   */
  router.post(
    "/transfers/ada",
    validateRequest(adaTransferRequestSchema),
    apiController.transferAda
  );

  /**
   * @swagger
   * /api/fee-estimate/ada:
   *   post:
   *     summary: Estimate fee for a native ADA transfer
   *     description: |
   *       Dry-runs the full ADA transaction pipeline (UTXO selection, output construction,
   *       iterative fee convergence) without signing or submitting. Returns an accurate fee
   *       breakdown. Use this to display estimated costs to users before they confirm.
   *
   *       When selected UTxOs contain native tokens, a `tokenChangeWarning` is included
   *       in the response to inform the caller that tokens will appear in the change output.
   *     tags: [Transfers]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [vaultAccountId, lovelaceAmount]
   *             properties:
   *               vaultAccountId:
   *                 type: string
   *               lovelaceAmount:
   *                 type: integer
   *                 minimum: 1000000
   *                 example: 5000000
   *               recipientAddress:
   *                 type: string
   *               recipientVaultAccountId:
   *                 type: string
   *               recipientIndex:
   *                 type: integer
   *                 default: 0
   *               index:
   *                 type: integer
   *                 default: 0
   *               grossAmount:
   *                 type: boolean
   *                 default: false
   *                 description: If true, fee is deducted from lovelaceAmount (recipient receives less)
   *     responses:
   *       200:
   *         description: Fee estimation successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 fee:
   *                   type: object
   *                   properties:
   *                     ada:
   *                       type: string
   *                       example: "0.174165"
   *                     lovelace:
   *                       type: string
   *                       example: "174165"
   *                 recipientReceives:
   *                   type: object
   *                   properties:
   *                     ada:
   *                       type: string
   *                     lovelace:
   *                       type: string
   *                 totalCost:
   *                   type: object
   *                   properties:
   *                     ada:
   *                       type: string
   *                     lovelace:
   *                       type: string
   *                 tokenChangeWarning:
   *                   type: object
   *                   nullable: true
   *                   description: Present only when token UTxOs are consumed by this transfer
   *                   properties:
   *                     policiesAffected:
   *                       type: integer
   *                     message:
   *                       type: string
   *       400:
   *         description: Validation error or insufficient ADA balance
   *       500:
   *         description: Internal server error
   */
  router.post(
    "/fee-estimate/ada",
    validateRequest(adaFeeEstimationRequestSchema),
    apiController.estimateAdaFee
  );

  /**
   * @swagger
   * /api/transfers/tokens:
   *   post:
   *     summary: Transfer multiple Cardano native tokens in a single transaction
   *     description: |
   *       Sends one or more CNTs to a recipient in a single Cardano transaction.
   *       All specified tokens are bundled into one recipient output.
   *
   *       If consumed UTxOs carry tokens not listed in `tokens`, those tokens are
   *       automatically returned to the sender in the change output — no tokens are lost.
   *
   *       The `tokensPresentedInChange` field in the response lists any extra policy IDs
   *       that ended up in the change output.
   *     tags:
   *       - Transfers
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - vaultAccountId
   *               - tokens
   *             properties:
   *               vaultAccountId:
   *                 type: string
   *                 description: Fireblocks vault account ID of the sender
   *               tokens:
   *                 type: array
   *                 minItems: 1
   *                 items:
   *                   type: object
   *                   required: [tokenPolicyId, tokenName, amount]
   *                   properties:
   *                     tokenPolicyId:
   *                       type: string
   *                       description: Token policy ID (hex)
   *                     tokenName:
   *                       type: string
   *                       description: Token name (hex)
   *                     amount:
   *                       type: integer
   *                       description: Amount to transfer in base units
   *               recipientAddress:
   *                 type: string
   *                 description: Recipient bech32 Cardano address (mutually exclusive with recipientVaultAccountId)
   *               recipientVaultAccountId:
   *                 type: string
   *                 description: Recipient Fireblocks vault account ID (mutually exclusive with recipientAddress)
   *               recipientIndex:
   *                 type: integer
   *                 description: Address index on the recipient vault (default 0)
   *               index:
   *                 type: integer
   *                 description: Address index on the sender vault (default 0)
   *               lovelaceAmount:
   *                 type: integer
   *                 minimum: 1000000
   *                 description: |
   *                   Explicit ADA amount (in lovelace) to include in the recipient output alongside the tokens.
   *                   Defaults to the protocol minimum for the number of token policies. Use this to send
   *                   ADA together with tokens in a single transaction (e.g. 5000000 = 5 ADA + all listed tokens).
   *     responses:
   *       200:
   *         description: Transfer successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 txHash:
   *                   type: string
   *                 senderAddress:
   *                   type: string
   *                 recipientAddress:
   *                   type: string
   *                 tokens:
   *                   type: array
   *                 fee:
   *                   type: object
   *                   properties:
   *                     lovelace:
   *                       type: string
   *                     ada:
   *                       type: string
   *                 tokensPresentedInChange:
   *                   type: array
   *                   items:
   *                     type: string
   *                   description: Policy IDs of tokens returned to sender in change (only when extra token UTxOs were consumed)
   *       400:
   *         description: Validation error or insufficient balance
   *       500:
   *         description: Internal server error
   */
  router.post(
    "/transfers/tokens",
    validateRequest(multiTokenTransferRequestSchema),
    apiController.transferMultipleTokens
  );

  /**
   * @swagger
   * /api/fee-estimate/tokens:
   *   post:
   *     summary: Estimate fee for a multi-token transfer
   *     description: |
   *       Dry-runs the full multi-token transaction pipeline and returns the fee breakdown.
   *       Does not sign or submit anything.
   *
   *       The `tokenChangeWarning` field is included when the selected UTxOs carry additional
   *       tokens not listed in `tokens` — those tokens will appear in the change output.
   *     tags:
   *       - Transfers
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - vaultAccountId
   *               - tokens
   *             properties:
   *               vaultAccountId:
   *                 type: string
   *               tokens:
   *                 type: array
   *                 minItems: 1
   *                 items:
   *                   type: object
   *                   required: [tokenPolicyId, tokenName, amount]
   *                   properties:
   *                     tokenPolicyId:
   *                       type: string
   *                     tokenName:
   *                       type: string
   *                     amount:
   *                       type: integer
   *               recipientAddress:
   *                 type: string
   *               recipientVaultAccountId:
   *                 type: string
   *               lovelaceAmount:
   *                 type: integer
   *                 minimum: 1000000
   *                 description: Explicit ADA amount (in lovelace) to bundle with tokens in the recipient output
   *               grossAmount:
   *                 type: boolean
   *                 description: If true, fee is considered included in the amounts being sent
   *     responses:
   *       200:
   *         description: Fee estimation result
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 fee:
   *                   type: object
   *                   properties:
   *                     ada:
   *                       type: string
   *                     lovelace:
   *                       type: string
   *                 minAdaRequired:
   *                   type: object
   *                   properties:
   *                     ada:
   *                       type: string
   *                     lovelace:
   *                       type: string
   *                 totalCost:
   *                   type: object
   *                   properties:
   *                     ada:
   *                       type: string
   *                     lovelace:
   *                       type: string
   *                 tokenChangeWarning:
   *                   type: object
   *                   description: Present when extra-token UTxOs are consumed
   *                   properties:
   *                     policiesAffected:
   *                       type: integer
   *                     message:
   *                       type: string
   *       400:
   *         description: Validation error or insufficient balance
   *       500:
   *         description: Internal server error
   */
  router.post(
    "/fee-estimate/tokens",
    validateRequest(multiTokenFeeEstimationRequestSchema),
    apiController.estimateMultiTokenFee
  );

  /**
   * @swagger
   * /api/utxos/consolidate:
   *   post:
   *     summary: Consolidate all UTxOs at an address into a single UTxO
   *     description: |
   *       Sweeps all UTxOs at the specified address index into a single output back to the sender.
   *       All ADA and all native tokens are preserved — nothing is lost.
   *
   *       Useful for combating UTxO fragmentation after many incoming transfers.
   *       Fails if the address has fewer UTxOs than `minUtxoCount` (default: 2).
   *     tags:
   *       - UTxOs
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - vaultAccountId
   *             properties:
   *               vaultAccountId:
   *                 type: string
   *                 description: Fireblocks vault account ID
   *               index:
   *                 type: integer
   *                 description: Address index to consolidate (default 0)
   *               minUtxoCount:
   *                 type: integer
   *                 minimum: 2
   *                 description: Minimum UTxO count required to proceed (default 2)
   *     responses:
   *       200:
   *         description: Consolidation successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 txHash:
   *                   type: string
   *                 address:
   *                   type: string
   *                 utxosCombined:
   *                   type: integer
   *                   description: Number of UTxOs merged into the consolidated output
   *                 lovelace:
   *                   type: string
   *                   description: ADA in the consolidated output (after fee)
   *                 fee:
   *                   type: object
   *                   properties:
   *                     lovelace:
   *                       type: string
   *                     ada:
   *                       type: string
   *                 tokenPolicies:
   *                   type: array
   *                   items:
   *                     type: string
   *                   description: Distinct token policy IDs present in the consolidated output
   *       400:
   *         description: Fewer UTxOs than minUtxoCount, or validation error
   *       500:
   *         description: Internal server error
   */
  router.post(
    "/utxos/consolidate",
    validateRequest(consolidateUtxosRequestSchema),
    apiController.consolidateUtxos
  );

  /**
   * WEBHOOK
   */

  /**
   * @swagger
   * /api/webhook:
   *   post:
   *     summary: Enrich webhook payload with signature verification
   *     description: |
   *       Enriches the incoming Fireblocks webhook payload with additional data, including CNT (Cardano Native Token) details.
   *
   *       **Security:** This endpoint verifies webhook signatures using either:
   *       - JWKS (JSON Web Key Set) - Modern method with automatic key rotation
   *       - Legacy RSA-SHA512 - Static public key verification (being phased out)
   *
   *       **Headers Required for Verification:**
   *       - `fireblocks-webhook-signature`: JWT signature (JWKS method)
   *       - `fireblocks-signature`: Legacy signature (fallback method)
   *
   *       **Environment:** The webhook environment (US, EU, EU2, SANDBOX) is automatically determined from the
   *       `FIREBLOCKS_BASE_PATH` configuration. Ensure your server configuration matches your Fireblocks workspace.
   *
   *       If signature verification fails, the request is rejected with a 401 error.
   *     tags: [Webhooks]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: Fireblocks webhook payload (JSON)
   *     responses:
   *       200:
   *         description: Webhook payload enriched successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *       401:
   *         description: Webhook signature verification failed
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: false
   *                 error:
   *                   type: string
   *                   example: "Webhook signature verification failed"
   *       500:
   *         description: Internal server error
   */
  router.post("/webhook", apiController.enrichWebhookPayload);
  /**
   * STAKING
   */

  /**
   * @swagger
   * /api/staking/accounts/{vaultAccountId}:
   *   get:
   *     summary: Get stake account information
   *     description: Retrieves comprehensive staking information for a vault account including registration status, delegation details, rewards, and withdrawals
   *     tags: [Staking]
   *     parameters:
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: The vault account ID
   *     responses:
   *       200:
   *         description: Stake account information retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     stakeAddress:
   *                       type: string
   *                       description: The stake address in bech32 format
   *                       example: stake1u9r76ypf5fskppa0cmttas05cgcswrttn6jrq4yd7jpdnvc7gt0yc
   *                     active:
   *                       type: boolean
   *                       description: Whether the stake address is currently registered and active
   *                     activeEpoch:
   *                       type: integer
   *                       nullable: true
   *                       description: The epoch when the stake address became active (null if not active)
   *                       example: 450
   *                     controlledAmount:
   *                       type: string
   *                       description: Total amount of ADA controlled by this stake address in Lovelace
   *                       example: "5000000000"
   *                     rewardsSum:
   *                       type: string
   *                       description: Sum of all rewards earned in Lovelace
   *                       example: "1500000"
   *                     withdrawalsSum:
   *                       type: string
   *                       description: Sum of all rewards withdrawn in Lovelace
   *                       example: "500000"
   *                     reservesSum:
   *                       type: string
   *                       description: Sum from reserves in Lovelace
   *                       example: "0"
   *                     treasurySum:
   *                       type: string
   *                       description: Sum from treasury in Lovelace
   *                       example: "0"
   *                     withdrawableAmount:
   *                       type: string
   *                       description: Currently available rewards that can be withdrawn in Lovelace
   *                       example: "1000000"
   *                     poolId:
   *                       type: string
   *                       nullable: true
   *                       description: Pool ID to which this stake address is currently delegated (null if not delegated)
   *                       example: pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy
   *       400:
   *         description: Bad request - vaultAccountId is required
   *       500:
   *         description: Internal server error
   */
  router.get(
    "/staking/accounts/:vaultAccountId",
    validateParams(vaultAccountIdParamsSchema),
    apiController.getStakeAccountInfo
  );

  /**
   * @swagger
   * /api/staking/rewards/{vaultAccountId}:
   *   get:
   *     summary: Query staking rewards
   *     description: Retrieves staking rewards information for a vault account including available rewards, total earned, and withdrawal history
   *     tags: [Staking]
   *     parameters:
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: The vault account ID
   *     responses:
   *       200:
   *         description: Rewards information retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 rewards:
   *                   type: array
   *                   description: Historical reward entries by epoch
   *                   items:
   *                     type: object
   *                     properties:
   *                       poolId:
   *                         type: string
   *                         description: Pool ID that generated the reward
   *                       amount:
   *                         type: string
   *                         description: Reward amount in Lovelace
   *                       epoch:
   *                         type: integer
   *                         description: Epoch number when reward was earned
   *                 availableRewards:
   *                   type: integer
   *                   description: Currently available rewards to withdraw in Lovelace
   *                 totalRewards:
   *                   type: integer
   *                   description: Total rewards earned in Lovelace
   *                 totalWithdrawals:
   *                   type: integer
   *                   description: Total amount withdrawn in Lovelace
   *       500:
   *         description: Internal server error
   */
  router.get(
    "/staking/rewards/:vaultAccountId",
    validateParams(vaultAccountIdParamsSchema),
    apiController.queryStakingRewards
  );

  /**
   * @swagger
   * /api/staking/stake-address/{vaultAccountId}:
   *   get:
   *     summary: Get stake address for a vault account
   *     description: Extracts the BASE address from the vault account and derives the stake address in bech32 format. The stake address is used to identify staking credentials and query staking-related information.
   *     tags: [Staking]
   *     parameters:
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: The vault account ID
   *     responses:
   *       200:
   *         description: Stake address retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     stakeAddress:
   *                       type: string
   *                       description: The stake address in bech32 format (stake1... or stake_test1...)
   *                       example: stake1u9r76ypf5fskppa0cmttas05cgcswrttn6jrq4yd7jpdnvc7gt0yc
   *       400:
   *         description: Bad request - vaultAccountId is required
   *       404:
   *         description: No BASE address found for vault account
   *       500:
   *         description: Internal server error
   */
  router.get(
    "/staking/stake-address/:vaultAccountId",
    validateParams(vaultAccountIdParamsSchema),
    apiController.getStakeAddress
  );

  /**
   * @swagger
   * /api/staking/register:
   *   post:
   *     summary: Register staking credential
   *     description: Registers a staking credential for a vault account, allowing it to participate in staking. Requires a 2 ADA deposit.
   *     tags: [Staking]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - vaultAccountId
   *             properties:
   *               vaultAccountId:
   *                 type: string
   *                 default: "0"
   *                 description: The vault account ID to register for staking
   *     responses:
   *       200:
   *         description: Staking credential registered successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 txHash:
   *                   type: string
   *                   description: Transaction hash
   *                 status:
   *                   type: string
   *                   description: Transaction status
   *                 operation:
   *                   type: string
   *                   description: Operation type (register)
   *       500:
   *         description: Internal server error
   */
  router.post("/staking/register", apiController.registerStaking);

  /**
   * @swagger
   * /api/staking/deregister:
   *   post:
   *     summary: Deregister staking credential
   *     description: Deregisters a staking credential and withdraws all available rewards. Returns the 2 ADA deposit.
   *     tags: [Staking]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - vaultAccountId
   *             properties:
   *               vaultAccountId:
   *                 type: string
   *                 default: "0"
   *                 description: The vault account ID to register for staking
   *     responses:
   *       200:
   *         description: Deregistration transaction submitted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 txHash:
   *                   type: string
   *                   description: Transaction hash
   *                 status:
   *                   type: string
   *                   description: Transaction status
   *                 operation:
   *                   type: string
   *                   description: Operation type (deregister)
   *       500:
   *         description: Internal server error
   */
  router.post("/staking/deregister", apiController.deregisterStaking);

  /**
   * @swagger
   * /api/staking/delegate:
   *   post:
   *     summary: Delegate to a stake pool
   *     description: Delegates staking power to a specific stake pool. The stake key must be registered first.
   *     tags: [Staking]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - vaultAccountId
   *               - poolId
   *             properties:
   *               vaultAccountId:
   *                 type: string
   *                 description: The vault account ID to delegate
   *               poolId:
   *                 type: string
   *                 description: Pool key hash in hex format
   *     responses:
   *       200:
   *         description: Delegation transaction submitted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 txHash:
   *                   type: string
   *                   description: Transaction hash
   *                 status:
   *                   type: string
   *                   description: Transaction status
   *                 operation:
   *                   type: string
   *                   description: Operation type (delegate)
   *       500:
   *         description: Internal server error
   */
  router.post("/staking/delegate", apiController.delegateToPool);

  /**
   * @swagger
   * /api/staking/withdraw-rewards:
   *   post:
   *     summary: Withdraw staking rewards
   *     description: Withdraws available staking rewards to the vault account
   *     tags: [Staking]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - vaultAccountId
   *             properties:
   *               vaultAccountId:
   *                 type: string
   *                 description: The vault account ID to withdraw rewards for
   *               limit:
   *                 type: integer
   *                 description: Maximum amount to withdraw in Lovelace (optional, withdraws all if not specified)
   *     responses:
   *       200:
   *         description: Reward withdrawal transaction submitted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 txHash:
   *                   type: string
   *                   description: Transaction hash
   *                 status:
   *                   type: string
   *                   description: Transaction status
   *                 operation:
   *                   type: string
   *                   description: Operation type (withdraw-rewards)
   *       500:
   *         description: Internal server error
   */
  router.post("/staking/withdraw-rewards", apiController.withdrawRewards);

  /**
   * @swagger
   * /api/governance/delegate-drep:
   *   post:
   *     summary: Delegate voting power to a DRep
   *     description: |
   *       Delegates voting power to a Delegated Representative (DRep) for Cardano governance (Conway era).
   *
   *       **DRep Actions:**
   *       - `always-abstain`: Automatically abstain from all governance votes. Your stake counts toward quorum but doesn't vote yes/no.
   *       - `always-no-confidence`: Automatically vote "no confidence" on all governance proposals. Signals distrust in current governance.
   *       - `custom-drep`: Delegate to a specific DRep who will vote on your behalf. Requires `drepId` parameter.
   *
   *       **Note:** Stake must be registered before delegating voting power.
   *     tags: [Staking]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - vaultAccountId
   *               - drepAction
   *             properties:
   *               vaultAccountId:
   *                 type: string
   *                 description: The vault account ID to delegate voting power
   *                 example: "12"
   *               drepAction:
   *                 type: string
   *                 enum: [always-abstain, always-no-confidence, custom-drep]
   *                 description: |
   *                   Type of DRep delegation:
   *                   - `always-abstain` - Abstain from all votes
   *                   - `always-no-confidence` - Vote no confidence on all proposals
   *                   - `custom-drep` - Delegate to specific DRep (requires drepId)
   *                 example: "always-abstain"
   *               drepId:
   *                 type: string
   *                 description: DRep ID in bech32 (drep1...) or hex format (required only if drepAction is 'custom-drep')
   *                 example: "drep1yyv2m4xyz..."
   *           examples:
   *             always-abstain:
   *               summary: Abstain from all governance votes
   *               value:
   *                 vaultAccountId: "12"
   *                 drepAction: "always-abstain"
   *             always-no-confidence:
   *               summary: Vote no-confidence on all proposals
   *               value:
   *                 vaultAccountId: "12"
   *                 drepAction: "always-no-confidence"
   *             custom-drep:
   *               summary: Delegate to a specific DRep
   *               value:
   *                 vaultAccountId: "12"
   *                 drepAction: "custom-drep"
   *                 drepId: "drep1yyv2m4xyzabc..."
   *     responses:
   *       200:
   *         description: DRep delegation transaction submitted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 txHash:
   *                   type: string
   *                   description: Transaction hash
   *                   example: "a1b2c3d4..."
   *                 status:
   *                   type: string
   *                   description: Transaction status
   *                   example: "submitted"
   *                 operation:
   *                   type: string
   *                   description: Operation type
   *                   example: "vote-delegate"
   *       400:
   *         description: Bad request - Invalid parameters or stake not registered
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 error:
   *                   type: string
   *                   example: "Stake credential must be registered before DRep delegation"
   *       500:
   *         description: Internal server error
   */
  router.post("/governance/delegate-drep", apiController.delegateToDRep);

  /**
   * @swagger
   * /api/governance/register-drep:
   *   post:
   *     summary: Register vault account as a DRep
   *     description: |
   *       Submits a Conway-era `reg_drep_cert` certificate to register the vault's stake
   *       credential as a Delegated Representative (DRep) on Cardano.
   *
   *       **Requirements:**
   *       - The vault must have a pure-ADA UTxO of at least 501 ADA (500 ADA deposit + fee).
   *       - The stake key does NOT need to be registered first.
   *
   *       **Anchor (optional):** Provide a publicly accessible URL to a JSON metadata document
   *       and the blake2b-256 hex hash of that document. This helps voters identify your DRep.
   *
   *       **Deposit:** 500 ADA (500,000,000 lovelace) — refundable upon DRep deregistration.
   *     tags: [Governance]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - vaultAccountId
   *             properties:
   *               vaultAccountId:
   *                 type: string
   *                 description: Fireblocks vault account ID
   *                 example: "0"
   *               anchor:
   *                 type: object
   *                 description: Optional DRep metadata anchor
   *                 required:
   *                   - url
   *                   - dataHash
   *                 properties:
   *                   url:
   *                     type: string
   *                     description: Public URL of the DRep metadata JSON document
   *                     example: "https://example.com/drep-metadata.json"
   *                   dataHash:
   *                     type: string
   *                     description: Blake2b-256 hex hash (64 chars) of the metadata document
   *                     example: "abcd1234...ef567890"
   *               depositAmount:
   *                 type: integer
   *                 description: Deposit in lovelace (default 500,000,000 = 500 ADA)
   *                 example: 500000000
   *               fee:
   *                 type: integer
   *                 description: Transaction fee in lovelace (default 1,000,000 = 1 ADA)
   *                 example: 1000000
   *     responses:
   *       200:
   *         description: DRep registration transaction submitted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: object
   *                   properties:
   *                     txHash:
   *                       type: string
   *                       description: Transaction hash
   *                     status:
   *                       type: string
   *                       example: "submitted"
   *                     operation:
   *                       type: string
   *                       example: "register-drep"
   *                     drepId:
   *                       type: string
   *                       description: Bech32 DRep ID (drep1...)
   *                     addressIndex:
   *                       type: integer
   *       400:
   *         description: Validation error
   *       500:
   *         description: Internal server error
   */
  router.post(
    "/governance/register-drep",
    validateRequest(registerAsDRepRequestSchema),
    apiController.registerAsDRep
  );

  /**
   * @swagger
   * /api/governance/vote:
   *   post:
   *     summary: Cast a governance vote as a DRep
   *     description: |
   *       Submits a Conway-era `voting_procedures` transaction allowing a registered DRep
   *       to vote on a specific governance action (Yes, No, or Abstain).
   *
   *       **Requirements:**
   *       - The vault must be registered as a DRep (via `POST /api/governance/register-drep`).
   *       - The vault must have a pure-ADA UTxO sufficient to cover the transaction fee (~1 ADA).
   *
   *       **Governance Action ID:** A governance action is identified by the transaction hash
   *       and index of the proposal transaction on-chain.
   *
   *       **Anchor (optional):** A URL and blake2b-256 hash of a rationale document explaining
   *       the vote.
   *     tags: [Governance]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - vaultAccountId
   *               - governanceActionId
   *               - vote
   *             properties:
   *               vaultAccountId:
   *                 type: string
   *                 description: Fireblocks vault account ID
   *                 example: "0"
   *               governanceActionId:
   *                 type: object
   *                 required:
   *                   - txHash
   *                   - index
   *                 properties:
   *                   txHash:
   *                     type: string
   *                     description: Transaction hash (hex, 64 chars) of the governance action proposal
   *                     example: "abcd1234...ef567890"
   *                   index:
   *                     type: integer
   *                     description: Index of the governance action in that transaction
   *                     example: 0
   *               vote:
   *                 type: string
   *                 enum: [yes, no, abstain]
   *                 description: Vote choice
   *                 example: "yes"
   *               anchor:
   *                 type: object
   *                 description: Optional vote rationale anchor
   *                 required:
   *                   - url
   *                   - dataHash
   *                 properties:
   *                   url:
   *                     type: string
   *                     description: Public URL of the vote rationale document
   *                   dataHash:
   *                     type: string
   *                     description: Blake2b-256 hex hash (64 chars) of the rationale document
   *               fee:
   *                 type: integer
   *                 description: Transaction fee in lovelace (default 1,000,000 = 1 ADA)
   *                 example: 1000000
   *     responses:
   *       200:
   *         description: Vote transaction submitted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: object
   *                   properties:
   *                     txHash:
   *                       type: string
   *                     status:
   *                       type: string
   *                       example: "submitted"
   *                     operation:
   *                       type: string
   *                       example: "cast-vote"
   *                     vote:
   *                       type: string
   *                       example: "yes"
   *                     governanceActionId:
   *                       type: object
   *                       properties:
   *                         txHash:
   *                           type: string
   *                         index:
   *                           type: integer
   *       400:
   *         description: Validation error
   *       500:
   *         description: Internal server error
   */
  router.post(
    "/governance/vote",
    validateRequest(castVoteRequestSchema),
    apiController.castGovernanceVote
  );

  /**
   * NETWORK
   */

  /**
   * @swagger
   * /api/epochs:
   *   get:
   *     summary: Get current epoch information
   *     description: Retrieves current epoch and slot information from the Cardano blockchain including epoch number, slot number, and block height
   *     tags: [Network]
   *     responses:
   *       200:
   *         description: Current epoch information retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   description: Indicates if the request was successful
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     epoch:
   *                       type: integer
   *                       description: Current epoch number
   *                       example: 450
   *                     slot:
   *                       type: integer
   *                       description: Current slot number
   *                       example: 123456789
   *                     block:
   *                       type: integer
   *                       description: Current block height
   *                       example: 9876543
   *       500:
   *         description: Internal server error
   */
  router.get("/epochs", apiController.getCurrentEpoch);

  /**
   * @swagger
   * /api/pools/{poolId}:
   *   get:
   *     summary: Get staking pool information
   *     description: |
   *       Returns live metrics for a Cardano staking pool including saturation, stake,
   *       delegator count, margin cost, and fixed cost.
   *       Use this after delegation to display pool stats to the user.
   *     tags:
   *       - Pools
   *     parameters:
   *       - in: path
   *         name: poolId
   *         required: true
   *         schema:
   *           type: string
   *         description: Pool ID in bech32 format (pool1...) or hex
   *     responses:
   *       200:
   *         description: Pool information retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: object
   *                   properties:
   *                     pool_id:
   *                       type: string
   *                     live_saturation:
   *                       type: number
   *                       description: Live saturation ratio (1.0 = fully saturated, >1.0 = oversaturated)
   *                     live_stake:
   *                       type: string
   *                     active_stake:
   *                       type: string
   *                     live_delegators:
   *                       type: integer
   *                     margin_cost:
   *                       type: number
   *                       description: Pool margin as a fraction (e.g. 0.03 = 3%)
   *                     fixed_cost:
   *                       type: string
   *                       description: Fixed fee per epoch in lovelace
   *                     declared_pledge:
   *                       type: string
   *                     live_pledge:
   *                       type: string
   *       400:
   *         description: Invalid pool ID
   *       404:
   *         description: Pool not found
   *       500:
   *         description: Internal server error
   */
  router.get("/pools/:poolId", validateParams(poolIdParamsSchema), apiController.getPoolInfo);

  /**
   * @swagger
   * /api/pools/{poolId}/metadata:
   *   get:
   *     summary: Get pool metadata
   *     description: Returns pool off-chain metadata including name, ticker, description, and homepage URL.
   *     tags:
   *       - Pools
   *     parameters:
   *       - in: path
   *         name: poolId
   *         required: true
   *         schema:
   *           type: string
   *         description: Pool ID in bech32 format (pool1...) or hex
   *     responses:
   *       200:
   *         description: Pool metadata retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: object
   *                   properties:
   *                     pool_id:
   *                       type: string
   *                     name:
   *                       type: string
   *                       nullable: true
   *                     ticker:
   *                       type: string
   *                       nullable: true
   *                     description:
   *                       type: string
   *                       nullable: true
   *                     homepage:
   *                       type: string
   *                       nullable: true
   *                     extended:
   *                       type: string
   *                       nullable: true
   *       400:
   *         description: Invalid pool ID
   *       404:
   *         description: Pool not found
   *       500:
   *         description: Internal server error
   */
  router.get(
    "/pools/:poolId/metadata",
    validateParams(poolIdParamsSchema),
    apiController.getPoolMetadata
  );

  /**
   * @swagger
   * /api/pools/{poolId}/delegators:
   *   get:
   *     summary: Get pool delegator summary
   *     description: Returns the total delegator count and total active stake for a pool.
   *     tags:
   *       - Pools
   *     parameters:
   *       - in: path
   *         name: poolId
   *         required: true
   *         schema:
   *           type: string
   *         description: Pool ID in bech32 format (pool1...) or hex
   *     responses:
   *       200:
   *         description: Pool delegator summary retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: object
   *                   properties:
   *                     pool_id:
   *                       type: string
   *                     delegator_count:
   *                       type: integer
   *                     active_stake:
   *                       type: string
   *                       description: Total active stake in lovelace
   *       400:
   *         description: Invalid pool ID
   *       404:
   *         description: Pool not found
   *       500:
   *         description: Internal server error
   */
  router.get(
    "/pools/:poolId/delegators",
    validateParams(poolIdParamsSchema),
    apiController.getPoolDelegators
  );

  /**
   * @swagger
   * /api/pools/{poolId}/delegators/list:
   *   get:
   *     summary: Get paginated list of pool delegators
   *     description: Returns individual delegator entries for a pool with pagination support.
   *     tags:
   *       - Pools
   *     parameters:
   *       - in: path
   *         name: poolId
   *         required: true
   *         schema:
   *           type: string
   *         description: Pool ID in bech32 format (pool1...) or hex
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 100
   *         description: Maximum number of delegators to return
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *         description: Pagination offset
   *     responses:
   *       200:
   *         description: Pool delegators list retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: object
   *                   properties:
   *                     pool_id:
   *                       type: string
   *                     delegators:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           stake_address:
   *                             type: string
   *                           amount:
   *                             type: string
   *                           active_epoch_no:
   *                             type: integer
   *                 pagination:
   *                   type: object
   *                   properties:
   *                     limit:
   *                       type: integer
   *                     offset:
   *                       type: integer
   *                     total:
   *                       type: integer
   *                     hasMore:
   *                       type: boolean
   *       400:
   *         description: Invalid pool ID
   *       404:
   *         description: Pool not found
   *       500:
   *         description: Internal server error
   */
  router.get(
    "/pools/:poolId/delegators/list",
    validateParams(poolIdParamsSchema),
    apiController.getPoolDelegatorsList
  );

  /**
   * @swagger
   * /api/pools/{poolId}/blocks:
   *   get:
   *     summary: Get pool block production statistics
   *     description: Returns block production stats for a pool including total blocks minted and current epoch blocks.
   *     tags:
   *       - Pools
   *     parameters:
   *       - in: path
   *         name: poolId
   *         required: true
   *         schema:
   *           type: string
   *         description: Pool ID in bech32 format (pool1...) or hex
   *     responses:
   *       200:
   *         description: Pool block stats retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: object
   *                   properties:
   *                     pool_id:
   *                       type: string
   *                     blocks_minted:
   *                       type: integer
   *                       description: Total blocks minted by the pool
   *                     blocks_epoch:
   *                       type: integer
   *                       description: Blocks minted in the current epoch
   *                     current_epoch:
   *                       type: integer
   *       400:
   *         description: Invalid pool ID
   *       404:
   *         description: Pool not found
   *       500:
   *         description: Internal server error
   */
  router.get(
    "/pools/:poolId/blocks",
    validateParams(poolIdParamsSchema),
    apiController.getPoolBlocks
  );

  return router;
};
