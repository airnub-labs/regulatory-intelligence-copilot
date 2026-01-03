/**
 * Unit tests for TransparentRateLimiter
 *
 * Tests verify industry-standard transparent failover behavior:
 * - Factory NEVER returns null
 * - Rate limiter errors fail-open (allow request)
 * - Application code never needs try-catch
 */

import { describe, it, expect, vi } from 'vitest';
import { createTransparentRateLimiter, type RateLimiterBackend } from '../transparentRateLimiter';

// Mock dependencies to avoid initialization issues in tests
vi.mock('@opentelemetry/api', () => ({
  metrics: {
    getMeter: () => ({
      createCounter: () => ({ add: vi.fn() }),
      createHistogram: () => ({ record: vi.fn() }),
    }),
  },
}));

vi.mock('@reg-copilot/reg-intel-observability', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));

describe('TransparentRateLimiter', () => {
  describe('AllowAllRateLimiter (no backend)', () => {
    it('factory never returns null - always returns instance', () => {
      const limiter = createTransparentRateLimiter(null);
      expect(limiter).not.toBeNull();
      expect(limiter).toBeDefined();
    });

    it('always allows requests (fail-open)', async () => {
      const limiter = createTransparentRateLimiter(null);

      expect(await limiter.check('ip1')).toBe(true);
      expect(await limiter.check('ip2')).toBe(true);
      expect(await limiter.check('ip3')).toBe(true);
    });

    it('reports allowall backend type', () => {
      const limiter = createTransparentRateLimiter(null);
      expect(limiter.getBackendType()).toBe('allowall');
    });

    it('allows unlimited requests from same identifier', async () => {
      const limiter = createTransparentRateLimiter(null);

      // Simulate high traffic - all should be allowed
      for (let i = 0; i < 100; i++) {
        expect(await limiter.check('same-ip')).toBe(true);
      }
    });
  });

  describe('RedisBackedRateLimiter (with backend)', () => {
    it('factory never returns null when backend provided', () => {
      const mockBackend: RateLimiterBackend = {
        check: vi.fn<RateLimiterBackend['check']>().mockResolvedValue(true),
        getType: () => 'redis' as const,
      };

      const limiter = createTransparentRateLimiter(mockBackend);
      expect(limiter).not.toBeNull();
      expect(limiter).toBeDefined();
    });

    it('returns backend check result when allowed', async () => {
      const mockBackend: RateLimiterBackend = {
        check: vi.fn<RateLimiterBackend['check']>().mockResolvedValue(true),
        getType: () => 'redis' as const,
      };

      const limiter = createTransparentRateLimiter(mockBackend);
      const result = await limiter.check('ip1');

      expect(result).toBe(true);
      expect(mockBackend.check).toHaveBeenCalledWith('ip1');
    });

    it('returns backend check result when rate limited', async () => {
      const mockBackend: RateLimiterBackend = {
        check: vi.fn<RateLimiterBackend['check']>().mockResolvedValue(false),
        getType: () => 'redis' as const,
      };

      const limiter = createTransparentRateLimiter(mockBackend);
      const result = await limiter.check('ip1');

      expect(result).toBe(false);
      expect(mockBackend.check).toHaveBeenCalledWith('ip1');
    });

    it('fails open on backend error - transparent failover', async () => {
      const mockBackend: RateLimiterBackend = {
        check: vi.fn<RateLimiterBackend['check']>().mockRejectedValue(
          new Error('Redis connection failed')
        ),
        getType: () => 'redis' as const,
      };

      const limiter = createTransparentRateLimiter(mockBackend);
      const result = await limiter.check('ip1');

      expect(result).toBe(true); // ✅ Error = allow request (fail-open)
    });

    it('continues to fail open on repeated errors', async () => {
      const mockBackend: RateLimiterBackend = {
        check: vi.fn<RateLimiterBackend['check']>().mockRejectedValue(
          new Error('Redis connection failed')
        ),
        getType: () => 'redis' as const,
      };

      const limiter = createTransparentRateLimiter(mockBackend);

      // Multiple errors all fail-open
      expect(await limiter.check('ip1')).toBe(true);
      expect(await limiter.check('ip2')).toBe(true);
      expect(await limiter.check('ip3')).toBe(true);
    });

    it('reports redis backend type', () => {
      const mockBackend: RateLimiterBackend = {
        check: vi.fn<RateLimiterBackend['check']>(),
        getType: () => 'redis' as const,
      };

      const limiter = createTransparentRateLimiter(mockBackend);
      expect(limiter.getBackendType()).toBe('redis');
    });

    it('reports upstash backend type', () => {
      const mockBackend: RateLimiterBackend = {
        check: vi.fn<RateLimiterBackend['check']>(),
        getType: () => 'upstash' as const,
      };

      const limiter = createTransparentRateLimiter(mockBackend);
      expect(limiter.getBackendType()).toBe('upstash');
    });
  });

  describe('Industry standard pattern compliance', () => {
    it('backend unavailable and backend allowing are both true', async () => {
      const workingBackend: RateLimiterBackend = {
        check: vi.fn<RateLimiterBackend['check']>().mockResolvedValue(true),
        getType: () => 'redis' as const,
      };

      const limiter1 = createTransparentRateLimiter(workingBackend);
      const limiter2 = createTransparentRateLimiter(null);

      // Both allow request
      expect(await limiter1.check('ip')).toBe(true);
      expect(await limiter2.check('ip')).toBe(true);
    });

    it('application code never needs null checks', () => {
      // ✅ CORRECT: Factory always returns instance
      const limiter = createTransparentRateLimiter(null);

      // ✅ CORRECT: Can call methods directly without null check
      expect(() => limiter.check('identifier')).not.toThrow();
      expect(() => limiter.getBackendType()).not.toThrow();
    });

    it('application code never needs try-catch', async () => {
      const failingBackend: RateLimiterBackend = {
        check: vi.fn<RateLimiterBackend['check']>().mockRejectedValue(
          new Error('Always fails')
        ),
        getType: () => 'redis' as const,
      };

      const limiter = createTransparentRateLimiter(failingBackend);

      // ✅ CORRECT: No try-catch needed - errors handled internally
      await expect(limiter.check('identifier')).resolves.toBe(true);
    });

    it('fail-open is better than fail-closed', async () => {
      const failingBackend: RateLimiterBackend = {
        check: vi.fn<RateLimiterBackend['check']>().mockRejectedValue(
          new Error('Redis down')
        ),
        getType: () => 'redis' as const,
      };

      const limiter = createTransparentRateLimiter(failingBackend);

      // ✅ Fail-open: Allow requests during outage
      // Better than blocking legitimate users
      expect(await limiter.check('legitimate-user')).toBe(true);
    });
  });

  describe('Real-world scenario simulation', () => {
    it('handles intermittent Redis failures gracefully', async () => {
      let callCount = 0;
      const intermittentBackend: RateLimiterBackend = {
        check: vi.fn<RateLimiterBackend['check']>().mockImplementation(async () => {
          callCount++;
          if (callCount % 3 === 0) {
            throw new Error('Intermittent Redis failure');
          }
          return callCount % 2 === 0; // Alternate allow/deny
        }),
        getType: () => 'redis' as const,
      };

      const limiter = createTransparentRateLimiter(intermittentBackend);

      // Call 1: allowed (callCount=1, odd)
      expect(await limiter.check('user1')).toBe(false);

      // Call 2: rate limited (callCount=2, even)
      expect(await limiter.check('user2')).toBe(true);

      // Call 3: error → fail-open (callCount=3, divisible by 3)
      expect(await limiter.check('user3')).toBe(true);

      // Call 4: rate limited (callCount=4, even)
      expect(await limiter.check('user4')).toBe(true);
    });

    it('works identically in normal and degraded modes from app perspective', async () => {
      // Application code that works with rate limiter
      async function handleRequest(limiter: ReturnType<typeof createTransparentRateLimiter>, ip: string) {
        // ✅ No null check needed
        const allowed = await limiter.check(ip);

        if (!allowed) {
          return { status: 429, body: 'Rate limited' };
        }

        return { status: 200, body: 'OK' };
      }

      // Normal mode (Redis working)
      const workingLimiter = createTransparentRateLimiter({
        check: vi.fn<RateLimiterBackend['check']>().mockResolvedValue(true),
        getType: () => 'redis' as const,
      });

      // Degraded mode (Redis unavailable)
      const degradedLimiter = createTransparentRateLimiter(null);

      // Application code works identically
      const result1 = await handleRequest(workingLimiter, 'ip1');
      const result2 = await handleRequest(degradedLimiter, 'ip1');

      expect(result1.status).toBe(200);
      expect(result2.status).toBe(200);
    });
  });
});
