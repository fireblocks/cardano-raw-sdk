/**
 * UTxO locking to prevent double-spend in concurrent requests.
 *
 * Locks are held for UTXO_LOCK_TTL_MS and automatically expire, so a crashed
 * request can never permanently block a UTxO.
 */

import { CardanoConstants } from "../constants.js";
import { Logger } from "./logger.js";

const logger = new Logger("utxo-lock");

interface LockEntry {
  expiry: number;
  /** Identifies which lock() acquisition currently owns this key. */
  token: number;
}

class UtxoLockManager {
  private readonly locks = new Map<string, LockEntry>();
  /** Monotonic counter giving every lock() acquisition a unique ownership token. */
  private nextToken = 1;

  private key(txId: string, index: number): string {
    return `${txId}#${index}`;
  }

  isLocked(txId: string, index: number): boolean {
    const k = this.key(txId, index);
    const entry = this.locks.get(k);
    if (entry === undefined) return false;
    if (Date.now() > entry.expiry) {
      this.locks.delete(k);
      return false;
    }
    return true;
  }

  /**
   * Lock a set of UTxOs and return a release function.
   * Calling release() more than once is safe (idempotent).
   *
   * Overwrites existing locks unconditionally; callers that must not
   * take over a live lock use {@link tryLock} instead.
   *
   * Each acquisition carries a unique ownership token, and release() only clears keys
   * this acquisition still owns. So a stale release() — e.g. from an operation whose
   * lock already expired and was re-acquired by another operation — cannot free the new
   * owner's lock.
   */
  lock(utxos: ReadonlyArray<{ transaction_id: string; output_index: number }>): () => void {
    const liveCount = utxos.filter((u) => this.isLocked(u.transaction_id, u.output_index)).length;
    if (liveCount > 0) {
      logger.warn(
        `lock() is overwriting ${liveCount} live UTxO lock(s) held by a concurrent operation`
      );
    }

    const token = this.nextToken++;
    const expiry = Date.now() + CardanoConstants.UTXO_LOCK_TTL_MS;
    const keys = utxos.map((u) => this.key(u.transaction_id, u.output_index));
    for (const k of keys) this.locks.set(k, { expiry, token });

    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const k of keys) {
        const entry = this.locks.get(k);
        // Only clear the key if we still own it; a newer lock() (after our TTL expiry)
        // may have re-acquired it and must not be released by us.
        if (entry && entry.token === token) this.locks.delete(k);
      }
    };
  }

  /**
   * Atomically lock a set of UTxOs only if none of them currently
   * holds a live lock. Returns a release function on success, or null
   * if any UTxO in the set is already locked (nothing is locked in
   * that case). The check and acquisition run synchronously, so no
   * concurrent operation can interleave between them.
   */
  tryLock(
    utxos: ReadonlyArray<{ transaction_id: string; output_index: number }>
  ): (() => void) | null {
    if (utxos.some((u) => this.isLocked(u.transaction_id, u.output_index))) {
      return null;
    }
    return this.lock(utxos);
  }

  /**
   * Lock a single UTxO by txHash and index.
   * Convenience method for staking operations that select one UTXO at a time.
   */
  lockOne(txHash: string, index: number): () => void {
    return this.lock([{ transaction_id: txHash, output_index: index }]);
  }

  /**
   * Atomically lock a single UTxO. Returns null if it already holds a
   * live lock. See {@link tryLock}.
   */
  tryLockOne(txHash: string, index: number): (() => void) | null {
    return this.tryLock([{ transaction_id: txHash, output_index: index }]);
  }
}

export const utxoLocks = new UtxoLockManager();
