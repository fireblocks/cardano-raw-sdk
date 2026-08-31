/**
 * Security middleware for the Cardano Raw SDK API server.
 *
 * Provides configurable security features:
 * - CORS (Cross-Origin Resource Sharing)
 * - Rate limiting
 * - Optional API key authentication
 * - Request body size limits
 *
 * All settings are configurable via environment variables to allow
 * clients to customize security based on their deployment requirements.
 */

import type { Express, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { timingSafeEqual } from "crypto";
import { Logger } from "../utils/index.js";

const logger = new Logger("security-middleware");

/**
 * Compare a provided API key against the configured key in constant time,
 * so response timing does not leak how many leading characters matched.
 */
const isValidApiKey = (provided: unknown, expected: string): boolean => {
  if (typeof provided !== "string") return false;
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
};

export interface SecurityConfig {
  maxBodySize: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  corsOrigins?: string | string[];
  apiKeyEnabled: boolean;
  apiKey?: string;
  trustProxy: boolean | number | string;
}

/**
 * Parse the TRUST_PROXY environment variable into the value Express
 * expects for the "trust proxy" setting: a boolean, a hop count, or a
 * preset/subnet string (e.g. "loopback", "10.0.0.0/8").
 */
const parseTrustProxy = (value: string | undefined): boolean | number | string => {
  if (value === undefined || value === "" || value === "false") return false;
  if (value === "true") return true;
  const hops = Number(value);
  return Number.isInteger(hops) && hops >= 0 ? hops : value;
};

/**
 * Load security configuration from environment variables.
 * All values have sensible defaults for development.
 */
const getConfig = (): SecurityConfig => ({
  maxBodySize: process.env.MAX_BODY_SIZE || "1mb",
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10), // 15 minutes
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100", 10),
  corsOrigins:
    process.env.CORS_ORIGINS === undefined || process.env.CORS_ORIGINS === ""
      ? undefined
      : process.env.CORS_ORIGINS === "*"
        ? "*"
        : process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim()),
  apiKeyEnabled: process.env.API_KEY_ENABLED === "true",
  apiKey: process.env.API_KEY,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
});

/**
 * Apply security middleware to the Express application.
 *
 * Order of middleware:
 * 1. CORS - Handle cross-origin requests
 * 2. Rate limiting - Prevent abuse
 * 3. API key auth (optional) - Require authentication header
 *
 * @param app - Express application instance
 */
export const applySecurityMiddleware = (app: Express): void => {
  const config = getConfig();

  // Auth is opt-in, so misconfiguration must never fail open silently.
  if (config.apiKeyEnabled && !config.apiKey) {
    throw new Error(
      "API_KEY_ENABLED=true but API_KEY is empty or unset. " +
        "Refusing to start with authentication silently disabled: " +
        "set a non-empty API_KEY, or set API_KEY_ENABLED=false to run without auth."
    );
  }
  if (!config.apiKeyEnabled) {
    logger.warn(
      "Server starting WITHOUT API key auth: every endpoint is unauthenticated. " +
        "Set API_KEY_ENABLED=true and API_KEY to enable authentication. " +
        "Only run without auth on a trusted, isolated network."
    );
  }

  // Required for req.ip (and rate-limit keying) to resolve to the
  // client address when the server runs behind a reverse proxy.
  app.set("trust proxy", config.trustProxy);

  // CORS is opt-in: without CORS_ORIGINS no CORS headers are sent and
  // browsers enforce same-origin. A wildcard origin is served without
  // credentials, as required by the CORS specification.
  if (config.corsOrigins !== undefined) {
    const isWildcard = config.corsOrigins === "*";
    if (isWildcard) {
      logger.warn(
        "CORS_ORIGINS=* allows any website to call this API from a browser. " +
          "Restrict CORS_ORIGINS to specific origins in production."
      );
    }
    app.use(
      cors({
        origin: config.corsOrigins,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
        credentials: !isWildcard,
      })
    );
  }

  // Rate limiting
  app.use(
    rateLimit({
      windowMs: config.rateLimitWindowMs,
      max: config.rateLimitMaxRequests,
      message: { success: false, error: "Too many requests, please try again later" },
      standardHeaders: true,
      legacyHeaders: false,
      // Skip rate limiting for health checks
      skip: (req: Request) => req.path === "/health",
      // An X-Forwarded-For header from an undeclared proxy must fall
      // back to socket-address keying rather than fail the request.
      validate: { xForwardedForHeader: false },
    })
  );

  // Optional API key authentication
  if (config.apiKeyEnabled && config.apiKey) {
    const apiKey = config.apiKey;
    app.use((req: Request, res: Response, next: NextFunction) => {
      // /health has no sub-resources, so it is matched exactly; /docs
      // and /api-docs serve nested static assets, so their sub-paths
      // are exempt too. Matching prevents an unrelated route sharing
      // one of these prefixes (e.g. /healthz) from bypassing auth.
      const exactPublicPaths = ["/health"];
      const prefixPublicPaths = ["/api-docs", "/docs"];
      // Webhook requests carry no X-API-Key header; they are
      // authenticated by Fireblocks signature verification in the
      // controller. Matched exactly so sibling paths remain protected.
      const signatureAuthenticatedPaths = ["/api/webhook"];
      if (
        exactPublicPaths.includes(req.path) ||
        prefixPublicPaths.some((p) => req.path === p || req.path.startsWith(`${p}/`)) ||
        signatureAuthenticatedPaths.includes(req.path)
      ) {
        return next();
      }

      const providedKey = req.headers["x-api-key"];
      if (!isValidApiKey(providedKey, apiKey)) {
        return res.status(401).json({
          success: false,
          error: "Invalid or missing API key",
          code: "UNAUTHORIZED",
        });
      }

      next();
    });
  }
};

/**
 * Get the configured max body size for use in express.json() middleware.
 * @returns Max body size string (e.g., "1mb", "100kb")
 */
export const getMaxBodySize = (): string => process.env.MAX_BODY_SIZE || "1mb";
