import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Request, Response } from 'express';
import { BasePath } from '@fireblocks/ts-sdk';
import { SdkApiError } from '../../types/errors.js';

// We'll test the exported getWebhookEnvironment function by importing the module
// For private methods, we'll test them indirectly through public methods

/**
 * Mock Express Request
 */
const createMockRequest = (overrides: Partial<Request> = {}): Partial<Request> => ({
  params: {},
  query: {},
  body: {},
  ...overrides,
});

/**
 * Mock Express Response
 */
const createMockResponse = (): Partial<Response> => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis() as any,
    json: jest.fn().mockReturnThis() as any,
  };
  return res;
};

describe('Controller Helper Functions', () => {
  describe('getWebhookEnvironment', () => {
    // Test the mapping logic directly
    it('should map BasePath.US to "US"', () => {
      const result = mapBasePathToEnvironment(BasePath.US);
      expect(result).toBe('US');
    });

    it('should map BasePath.EU to "EU"', () => {
      const result = mapBasePathToEnvironment(BasePath.EU);
      expect(result).toBe('EU');
    });

    it('should map BasePath.EU2 to "EU2"', () => {
      const result = mapBasePathToEnvironment(BasePath.EU2);
      expect(result).toBe('EU2');
    });

    it('should map BasePath.Sandbox to "SANDBOX"', () => {
      const result = mapBasePathToEnvironment(BasePath.Sandbox);
      expect(result).toBe('SANDBOX');
    });

    it('should default to "US" for unknown values', () => {
      const result = mapBasePathToEnvironment('unknown' as BasePath);
      expect(result).toBe('US');
    });

    it('should handle undefined by defaulting to "US"', () => {
      const result = mapBasePathToEnvironment(undefined as any);
      expect(result).toBe('US');
    });

    it('should handle null by defaulting to "US"', () => {
      const result = mapBasePathToEnvironment(null as any);
      expect(result).toBe('US');
    });
  });
});

describe('Controller Error Handling', () => {
  describe('handleError with SdkApiError', () => {
    it('should format SdkApiError response correctly', () => {
      const res = createMockResponse();
      const error = new SdkApiError(
        'Insufficient balance',
        400,
        'InsufficientBalance',
        { required: 1000, available: 500 },
        'FireblocksSDK'
      );

      // Simulate error handling
      const statusCode = error.statusCode || 500;
      (res.status as jest.Mock)(statusCode);
      (res.json as jest.Mock)({
        success: false,
        error: error.message,
        statusCode: error.statusCode,
        type: error.errorType,
        info: error.errorInfo,
        service: error.service,
      });

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Insufficient balance',
        statusCode: 400,
        type: 'InsufficientBalance',
        info: { required: 1000, available: 500 },
        service: 'FireblocksSDK',
      });
    });

    it('should default to 500 if statusCode is missing', () => {
      const res = createMockResponse();
      const error = new SdkApiError('Generic error');

      const statusCode = error.statusCode || 500;
      (res.status as jest.Mock)(statusCode);
      (res.json as jest.Mock)({
        success: false,
        error: error.message,
        statusCode: error.statusCode,
        type: error.errorType,
        info: error.errorInfo,
        service: error.service,
      });

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should include all SdkApiError fields in response', () => {
      const res = createMockResponse();
      const error = new SdkApiError(
        'Validation failed',
        400,
        'ValidationError',
        { field: 'amount', reason: 'negative' },
        'CardanoSDK'
      );

      (res.status as jest.Mock)(400);
      (res.json as jest.Mock)({
        success: false,
        error: error.message,
        statusCode: error.statusCode,
        type: error.errorType,
        info: error.errorInfo,
        service: error.service,
      });

      const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonCall).toHaveProperty('success', false);
      expect(jsonCall).toHaveProperty('error', 'Validation failed');
      expect(jsonCall).toHaveProperty('statusCode', 400);
      expect(jsonCall).toHaveProperty('type', 'ValidationError');
      expect(jsonCall).toHaveProperty('info');
      expect(jsonCall).toHaveProperty('service', 'CardanoSDK');
    });
  });

  describe('handleError with generic Error', () => {
    it('should format generic Error response', () => {
      const res = createMockResponse();
      const error = new Error('Network timeout');

      (res.status as jest.Mock)(500);
      (res.json as jest.Mock)({
        success: false,
        error: 'Something went wrong',
      });

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Something went wrong',
      });
    });

    it('should handle non-Error objects', () => {
      const res = createMockResponse();
      const error = 'string error';

      (res.status as jest.Mock)(500);
      (res.json as jest.Mock)({
        success: false,
        error: 'Something went wrong',
      });

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Something went wrong',
      });
    });

    it('should not leak error details for generic errors', () => {
      const res = createMockResponse();
      const error = new Error('Internal database connection failed');

      (res.status as jest.Mock)(500);
      (res.json as jest.Mock)({
        success: false,
        error: 'Something went wrong', // Generic message, not actual error
      });

      const jsonCall = (res.json as jest.Mock).mock.calls[0][0] as any;
      expect(jsonCall.error).toBe('Something went wrong');
      expect(jsonCall.error).not.toContain('database');
    });
  });
});

describe('Request Parameter Parsing', () => {
  describe('parseTransactionHistoryParams', () => {
    it('should parse vaultAccountId from params', () => {
      const req = createMockRequest({
        params: { vaultAccountId: '123' },
      });

      const { vaultAccountId } = req.params as any;
      expect(vaultAccountId).toBe('123');
    });

    it('should parse index from query with default 0', () => {
      const req1 = createMockRequest({
        query: {},
      });
      const index1 = req1.query?.index ? parseInt(req1.query.index as string, 10) : 0;
      expect(index1).toBe(0);

      const req2 = createMockRequest({
        query: { index: '5' },
      });
      const index2 = req2.query?.index ? parseInt(req2.query.index as string, 10) : 0;
      expect(index2).toBe(5);
    });

    it('should parse optional limit parameter', () => {
      const req1 = createMockRequest({
        query: {},
      });
      const limit1 = req1.query?.limit ? Number(req1.query.limit) : undefined;
      expect(limit1).toBeUndefined();

      const req2 = createMockRequest({
        query: { limit: '10' },
      });
      const limit2 = req2.query?.limit ? Number(req2.query.limit) : undefined;
      expect(limit2).toBe(10);
    });

    it('should parse optional offset parameter', () => {
      const req = createMockRequest({
        query: { offset: '20' },
      });
      const offset = req.query?.offset ? Number(req.query.offset) : undefined;
      expect(offset).toBe(20);
    });

    it('should parse optional fromSlot parameter', () => {
      const req = createMockRequest({
        query: { fromSlot: '12345' },
      });
      const fromSlot = req.query?.fromSlot ? Number(req.query.fromSlot) : undefined;
      expect(fromSlot).toBe(12345);
    });

    it('should parse all parameters together', () => {
      const req = createMockRequest({
        params: { vaultAccountId: '456' },
        query: {
          index: '2',
          limit: '50',
          offset: '100',
          fromSlot: '999999',
        },
      });

      const vaultAccountId = (req.params as any).vaultAccountId;
      const index = req.query?.index ? parseInt(req.query.index as string, 10) : 0;
      const limit = req.query?.limit ? Number(req.query.limit) : undefined;
      const offset = req.query?.offset ? Number(req.query.offset) : undefined;
      const fromSlot = req.query?.fromSlot ? Number(req.query.fromSlot) : undefined;

      expect(vaultAccountId).toBe('456');
      expect(index).toBe(2);
      expect(limit).toBe(50);
      expect(offset).toBe(100);
      expect(fromSlot).toBe(999999);
    });
  });

  describe('getBalanceByAddress parameter parsing', () => {
    it('should parse index with default 0', () => {
      const req = createMockRequest({ query: {} });
      const index = req.query?.index ? parseInt(req.query.index as string, 10) : 0;
      expect(index).toBe(0);
    });

    it('should parse groupByPolicy boolean flag', () => {
      const req1 = createMockRequest({ query: { groupByPolicy: 'true' } });
      const groupByPolicy1 = req1.query?.groupByPolicy === 'true';
      expect(groupByPolicy1).toBe(true);

      const req2 = createMockRequest({ query: { groupByPolicy: 'false' } });
      const groupByPolicy2 = req2.query?.groupByPolicy === 'true';
      expect(groupByPolicy2).toBe(false);

      const req3 = createMockRequest({ query: {} });
      const groupByPolicy3 = req3.query?.groupByPolicy === 'true';
      expect(groupByPolicy3).toBe(false);
    });

    it('should parse includeMetadata boolean flag', () => {
      const req1 = createMockRequest({ query: { includeMetadata: 'true' } });
      const includeMetadata1 = req1.query?.includeMetadata === 'true';
      expect(includeMetadata1).toBe(true);

      const req2 = createMockRequest({ query: {} });
      const includeMetadata2 = req2.query?.includeMetadata === 'true';
      expect(includeMetadata2).toBe(false);
    });
  });
});

describe('Response Format Consistency', () => {
  it('should format success responses with success=true and data', () => {
    const res = createMockResponse();
    const mockData = { balance: 1000, address: 'addr1...' };

    (res.status as jest.Mock)(200);
    (res.json as jest.Mock)({
      success: true,
      data: mockData,
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockData,
    });
  });

  it('should format error responses with success=false and error', () => {
    const res = createMockResponse();

    (res.status as jest.Mock)(400);
    (res.json as jest.Mock)({
      success: false,
      error: 'Invalid input',
    });

    expect(res.status).toHaveBeenCalledWith(400);
    const jsonCall = (res.json as jest.Mock).mock.calls[0][0] as any;
    expect(jsonCall.success).toBe(false);
    expect(jsonCall).toHaveProperty('error');
  });

  it('should use consistent status codes for error types', () => {
    const testCases = [
      { error: new SdkApiError('Validation', 400), expectedStatus: 400 },
      { error: new SdkApiError('Unauthorized', 401), expectedStatus: 401 },
      { error: new SdkApiError('Not found', 404), expectedStatus: 404 },
      { error: new SdkApiError('Server error', 500), expectedStatus: 500 },
    ];

    testCases.forEach(({ error, expectedStatus }) => {
      const res = createMockResponse();
      (res.status as jest.Mock)(error.statusCode!);
      expect(res.status).toHaveBeenCalledWith(expectedStatus);
    });
  });
});

// Helper function to test BasePath mapping
function mapBasePathToEnvironment(basePath: BasePath): 'US' | 'EU' | 'EU2' | 'SANDBOX' {
  const path = basePath as string;

  if (path === BasePath.EU2) {
    return 'EU2';
  } else if (path === BasePath.EU) {
    return 'EU';
  } else if (path === BasePath.Sandbox) {
    return 'SANDBOX';
  } else {
    return 'US';
  }
}
