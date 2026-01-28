import { readFileSync } from "fs";
import { BasePath, ConfigurationOptions as FireblocksConfig } from "@fireblocks/ts-sdk";
import dotenv from "dotenv";
import { Logger, LogLevel } from "./logger.js";

// Load dotenv but don't initialize config yet
dotenv.config();

const logLevel = "INFO";
Logger.setLogLevel(LogLevel[logLevel as keyof typeof LogLevel] || LogLevel.INFO);
const logger = new Logger("utils:config");

// Config type definition
export interface Config {
  PORT: number;
  FIREBLOCKS: FireblocksConfig;
  APP_NAME: string;
}

// Optional custom config for library usage
export interface CustomConfig {
  PORT?: number;
  FIREBLOCKS?: Partial<FireblocksConfig>;
  APP_NAME?: string;
}

// Cached config instance
let configCache: Config | null = null;

// Validate and get secret key from file
const getSecretKey = (secretKeyPath?: string): string => {
  const path = secretKeyPath || process.env.FIREBLOCKS_API_USER_SECRET_KEY_PATH;

  if (!path) {
    throw new Error("FIREBLOCKS_API_USER_SECRET_KEY_PATH environment variable or secretKeyPath parameter is required");
  }

  try {
    return readFileSync(path, "utf-8");
  } catch (error) {
    throw new Error(`Failed to read secret key file at ${path}: ${error}`);
  }
};

// Validate base path
const validateBasePath = (basePath: string): BasePath => {
  if (basePath && !Object.values(BasePath).includes(basePath as BasePath)) {
    logger.warn(
      `Invalid BASE_PATH: ${basePath}. Must be one of: ${Object.values(BasePath).join(", ")}`
    );
  }
  return (basePath as BasePath) || BasePath.US;
};

// Load config from environment variables
const loadConfigFromEnv = (): Config => {
  return {
    PORT: Number(process.env.PORT) || 8000,
    FIREBLOCKS: {
      apiKey: process.env.FIREBLOCKS_API_USER_KEY || "",
      secretKey: getSecretKey(),
      basePath: validateBasePath(process.env.BASE_PATH || ""),
    },
    APP_NAME: process.env.APP_NAME || "cardano-raw-sdk",
  };
};

// Merge custom config with defaults
const mergeConfig = (customConfig: CustomConfig): Config => {
  const defaults: Config = {
    PORT: Number(process.env.PORT) || 8000,
    FIREBLOCKS: {
      apiKey: "",
      secretKey: "",
      basePath: BasePath.US,
    },
    APP_NAME: process.env.APP_NAME || "cardano-raw-sdk",
  };

  return {
    PORT: customConfig.PORT ?? defaults.PORT,
    FIREBLOCKS: {
      apiKey: customConfig.FIREBLOCKS?.apiKey ?? defaults.FIREBLOCKS.apiKey,
      secretKey: customConfig.FIREBLOCKS?.secretKey ?? defaults.FIREBLOCKS.secretKey,
      basePath: customConfig.FIREBLOCKS?.basePath ?? defaults.FIREBLOCKS.basePath,
    },
    APP_NAME: customConfig.APP_NAME ?? defaults.APP_NAME,
  };
};

/**
 * Manually initialize config with custom values (for library usage)
 * Call this before accessing config if you want to provide custom configuration
 *
 * @param customConfig - Custom configuration object
 * @example
 * ```typescript
 * initConfig({
 *   FIREBLOCKS: {
 *     apiKey: "your-api-key",
 *     secretKey: "your-secret-key",
 *     basePath: BasePath.US
 *   }
 * });
 * ```
 */
export const initConfig = (customConfig?: CustomConfig): void => {
  if (configCache) {
    logger.warn("Config already initialized. Reinitializing with new values.");
  }

  if (customConfig) {
    configCache = mergeConfig(customConfig);
    logger.info("Config manually initialized with custom values");
  } else {
    configCache = loadConfigFromEnv();
    logger.info("Config initialized from environment variables");
  }
};

/**
 * Get the config object (lazy initialization)
 * Will automatically load from environment variables on first access
 *
 * @returns Config object
 */
export const getConfig = (): Config => {
  if (!configCache) {
    logger.info("Lazy loading config from environment variables");
    configCache = loadConfigFromEnv();
  }
  return configCache;
};

/**
 * Check if config has been initialized
 */
export const isConfigInitialized = (): boolean => {
  return configCache !== null;
};

/**
 * Reset config (mainly for testing)
 */
export const resetConfig = (): void => {
  configCache = null;
  logger.info("Config reset");
};

// Create a Proxy for backward compatibility
// This allows existing code to use `config.PORT` without breaking
export const config: Config = new Proxy({} as Config, {
  get(_target, prop: string) {
    // Lazy load config on first property access
    if (!configCache) {
      configCache = loadConfigFromEnv();
    }
    return configCache[prop as keyof Config];
  },
  set(_target, prop: string, _value) {
    throw new Error(
      `Config is read-only. Property '${prop}' cannot be modified. Use initConfig() to set custom config.`
    );
  },
});
