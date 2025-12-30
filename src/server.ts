import { fileURLToPath } from "url";
import path, { dirname } from "path";
import { BasePath, ConfigurationOptions } from "@fireblocks/ts-sdk";
import { Express } from "express-serve-static-core";
import express, { Request, Response } from "express";

import { config } from "./utils/config.js";
import { SdkManager } from "./pool/sdkManager.js";
import { configureRouter } from "./api/router.js";
import { Logger, LogLevel } from "./utils/logger.js";
import { swaggerSpec, swaggerUi } from "./utils/swagger.js";
import { FireblocksIagonSDK } from "./FireblocksIagonSDK.js";
import { Networks } from "./types/index.js";

// Validate required environment variables, additional variables can be added as needed
(() => {
  ["FIREBLOCKS_API_USER_KEY", "FIREBLOCKS_API_USER_SECRET_KEY_PATH"].forEach((key) => {
    if (process.env[key] === undefined || process.env[key] === "") {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  });
})();

const logLevel = "INFO";
Logger.setLogLevel(LogLevel[logLevel as keyof typeof LogLevel] || LogLevel.INFO);
const logger = new Logger("app:server-setup");

const startServer = () => {
  const app = express();

  configureMiddlewares(app);

  // Initialize base config for Fireblocks
  const baseConfig: ConfigurationOptions = {
    apiKey: config.FIREBLOCKS.apiKey || "",
    secretKey: config.FIREBLOCKS.secretKey || "",
    basePath: (config.FIREBLOCKS.basePath as BasePath) || BasePath.US,
  };

  // Get network from environment variable
  const network = (process.env.CARDANO_NETWORK as Networks) || Networks.MAINNET;

  // Initialize SDK Manager with pool configuration
  const sdkManager = new SdkManager(
    baseConfig,
    network,
    {
      maxPoolSize: parseInt(process.env.POOL_MAX_SIZE || "100"),
      idleTimeoutMs: parseInt(process.env.POOL_IDLE_TIMEOUT_MS || "1800000"),
      cleanupIntervalMs: parseInt(process.env.POOL_CLEANUP_INTERVAL_MS || "300000"),
      connectionTimeoutMs: parseInt(process.env.POOL_CONNECTION_TIMEOUT_MS || "30000"),
      retryAttempts: parseInt(process.env.POOL_RETRY_ATTEMPTS || "3"),
    },
    // SDK factory function to create FireblocksIagonSDK instances
    async (vaultAccountId: string, fireblocksConfig: ConfigurationOptions, network: Networks) =>
      FireblocksIagonSDK.createInstance({
        fireblocksConfig,
        vaultAccountId,
        network,
      })
  );

  // Mount API routes with SDK Manager
  app.use("/api", configureRouter(sdkManager));

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    logger.info("alive");
    res.status(200).send("Alive");
  });

  // Swagger documentation endpoints
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/api-docs-json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  app.use("/docs", express.static(path.join(__dirname, "../docs")));

  app.listen(config.PORT, () => {
    logger.info(`${config.APP_NAME} listening on port ${config.PORT}`);
  });
};

const configureMiddlewares = (app: Express) => {
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(errorHandler);
};

const errorHandler: express.ErrorRequestHandler = (err, _req, res, _next) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({ error: "Internal server error" });
};

export default startServer;
