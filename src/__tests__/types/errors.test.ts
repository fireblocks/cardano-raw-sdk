import { describe, it, expect } from '@jest/globals';
import { SdkApiError } from '../../types/errors.js';

describe('SdkApiError', () => {
  describe('Basic construction', () => {
    it('should create error with message only', () => {
      const error = new SdkApiError('Test error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SdkApiError);
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('SdkApiError');
    });

    it('should have undefined optional fields when not provided', () => {
      const error = new SdkApiError('Test error');
      expect(error.statusCode).toBeUndefined();
      expect(error.errorType).toBeUndefined();
      expect(error.errorInfo).toBeUndefined();
      expect(error.service).toBeUndefined();
    });
  });

  describe('With status code', () => {
    it('should create error with status code', () => {
      const error = new SdkApiError('Not found', 404);
      expect(error.message).toBe('Not found');
      expect(error.statusCode).toBe(404);
    });

    it('should support HTTP 400 Bad Request', () => {
      const error = new SdkApiError('Invalid input', 400);
      expect(error.statusCode).toBe(400);
    });

    it('should support HTTP 401 Unauthorized', () => {
      const error = new SdkApiError('Unauthorized', 401);
      expect(error.statusCode).toBe(401);
    });

    it('should support HTTP 403 Forbidden', () => {
      const error = new SdkApiError('Forbidden', 403);
      expect(error.statusCode).toBe(403);
    });

    it('should support HTTP 500 Internal Server Error', () => {
      const error = new SdkApiError('Server error', 500);
      expect(error.statusCode).toBe(500);
    });
  });

  describe('With error type', () => {
    it('should create error with error type', () => {
      const error = new SdkApiError('Validation failed', 400, 'ValidationError');
      expect(error.errorType).toBe('ValidationError');
    });

    it('should support common error types', () => {
      const types = [
        'ValidationError',
        'UnsupportedOperation',
        'InsufficientBalance',
        'BelowMinimumUtxo',
      ];
      types.forEach((type) => {
        const error = new SdkApiError('Test', 400, type);
        expect(error.errorType).toBe(type);
      });
    });
  });

  describe('With error info', () => {
    it('should store primitive error info', () => {
      const error = new SdkApiError('Test', 400, 'TestError', 'additional info');
      expect(error.errorInfo).toBe('additional info');
    });

    it('should store object error info', () => {
      const errorInfo = { field: 'amount', value: -100, expected: 'positive' };
      const error = new SdkApiError('Invalid amount', 400, 'ValidationError', errorInfo);
      expect(error.errorInfo).toEqual(errorInfo);
    });

    it('should store array error info', () => {
      const errorInfo = ['error1', 'error2', 'error3'];
      const error = new SdkApiError('Multiple errors', 400, 'ValidationError', errorInfo);
      expect(error.errorInfo).toEqual(errorInfo);
    });

    it('should store null error info', () => {
      const error = new SdkApiError('Test', 400, 'TestError', null);
      expect(error.errorInfo).toBeNull();
    });

    it('should store number error info', () => {
      const error = new SdkApiError('Test', 400, 'TestError', 42);
      expect(error.errorInfo).toBe(42);
    });
  });

  describe('With service name', () => {
    it('should store service name', () => {
      const error = new SdkApiError(
        'API call failed',
        500,
        'ServerError',
        undefined,
        'IagonApiService'
      );
      expect(error.service).toBe('IagonApiService');
    });

    it('should support different service names', () => {
      const services = ['FireblocksCardanoRawSDK', 'IagonApiService', 'SDKManager'];
      services.forEach((service) => {
        const error = new SdkApiError('Test', 500, 'TestError', undefined, service);
        expect(error.service).toBe(service);
      });
    });
  });

  describe('Complete error construction', () => {
    it('should create fully populated error', () => {
      const errorInfo = { lovelaceAmount: -1000, minimum: 1_000_000 };
      const error = new SdkApiError(
        'Amount below minimum UTXO value',
        400,
        'BelowMinimumUtxo',
        errorInfo,
        'FireblocksCardanoRawSDK'
      );

      expect(error.message).toBe('Amount below minimum UTXO value');
      expect(error.statusCode).toBe(400);
      expect(error.errorType).toBe('BelowMinimumUtxo');
      expect(error.errorInfo).toEqual(errorInfo);
      expect(error.service).toBe('FireblocksCardanoRawSDK');
      expect(error.name).toBe('SdkApiError');
    });

    it('should preserve error stack trace', () => {
      const error = new SdkApiError('Test error');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('SdkApiError');
    });
  });

  describe('Error behavior', () => {
    it('should be catchable as Error', () => {
      try {
        throw new SdkApiError('Test error');
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e).toBeInstanceOf(SdkApiError);
      }
    });

    it('should be catchable as SdkApiError', () => {
      try {
        throw new SdkApiError('Test', 400, 'TestError');
      } catch (e) {
        if (e instanceof SdkApiError) {
          expect(e.errorType).toBe('TestError');
          expect(e.statusCode).toBe(400);
        } else {
          fail('Should be instance of SdkApiError');
        }
      }
    });

    it('should have correct toString behavior', () => {
      const error = new SdkApiError('Custom error message', 404);
      const errorString = error.toString();
      expect(errorString).toContain('SdkApiError');
      expect(errorString).toContain('Custom error message');
    });
  });

  describe('Real-world usage scenarios', () => {
    it('should create validation error for invalid input', () => {
      const error = new SdkApiError(
        'lovelaceAmount must be a positive integer',
        400,
        'ValidationError',
        { lovelaceAmount: -1000 },
        'FireblocksCardanoRawSDK'
      );

      expect(error.statusCode).toBe(400);
      expect(error.errorType).toBe('ValidationError');
    });

    it('should create insufficient balance error', () => {
      const error = new SdkApiError(
        'Insufficient ADA balance',
        400,
        'InsufficientBalance',
        { required: 5_000_000, available: 2_000_000 },
        'FireblocksCardanoRawSDK'
      );

      expect(error.errorType).toBe('InsufficientBalance');
      expect((error.errorInfo as any).required).toBe(5_000_000);
    });

    it('should create unsupported operation error', () => {
      const error = new SdkApiError(
        'Native ADA transfers are not supported by this SDK',
        400,
        'UnsupportedOperation',
        { tokenPolicyId: '', tokenName: 'ADA' },
        'FireblocksCardanoRawSDK'
      );

      expect(error.errorType).toBe('UnsupportedOperation');
      expect(error.statusCode).toBe(400);
    });

    it('should create below minimum UTXO error', () => {
      const error = new SdkApiError(
        'lovelaceAmount 500000 is below the Cardano protocol minimum of 1000000 lovelace',
        400,
        'BelowMinimumUtxo',
        { lovelaceAmount: 500_000, minimum: 1_000_000 },
        'FireblocksCardanoRawSDK'
      );

      expect(error.errorType).toBe('BelowMinimumUtxo');
      expect((error.errorInfo as any).minimum).toBe(1_000_000);
    });

    it('should create server error without extra details', () => {
      const error = new SdkApiError(
        'Unexpected error during transaction building',
        500,
        'InternalError'
      );

      expect(error.statusCode).toBe(500);
      expect(error.errorType).toBe('InternalError');
      expect(error.service).toBeUndefined();
    });
  });
});
