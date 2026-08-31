import { describe, it, expect, jest } from '@jest/globals';
import { Transaction } from '@emurgo/cardano-serialization-lib-nodejs';
import { submitTransaction } from '../../utils/cardano.js';
import { SdkApiError } from '../../types/index.js';
import { IagonApiService } from '../../services/index.js';

// H-1: submitTransaction must surface the upstream Iagon error message and
// preserve SdkApiError so the staking-service retry-on-IncompleteWithdrawals
// substring check fires correctly.

const fakeSignedTx = (): Transaction => {
  // Tiny CBOR for testing: a Transaction object with empty body and
  // witness set. submitTransaction only calls .to_bytes() on it.
  return {
    to_bytes: () => new Uint8Array([0x84, 0xa0, 0xa0, 0xf6, 0xf6]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
};

describe('submitTransaction - H-1 upstream error propagation', () => {
  it('passes through an SdkApiError thrown by submitTransfer with its message intact', async () => {
    const sdkErr = new SdkApiError(
      'Transaction submission rejected: IncompleteWithdrawals: must withdraw rewards in full',
      400,
      'TX_SUBMIT_REJECTED',
      { iagonError: 'IncompleteWithdrawals: must withdraw rewards in full' },
      'iagon-api'
    );
    const mockIagon = {
      submitTransfer: jest.fn(async () => {
        throw sdkErr;
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as unknown as IagonApiService;

    await expect(submitTransaction(mockIagon, fakeSignedTx())).rejects.toBe(sdkErr);
  });

  it('preserves the "IncompleteWithdrawals" substring so the retry detector fires', async () => {
    const mockIagon = {
      submitTransfer: jest.fn(async () => {
        throw new SdkApiError(
          'Transaction submission rejected: IncompleteWithdrawals: amount mismatch',
          400,
          'TX_SUBMIT_REJECTED'
        );
      }),
    } as unknown as IagonApiService;

    try {
      await submitTransaction(mockIagon, fakeSignedTx());
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SdkApiError);
      const msg = (err as Error).message.toLowerCase();
      // Same substrings the staking-service retry detector matches on.
      expect(msg).toMatch(/incomplete|rewards in full|incompletewithdrawals/);
    }
  });

  it('wraps non-SdkApiError exceptions in a generic Error (legacy behaviour)', async () => {
    const mockIagon = {
      submitTransfer: jest.fn(async () => {
        throw new Error('network reset');
      }),
    } as unknown as IagonApiService;

    await expect(submitTransaction(mockIagon, fakeSignedTx())).rejects.toThrow(
      /Error submitting transaction: network reset/
    );
  });

  it('returns the txHash on a successful submission', async () => {
    const mockIagon = {
      submitTransfer: jest.fn(async () => ({
        success: true as const,
        data: { txHash: 'aa'.repeat(32) },
      })),
    } as unknown as IagonApiService;

    const hash = await submitTransaction(mockIagon, fakeSignedTx());
    expect(hash).toBe('aa'.repeat(32));
  });
});
