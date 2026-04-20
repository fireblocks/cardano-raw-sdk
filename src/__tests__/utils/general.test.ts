import { describe, it, expect } from '@jest/globals';
import {
  toHex,
  decodeAssetName,
  formatWithDecimals,
  parseAdaStringToLovelace,
} from '../../utils/general.js';

describe('toHex', () => {
  it('should convert ASCII string to hex', () => {
    expect(toHex('hello')).toBe('68656c6c6f');
  });

  it('should convert empty string to empty hex', () => {
    expect(toHex('')).toBe('');
  });

  it('should handle special characters', () => {
    expect(toHex('ABC123!@#')).toBe('414243313233214023');
  });

  it('should handle unicode characters', () => {
    expect(toHex('café')).toBe('636166c3a9');
  });
});

describe('decodeAssetName', () => {
  it('should decode hex asset name to ASCII', () => {
    const assetId = 'policyId.68656c6c6f'; // "hello" in hex
    expect(decodeAssetName(assetId)).toBe('hello');
  });

  it('should return empty string for ADA (no asset name)', () => {
    const assetId = 'policyId';
    expect(decodeAssetName(assetId)).toBe('');
  });

  it('should handle empty asset name hex', () => {
    const assetId = 'policyId.';
    expect(decodeAssetName(assetId)).toBe('');
  });

  it('should decode token names correctly', () => {
    const assetId = 'abc123.4d59544f4b454e'; // "MYTOKEN" in hex
    expect(decodeAssetName(assetId)).toBe('MYTOKEN');
  });

  it('should handle complex token names', () => {
    const assetId = 'policy.546573742d546f6b656e2d313233'; // "Test-Token-123" in hex
    expect(decodeAssetName(assetId)).toBe('Test-Token-123');
  });
});

describe('formatWithDecimals', () => {
  describe('ADA formatting (6 decimals)', () => {
    it('should format 1 ADA (1,000,000 lovelace)', () => {
      const result = formatWithDecimals(1_000_000, 6);
      expect(result.value).toBe('1.000000');
      expect(result.raw).toBe('1,000,000');
    });

    it('should format 1.7 ADA', () => {
      const result = formatWithDecimals(1_700_000, 6);
      expect(result.value).toBe('1.700000');
      expect(result.raw).toBe('1,700,000');
    });

    it('should format 0.47 ADA', () => {
      const result = formatWithDecimals(470_000, 6);
      expect(result.value).toBe('0.470000');
      expect(result.raw).toBe('470,000');
    });

    it('should format 0 lovelace', () => {
      const result = formatWithDecimals(0, 6);
      expect(result.value).toBe('0.000000');
      expect(result.raw).toBe('0');
    });

    it('should format 1 lovelace (minimum)', () => {
      const result = formatWithDecimals(1, 6);
      expect(result.value).toBe('0.000001');
      expect(result.raw).toBe('1');
    });

    it('should format max ADA supply (45 billion)', () => {
      const maxSupply = 45_000_000_000_000_000; // 45B ADA in lovelace
      const result = formatWithDecimals(maxSupply, 6);
      expect(result.value).toBe('45000000000.000000');
      expect(result.raw).toBe('45,000,000,000,000,000');
    });
  });

  describe('BigInt support', () => {
    it('should handle BigInt input for large values', () => {
      const result = formatWithDecimals(1_000_000n, 6);
      expect(result.value).toBe('1.000000');
      expect(result.raw).toBe('1,000,000');
    });

    it('should handle very large BigInt values', () => {
      const result = formatWithDecimals(45_000_000_000_000_000n, 6);
      expect(result.value).toBe('45000000000.000000');
    });
  });

  describe('Different decimal places', () => {
    it('should format with 0 decimals', () => {
      const result = formatWithDecimals(12345, 0);
      expect(result.value).toBe('12345');
      expect(result.raw).toBe('12,345');
    });

    it('should format with 2 decimals (cents)', () => {
      const result = formatWithDecimals(12345, 2);
      expect(result.value).toBe('123.45');
      expect(result.raw).toBe('12,345');
    });

    it('should format with 18 decimals (ETH-style)', () => {
      const result = formatWithDecimals(1_000_000_000_000_000_000, 18);
      expect(result.value).toBe('1.000000000000000000');
    });
  });

  describe('Edge cases and validation', () => {
    it('should throw error for negative amount', () => {
      expect(() => formatWithDecimals(-1000, 6)).toThrow(
        'formatWithDecimals: negative amount is not supported'
      );
    });

    it('should throw error for negative BigInt', () => {
      expect(() => formatWithDecimals(-1000n, 6)).toThrow(
        'formatWithDecimals: negative amount is not supported'
      );
    });

    it('should throw error for negative decimals', () => {
      expect(() => formatWithDecimals(1000, -1)).toThrow(
        'formatWithDecimals: decimals must be a non-negative integer'
      );
    });

    it('should throw error for non-integer decimals', () => {
      expect(() => formatWithDecimals(1000, 6.5)).toThrow(
        'formatWithDecimals: decimals must be a non-negative integer'
      );
    });

    it('should handle fractional number input by truncating', () => {
      const result = formatWithDecimals(1_500_000.999, 6);
      expect(result.value).toBe('1.500000');
    });
  });

  describe('Padding and formatting', () => {
    it('should pad fractional part with leading zeros', () => {
      const result = formatWithDecimals(1, 6);
      expect(result.value).toBe('0.000001');
    });

    it('should pad fractional part correctly for small values', () => {
      const result = formatWithDecimals(100, 6);
      expect(result.value).toBe('0.000100');
    });

    it('should format large numbers with comma separators', () => {
      const result = formatWithDecimals(1_234_567_890, 6);
      expect(result.raw).toBe('1,234,567,890');
    });
  });
});

describe('parseAdaStringToLovelace', () => {
  describe('Valid inputs', () => {
    it('should parse whole ADA amounts', () => {
      expect(parseAdaStringToLovelace('1')).toBe(1_000_000);
      expect(parseAdaStringToLovelace('10')).toBe(10_000_000);
      expect(parseAdaStringToLovelace('100')).toBe(100_000_000);
    });

    it('should parse decimal ADA amounts', () => {
      expect(parseAdaStringToLovelace('1.5')).toBe(1_500_000);
      expect(parseAdaStringToLovelace('0.5')).toBe(500_000);
      expect(parseAdaStringToLovelace('2.178701')).toBe(2_178_701);
    });

    it('should parse zero', () => {
      expect(parseAdaStringToLovelace('0')).toBe(0);
      expect(parseAdaStringToLovelace('0.0')).toBe(0);
      expect(parseAdaStringToLovelace('0.000000')).toBe(0);
    });

    it('should handle trailing zeros', () => {
      expect(parseAdaStringToLovelace('1.500000')).toBe(1_500_000);
      expect(parseAdaStringToLovelace('1.100000')).toBe(1_100_000);
    });

    it('should handle amounts with less than 6 decimals', () => {
      expect(parseAdaStringToLovelace('1.5')).toBe(1_500_000);
      expect(parseAdaStringToLovelace('1.12')).toBe(1_120_000);
      expect(parseAdaStringToLovelace('1.123')).toBe(1_123_000);
    });

    it('should truncate beyond 6 decimals', () => {
      expect(parseAdaStringToLovelace('1.1234567')).toBe(1_123_456); // Truncates to 6 decimals
      expect(parseAdaStringToLovelace('0.9999999')).toBe(999_999); // Truncates, not rounds
    });

    it('should handle minimum lovelace (0.000001 ADA)', () => {
      expect(parseAdaStringToLovelace('0.000001')).toBe(1);
    });

    it('should handle large ADA amounts within safe range', () => {
      expect(parseAdaStringToLovelace('1000000')).toBe(1_000_000_000_000);
      // 9M ADA is within safe integer range
      expect(parseAdaStringToLovelace('9000000')).toBe(9_000_000_000_000);
    });
  });

  describe('Invalid inputs', () => {
    it('should throw error for negative amounts', () => {
      expect(() => parseAdaStringToLovelace('-1')).toThrow('Invalid ADA string');
      expect(() => parseAdaStringToLovelace('-0.5')).toThrow('Invalid ADA string');
    });

    it('should throw error for non-numeric strings', () => {
      expect(() => parseAdaStringToLovelace('abc')).toThrow('Invalid ADA string');
      expect(() => parseAdaStringToLovelace('1.2.3')).toThrow('Invalid ADA string');
      expect(() => parseAdaStringToLovelace('1,000')).toThrow('Invalid ADA string');
    });

    it('should throw error for empty string', () => {
      expect(() => parseAdaStringToLovelace('')).toThrow('Invalid ADA string');
    });

    it('should throw error for strings with spaces', () => {
      expect(() => parseAdaStringToLovelace('1 000')).toThrow('Invalid ADA string');
      expect(() => parseAdaStringToLovelace(' 1')).toThrow('Invalid ADA string');
      expect(() => parseAdaStringToLovelace('1 ')).toThrow('Invalid ADA string');
    });

    it('should throw error for scientific notation', () => {
      expect(() => parseAdaStringToLovelace('1e6')).toThrow('Invalid ADA string');
      expect(() => parseAdaStringToLovelace('1E6')).toThrow('Invalid ADA string');
    });
  });

  describe('Edge cases', () => {
    it('should handle amounts at Number.MAX_SAFE_INTEGER boundary', () => {
      // Max safe integer is 9,007,199,254,740,991
      // In ADA: 9,007,199.254740991 ADA
      expect(parseAdaStringToLovelace('9007199.254740')).toBe(9_007_199_254_740);
    });

    it('should throw error for amounts exceeding safe integer range', () => {
      // Max ADA supply is 45B ADA = 45,000,000,000,000,000 lovelace
      // This exceeds MAX_SAFE_INTEGER, so it should throw
      expect(() => parseAdaStringToLovelace('100000000000')).toThrow(
        'ADA string out of range'
      );
    });

    it('should reject decimal point without fractional part', () => {
      // The regex requires \d+ after optional decimal, so "5." is invalid
      expect(() => parseAdaStringToLovelace('5.')).toThrow('Invalid ADA string');
    });

    it('should handle leading zeros in whole part', () => {
      expect(parseAdaStringToLovelace('001')).toBe(1_000_000);
      expect(parseAdaStringToLovelace('00.5')).toBe(500_000);
    });
  });

  describe('Precision and rounding', () => {
    it('should preserve exact lovelace precision', () => {
      expect(parseAdaStringToLovelace('0.000001')).toBe(1);
      expect(parseAdaStringToLovelace('0.000002')).toBe(2);
      expect(parseAdaStringToLovelace('0.123456')).toBe(123_456);
    });

    it('should truncate, not round, beyond 6 decimals', () => {
      expect(parseAdaStringToLovelace('1.9999999')).toBe(1_999_999); // Not 2_000_000
      expect(parseAdaStringToLovelace('0.0000019')).toBe(1); // Not 2
    });
  });
});
