import { Router } from "express";
import { SdkManager } from "../pool/sdkManager.js";
import { ApiController } from "./controllers/controller.js";

export const createRouter = (sdkManager: SdkManager): Router => {
  const router: Router = Router();
  const apiController = new ApiController(sdkManager);

  router.get(
    "/balance/credential/:vaultAccountId/:credential",
    apiController.getBalanceByCredential
  );
  router.get("/balance/stake-key/:vaultAccountId/:stakeKey", apiController.getBalanceByStakeKey);
  router.get("/balance/address/:vaultAccountId", apiController.getBalanceByAddress);

  router.get("/transactions/:vaultAccountId", apiController.getTransactionsHistory);

  router.post("/transfers", apiController.transfer);

  return router;
};
