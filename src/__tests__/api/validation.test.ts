import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import {
  vaultAccountIdParamsSchema,
  poolIdParamsSchema,
  credentialParamsSchema,
  hashParamsSchema,
  consolidateUtxosRequestSchema,
  registerStakingRequestSchema,
  deregisterStakingRequestSchema,
  delegateToPoolRequestSchema,
  withdrawRewardsRequestSchema,
  registerAsDRepRequestSchema,
  castVoteRequestSchema,
} from '../../api/validation.js';

describe('vaultAccountIdParamsSchema', () => {
  it('should accept valid vault account ID', () => {
    const result = vaultAccountIdParamsSchema.parse({ vaultAccountId: '123' });
    expect(result.vaultAccountId).toBe('123');
  });

  it('should accept numeric vault account ID as string', () => {
    const result = vaultAccountIdParamsSchema.parse({ vaultAccountId: '0' });
    expect(result.vaultAccountId).toBe('0');
  });

  it('should reject empty string', () => {
    expect(() =>
      vaultAccountIdParamsSchema.parse({ vaultAccountId: '' })
    ).toThrow(z.ZodError);
  });

  it('should reject missing vaultAccountId', () => {
    expect(() => vaultAccountIdParamsSchema.parse({})).toThrow(z.ZodError);
  });
});

describe('poolIdParamsSchema', () => {
  it('should accept valid pool ID', () => {
    const result = poolIdParamsSchema.parse({ poolId: 'pool123abc' });
    expect(result.poolId).toBe('pool123abc');
  });

  it('should reject empty string', () => {
    expect(() => poolIdParamsSchema.parse({ poolId: '' })).toThrow(z.ZodError);
  });

  it('should reject missing poolId', () => {
    expect(() => poolIdParamsSchema.parse({})).toThrow(z.ZodError);
  });
});

describe('credentialParamsSchema', () => {
  it('should accept valid credential params', () => {
    const result = credentialParamsSchema.parse({
      vaultAccountId: '123',
      credential: 'abc123',
    });
    expect(result.vaultAccountId).toBe('123');
    expect(result.credential).toBe('abc123');
  });

  it('should reject empty vaultAccountId', () => {
    expect(() =>
      credentialParamsSchema.parse({ vaultAccountId: '', credential: 'abc' })
    ).toThrow(z.ZodError);
  });

  it('should reject empty credential', () => {
    expect(() =>
      credentialParamsSchema.parse({ vaultAccountId: '123', credential: '' })
    ).toThrow(z.ZodError);
  });

  it('should reject missing fields', () => {
    expect(() => credentialParamsSchema.parse({ vaultAccountId: '123' })).toThrow(
      z.ZodError
    );
    expect(() => credentialParamsSchema.parse({ credential: 'abc' })).toThrow(z.ZodError);
  });
});

describe('hashParamsSchema', () => {
  it('should accept valid transaction hash', () => {
    const txHash = 'a'.repeat(64);
    const result = hashParamsSchema.parse({ hash: txHash });
    expect(result.hash).toBe(txHash);
  });

  it('should reject empty hash', () => {
    expect(() => hashParamsSchema.parse({ hash: '' })).toThrow(z.ZodError);
  });

  it('should reject missing hash', () => {
    expect(() => hashParamsSchema.parse({})).toThrow(z.ZodError);
  });
});

describe('consolidateUtxosRequestSchema', () => {
  it('should accept valid consolidation request', () => {
    const result = consolidateUtxosRequestSchema.parse({
      vaultAccountId: '0',
      index: 0,
    });
    expect(result.vaultAccountId).toBe('0');
    expect(result.index).toBe(0);
  });

  it('should accept optional index and minUtxoCount', () => {
    const result = consolidateUtxosRequestSchema.parse({
      vaultAccountId: '0',
    });
    expect(result.vaultAccountId).toBe('0');
    expect(result.index).toBeUndefined();
    expect(result.minUtxoCount).toBeUndefined();
  });

  it('should accept optional minUtxoCount', () => {
    const result = consolidateUtxosRequestSchema.parse({
      vaultAccountId: '0',
      minUtxoCount: 10,
    });
    expect(result.minUtxoCount).toBe(10);
  });

  it('should reject missing vaultAccountId', () => {
    expect(() =>
      consolidateUtxosRequestSchema.parse({ index: 0 })
    ).toThrow(z.ZodError);
  });

  it('should reject negative index', () => {
    expect(() =>
      consolidateUtxosRequestSchema.parse({ vaultAccountId: '0', index: -1 })
    ).toThrow(z.ZodError);
  });

  it('should reject non-integer index', () => {
    expect(() =>
      consolidateUtxosRequestSchema.parse({ vaultAccountId: '0', index: 1.5 })
    ).toThrow(z.ZodError);
  });

  it('should reject minUtxoCount less than 2', () => {
    expect(() =>
      consolidateUtxosRequestSchema.parse({ vaultAccountId: '0', minUtxoCount: 1 })
    ).toThrow(z.ZodError);
  });
});

describe('registerStakingRequestSchema', () => {
  it('should accept valid registration request', () => {
    const result = registerStakingRequestSchema.parse({
      vaultAccountId: '0',
      index: 0,
    });
    expect(result.vaultAccountId).toBe('0');
    expect(result.index).toBe(0);
  });

  it('should accept optional index (defaults handled elsewhere)', () => {
    const result = registerStakingRequestSchema.parse({
      vaultAccountId: '0',
    });
    expect(result.vaultAccountId).toBe('0');
    expect(result.index).toBeUndefined();
  });

  it('should reject missing vaultAccountId', () => {
    expect(() => registerStakingRequestSchema.parse({ index: 0 })).toThrow(z.ZodError);
  });

  it('should reject negative index', () => {
    expect(() =>
      registerStakingRequestSchema.parse({ vaultAccountId: '0', index: -1 })
    ).toThrow(z.ZodError);
  });

  it('should reject non-integer index', () => {
    expect(() =>
      registerStakingRequestSchema.parse({ vaultAccountId: '0', index: 2.5 })
    ).toThrow(z.ZodError);
  });
});

describe('deregisterStakingRequestSchema', () => {
  it('should accept valid deregistration request', () => {
    const result = deregisterStakingRequestSchema.parse({
      vaultAccountId: '5',
    });
    expect(result.vaultAccountId).toBe('5');
  });

  it('should accept vault account 0', () => {
    const result = deregisterStakingRequestSchema.parse({ vaultAccountId: '0' });
    expect(result.vaultAccountId).toBe('0');
  });

  it('should reject empty vaultAccountId', () => {
    expect(() =>
      deregisterStakingRequestSchema.parse({ vaultAccountId: '' })
    ).toThrow(z.ZodError);
  });

  it('should reject missing vaultAccountId', () => {
    expect(() => deregisterStakingRequestSchema.parse({})).toThrow(z.ZodError);
  });
});

describe('delegateToPoolRequestSchema', () => {
  it('should accept valid pool delegation request', () => {
    const result = delegateToPoolRequestSchema.parse({
      vaultAccountId: '0',
      poolId: 'pool1abc123',
    });
    expect(result.poolId).toBe('pool1abc123');
    expect(result.vaultAccountId).toBe('0');
  });

  it('should require both vaultAccountId and poolId', () => {
    const result = delegateToPoolRequestSchema.parse({
      vaultAccountId: '123',
      poolId: 'pool1xyz',
    });
    expect(result.poolId).toBe('pool1xyz');
    expect(result.vaultAccountId).toBe('123');
  });

  it('should reject missing poolId', () => {
    expect(() =>
      delegateToPoolRequestSchema.parse({ vaultAccountId: '0' })
    ).toThrow(z.ZodError);
  });

  it('should reject missing vaultAccountId', () => {
    expect(() =>
      delegateToPoolRequestSchema.parse({ poolId: 'pool1abc' })
    ).toThrow(z.ZodError);
  });

  it('should reject empty poolId', () => {
    expect(() =>
      delegateToPoolRequestSchema.parse({ vaultAccountId: '0', poolId: '' })
    ).toThrow(z.ZodError);
  });

  it('should reject empty vaultAccountId', () => {
    expect(() =>
      delegateToPoolRequestSchema.parse({ vaultAccountId: '', poolId: 'pool1abc' })
    ).toThrow(z.ZodError);
  });
});

describe('withdrawRewardsRequestSchema', () => {
  it('should accept valid withdrawal request', () => {
    const result = withdrawRewardsRequestSchema.parse({
      vaultAccountId: '2',
      limit: 10,
    });
    expect(result.vaultAccountId).toBe('2');
    expect(result.limit).toBe(10);
  });

  it('should accept optional limit', () => {
    const result = withdrawRewardsRequestSchema.parse({ vaultAccountId: '0' });
    expect(result.vaultAccountId).toBe('0');
    expect(result.limit).toBeUndefined();
  });

  it('should reject missing vaultAccountId', () => {
    expect(() => withdrawRewardsRequestSchema.parse({})).toThrow(z.ZodError);
  });

  it('should reject negative limit', () => {
    expect(() =>
      withdrawRewardsRequestSchema.parse({ vaultAccountId: '0', limit: -3 })
    ).toThrow(z.ZodError);
  });

  it('should reject zero limit', () => {
    expect(() =>
      withdrawRewardsRequestSchema.parse({ vaultAccountId: '0', limit: 0 })
    ).toThrow(z.ZodError);
  });
});

describe('registerAsDRepRequestSchema', () => {
  it('should accept valid DRep registration with anchor', () => {
    const result = registerAsDRepRequestSchema.parse({
      vaultAccountId: '0',
      anchor: {
        url: 'https://example.com/drep.json',
        dataHash: 'a'.repeat(64),
      },
    });
    expect(result.vaultAccountId).toBe('0');
    expect(result.anchor).toBeDefined();
    expect(result.anchor!.url).toBe('https://example.com/drep.json');
    expect(result.anchor!.dataHash).toBe('a'.repeat(64));
  });

  it('should accept optional anchor', () => {
    const result = registerAsDRepRequestSchema.parse({
      vaultAccountId: '0',
    });
    expect(result.vaultAccountId).toBe('0');
    expect(result.anchor).toBeUndefined();
  });

  it('should reject missing vaultAccountId', () => {
    expect(() => registerAsDRepRequestSchema.parse({})).toThrow(z.ZodError);
  });

  it('should reject invalid anchor URL', () => {
    expect(() =>
      registerAsDRepRequestSchema.parse({
        vaultAccountId: '0',
        anchor: {
          url: 'not-a-url',
          dataHash: 'a'.repeat(64),
        },
      })
    ).toThrow(z.ZodError);
  });

  it('should reject anchor with missing dataHash', () => {
    expect(() =>
      registerAsDRepRequestSchema.parse({
        vaultAccountId: '0',
        anchor: {
          url: 'https://example.com/drep.json',
        },
      })
    ).toThrow(z.ZodError);
  });

  it('should reject anchor with invalid dataHash length', () => {
    expect(() =>
      registerAsDRepRequestSchema.parse({
        vaultAccountId: '0',
        anchor: {
          url: 'https://example.com/drep.json',
          dataHash: 'short',
        },
      })
    ).toThrow(z.ZodError);
  });

  it('should accept optional depositAmount', () => {
    const result = registerAsDRepRequestSchema.parse({
      vaultAccountId: '0',
      depositAmount: 500_000_000,
    });
    expect(result.depositAmount).toBe(500_000_000);
  });

  it('should accept optional fee', () => {
    const result = registerAsDRepRequestSchema.parse({
      vaultAccountId: '0',
      fee: 1_000_000,
    });
    expect(result.fee).toBe(1_000_000);
  });

  it('should reject negative depositAmount', () => {
    expect(() =>
      registerAsDRepRequestSchema.parse({ vaultAccountId: '0', depositAmount: -1 })
    ).toThrow(z.ZodError);
  });
});

describe('castVoteRequestSchema', () => {
  it('should accept valid vote cast request', () => {
    const result = castVoteRequestSchema.parse({
      vaultAccountId: '0',
      governanceActionId: {
        txHash: 'a'.repeat(64),
        index: 0,
      },
      vote: 'yes',
      anchor: {
        url: 'https://example.com/vote.json',
        dataHash: 'b'.repeat(64),
      },
    });
    expect(result.vaultAccountId).toBe('0');
    expect(result.governanceActionId.txHash).toBe('a'.repeat(64));
    expect(result.governanceActionId.index).toBe(0);
    expect(result.vote).toBe('yes');
    expect(result.anchor).toBeDefined();
  });

  it('should accept "no" vote', () => {
    const result = castVoteRequestSchema.parse({
      vaultAccountId: '0',
      governanceActionId: {
        txHash: 'a'.repeat(64),
        index: 0,
      },
      vote: 'no',
    });
    expect(result.vote).toBe('no');
  });

  it('should accept "abstain" vote', () => {
    const result = castVoteRequestSchema.parse({
      vaultAccountId: '0',
      governanceActionId: {
        txHash: 'a'.repeat(64),
        index: 0,
      },
      vote: 'abstain',
    });
    expect(result.vote).toBe('abstain');
  });

  it('should accept optional anchor', () => {
    const result = castVoteRequestSchema.parse({
      vaultAccountId: '0',
      governanceActionId: {
        txHash: 'a'.repeat(64),
        index: 0,
      },
      vote: 'yes',
    });
    expect(result.anchor).toBeUndefined();
  });

  it('should reject missing vaultAccountId', () => {
    expect(() =>
      castVoteRequestSchema.parse({
        governanceActionId: {
          txHash: 'a'.repeat(64),
          index: 0,
        },
        vote: 'yes',
      })
    ).toThrow(z.ZodError);
  });

  it('should reject missing governanceActionId', () => {
    expect(() =>
      castVoteRequestSchema.parse({
        vaultAccountId: '0',
        vote: 'yes',
      })
    ).toThrow(z.ZodError);
  });

  it('should reject missing vote', () => {
    expect(() =>
      castVoteRequestSchema.parse({
        vaultAccountId: '0',
        governanceActionId: {
          txHash: 'a'.repeat(64),
          index: 0,
        },
      })
    ).toThrow(z.ZodError);
  });

  it('should reject invalid vote value', () => {
    expect(() =>
      castVoteRequestSchema.parse({
        vaultAccountId: '0',
        governanceActionId: {
          txHash: 'a'.repeat(64),
          index: 0,
        },
        vote: 'invalid',
      })
    ).toThrow(z.ZodError);
  });

  it('should reject negative governanceActionId.index', () => {
    expect(() =>
      castVoteRequestSchema.parse({
        vaultAccountId: '0',
        governanceActionId: {
          txHash: 'a'.repeat(64),
          index: -1,
        },
        vote: 'yes',
      })
    ).toThrow(z.ZodError);
  });

  it('should reject non-integer governanceActionId.index', () => {
    expect(() =>
      castVoteRequestSchema.parse({
        vaultAccountId: '0',
        governanceActionId: {
          txHash: 'a'.repeat(64),
          index: 1.5,
        },
        vote: 'yes',
      })
    ).toThrow(z.ZodError);
  });

  it('should reject invalid governanceActionId.txHash format', () => {
    expect(() =>
      castVoteRequestSchema.parse({
        vaultAccountId: '0',
        governanceActionId: {
          txHash: 'invalid-hash',
          index: 0,
        },
        vote: 'yes',
      })
    ).toThrow(z.ZodError);
  });

  it('should accept optional fee', () => {
    const result = castVoteRequestSchema.parse({
      vaultAccountId: '0',
      governanceActionId: {
        txHash: 'a'.repeat(64),
        index: 0,
      },
      vote: 'yes',
      fee: 1_000_000,
    });
    expect(result.fee).toBe(1_000_000);
  });
});
