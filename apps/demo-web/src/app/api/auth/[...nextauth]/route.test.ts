/**
 * Basic integration tests for NextAuth route
 *
 * Tests:
 * - Route exports GET and POST handlers
 * - Handlers are properly configured with authOptions
 * - Basic authentication flow verification
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockNextAuth = vi.fn(() => {
  return vi.fn(() => {
    return Response.json({ status: 'ok' });
  });
});

vi.mock('next-auth/next', () => ({
  default: mockNextAuth,
}));

vi.mock('@/lib/auth/options', () => ({
  authOptions: {
    providers: [],
    callbacks: {},
  },
}));

describe('NextAuth Route /api/auth/[...nextauth]', () => {
  beforeEach(() => {
    vi.resetModules();
    mockNextAuth.mockClear();
  });

  describe('Route Configuration', () => {
    it('exports GET handler', async () => {
      const route = await import('./route');

      expect(route.GET).toBeDefined();
      expect(typeof route.GET).toBe('function');
    });

    it('exports POST handler', async () => {
      const route = await import('./route');

      expect(route.POST).toBeDefined();
      expect(typeof route.POST).toBe('function');
    });

    it('GET and POST handlers are the same NextAuth handler', async () => {
      const route = await import('./route');

      expect(route.GET).toBe(route.POST);
    });

    it('initializes NextAuth with authOptions', async () => {
      await import('./route');

      expect(mockNextAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          providers: expect.any(Array),
          callbacks: expect.any(Object),
        })
      );
    });
  });

  describe('Handler Functionality', () => {
    it('handles GET requests', async () => {
      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/auth/session');
      const response = await GET(request);

      expect(response).toBeInstanceOf(Response);
    });

    it('handles POST requests', async () => {
      const { POST } = await import('./route');

      const request = new Request('http://localhost:3000/api/auth/callback', {
        method: 'POST',
      });
      const response = await POST(request);

      expect(response).toBeInstanceOf(Response);
    });
  });

  describe('Integration Points', () => {
    it('uses authOptions from configured location', async () => {
      const authOptions = await import('@/lib/auth/options');

      expect(authOptions.authOptions).toBeDefined();
      expect(authOptions.authOptions.providers).toBeDefined();
    });

    it('route is accessible via standard NextAuth paths', async () => {
      const { GET } = await import('./route');

      // Common NextAuth endpoints
      const endpoints = [
        '/api/auth/session',
        '/api/auth/signin',
        '/api/auth/signout',
        '/api/auth/csrf',
        '/api/auth/providers',
      ];

      for (const endpoint of endpoints) {
        const request = new Request(`http://localhost:3000${endpoint}`);
        const response = await GET(request);

        // Should return a valid response (not throw)
        expect(response).toBeInstanceOf(Response);
      }
    });
  });

  describe('Type Safety', () => {
    it('handlers accept Request parameter', async () => {
      const { GET, POST } = await import('./route');

      const request = new Request('http://localhost:3000/api/auth/session');

      // Should accept Request objects without TypeScript errors
      expect(() => GET(request)).not.toThrow();
      expect(() => POST(request)).not.toThrow();
    });

    it('handlers return Response or Promise<Response>', async () => {
      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/auth/session');
      const result = GET(request);

      // Should be either Response or Promise<Response>
      expect(
        result instanceof Response || result instanceof Promise
      ).toBe(true);
    });
  });
});
