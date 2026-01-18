import { readFileSync } from "fs";
import { BasePath, ConfigurationOptions as FireblocksConfig } from "@fireblocks/ts-sdk";
import dotenv from "dotenv";
import { Logger, LogLevel } from "./logger.js";
dotenv.config();

const logLevel = "INFO";
Logger.setLogLevel(LogLevel[logLevel as keyof typeof LogLevel] || LogLevel.INFO);
const logger = new Logger("utils:cardano");

// validate and get secret key from file
const getSecretKey = (): string => {
  const secretKeyPath = process.env.FIREBLOCKS_API_USER_SECRET_KEY_PATH;

  if (!secretKeyPath) {
    throw new Error("FIREBLOCKS_API_USER_SECRET_KEY_PATH environment variable is required");
  }

  try {
    return readFileSync(secretKeyPath, "utf-8");
  } catch (error) {
    throw new Error(`Failed to read secret key file at ${secretKeyPath}: ${error}`);
  }
};

// validate base path
const validateBasePath = (basePath: string): BasePath => {
  if (basePath && !Object.values(BasePath).includes(basePath as BasePath)) {
    logger.warn(
      `Invalid BASE_PATH: ${basePath}. Must be one of: ${Object.values(BasePath).join(", ")}`
    );
  }
  return (basePath as BasePath) || BasePath.US;
};

// Application configuration
export const config: {
  PORT: number;
  FIREBLOCKS: FireblocksConfig;
  APP_NAME: string;
} = {
  PORT: Number(process.env.PORT) || 8000,
  FIREBLOCKS: {
    apiKey: process.env.FIREBLOCKS_API_USER_KEY || "",
    secretKey: getSecretKey(),
    basePath: validateBasePath(process.env.BASE_PATH || ""),
  },
  APP_NAME: process.env.APP_NAME || "CNT",
};
