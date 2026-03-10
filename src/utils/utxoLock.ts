/**
 * UTxO locking to prevent double-spend in concurrent requests.
 *
 * Locks are held for UTXO_LOCK_TTL_MS and automatically expire, so a crashed
 * request can never permanently block a UTxO.
 */

import { CardanoConstants } from "../constants.js";

class UtxoLockManager {
  private readonly locks = new Map<string, number>();

  private key(txId: string, index: number): string {
    return `${txId}#${index}`;
  }

  isLocked(txId: string, index: number): boolean {
    const k = this.key(txId, index);
    const expiry = this.locks.get(k);
    if (expiry === undefined) return false;
    if (Date.now() > expiry) {
      this.locks.delete(k);
      return false;
    }
    return true;
  }

  /**
   * Lock a set of UTxOs and return a release function.
   * Calling release() more than once is safe (idempotent).
   */
  lock(utxos: ReadonlyArray<{ transaction_id: string; output_index: number }>): () => void {
    const expiry = Date.now() + CardanoConstants.UTXO_LOCK_TTL_MS;
    const keys = utxos.map((u) => this.key(u.transaction_id, u.output_index));
    for (const k of keys) this.locks.set(k, expiry);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const k of keys) this.locks.delete(k);
    };
  }
}

export const utxoLocks = new UtxoLockManager();
