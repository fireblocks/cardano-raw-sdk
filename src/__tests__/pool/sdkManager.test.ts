import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { SdkManager } from '../../pool/sdkManager.js';
import { Networks } from '../../types/index.js';

// Minimal stand-in for FireblocksCardanoRawSDK in pool tests. The manager
// never calls SDK methods - it only stores/returns the instance.
const makeFakeSdk = (id: string) => ({ __id: id });

const makeManager = (
  factory: (vaultAccountId: string) => Promise<unknown>,
  maxPoolSize = 100
): SdkManager => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseConfig: any = { apiKey: 'k', secretKey: 's', basePath: 'https://x' };
  const manager = new SdkManager(
    baseConfig,
    Networks.PREPROD,
    { maxPoolSize },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (async (vaultAccountId: string) => factory(vaultAccountId)) as any
  );
  return manager;
};

describe('SdkManager.getSdk - M-21 concurrent cache-miss', () => {
  let manager: SdkManager | undefined;

  afterEach(() => {
    // SdkManager schedules a setInterval; clear it so tests exit cleanly.
    if (manager) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const interval = (manager as any).cleanupInterval as NodeJS.Timeout;
      clearInterval(interval);
      manager = undefined;
    }
  });

  it('shares a single SDK across concurrent callers for the same vault', async () => {
    let calls = 0;
    // Factory deliberately yields with a small await so multiple callers can
    // race past the cache check before the first one resolves.
    const factory = jest.fn(async (vaultAccountId: string) => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return makeFakeSdk(`${vaultAccountId}:${calls}`);
    });

    manager = makeManager(factory);

    const concurrency = 8;
    const results = await Promise.all(
      Array.from({ length: concurrency }, () => manager!.getSdk('vault-A'))
    );

    // Factory called exactly once across all concurrent waiters.
    expect(factory).toHaveBeenCalledTimes(1);

    // Every caller received the same instance.
    const first = results[0];
    for (const r of results) {
      expect(r).toBe(first);
    }
  });

  it('still allocates separate SDKs for distinct vault accounts in parallel', async () => {
    let calls = 0;
    const factory = jest.fn(async (vaultAccountId: string) => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      return makeFakeSdk(`${vaultAccountId}:${calls}`);
    });

    manager = makeManager(factory);

    const [a, b, c] = await Promise.all([
      manager.getSdk('vault-A'),
      manager.getSdk('vault-B'),
      manager.getSdk('vault-C'),
    ]);

    expect(factory).toHaveBeenCalledTimes(3);
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
  });

  it('re-allocates after a previous in-flight creation rejected', async () => {
    let attempt = 0;
    const factory = jest.fn(async () => {
      attempt++;
      await new Promise((r) => setTimeout(r, 5));
      if (attempt === 1) throw new Error('boom');
      return makeFakeSdk(`vault-A:${attempt}`);
    });

    manager = makeManager(factory);

    await expect(manager.getSdk('vault-A')).rejects.toThrow('boom');
    // Second call must not be blocked by the stale in-flight entry.
    const sdk = await manager.getSdk('vault-A');
    expect(sdk).toBeDefined();
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
