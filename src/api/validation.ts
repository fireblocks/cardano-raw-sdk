import { z } from "zod";
import { Request, Response, NextFunction } from "express";
import { bech32 } from "bech32";

import { getProtocolParams } from "../utils/protocolParams.js";

/**
 * Validate a DRep ID. Accepts:
 * - a 56-char hex string (28-byte credential), or
 * - CIP-105 bech32 (HRP "drep" or "drep_script", 28-byte payload), or
 * - CIP-129 bech32 (HRP "drep", 29-byte payload = header + 28-byte hash).
 * Verifies the bech32 checksum and payload length.
 */
const isValidDrepId = (id: string): boolean => {
  if (/^[0-9a-fA-F]{56}$/.test(id)) return true;
  if (!id.startsWith("drep1") && !id.startsWith("drep_script1")) return false;
  try {
    const decoded = bech32.decode(id, 1000);
    if (decoded.prefix !== "drep" && decoded.prefix !== "drep_script") return false;
    const bytes = bech32.fromWords(decoded.words);
    // CIP-105 = 28 bytes (raw hash); CIP-129 = 29 bytes (header byte + hash).
    // CIP-129 only uses HRP "drep", and its header byte must be exactly
    // 0x22 (key hash) or 0x23 (script hash) - mirrors decodeDRepId.
    if (bytes.length === 28) return true;
    if (
      bytes.length === 29 &&
      decoded.prefix === "drep" &&
      (bytes[0] === 0x22 || bytes[0] === 0x23)
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

/**
 * Fee validation bounds.
 * MIN_PROTOCOL_FEE: Minimum fee per Cardano protocol (minFeeB constant, configurable)
 * MAX_REASONABLE_FEE: Upper bound to prevent accidental loss-of-funds (10 ADA)
 */
const getMinProtocolFee = () => getProtocolParams().minFeeB; // Default: 155,381 lovelace
const MAX_REASONABLE_FEE = 10_000_000; // 10 ADA - covers even complex multi-asset tx

/**
 * Reusable schema for optional fee parameter with bounds validation.
 * Prevents loss-of-funds from excessive fees while ensuring minimum protocol requirements.
 * Note: Uses a function to get min fee to support configurable protocol params.
 */
const optionalFeeSchema = z
  .number()
  .int("fee must be an integer")
  .refine((fee) => fee >= getMinProtocolFee(), {
    message: `fee must be at least the protocol minimum (minFeeB)`,
  })
  .refine((fee) => fee <= MAX_REASONABLE_FEE, {
    message: `fee cannot exceed ${MAX_REASONABLE_FEE} lovelace (10 ADA)`,
  })
  .optional();

/**
 * Generic validation middleware that validates request body against a Zod schema
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 */
export const validateRequest = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse and validate request body, replacing it with validated data
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Request validation failed",
          details: error.issues.map((err) => ({
            path: err.path.join("."),
            message: err.message,
            code: err.code,
          })),
        });
      }
      // Pass non-validation errors to error handler
      next(error);
    }
  };
};

/**
 * Validation middleware for request params (URL path parameters)
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 */
export const validateQuery = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid query parameters",
        details: result.error.issues.map((err) => ({
          path: err.path.join("."),
          message: err.message,
          code: err.code,
        })),
      });
    }
    Object.assign(req.query, result.data);
    next();
  };
};

export const validateParams = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate params - throws if invalid
      schema.parse(req.params);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Invalid URL parameters",
          details: error.issues.map((err) => ({
            path: err.path.join("."),
            message: err.message,
            code: err.code,
          })),
        });
      }
      next(error);
    }
  };
};

/**
 * Common schema for vault account ID in URL params
 */
export const vaultAccountIdParamsSchema = z.object({
  vaultAccountId: z.string().min(1, "vaultAccountId is required"),
});

/**
 * Schema for pool ID in URL params
 */
export const poolIdParamsSchema = z.object({
  poolId: z.string().min(1, "poolId is required"),
});

/**
 * Schema for credential params
 */
export const credentialParamsSchema = z.object({
  vaultAccountId: z.string().min(1, "vaultAccountId is required"),
  credential: z.string().min(1, "credential is required"),
});

/**
 * Schema for transaction hash params
 */
export const hashParamsSchema = z.object({
  hash: z.string().min(1, "transaction hash is required"),
});

/**
 * Validation schema for transfer endpoint request body
 * Matches the transferOpts interface from types/iagon/general.ts
 */
export const transferRequestSchema = z
  .object({
    // Recipient must be one of: address, vaultAccountId+index, or just index
    recipientAddress: z.string().optional(),
    recipientVaultAccountId: z.string().optional(),
    recipientIndex: z.number().int().nonnegative().optional(),

    // Token information (required)
    tokenPolicyId: z.string().min(1, "tokenPolicyId is required"),
    tokenName: z.string().min(1, "tokenName is required"),
    requiredTokenAmount: z.number().positive("requiredTokenAmount must be positive"),

    // Optional lovelace amounts
    minRecipientLovelace: z.number().int().positive().optional(),
    minChangeLovelace: z.number().int().positive().optional(),

    // Sender address index (optional)
    index: z.number().int().nonnegative().optional(),

    // Vault account ID (required by controller)
    vaultAccountId: z.string().min(1, "vaultAccountId is required"),
  })
  .refine(
    (data) => {
      // At least one recipient must be specified
      return (
        data.recipientAddress !== undefined ||
        data.recipientVaultAccountId !== undefined ||
        data.recipientIndex !== undefined ||
        data.index !== undefined
      );
    },
    {
      message:
        "At least one recipient must be specified: recipientAddress, recipientVaultAccountId, recipientIndex, or index",
    }
  );

export type TransferRequest = z.infer<typeof transferRequestSchema>;

/**
 * Validation schema for fee estimation endpoint request body
 * Similar to transferRequestSchema but with grossAmount option
 */
export const feeEstimationRequestSchema = z
  .object({
    // Recipient must be one of: address or vaultAccountId
    recipientAddress: z.string().optional(),
    recipientVaultAccountId: z.string().optional(),
    recipientIndex: z.number().int().nonnegative().optional(),

    // Token information (required)
    tokenPolicyId: z.string().min(1, "tokenPolicyId is required"),
    tokenName: z.string().min(1, "tokenName is required"),
    requiredTokenAmount: z.number().positive("requiredTokenAmount must be positive"),

    // Sender address index (optional)
    index: z.number().int().nonnegative().optional(),

    // Gross amount flag (optional)
    grossAmount: z.boolean().optional(),

    // Vault account ID (required by controller)
    vaultAccountId: z.string().min(1, "vaultAccountId is required"),
  })
  .refine(
    (data) => {
      // Exactly one of recipientAddress or recipientVaultAccountId must be specified
      const hasAddress = data.recipientAddress !== undefined;
      const hasVaultId = data.recipientVaultAccountId !== undefined;
      return (hasAddress && !hasVaultId) || (!hasAddress && hasVaultId);
    },
    {
      message:
        "Exactly one recipient must be specified: recipientAddress OR recipientVaultAccountId (not both)",
    }
  );

export type CntFeeEstimationRequest = z.infer<typeof feeEstimationRequestSchema>;

const adaRecipientRefinement = (data: {
  recipientAddress?: string;
  recipientVaultAccountId?: string;
}) => {
  const hasAddress = data.recipientAddress !== undefined;
  const hasVaultId = data.recipientVaultAccountId !== undefined;
  return (hasAddress && !hasVaultId) || (!hasAddress && hasVaultId);
};

const adaRecipientRefinementMessage =
  "Exactly one recipient must be specified: recipientAddress OR recipientVaultAccountId (not both, not neither)";

export const adaTransferRequestSchema = z
  .object({
    vaultAccountId: z.string().min(1, "vaultAccountId is required"),
    lovelaceAmount: z
      .number()
      .int("lovelaceAmount must be an integer")
      .min(1_000_000, "lovelaceAmount must be at least 1,000,000 lovelace (1 ADA)"),
    recipientAddress: z.string().optional(),
    recipientVaultAccountId: z.string().optional(),
    recipientIndex: z.number().int().nonnegative().optional(),
    index: z.number().int().nonnegative().optional(),
  })
  .refine(adaRecipientRefinement, { message: adaRecipientRefinementMessage });

export type AdaTransferRequest = z.infer<typeof adaTransferRequestSchema>;

export const adaFeeEstimationRequestSchema = z
  .object({
    vaultAccountId: z.string().min(1, "vaultAccountId is required"),
    lovelaceAmount: z
      .number()
      .int("lovelaceAmount must be an integer")
      .min(1_000_000, "lovelaceAmount must be at least 1,000,000 lovelace (1 ADA)"),
    recipientAddress: z.string().optional(),
    recipientVaultAccountId: z.string().optional(),
    recipientIndex: z.number().int().nonnegative().optional(),
    index: z.number().int().nonnegative().optional(),
    grossAmount: z.boolean().optional(),
  })
  .refine(adaRecipientRefinement, { message: adaRecipientRefinementMessage });

export type AdaFeeEstimationRequest = z.infer<typeof adaFeeEstimationRequestSchema>;

const tokenSpecSchema = z.object({
  tokenPolicyId: z.string().min(1, "tokenPolicyId is required"),
  tokenName: z.string().min(1, "tokenName is required"),
  amount: z.number().int().positive("token amount must be a positive integer"),
});

const multiTokenRecipientRefinement = (data: {
  recipientAddress?: string;
  recipientVaultAccountId?: string;
}) => {
  const hasAddress = data.recipientAddress !== undefined;
  const hasVaultId = data.recipientVaultAccountId !== undefined;
  return (hasAddress && !hasVaultId) || (!hasAddress && hasVaultId);
};

const multiTokenRecipientMessage =
  "Exactly one recipient must be specified: recipientAddress OR recipientVaultAccountId (not both, not neither)";

export const multiTokenTransferRequestSchema = z
  .object({
    vaultAccountId: z.string().min(1, "vaultAccountId is required"),
    tokens: z.array(tokenSpecSchema).min(1, "At least one token must be specified"),
    recipientAddress: z.string().optional(),
    recipientVaultAccountId: z.string().optional(),
    recipientIndex: z.number().int().nonnegative().optional(),
    index: z.number().int().nonnegative().optional(),
    lovelaceAmount: z
      .number()
      .int("lovelaceAmount must be an integer")
      .min(1_000_000, "lovelaceAmount must be at least 1,000,000 lovelace (1 ADA)")
      .optional(),
  })
  .refine(multiTokenRecipientRefinement, { message: multiTokenRecipientMessage });

export type MultiTokenTransferRequest = z.infer<typeof multiTokenTransferRequestSchema>;

export const multiTokenFeeEstimationRequestSchema = z
  .object({
    vaultAccountId: z.string().min(1, "vaultAccountId is required"),
    tokens: z.array(tokenSpecSchema).min(1, "At least one token must be specified"),
    recipientAddress: z.string().optional(),
    recipientVaultAccountId: z.string().optional(),
    recipientIndex: z.number().int().nonnegative().optional(),
    index: z.number().int().nonnegative().optional(),
    lovelaceAmount: z
      .number()
      .int("lovelaceAmount must be an integer")
      .min(1_000_000, "lovelaceAmount must be at least 1,000,000 lovelace (1 ADA)")
      .optional(),
    grossAmount: z.boolean().optional(),
  })
  .refine(multiTokenRecipientRefinement, { message: multiTokenRecipientMessage });

export type MultiTokenFeeEstimationRequest = z.infer<typeof multiTokenFeeEstimationRequestSchema>;

export const consolidateUtxosRequestSchema = z.object({
  vaultAccountId: z.string().min(1, "vaultAccountId is required"),
  index: z.number().int().nonnegative().optional(),
  minUtxoCount: z.number().int().min(2, "minUtxoCount must be at least 2").optional(),
  batched: z.boolean().optional(),
  batchSize: z.number().int().min(2).max(100).optional(),
  maxBatches: z.number().int().min(1).max(100).optional(),
});

export type ConsolidateUtxosRequest = z.infer<typeof consolidateUtxosRequestSchema>;

export const delegateToDRepRequestSchema = z
  .object({
    vaultAccountId: z.string().min(1, "vaultAccountId is required"),
    drepAction: z.enum(["always-abstain", "always-no-confidence", "custom-drep"], {
      message: 'drepAction must be "always-abstain", "always-no-confidence", or "custom-drep"',
    }),
    drepId: z
      .string()
      .refine(
        isValidDrepId,
        "drepId must be a 56-character hex string or a valid bech32 string with HRP drep/drep_script decoding to 28 bytes"
      )
      .optional(),
    fee: optionalFeeSchema,
  })
  .refine((data) => data.drepAction !== "custom-drep" || !!data.drepId, {
    message: "drepId is required when drepAction is custom-drep",
    path: ["drepId"],
  });

export type DelegateToDRepRequest = z.infer<typeof delegateToDRepRequestSchema>;

export const registerAsDRepRequestSchema = z.object({
  vaultAccountId: z.string().min(1, "vaultAccountId is required"),
  anchor: z
    .object({
      url: z
        .string()
        .min(1, "anchor.url is required")
        .max(128, "anchor.url must not exceed 128 bytes (Conway protocol limit)")
        .regex(/^https?:\/\/.+/, "anchor.url must be a valid HTTP/HTTPS URL"),
      dataHash: z
        .string()
        .length(64, "anchor.dataHash must be a 64-character hex string (blake2b-256)")
        .regex(/^[0-9a-fA-F]{64}$/, "anchor.dataHash must be hex"),
    })
    .optional(),
  depositAmount: z.number().int().positive().optional(),
  fee: optionalFeeSchema,
});

export type RegisterAsDRepRequest = z.infer<typeof registerAsDRepRequestSchema>;

const anchorSchema = z.object({
  url: z
    .string()
    .min(1, "anchor.url is required")
    .max(128, "anchor.url must not exceed 128 bytes (Conway protocol limit)")
    .regex(/^https?:\/\/.+/, "anchor.url must be a valid HTTP/HTTPS URL"),
  dataHash: z
    .string()
    .length(64, "anchor.dataHash must be a 64-character hex string (blake2b-256)")
    .regex(/^[0-9a-fA-F]{64}$/, "anchor.dataHash must be hex"),
});

export const castVoteRequestSchema = z.object({
  vaultAccountId: z.string().min(1, "vaultAccountId is required"),
  governanceActionId: z.object({
    txHash: z
      .string()
      .length(64, "governanceActionId.txHash must be a 64-character hex string")
      .regex(/^[0-9a-fA-F]{64}$/, "governanceActionId.txHash must be hex"),
    index: z
      .number()
      .int()
      .min(0, "governanceActionId.index must be a non-negative integer")
      .max(65535, "governanceActionId.index must fit in uint16 (0-65535) per Conway CDDL"),
  }),
  vote: z.enum(["yes", "no", "abstain"], { message: 'vote must be "yes", "no", or "abstain"' }),
  anchor: anchorSchema.optional(),
  fee: optionalFeeSchema,
});

export type CastVoteRequest = z.infer<typeof castVoteRequestSchema>;

// ======================
// Staking Schemas
// ======================

export const registerStakingRequestSchema = z.object({
  vaultAccountId: z.string().min(1, "vaultAccountId is required"),
  index: z.number().int().nonnegative().optional(),
});

export type RegisterStakingRequest = z.infer<typeof registerStakingRequestSchema>;

export const deregisterStakingRequestSchema = z.object({
  vaultAccountId: z.string().min(1, "vaultAccountId is required"),
});

export type DeregisterStakingRequest = z.infer<typeof deregisterStakingRequestSchema>;

export const delegateToPoolRequestSchema = z.object({
  vaultAccountId: z.string().min(1, "vaultAccountId is required"),
  poolId: z.string().min(1, "poolId is required"),
});

export type DelegateToPoolRequest = z.infer<typeof delegateToPoolRequestSchema>;

export const withdrawRewardsRequestSchema = z.object({
  vaultAccountId: z.string().min(1, "vaultAccountId is required"),
  limit: z.number().int().positive().optional(),
});

export type WithdrawRewardsRequest = z.infer<typeof withdrawRewardsRequestSchema>;

// ======================
// Query Parameter Schemas
// ======================

export const addressQuerySchema = z.object({
  index: z.coerce.number().int().nonnegative().optional().default(0),
});

export type AddressQuery = z.infer<typeof addressQuerySchema>;

export const txHistoryQuerySchema = z.object({
  index: z.coerce.number().int().nonnegative().optional().default(0),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
  fromSlot: z.coerce.number().int().nonnegative().optional(),
});

export type TxHistoryQuery = z.infer<typeof txHistoryQuerySchema>;

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
