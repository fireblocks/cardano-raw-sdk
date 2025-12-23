import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { config } from "./config.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
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

export const swaggerSpec = swaggerJsdoc(options);
export { swaggerUi };
