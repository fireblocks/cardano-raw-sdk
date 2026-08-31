/**
 * Zod schemas for Iagon API responses.
 *
 * Responses are validated at the service boundary so a contract change
 * fails loudly at the fetch site instead of surfacing as undefined
 * field reads deeper in the transaction-building path.
 */

import { z } from "zod";

export const utxoDataSchema = z.object({
  transaction_id: z.string(),
  output_index: z.number(),
  address: z.string(),
  value: z.object({
    lovelace: z.number(),
    assets: z.record(z.string(), z.number()).optional().default({}),
  }),
  datum_hash: z.string().nullable(),
  script_hash: z.string().nullable(),
  created_at: z.object({
    slot_no: z.number(),
    header_hash: z.string(),
  }),
});

export const utxoResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(utxoDataSchema).optional(),
});

export const balanceResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    lovelace: z.number(),
    assets: z.record(z.string(), z.union([z.number(), z.record(z.string(), z.number())])),
  }),
});

// Iagon /v1/tx/submit returns either { success: true, data: { txHash } }
// on a successful submission or { success: false, error: "..." } on
// rejection. Both arrive with HTTP 200, so the schema parses
// permissively and submitTransfer surfaces the error itself.
export const transferResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({ txHash: z.string() }).optional(),
  error: z.string().optional(),
});

// The pool-retirement gate (staking-validator.helper.ts) keys on
// data.status and data.retiring_epoch. Only this safety-critical
// subset is validated; the payload is returned unstripped for the
// pool-info passthrough endpoint. data stays optional so a
// success:false response still maps to PoolNotFound downstream.
export const poolInfoResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      pool_id: z.string(),
      status: z.enum(["active", "retiring", "retired"]),
      retiring_epoch: z.number().nullable(),
    })
    .passthrough()
    .optional(),
});
