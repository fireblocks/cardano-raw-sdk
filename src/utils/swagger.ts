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
      },
      apis: ["./dist/api/router.js", "./dist/api/controllers/*.js", "./dist/routes/*.js"],
    };

    cachedSwaggerSpec = swaggerJsdoc(options);
  }

  return cachedSwaggerSpec;
};

// Maintain backward compatibility - export swaggerSpec as a getter
export const swaggerSpec = getSwaggerSpec();
export { swaggerUi };
