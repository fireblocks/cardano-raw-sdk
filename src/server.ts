import { fileURLToPath } from "url";
import path, { dirname } from "path";
import http from "http";
import { BasePath, ConfigurationOptions } from "@fireblocks/ts-sdk";
import express, { Request, Response } from "express";

import { config, Logger } from "./utils/index.js";
import { getSwaggerSpec, swaggerUi } from "./utils/swagger.js";
import { SdkManager } from "./pool/sdkManager.js";
import { configureRouter } from "./api/router.js";
import { FireblocksCardanoRawSDK } from "./FireblocksCardanoRawSDK.js";
import { Networks } from "./types/index.js";

const logger = new Logger("app:server-setup");

/**
 * Valid Cardano networks supported by this SDK
 */
const VALID_NETWORKS: readonly string[] = ["mainnet", "preprod"] as const;

/**
 * Validate and parse CARDANO_NETWORK environment variable
 * @throws Error if network is invalid
 */
const validateNetwork = (networkStr: string | undefined): Networks => {
  const network = networkStr?.toLowerCase() || "mainnet";

  if (!VALID_NETWORKS.includes(network)) {
    throw new Error(
      `Invalid CARDANO_NETWORK: "${networkStr}". Must be one of: ${VALID_NETWORKS.join(", ")}`
    );
  }

  return network === "mainnet" ? Networks.MAINNET : Networks.PREPROD;
};

const startServer = () => {
  // Validate required environment variables for server mode
  ["FIREBLOCKS_API_USER_KEY", "FIREBLOCKS_API_USER_SECRET_KEY_PATH", "IAGON_API_KEY"].forEach(
    (key) => {
      if (process.env[key] === undefined || process.env[key] === "") {
        throw new Error(`Missing required environment variable: ${key}`);
      }
    }
  );

  const app = express();

  // Configure middlewares with raw body preservation for webhook endpoint
  app.use(
    express.json({
      verify: (req, _res, buf, _encoding) => {
        // Preserve raw body for webhook signature verification
        const r = req as Request & { url?: string; rawBody?: Buffer };
        if (r.url?.split("?")[0] === "/api/webhook") {
          r.rawBody = buf;
        }
      },
    })
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(errorHandler);

  // Initialize base config for Fireblocks
  const baseConfig: ConfigurationOptions = {
    apiKey: config.FIREBLOCKS.apiKey || "",
    secretKey: config.FIREBLOCKS.secretKey || "",
    basePath: (config.FIREBLOCKS.basePath as BasePath) || BasePath.US,
  };

  // Get and validate network from environment variable
  const network = validateNetwork(process.env.CARDANO_NETWORK);

  // Get Iagon API key from environment variable
  const iagonApiKey = process.env.IAGON_API_KEY || "";

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

    // SDK factory function to create FireblocksCardanoRawSDK instances
    async (vaultAccountId: string, fireblocksConfig: ConfigurationOptions, network: Networks) =>
      FireblocksCardanoRawSDK.createInstance({
        fireblocksConfig,
        vaultAccountId,
        network,
        iagonApiKey,
      })
  );

  // Mount API routes with SDK Manager
  app.use("/api", configureRouter(sdkManager));

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    logger.info("alive");
    res.status(200).send("Alive");
  });

  // Swagger documentation endpoints (lazy loaded)
  const swaggerSpec = getSwaggerSpec();
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/api-docs-json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  app.use("/docs", express.static(path.join(__dirname, "../docs")));

  // Create HTTP server for graceful shutdown support
  const server = http.createServer(app);

  // Graceful shutdown handler
  let isShuttingDown = false;

  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn(`Shutdown already in progress, ignoring ${signal}`);
      return;
    }
    isShuttingDown = true;

    logger.info(`Received ${signal}, starting graceful shutdown...`);

    // Stop accepting new connections
    server.close((err) => {
      if (err) {
        logger.error("Error closing HTTP server:", err);
      } else {
        logger.info("HTTP server closed");
      }
    });

    try {
      // Shutdown SDK manager (clears cleanup interval, releases all SDK instances)
      await sdkManager.shutdown();
      logger.info("Graceful shutdown complete");
      process.exit(0);
    } catch (err) {
      logger.error("Error during graceful shutdown:", err);
      process.exit(1);
    }
  };

  // Register signal handlers
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  server.listen(config.PORT, () => {
    logger.info(`${config.APP_NAME} listening on port ${config.PORT}`);
    logger.info(`Network: ${network}`);
  });
};

const errorHandler: express.ErrorRequestHandler = (err, _req, res, _next) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({ error: "Internal server error" });
};

export default startServer;
