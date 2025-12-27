import { describe, it, expect, vi } from 'vitest';
import { applyAspects, type Aspect } from './applyAspects.js';

interface TestRequest {
  value: string;
  metadata?: Record<string, unknown>;
}

interface TestResponse {
  result: string;
  processedBy: string[];
}

describe('applyAspects', () => {
  it('should call base function with no aspects', async () => {
    const base = async (req: TestRequest): Promise<TestResponse> => ({
      result: req.value,
      processedBy: ['base'],
    });

    const wrapped = applyAspects(base, []);
    const result = await wrapped({ value: 'test' });

    expect(result.result).toBe('test');
    expect(result.processedBy).toEqual(['base']);
  });

  it('should apply single aspect', async () => {
    const base = async (req: TestRequest): Promise<TestResponse> => ({
      result: req.value,
      processedBy: ['base'],
    });

    const aspect: Aspect<TestRequest, TestResponse> = async (req, next) => {
      const response = await next(req);
      return {
        ...response,
        processedBy: [...response.processedBy, 'aspect1'],
      };
    };

    const wrapped = applyAspects(base, [aspect]);
    const result = await wrapped({ value: 'test' });

    expect(result.processedBy).toEqual(['base', 'aspect1']);
  });

  it('should apply multiple aspects in correct order', async () => {
    const base = async (req: TestRequest): Promise<TestResponse> => ({
      result: req.value,
      processedBy: ['base'],
    });

    const aspect1: Aspect<TestRequest, TestResponse> = async (req, next) => {
      const response = await next(req);
      return {
        ...response,
        processedBy: [...response.processedBy, 'aspect1'],
      };
    };

    const aspect2: Aspect<TestRequest, TestResponse> = async (req, next) => {
      const response = await next(req);
      return {
        ...response,
        processedBy: [...response.processedBy, 'aspect2'],
      };
    };

    const aspect3: Aspect<TestRequest, TestResponse> = async (req, next) => {
      const response = await next(req);
      return {
        ...response,
        processedBy: [...response.processedBy, 'aspect3'],
      };
    };

    // Aspects are applied inside-out: first aspect is outermost
    const wrapped = applyAspects(base, [aspect1, aspect2, aspect3]);
    const result = await wrapped({ value: 'test' });

    // Since aspect1 is outermost, its "after" code runs last
    expect(result.processedBy).toEqual(['base', 'aspect3', 'aspect2', 'aspect1']);
  });

  it('should allow aspects to modify request before passing to next', async () => {
    const base = async (req: TestRequest): Promise<TestResponse> => ({
      result: req.value,
      processedBy: ['base'],
    });

    const uppercaseAspect: Aspect<TestRequest, TestResponse> = async (req, next) => {
      return next({ ...req, value: req.value.toUpperCase() });
    };

    const wrapped = applyAspects(base, [uppercaseAspect]);
    const result = await wrapped({ value: 'test' });

    expect(result.result).toBe('TEST');
  });

  it('should allow aspects to modify response after next returns', async () => {
    const base = async (req: TestRequest): Promise<TestResponse> => ({
      result: req.value,
      processedBy: [],
    });

    const suffixAspect: Aspect<TestRequest, TestResponse> = async (req, next) => {
      const response = await next(req);
      return {
        ...response,
        result: `${response.result}-modified`,
      };
    };

    const wrapped = applyAspects(base, [suffixAspect]);
    const result = await wrapped({ value: 'test' });

    expect(result.result).toBe('test-modified');
  });

  it('should handle async aspects correctly', async () => {
    const base = async (req: TestRequest): Promise<TestResponse> => ({
      result: req.value,
      processedBy: ['base'],
    });

    const asyncAspect: Aspect<TestRequest, TestResponse> = async (req, next) => {
      // Simulate async operation
      await new Promise(resolve => setTimeout(resolve, 10));
      const response = await next(req);
      await new Promise(resolve => setTimeout(resolve, 10));
      return {
        ...response,
        processedBy: [...response.processedBy, 'async-aspect'],
      };
    };

    const wrapped = applyAspects(base, [asyncAspect]);
    const result = await wrapped({ value: 'test' });

    expect(result.processedBy).toEqual(['base', 'async-aspect']);
  });

  it('should propagate errors from base function', async () => {
    const base = async (_req: TestRequest): Promise<TestResponse> => {
      throw new Error('Base error');
    };

    const aspect: Aspect<TestRequest, TestResponse> = async (req, next) => {
      return next(req);
    };

    const wrapped = applyAspects(base, [aspect]);

    await expect(wrapped({ value: 'test' })).rejects.toThrow('Base error');
  });

  it('should allow aspects to catch and handle errors', async () => {
    const base = async (_req: TestRequest): Promise<TestResponse> => {
      throw new Error('Base error');
    };

    const errorHandlingAspect: Aspect<TestRequest, TestResponse> = async (req, next) => {
      try {
        return await next(req);
      } catch (error) {
        return {
          result: 'error-handled',
          processedBy: ['error-handler'],
        };
      }
    };

    const wrapped = applyAspects(base, [errorHandlingAspect]);
    const result = await wrapped({ value: 'test' });

    expect(result.result).toBe('error-handled');
  });

  it('should allow aspects to transform errors', async () => {
    const base = async (_req: TestRequest): Promise<TestResponse> => {
      throw new Error('Original error');
    };

    const errorTransformAspect: Aspect<TestRequest, TestResponse> = async (req, next) => {
      try {
        return await next(req);
      } catch (error) {
        throw new Error(`Transformed: ${(error as Error).message}`);
      }
    };

    const wrapped = applyAspects(base, [errorTransformAspect]);

    await expect(wrapped({ value: 'test' })).rejects.toThrow('Transformed: Original error');
  });

  it('should support logging aspect pattern', async () => {
    const logs: string[] = [];

    const base = async (req: TestRequest): Promise<TestResponse> => ({
      result: req.value,
      processedBy: ['base'],
    });

    const loggingAspect: Aspect<TestRequest, TestResponse> = async (req, next) => {
      logs.push(`Before: ${req.value}`);
      const start = Date.now();

      try {
        const response = await next(req);
        logs.push(`After: ${response.result} (${Date.now() - start}ms)`);
        return response;
      } catch (error) {
        logs.push(`Error: ${(error as Error).message}`);
        throw error;
      }
    };

    const wrapped = applyAspects(base, [loggingAspect]);
    await wrapped({ value: 'test' });

    expect(logs).toHaveLength(2);
    expect(logs[0]).toBe('Before: test');
    expect(logs[1]).toMatch(/^After: test \(\d+ms\)$/);
  });

  it('should support caching aspect pattern', async () => {
    const cache = new Map<string, TestResponse>();
    let baseCalls = 0;

    const base = async (req: TestRequest): Promise<TestResponse> => {
      baseCalls++;
      return {
        result: req.value.toUpperCase(),
        processedBy: ['base'],
      };
    };

    const cachingAspect: Aspect<TestRequest, TestResponse> = async (req, next) => {
      const cached = cache.get(req.value);
      if (cached) {
        return { ...cached, processedBy: [...cached.processedBy, 'cache-hit'] };
      }

      const response = await next(req);
      cache.set(req.value, response);
      return response;
    };

    const wrapped = applyAspects(base, [cachingAspect]);

    // First call - cache miss
    const result1 = await wrapped({ value: 'test' });
    expect(result1.processedBy).toEqual(['base']);
    expect(baseCalls).toBe(1);

    // Second call - cache hit
    const result2 = await wrapped({ value: 'test' });
    expect(result2.processedBy).toEqual(['base', 'cache-hit']);
    expect(baseCalls).toBe(1); // Base not called again

    // Different value - cache miss
    const result3 = await wrapped({ value: 'other' });
    expect(result3.processedBy).toEqual(['base']);
    expect(baseCalls).toBe(2);
  });

  it('should support validation aspect pattern', async () => {
    const base = async (req: TestRequest): Promise<TestResponse> => ({
      result: req.value,
      processedBy: ['base'],
    });

    const validationAspect: Aspect<TestRequest, TestResponse> = async (req, next) => {
      if (!req.value || req.value.trim().length === 0) {
        throw new Error('Invalid request: value cannot be empty');
      }

      const response = await next(req);

      if (!response.result) {
        throw new Error('Invalid response: result cannot be empty');
      }

      return response;
    };

    const wrapped = applyAspects(base, [validationAspect]);

    // Valid request
    await expect(wrapped({ value: 'test' })).resolves.toBeDefined();

    // Invalid request
    await expect(wrapped({ value: '' })).rejects.toThrow('Invalid request');
    await expect(wrapped({ value: '   ' })).rejects.toThrow('Invalid request');
  });

  it('should support sanitization aspect pattern', async () => {
    const base = async (req: TestRequest): Promise<TestResponse> => ({
      result: req.value,
      processedBy: ['base'],
    });

    const sanitizationAspect: Aspect<TestRequest, TestResponse> = async (req, next) => {
      // Remove sensitive data from request
      const sanitizedReq = {
        ...req,
        metadata: undefined, // Strip metadata
      };

      const response = await next(sanitizedReq);

      // Sanitize response
      return {
        ...response,
        result: response.result.replace(/secret/gi, '[REDACTED]'),
      };
    };

    const wrapped = applyAspects(base, [sanitizationAspect]);
    const result = await wrapped({
      value: 'This contains a secret value',
      metadata: { apiKey: 'sensitive-data' },
    });

    expect(result.result).toBe('This contains a [REDACTED] value');
  });

  it('should compose multiple aspect patterns together', async () => {
    const logs: string[] = [];
    const cache = new Map<string, TestResponse>();

    const base = async (req: TestRequest): Promise<TestResponse> => ({
      result: req.value.toUpperCase(),
      processedBy: ['base'],
    });

    const loggingAspect: Aspect<TestRequest, TestResponse> = async (req, next) => {
      logs.push(`Log: ${req.value}`);
      return next(req);
    };

    const cachingAspect: Aspect<TestRequest, TestResponse> = async (req, next) => {
      const cached = cache.get(req.value);
      if (cached) return cached;
      const response = await next(req);
      cache.set(req.value, response);
      return response;
    };

    const validationAspect: Aspect<TestRequest, TestResponse> = async (req, next) => {
      if (!req.value) throw new Error('Invalid');
      return next(req);
    };

    // Apply aspects: validation -> logging -> caching -> base
    // With this order, caching is innermost, so cache hits bypass logging
    const wrapped = applyAspects(base, [validationAspect, loggingAspect, cachingAspect]);

    await wrapped({ value: 'test' });
    expect(logs).toHaveLength(1);

    // Cache hit - caching is inside logging, so logging still happens
    await wrapped({ value: 'test' });
    expect(logs).toHaveLength(2);

    // Validation failure - validation is outer, so nothing else happens
    await expect(wrapped({ value: '' })).rejects.toThrow('Invalid');
    expect(logs).toHaveLength(2); // Still 2, didn't increment
  });

  it('should call aspects with spies to verify execution', async () => {
    const base = vi.fn(async (req: TestRequest): Promise<TestResponse> => ({
      result: req.value,
      processedBy: [],
    }));

    const aspect1 = vi.fn(async (req: TestRequest, next: (req: TestRequest) => Promise<TestResponse>) => {
      return next(req);
    });

    const aspect2 = vi.fn(async (req: TestRequest, next: (req: TestRequest) => Promise<TestResponse>) => {
      return next(req);
    });

    const wrapped = applyAspects(base, [aspect1, aspect2]);
    await wrapped({ value: 'test' });

    // Verify all functions were called
    expect(aspect1).toHaveBeenCalledTimes(1);
    expect(aspect2).toHaveBeenCalledTimes(1);
    expect(base).toHaveBeenCalledTimes(1);
  });
});
