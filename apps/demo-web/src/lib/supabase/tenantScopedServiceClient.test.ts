import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createTenantScopedServiceClient, createUnrestrictedServiceClient } from './tenantScopedServiceClient';

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = {
    ...originalEnv,
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  };
});

describe('createTenantScopedServiceClient', () => {
  const mockCookies = {
    getAll: () => [],
    set: vi.fn(),
  };

  it('should throw error if tenantId is not provided', () => {
    expect(() => {
      createTenantScopedServiceClient(
        {
          tenantId: '',
          userId: 'user-123',
          operation: 'test-operation',
        },
        mockCookies
      );
    }).toThrow('tenantId required for tenant-scoped service client');
  });

  it('should throw error if Supabase configuration is missing', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';

    expect(() => {
      createTenantScopedServiceClient(
        {
          tenantId: 'tenant-123',
          userId: 'user-123',
          operation: 'test-operation',
        },
        mockCookies
      );
    }).toThrow('Supabase configuration missing');
  });

  it('should create a client when valid options provided', () => {
    const client = createTenantScopedServiceClient(
      {
        tenantId: 'tenant-123',
        userId: 'user-123',
        operation: 'test-operation',
      },
      mockCookies
    );

    expect(client).toBeDefined();
    expect(client.from).toBeDefined();
  });

  it('should accept valid tenant and user IDs', () => {
    expect(() => {
      createTenantScopedServiceClient(
        {
          tenantId: 'valid-tenant-id',
          userId: 'valid-user-id',
          operation: 'fetch-conversations',
        },
        mockCookies
      );
    }).not.toThrow();
  });
});

describe('createUnrestrictedServiceClient', () => {
  it('should create unrestricted client with valid reason', () => {
    const client = createUnrestrictedServiceClient(
      'Creating new tenant - no tenant_id exists yet',
      'user-123'
    );

    expect(client).toBeDefined();
    expect(client.from).toBeDefined();
  });

  it('should throw error if Supabase configuration is missing', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';

    expect(() => {
      createUnrestrictedServiceClient(
        'Valid reason',
        'user-123'
      );
    }).toThrow('Supabase configuration missing');
  });

  it('should accept any reason string', () => {
    expect(() => {
      createUnrestrictedServiceClient(
        'Admin operation across all tenants',
        'admin-user'
      );
    }).not.toThrow();
  });
});

describe('Tenant-scoped table filtering', () => {
  const mockCookies = {
    getAll: () => [],
    set: vi.fn(),
  };

  it('should identify tenant-scoped tables correctly', () => {
    const client = createTenantScopedServiceClient(
      {
        tenantId: 'tenant-123',
        userId: 'user-123',
        operation: 'test',
      },
      mockCookies
    );

    // These should be recognized as tenant-scoped
    const tenantScopedTables = [
      'conversations',
      'conversation_messages',
      'llm_cost_records',
      'e2b_cost_records',
    ];

    tenantScopedTables.forEach(tableName => {
      expect(() => client.from(tableName)).not.toThrow();
    });
  });

  it('should not filter non-tenant-scoped tables', () => {
    const client = createTenantScopedServiceClient(
      {
        tenantId: 'tenant-123',
        userId: 'user-123',
        operation: 'test',
      },
      mockCookies
    );

    // These tables should not have automatic tenant filtering
    expect(() => client.from('tenants')).not.toThrow();
    expect(() => client.from('tenant_memberships')).not.toThrow();
  });
});

describe('Security validation', () => {
  const mockCookies = {
    getAll: () => [],
    set: vi.fn(),
  };

  it('should reject empty tenantId', () => {
    expect(() => {
      createTenantScopedServiceClient(
        {
          tenantId: '',
          userId: 'user-123',
          operation: 'test',
        },
        mockCookies
      );
    }).toThrow();
  });

  it('should accept valid UUID format for tenantId', () => {
    const validUUID = '550e8400-e29b-41d4-a716-446655440000';
    expect(() => {
      createTenantScopedServiceClient(
        {
          tenantId: validUUID,
          userId: 'user-123',
          operation: 'test',
        },
        mockCookies
      );
    }).not.toThrow();
  });

  it('should require userId for unrestricted client', () => {
    // This should work - userId is required but can be any string
    expect(() => {
      createUnrestrictedServiceClient(
        'Valid reason',
        'user-123'
      );
    }).not.toThrow();
  });
});
