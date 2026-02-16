import { Router } from "express";
import { SdkManager } from "../pool/sdkManager.js";
import { ApiController } from "./controllers/controller.js";
import {
  validateRequest,
  validateParams,
  transferRequestSchema,
  vaultAccountIdParamsSchema,
  credentialParamsSchema,
  stakeKeyParamsSchema,
  hashParamsSchema,
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
  router.get(
    "/balance/stake-key/:vaultAccountId/:stakeKey",
    validateParams(stakeKeyParamsSchema),
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
  router.get(
    "/tx/hash/:hash",
    validateParams(hashParamsSchema),
    apiController.getTransactionDetails
  );

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
  router.get(
    "/utxos/:vaultAccountId",
    validateParams(vaultAccountIdParamsSchema),
    apiController.getUtxosByAddress
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
   *     tags: [Transactions]
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
   *     tags: [Transactions]
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
  router.post("/transfers", validateRequest(transferRequestSchema), apiController.transfer);

  /**
   * WEBHOOK
   */

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
   *                 description: DRep ID in hex format (required only if drepAction is 'custom-drep')
   *                 example: "drep1abc123..."
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
  return router;
};
