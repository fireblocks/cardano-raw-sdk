import { describe, it, expect } from '@jest/globals';
import {
  Networks,
  TransactionType,
  SupportedAssets,
  GroupByOptions,
  WebhookEventTypes,
  RewardType,
  PoolStatus,
  DRepKind,
  CertificateType,
  DRepAction,
  StakingOperation,
} from '../../types/enums.js';

describe('Networks', () => {
  it('should have mainnet network', () => {
    expect(Networks.MAINNET).toBe('mainnet');
  });

  it('should have preprod testnet', () => {
    expect(Networks.PREPROD).toBe('preprod');
  });

  it('should have preview testnet', () => {
    expect(Networks.PREVIEW).toBe('preview');
  });

  it('should have exactly 3 networks', () => {
    const networks = Object.values(Networks);
    expect(networks).toHaveLength(3);
  });
});

describe('TransactionType', () => {
  it('should have balance check by address', () => {
    expect(TransactionType.GET_BLALANCE_BY_ADDRESS).toBe('checkBalanceByAddress');
  });

  it('should have balance check by credential', () => {
    expect(TransactionType.GET_BLALNCE_BY_CREDENTIAL_ID).toBe('getBalanceByCredential');
  });

  it('should have balance check by stake key', () => {
    expect(TransactionType.GET_BALANCE_BY_STAKE_KEY).toBe('getBalanceByStakeKey');
  });

  it('should have transaction history query', () => {
    expect(TransactionType.GET_TRANSACTIONS_HISTORY).toBe('getTransactionsHistory');
  });

  it('should have transfer type', () => {
    expect(TransactionType.TRANSFER).toBe('TRANSFER');
  });
});

describe('SupportedAssets', () => {
  it('should support mainnet ADA', () => {
    expect(SupportedAssets.ADA).toBe('ADA');
  });

  it('should support testnet ADA', () => {
    expect(SupportedAssets.ADA_TEST).toBe('ADA_TEST');
  });

  it('should have exactly 2 supported assets', () => {
    const assets = Object.values(SupportedAssets);
    expect(assets).toHaveLength(2);
  });
});

describe('GroupByOptions', () => {
  it('should support grouping by token', () => {
    expect(GroupByOptions.TOKEN).toBe('token');
  });

  it('should support grouping by address', () => {
    expect(GroupByOptions.ADDRESS).toBe('address');
  });

  it('should support grouping by policy', () => {
    expect(GroupByOptions.POLICY).toBe('policy');
  });

  it('should have exactly 3 grouping options', () => {
    const options = Object.values(GroupByOptions);
    expect(options).toHaveLength(3);
  });
});

describe('WebhookEventTypes', () => {
  it('should have transaction created event', () => {
    expect(WebhookEventTypes.TRANSACTION_CREATED).toBe('transaction.created');
  });

  it('should have transaction status updated event', () => {
    expect(WebhookEventTypes.TRANSACTION_STATUS_UPDATED).toBe('transaction.status.updated');
  });

  it('should have transaction approval status updated event', () => {
    expect(WebhookEventTypes.TRANSACTION_APPROVAL_STATUS_UPDATED).toBe(
      'transaction.approval_status.updated'
    );
  });

  it('should have network records processing completed event', () => {
    expect(WebhookEventTypes.TRANSACTION_NETWORK_RECORDS_PROCESSING_COMPLETED).toBe(
      'transaction.network_records.processing_completed'
    );
  });

  it('should have exactly 4 webhook event types', () => {
    const events = Object.values(WebhookEventTypes);
    expect(events).toHaveLength(4);
  });
});

describe('RewardType', () => {
  it('should have leader reward type', () => {
    expect(RewardType.LEADER).toBe('leader');
  });

  it('should have member reward type', () => {
    expect(RewardType.MEMBER).toBe('member');
  });

  it('should have reserves reward type', () => {
    expect(RewardType.RESERVES).toBe('reserves');
  });

  it('should have treasury reward type', () => {
    expect(RewardType.TREASURY).toBe('treasury');
  });

  it('should have refund reward type', () => {
    expect(RewardType.REFUND).toBe('refund');
  });

  it('should have exactly 5 reward types', () => {
    const types = Object.values(RewardType);
    expect(types).toHaveLength(5);
  });
});

describe('PoolStatus', () => {
  it('should have active status', () => {
    expect(PoolStatus.ACTIVE).toBe('active');
  });

  it('should have retiring status', () => {
    expect(PoolStatus.RETIRING).toBe('retiring');
  });

  it('should have retired status', () => {
    expect(PoolStatus.RETRIED).toBe('retried');
  });

  it('should have exactly 3 pool statuses', () => {
    const statuses = Object.values(PoolStatus);
    expect(statuses).toHaveLength(3);
  });
});

describe('DRepKind - Conway Governance', () => {
  it('should have KEY_HASH = 0 per Conway CDDL spec', () => {
    expect(DRepKind.KEY_HASH).toBe(0);
  });

  it('should have SCRIPT_HASH = 1 per Conway CDDL spec', () => {
    expect(DRepKind.SCRIPT_HASH).toBe(1);
  });

  it('should have ALWAYS_ABSTAIN = 2 per Conway CDDL spec', () => {
    expect(DRepKind.ALWAYS_ABSTAIN).toBe(2);
  });

  it('should have ALWAYS_NO_CONFIDENCE = 3 per Conway CDDL spec', () => {
    expect(DRepKind.ALWAYS_NO_CONFIDENCE).toBe(3);
  });

  it('should have exactly 4 DRep kinds', () => {
    const kinds = Object.values(DRepKind).filter((v) => typeof v === 'number');
    expect(kinds).toHaveLength(4);
  });

  it('should have sequential numeric values', () => {
    expect(DRepKind.KEY_HASH).toBe(0);
    expect(DRepKind.SCRIPT_HASH).toBe(1);
    expect(DRepKind.ALWAYS_ABSTAIN).toBe(2);
    expect(DRepKind.ALWAYS_NO_CONFIDENCE).toBe(3);
  });
});

describe('CertificateType', () => {
  describe('Pre-Conway (Shelley-Babbage)', () => {
    it('should have stake key registration = 0', () => {
      expect(CertificateType.STAKE_KEY_REGISTRATION).toBe(0);
    });

    it('should have stake key deregistration = 1', () => {
      expect(CertificateType.STAKE_KEY_DEREGISTRATION).toBe(1);
    });

    it('should have delegation = 2', () => {
      expect(CertificateType.DELEGATION).toBe(2);
    });
  });

  describe('Conway Era', () => {
    it('should have stake registration = 7 (Conway)', () => {
      expect(CertificateType.STAKE_REGISTRATION).toBe(7);
    });

    it('should have stake deregistration = 8 (Conway)', () => {
      expect(CertificateType.STAKE_DEREGISTRATION).toBe(8);
    });

    it('should have vote delegation = 9 (Conway)', () => {
      expect(CertificateType.VOTE_DELEGATION).toBe(9);
    });

    it('should have DRep registration = 16 (Conway)', () => {
      expect(CertificateType.DREP_REGISTRATION).toBe(16);
    });
  });

  it('should have distinct values for all certificate types', () => {
    const values = Object.values(CertificateType).filter((v) => typeof v === 'number');
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });

  it('should differentiate Shelley vs Conway registration types', () => {
    expect(CertificateType.STAKE_KEY_REGISTRATION).not.toBe(
      CertificateType.STAKE_REGISTRATION
    );
    expect(CertificateType.STAKE_KEY_DEREGISTRATION).not.toBe(
      CertificateType.STAKE_DEREGISTRATION
    );
  });
});

describe('DRepAction', () => {
  it('should have always-abstain action', () => {
    expect(DRepAction.ALWAYS_ABSTAIN).toBe('always-abstain');
  });

  it('should have always-no-confidence action', () => {
    expect(DRepAction.ALWAYS_NO_CONFIDENCE).toBe('always-no-confidence');
  });

  it('should have custom-drep action', () => {
    expect(DRepAction.CUSTOM_DREP).toBe('custom-drep');
  });

  it('should have exactly 3 DRep actions', () => {
    const actions = Object.values(DRepAction);
    expect(actions).toHaveLength(3);
  });

  it('should use kebab-case naming', () => {
    Object.values(DRepAction).forEach((action) => {
      expect(action).toMatch(/^[a-z]+(-[a-z]+)*$/);
    });
  });
});

describe('StakingOperation', () => {
  it('should have register operation', () => {
    expect(StakingOperation.REGISTER).toBe('register');
  });

  it('should have delegate operation', () => {
    expect(StakingOperation.DELEGATE).toBe('delegate');
  });

  it('should have deregister operation', () => {
    expect(StakingOperation.DEREGISTER).toBe('deregister');
  });

  it('should have withdraw rewards operation', () => {
    expect(StakingOperation.WITHDRAW_REWARDS).toBe('withdraw-rewards');
  });

  it('should have vote delegate operation (Conway)', () => {
    expect(StakingOperation.VOTE_DELEGATE).toBe('vote-delegate');
  });

  it('should have register DRep operation (Conway)', () => {
    expect(StakingOperation.REGISTER_DREP).toBe('register-drep');
  });

  it('should have cast vote operation (Conway)', () => {
    expect(StakingOperation.CAST_VOTE).toBe('cast-vote');
  });

  it('should have exactly 7 staking operations', () => {
    const operations = Object.values(StakingOperation);
    expect(operations).toHaveLength(7);
  });

  it('should use kebab-case naming', () => {
    Object.values(StakingOperation).forEach((operation) => {
      expect(operation).toMatch(/^[a-z]+(-[a-z]+)*$/);
    });
  });
});
