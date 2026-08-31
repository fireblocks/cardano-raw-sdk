import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import type { Express, Request, Response, NextFunction } from "express";
import { applySecurityMiddleware } from "../../middleware/security.js";

// API key auth is opt-in. To prevent the server from silently failing
// open, API_KEY_ENABLED=true with an empty key is treated as a fatal
// misconfiguration, and starting with auth disabled emits an explicit
// warning.

const makeApp = (): { app: Express; use: jest.Mock; set: jest.Mock } => {
  const use = jest.fn();
  const set = jest.fn();
  return { app: { use, set } as unknown as Express, use, set };
};

const ENV_KEYS = ["API_KEY_ENABLED", "API_KEY", "TRUST_PROXY", "CORS_ORIGINS"];
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  ENV_KEYS.forEach((k) => delete process.env[k]);
});

afterEach(() => {
  ENV_KEYS.forEach((k) => {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  });
  jest.restoreAllMocks();
});

describe("applySecurityMiddleware - C-01 API key misconfiguration", () => {
  it("throws when API_KEY_ENABLED=true but API_KEY is unset", () => {
    process.env.API_KEY_ENABLED = "true";
    const { app } = makeApp();
    expect(() => applySecurityMiddleware(app)).toThrow(/API_KEY/);
  });

  it("throws when API_KEY_ENABLED=true but API_KEY is empty", () => {
    process.env.API_KEY_ENABLED = "true";
    process.env.API_KEY = "";
    const { app } = makeApp();
    expect(() => applySecurityMiddleware(app)).toThrow(/API_KEY/);
  });

  it("logs a warning when the server starts without API key auth", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { app } = makeApp();
    applySecurityMiddleware(app);
    const warned = warnSpy.mock.calls.some((call) =>
      call.some((arg) => typeof arg === "string" && /API key|auth/i.test(arg))
    );
    expect(warned).toBe(true);
  });

  it("does not warn about missing auth when auth is properly enabled", () => {
    process.env.API_KEY_ENABLED = "true";
    process.env.API_KEY = "test-key-123";
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { app } = makeApp();
    applySecurityMiddleware(app);
    const warned = warnSpy.mock.calls.some((call) =>
      call.some((arg) => typeof arg === "string" && /without API key auth/i.test(arg))
    );
    expect(warned).toBe(false);
  });
});

describe("applySecurityMiddleware - API key comparison", () => {
  const getAuthMiddleware = (
    use: jest.Mock
  ): ((req: Request, res: Response, next: NextFunction) => unknown) => {
    // auth middleware is the last one registered (after CORS and rate limit)
    const lastCall = use.mock.calls[use.mock.calls.length - 1];
    return lastCall[0] as (req: Request, res: Response, next: NextFunction) => unknown;
  };

  const makeReqRes = (providedKey?: string) => {
    const req = {
      path: "/api/balance",
      headers: { "x-api-key": providedKey },
    } as unknown as Request;
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const res = { status, json } as unknown as Response;
    const next = jest.fn();
    return { req, res, next, status, json };
  };

  beforeEach(() => {
    process.env.API_KEY_ENABLED = "true";
    process.env.API_KEY = "correct-key";
  });

  it("accepts the correct API key", () => {
    const { app, use } = makeApp();
    applySecurityMiddleware(app);
    const auth = getAuthMiddleware(use);
    const { req, res, next } = makeReqRes("correct-key");
    auth(req, res, next as NextFunction);
    expect(next).toHaveBeenCalled();
  });

  it("rejects a wrong key of the same length with 401", () => {
    const { app, use } = makeApp();
    applySecurityMiddleware(app);
    const auth = getAuthMiddleware(use);
    const { req, res, next, status } = makeReqRes("wrongkey-key");
    auth(req, res, next as NextFunction);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it("rejects a wrong key of a different length with 401 (no throw)", () => {
    const { app, use } = makeApp();
    applySecurityMiddleware(app);
    const auth = getAuthMiddleware(use);
    const { req, res, next, status } = makeReqRes("short");
    expect(() => auth(req, res, next as NextFunction)).not.toThrow();
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it("rejects a missing key with 401", () => {
    const { app, use } = makeApp();
    applySecurityMiddleware(app);
    const auth = getAuthMiddleware(use);
    const { req, res, next, status } = makeReqRes(undefined);
    auth(req, res, next as NextFunction);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });
});

describe("applySecurityMiddleware - CORS configuration", () => {
  // CORS is opt-in: without CORS_ORIGINS the server sends no CORS
  // headers, so browsers enforce same-origin. A wildcard origin must
  // not be combined with credentials.
  const invokeCorsMiddleware = (use: jest.Mock, origin: string) => {
    const corsMiddleware = use.mock.calls[0][0] as (
      req: Request,
      res: Response,
      next: NextFunction
    ) => unknown;
    const headers: Record<string, unknown> = {};
    const req = { method: "GET", headers: { origin } } as unknown as Request;
    const res = {
      setHeader: (key: string, value: unknown) => {
        headers[key] = value;
      },
      getHeader: (key: string) => headers[key],
    } as unknown as Response;
    const next = jest.fn();
    corsMiddleware(req, res, next as NextFunction);
    return { headers, next };
  };

  it("registers no CORS middleware when CORS_ORIGINS is unset", () => {
    const { app, use } = makeApp();
    applySecurityMiddleware(app);
    // Only the rate limiter is registered (auth is disabled by default)
    expect(use).toHaveBeenCalledTimes(1);
  });

  it("allows a configured origin and enables credentials", () => {
    process.env.CORS_ORIGINS = "https://app.example.com";
    const { app, use } = makeApp();
    applySecurityMiddleware(app);
    const { headers, next } = invokeCorsMiddleware(use, "https://app.example.com");
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://app.example.com");
    expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
    expect(next).toHaveBeenCalled();
  });

  it("serves wildcard origin without credentials when CORS_ORIGINS=*", () => {
    process.env.CORS_ORIGINS = "*";
    const { app, use } = makeApp();
    applySecurityMiddleware(app);
    const { headers } = invokeCorsMiddleware(use, "https://anywhere.example.com");
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  it("warns when a wildcard origin is configured", () => {
    process.env.CORS_ORIGINS = "*";
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { app } = makeApp();
    applySecurityMiddleware(app);
    const warned = warnSpy.mock.calls.some((call) =>
      call.some((arg) => typeof arg === "string" && /CORS/i.test(arg))
    );
    expect(warned).toBe(true);
  });
});

describe("applySecurityMiddleware - trust proxy configuration", () => {
  // Express must be told the proxy depth for req.ip (and rate-limit
  // keying) to resolve to the client address rather than the proxy's.
  it("defaults trust proxy to false when TRUST_PROXY is unset", () => {
    const { app, set } = makeApp();
    applySecurityMiddleware(app);
    expect(set).toHaveBeenCalledWith("trust proxy", false);
  });

  it("sets trust proxy to true for TRUST_PROXY=true", () => {
    process.env.TRUST_PROXY = "true";
    const { app, set } = makeApp();
    applySecurityMiddleware(app);
    expect(set).toHaveBeenCalledWith("trust proxy", true);
  });

  it("sets a numeric hop count for TRUST_PROXY=2", () => {
    process.env.TRUST_PROXY = "2";
    const { app, set } = makeApp();
    applySecurityMiddleware(app);
    expect(set).toHaveBeenCalledWith("trust proxy", 2);
  });

  it("passes preset/subnet strings through for TRUST_PROXY=loopback", () => {
    process.env.TRUST_PROXY = "loopback";
    const { app, set } = makeApp();
    applySecurityMiddleware(app);
    expect(set).toHaveBeenCalledWith("trust proxy", "loopback");
  });
});

describe("applySecurityMiddleware - webhook exemption from API key auth", () => {
  // Fireblocks webhook requests carry only signature headers and cannot
  // include X-API-Key, so the webhook path is exempt from API key auth.
  // Webhook requests are instead authenticated via signature verification
  // in the controller (M-01).
  const getAuthMiddleware = (
    use: jest.Mock
  ): ((req: Request, res: Response, next: NextFunction) => unknown) => {
    const lastCall = use.mock.calls[use.mock.calls.length - 1];
    return lastCall[0] as (req: Request, res: Response, next: NextFunction) => unknown;
  };

  const makeReqRes = (path: string) => {
    const req = { path, headers: {} } as unknown as Request;
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const res = { status, json } as unknown as Response;
    const next = jest.fn();
    return { req, res, next, status };
  };

  beforeEach(() => {
    process.env.API_KEY_ENABLED = "true";
    process.env.API_KEY = "correct-key";
  });

  it("lets a webhook request through without an API key", () => {
    const { app, use } = makeApp();
    applySecurityMiddleware(app);
    const auth = getAuthMiddleware(use);
    const { req, res, next } = makeReqRes("/api/webhook");
    auth(req, res, next as NextFunction);
    expect(next).toHaveBeenCalled();
  });

  it("still requires an API key on paths that merely share the webhook prefix", () => {
    const { app, use } = makeApp();
    applySecurityMiddleware(app);
    const auth = getAuthMiddleware(use);
    const { req, res, next, status } = makeReqRes("/api/webhook-other");
    auth(req, res, next as NextFunction);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it("still requires an API key on a path that merely shares the /health prefix", () => {
    const { app, use } = makeApp();
    applySecurityMiddleware(app);
    const auth = getAuthMiddleware(use);
    const { req, res, next, status } = makeReqRes("/healthz");
    auth(req, res, next as NextFunction);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it("exempts the exact /health path", () => {
    const { app, use } = makeApp();
    applySecurityMiddleware(app);
    const auth = getAuthMiddleware(use);
    const { req, res, next } = makeReqRes("/health");
    auth(req, res, next as NextFunction);
    expect(next).toHaveBeenCalled();
  });

  it("exempts nested docs and api-docs asset paths", () => {
    const { app, use } = makeApp();
    applySecurityMiddleware(app);
    const auth = getAuthMiddleware(use);
    for (const path of ["/docs", "/docs/assets/style.css", "/api-docs", "/api-docs/swagger.json"]) {
      const { req, res, next } = makeReqRes(path);
      auth(req, res, next as NextFunction);
      expect(next).toHaveBeenCalled();
    }
  });
});
