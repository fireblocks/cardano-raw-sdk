import { z } from "zod";
import { Request, Response, NextFunction } from "express";

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
    minRecipientLovelace: z.number().int().positive().optional(),
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
    minRecipientLovelace: z.number().int().positive().optional(),
    grossAmount: z.boolean().optional(),
  })
  .refine(multiTokenRecipientRefinement, { message: multiTokenRecipientMessage });

export type MultiTokenFeeEstimationRequest = z.infer<typeof multiTokenFeeEstimationRequestSchema>;

export const consolidateUtxosRequestSchema = z.object({
  vaultAccountId: z.string().min(1, "vaultAccountId is required"),
  index: z.number().int().nonnegative().optional(),
  minUtxoCount: z.number().int().min(2, "minUtxoCount must be at least 2").optional(),
});

export type ConsolidateUtxosRequest = z.infer<typeof consolidateUtxosRequestSchema>;
