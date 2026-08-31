import { describe, it, expect, jest } from '@jest/globals';
import { StakingValidator } from '../../services/staking/helpers/staking-validator.helper.js';
import { SdkApiError } from '../../types/index.js';
import { Logger } from '../../utils/index.js';

// H-2: checkRegistrationStatus must distinguish "stake key does not exist"
// (404) from any other error. A bare catch turning every failure into
// "not registered" causes the SDK to silently skip a deregistration on an
// Iagon outage, leaving the user's 2 ADA deposit locked.

const makeValidator = (
  getStakeAccountInfo: jest.Mock<(stakeAddress: string) => Promise<unknown>>
): StakingValidator => {
  const addressResolver = {
    getStakeAddress: jest.fn(async (_id: string) => 'stake_test1abc'),
  };
  const iagon = {
    getStakeAccountInfo,
  };
  const logger = new Logger('test:staking-validator');
  return new StakingValidator(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    iagon as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addressResolver as any,
    logger
  );
};

describe('StakingValidator.checkRegistrationStatus - H-2', () => {
  it('returns true when Iagon reports the stake account active', async () => {
    const v = makeValidator(
      jest.fn(async () => ({ data: { active: true } }))
    );
    await expect(v.checkRegistrationStatus('vault-1')).resolves.toBe(true);
  });

  it('returns false on Iagon 404 (stake key not registered)', async () => {
    const v = makeValidator(
      jest.fn(async () => {
        throw new SdkApiError('not found', 404, 'NotFound', undefined, 'iagon-api');
      })
    );
    await expect(v.checkRegistrationStatus('vault-1')).resolves.toBe(false);
  });

  it('propagates a 5xx Iagon failure instead of reporting "not registered"', async () => {
    const v = makeValidator(
      jest.fn(async () => {
        throw new SdkApiError('upstream broken', 503, 'BadGateway', undefined, 'iagon-api');
      })
    );
    await expect(v.checkRegistrationStatus('vault-1')).rejects.toBeInstanceOf(SdkApiError);
  });

  it('propagates a network error (no statusCode) instead of reporting "not registered"', async () => {
    const v = makeValidator(
      jest.fn(async () => {
        throw new SdkApiError('ECONNREFUSED', undefined, undefined, undefined, 'iagon-api');
      })
    );
    await expect(v.checkRegistrationStatus('vault-1')).rejects.toBeInstanceOf(SdkApiError);
  });

  it('propagates a non-SdkApiError throwable instead of reporting "not registered"', async () => {
    const v = makeValidator(
      jest.fn(async () => {
        throw new TypeError('boom');
      })
    );
    await expect(v.checkRegistrationStatus('vault-1')).rejects.toBeInstanceOf(TypeError);
  });
});

// The Iagon pool-info response reports retirement via a `status` field
// ("active" | "retiring" | "retired") plus `retiring_epoch`. Delegation to a
// retiring or retired pool must be rejected with PoolRetired.

const makeDelegationValidator = (
  poolData: Record<string, unknown> | null
): StakingValidator => {
  const addressResolver = {
    getStakeAddress: jest.fn(async (_id: string) => 'stake_test1abc'),
  };
  const iagon = {
    getStakeAccountInfo: jest.fn(async () => ({ data: { active: true, pool_id: null } })),
    getPoolInfo: jest.fn(async () => ({ success: true, data: poolData })),
  };
  const logger = new Logger('test:staking-validator');
  return new StakingValidator(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    iagon as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addressResolver as any,
    logger
  );
};

describe('StakingValidator.validateDelegationPrerequisites - M-15 pool retirement', () => {
  const poolId = 'pool1testpool';

  it('rejects delegation to a pool with status "retiring"', async () => {
    const v = makeDelegationValidator({
      pool_id: poolId,
      status: 'retiring',
      retiring_epoch: 300,
    });
    await expect(v.validateDelegationPrerequisites('vault-1', poolId)).rejects.toMatchObject({
      errorType: 'PoolRetired',
      statusCode: 400,
    });
  });

  it('rejects delegation to a pool with status "retired"', async () => {
    const v = makeDelegationValidator({
      pool_id: poolId,
      status: 'retired',
      retiring_epoch: 295,
    });
    await expect(v.validateDelegationPrerequisites('vault-1', poolId)).rejects.toMatchObject({
      errorType: 'PoolRetired',
      statusCode: 400,
    });
  });

  it('allows delegation to a pool with status "active"', async () => {
    const v = makeDelegationValidator({
      pool_id: poolId,
      status: 'active',
      retiring_epoch: null,
    });
    await expect(v.validateDelegationPrerequisites('vault-1', poolId)).resolves.toBeUndefined();
  });

  it('still rejects an unknown pool with PoolNotFound', async () => {
    const v = makeDelegationValidator(null);
    await expect(v.validateDelegationPrerequisites('vault-1', poolId)).rejects.toMatchObject({
      errorType: 'PoolNotFound',
      statusCode: 404,
    });
  });
});
