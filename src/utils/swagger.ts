import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { config } from "./config.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cache the swagger spec after first creation
let cachedSwaggerSpec: ReturnType<typeof swaggerJsdoc> | null = null;

/**
 * Get or create the swagger specification
 * Lazy loads on first access
 */
export const getSwaggerSpec = (): ReturnType<typeof swaggerJsdoc> => {
  if (!cachedSwaggerSpec) {
    const packageJson = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf8"));

    const options = {
      definition: {
        openapi: "3.0.0",
        info: {
          title: `${config.APP_NAME} SDK API`,
          version: packageJson.version,
          description: `API documentation for ${config.APP_NAME} SDK`,
        },
        servers: [
          {
            url: `http://localhost:${config.PORT}/`,
            description: "Local server",
          },
        ],
        tags: [
          { name: "Health", description: "Service health checks" },
          {
            name: "Balance",
            description: "Query ADA and token balances by address, stake key, or credential",
          },
          {
            name: "Transfers",
            description: "Send ADA or native tokens and estimate transaction fees",
          },
          {
            name: "Transaction History",
            description: "Retrieve past transaction records and details",
          },
          {
            name: "UTxOs",
            description: "Query unspent outputs and consolidate wallet fragmentation",
          },
          { name: "Assets", description: "Look up native asset metadata" },
          {
            name: "Staking",
            description: "Register, delegate, deregister, and withdraw staking rewards",
          },
          {
            name: "Governance",
            description:
              "Conway-era DRep registration, vote delegation, and casting governance votes",
          },
          {
            name: "Pools",
            description: "Query stake pool metrics, metadata, delegators, and block stats",
          },
          { name: "Network", description: "Current epoch and network state" },
          { name: "Webhooks", description: "Verify and enrich Fireblocks webhook payloads" },
        ],
      },
      apis: ["./dist/api/router.js", "./dist/api/controllers/*.js", "./dist/routes/*.js"],
    };

    cachedSwaggerSpec = swaggerJsdoc(options);
  }

  return cachedSwaggerSpec;
};

export { swaggerUi };
