import { describe, it, expect } from '@jest/globals';
import {
  iagonBaseUrl,
  CardanoConstants,
  CardanoAmounts,
  FireblocksWebhookConstants,
} from '../constants.js';

describe('iagonBaseUrl', () => {
  it('should be a valid HTTPS URL', () => {
    expect(iagonBaseUrl).toMatch(/^https:\/\//);
  });

  it('should point to Iagon API', () => {
    expect(iagonBaseUrl).toBe('https://api.fireblocks.partners.iagon.com');
  });
});

describe('CardanoConstants', () => {
  describe('Coin types', () => {
    it('should have correct mainnet coin type (CIP-1852)', () => {
      expect(CardanoConstants.ADA_COIN_TYPE).toBe(1815);
    });

    it('should have correct testnet coin type', () => {
      expect(CardanoConstants.ADA_TEST_COIN_TYPE).toBe(1);
    });
  });

  describe('Address derivation', () => {
    it('should use change index 0', () => {
      expect(CardanoConstants.CHANGE_INDEX).toBe(0);
    });

    it('should use chimeric index 2 for staking', () => {
      expect(CardanoConstants.CHIMERIC_INDEX).toBe(2);
    });
  });

  describe('Address structure', () => {
    it('should have correct base address minimum length', () => {
      // 1 byte header + 28 bytes payment + 28 bytes stake = 57 bytes
      expect(CardanoConstants.CARDANO_BASE_ADDRESS_MIN_LENGTH).toBe(57);
    });

    it('should have correct payment credential offset', () => {
      // 1 byte header + 28 bytes payment hash = 29 bytes
      expect(CardanoConstants.CARDANO_PAYMENT_CREDENTIAL_OFFSET).toBe(29);
    });
  });

  describe('ADA formatting', () => {
    it('should have 6 decimal places for ADA', () => {
      expect(CardanoConstants.ADA_DECIMALS).toBe(6);
    });

    it('should correctly convert 1 ADA to lovelace', () => {
      const oneAda = Math.pow(10, CardanoConstants.ADA_DECIMALS);
      expect(oneAda).toBe(1_000_000);
    });
  });

  describe('Fee calculation parameters', () => {
    it('should have correct minFeeA (linear coefficient)', () => {
      expect(CardanoConstants.MIN_FEE_A).toBe(44);
    });

    it('should have correct minFeeB (constant term)', () => {
      expect(CardanoConstants.MIN_FEE_B).toBe(155_381);
    });
  });

  describe('Transaction witness', () => {
    it('should have correct Ed25519 witness size', () => {
      // Ed25519 signature witness in CBOR: ~139 bytes
      expect(CardanoConstants.TX_WITNESS_SIZE_BYTES).toBe(139);
    });
  });

  describe('Fee convergence', () => {
    it('should limit fee iterations to prevent infinite loops', () => {
      expect(CardanoConstants.TX_FEE_MAX_ITERATIONS).toBe(5);
      expect(CardanoConstants.TX_FEE_MAX_ITERATIONS).toBeGreaterThan(0);
    });
  });

  describe('UTxO locking', () => {
    it('should have reasonable lock TTL (2 minutes)', () => {
      expect(CardanoConstants.UTXO_LOCK_TTL_MS).toBe(120_000);
      expect(CardanoConstants.UTXO_LOCK_TTL_MS).toBe(2 * 60 * 1000);
    });
  });

  describe('Transaction limits', () => {
    it('should limit inputs to prevent dust attacks', () => {
      expect(CardanoConstants.MAX_TX_INPUTS).toBe(100);
    });

    it('should have positive input limit', () => {
      expect(CardanoConstants.MAX_TX_INPUTS).toBeGreaterThan(0);
    });
  });

  describe('Minimum UTxO value', () => {
    it('should require at least 1 ADA for any UTxO', () => {
      expect(CardanoConstants.MIN_UTXO_BASE_LOVELACE).toBe(1_000_000);
    });

    it('should match 1 ADA in lovelace', () => {
      const oneAda = Math.pow(10, CardanoConstants.ADA_DECIMALS);
      expect(CardanoConstants.MIN_UTXO_BASE_LOVELACE).toBe(oneAda);
    });
  });
});

describe('CardanoAmounts', () => {
  describe('Staking deposit', () => {
    it('should require 2 ADA deposit for stake key registration', () => {
      expect(CardanoAmounts.DEPOSIT_AMOUNT).toBe(2_000_000);
    });
  });

  describe('Transaction fees', () => {
    it('should have reasonable staking operation fee (0.3 ADA)', () => {
      expect(CardanoAmounts.STAKING_TX_FEE).toBe(300_000);
    });

    it('should have reasonable governance operation fee (1 ADA)', () => {
      expect(CardanoAmounts.GOVERNANCE_TX_FEE).toBe(1_000_000);
    });

    it('should have governance fee >= staking fee', () => {
      expect(CardanoAmounts.GOVERNANCE_TX_FEE).toBeGreaterThanOrEqual(
        CardanoAmounts.STAKING_TX_FEE
      );
    });
  });

  describe('DRep registration', () => {
    it('should require 500 ADA deposit to register as DRep', () => {
      expect(CardanoAmounts.DREP_REGISTRATION_DEPOSIT).toBe(500_000_000);
    });

    it('should be significantly larger than stake deposit', () => {
      expect(CardanoAmounts.DREP_REGISTRATION_DEPOSIT).toBeGreaterThan(
        CardanoAmounts.DEPOSIT_AMOUNT * 100
      );
    });
  });

  describe('Fee estimation', () => {
    it('should have conservative max fee estimate (0.5 ADA)', () => {
      expect(CardanoAmounts.ESTIMATED_MAX_FEE).toBe(500_000);
    });

    it('should have initial fee estimate for convergence (0.2 ADA)', () => {
      expect(CardanoAmounts.TX_FEE_INITIAL_ESTIMATE).toBe(200_000);
    });

    it('should have reasonable fee tolerance (0.001 ADA)', () => {
      expect(CardanoAmounts.TX_FEE_TOLERANCE).toBe(1_000);
    });

    it('should have tolerance less than initial estimate', () => {
      expect(CardanoAmounts.TX_FEE_TOLERANCE).toBeLessThan(
        CardanoAmounts.TX_FEE_INITIAL_ESTIMATE
      );
    });
  });

  describe('Multi-asset UTxO costs', () => {
    it('should charge per policy for min UTxO (0.15 ADA)', () => {
      expect(CardanoAmounts.MIN_UTXO_PER_POLICY_LOVELACE).toBe(150_000);
    });

    it('should have cost per UTxO byte (4310 lovelace)', () => {
      expect(CardanoAmounts.COINS_PER_UTXO_BYTE).toBe(4310);
    });
  });

  describe('TTL', () => {
    it('should have 2-hour TTL for transactions', () => {
      expect(CardanoAmounts.TX_TTL_SECS).toBe(7_200);
      expect(CardanoAmounts.TX_TTL_SECS).toBe(2 * 60 * 60);
    });
  });
});

describe('FireblocksWebhookConstants', () => {
  describe('JWKS Endpoints', () => {
    it('should have US JWKS endpoint', () => {
      expect(FireblocksWebhookConstants.JWKS_ENDPOINTS.US).toMatch(/^https:\/\//);
      expect(FireblocksWebhookConstants.JWKS_ENDPOINTS.US).toContain('keys.fireblocks.io');
    });

    it('should have EU JWKS endpoint', () => {
      expect(FireblocksWebhookConstants.JWKS_ENDPOINTS.EU).toMatch(/^https:\/\//);
      expect(FireblocksWebhookConstants.JWKS_ENDPOINTS.EU).toContain('eu-keys.fireblocks.io');
    });

    it('should have EU2 JWKS endpoint', () => {
      expect(FireblocksWebhookConstants.JWKS_ENDPOINTS.EU2).toMatch(/^https:\/\//);
      expect(FireblocksWebhookConstants.JWKS_ENDPOINTS.EU2).toContain('eu2-keys.fireblocks.io');
    });

    it('should have Sandbox JWKS endpoint', () => {
      expect(FireblocksWebhookConstants.JWKS_ENDPOINTS.SANDBOX).toMatch(/^https:\/\//);
      expect(FireblocksWebhookConstants.JWKS_ENDPOINTS.SANDBOX).toContain(
        'sandbox-keys.fireblocks.io'
      );
    });

    it('should have .well-known/jwks.json path for all endpoints', () => {
      Object.values(FireblocksWebhookConstants.JWKS_ENDPOINTS).forEach((endpoint) => {
        expect(endpoint).toContain('.well-known/jwks.json');
      });
    });
  });

  describe('Legacy Public Keys', () => {
    it('should have US public key in PEM format', () => {
      const key = FireblocksWebhookConstants.LEGACY_PUBLIC_KEYS.US;
      expect(key).toContain('-----BEGIN PUBLIC KEY-----');
      expect(key).toContain('-----END PUBLIC KEY-----');
    });

    it('should have EU public key in PEM format', () => {
      const key = FireblocksWebhookConstants.LEGACY_PUBLIC_KEYS.EU;
      expect(key).toContain('-----BEGIN PUBLIC KEY-----');
      expect(key).toContain('-----END PUBLIC KEY-----');
    });

    it('should have Sandbox public key in PEM format', () => {
      const key = FireblocksWebhookConstants.LEGACY_PUBLIC_KEYS.SANDBOX;
      expect(key).toContain('-----BEGIN PUBLIC KEY-----');
      expect(key).toContain('-----END PUBLIC KEY-----');
    });

    it('should have different keys for each environment', () => {
      const keys = [
        FireblocksWebhookConstants.LEGACY_PUBLIC_KEYS.US,
        FireblocksWebhookConstants.LEGACY_PUBLIC_KEYS.EU,
        FireblocksWebhookConstants.LEGACY_PUBLIC_KEYS.SANDBOX,
      ];
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });
  });

  describe('Headers', () => {
    it('should have JWKS signature header name', () => {
      expect(FireblocksWebhookConstants.HEADERS.JWKS_SIGNATURE).toBe(
        'fireblocks-webhook-signature'
      );
    });

    it('should have legacy signature header name', () => {
      expect(FireblocksWebhookConstants.HEADERS.LEGACY_SIGNATURE).toBe(
        'fireblocks-signature'
      );
    });

    it('should have different header names for JWKS vs legacy', () => {
      expect(FireblocksWebhookConstants.HEADERS.JWKS_SIGNATURE).not.toBe(
        FireblocksWebhookConstants.HEADERS.LEGACY_SIGNATURE
      );
    });
  });
});
