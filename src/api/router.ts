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
   * /api/transactions/{vaultAccountId}:
   *   get:
   *     summary: Get transaction history
   *     description: Retrieves the transaction history for a vault account
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
   *         description: The address index
   *     responses:
   *       200:
   *         description: Transaction history retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *       500:
   *         description: Internal server error
   */
  router.get("/transactions/:vaultAccountId", apiController.getTransactionsHistory);

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
