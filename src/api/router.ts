import { Router } from "express";
import { SdkManager } from "../pool/sdkManager.js";
import { ApiController } from "./controllers/controller.js";

export const configureRouter = (sdkManager: SdkManager): Router => {
  const router: Router = Router();
  const apiController = new ApiController(sdkManager);

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
   *           default: false
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
   *           default: false
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
   * /api/balance/address/{vaultAccountId}:
   *   get:
   *     summary: Get balance by address
   *     description: Retrieves the balance for a vault account address
   *     tags: [Balance]
   *     parameters:
   *       - in: path
   *         name: vaultAccountId
   *         required: true
   *         schema:
   *           type: string
   *         description: The vault account ID
   *       - in: query
   *         name: assetId
   *         schema:
   *           type: string
   *           enum: [ADA, ADA_TEST]
   *           default: ADA
   *         description: The asset ID for the blockchain
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
   *           default: false
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
   *     description: Executes a transfer of tokens between accounts
   *     tags: [Transfers]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - vaultAccountId
   *               - recipientAddress
   *               - tokenPolicyId
   *               - tokenName
   *               - requiredTokenAmount
   *             properties:
   *               vaultAccountId:
   *                 type: string
   *                 description: The source vault account ID
   *               assetId:
   *                 type: string
   *                 enum: [ADA, ADA_TEST]
   *                 description: The asset ID for the blockchain (optional)
   *               recipientAddress:
   *                 type: string
   *                 description: The recipient address to send tokens to
   *               tokenPolicyId:
   *                 type: string
   *                 description: The policy ID of the token to transfer
   *               tokenName:
   *                 type: string
   *                 description: The token name (asset name)
   *               requiredTokenAmount:
   *                 type: number
   *                 description: The amount of tokens to transfer
   *               minRecipientLovelace:
   *                 type: number
   *                 description: Minimum lovelace to send to recipient (optional)
   *               minChangeLovelace:
   *                 type: number
   *                 description: Minimum lovelace for change output (optional)
   *               index:
   *                 type: number
   *                 description: Address index to use (optional, defaults to 0)
   *     responses:
   *       200:
   *         description: Transfer executed successfully
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
   *       500:
   *         description: Internal server error
   */
  router.post("/transfers", apiController.transfer);

  return router;
};
