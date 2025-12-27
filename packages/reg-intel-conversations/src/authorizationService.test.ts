import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SupabaseRLSAuthorizationService,
  OpenFGAAuthorizationService,
  HybridAuthorizationService,
  createAuthorizationService,
  type AuthorizationCheck,
} from './authorizationService.js';
import type { ConversationRecord } from './conversationStores.js';

describe('SupabaseRLSAuthorizationService', () => {
  let service: SupabaseRLSAuthorizationService;

  beforeEach(() => {
    service = new SupabaseRLSAuthorizationService();
  });

  describe('canRead', () => {
    it('should allow reading public conversations', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test',
        shareAudience: 'public',
        tenantAccess: 'read',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.canRead({
        conversation,
        userId: 'user-2',
        tenantId: 'tenant-1',
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('public_conversation');
    });

    it('should allow reading tenant-shared conversations by tenant users', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test',
        shareAudience: 'tenant',
        tenantAccess: 'read',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.canRead({
        conversation,
        userId: 'user-2',
        tenantId: 'tenant-1',
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('tenant_shared');
    });

    it('should allow owner to read their private conversations', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: 'read',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.canRead({
        conversation,
        userId: 'user-1',
        tenantId: 'tenant-1',
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('owner');
    });

    it('should deny non-owner reading private conversations', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: 'read',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.canRead({
        conversation,
        userId: 'user-2',
        tenantId: 'tenant-1',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('not_authorized');
    });

    it('should allow reading system conversations (no userId)', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: null,
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: 'read',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.canRead({
        conversation,
        userId: 'user-1',
        tenantId: 'tenant-1',
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('system_conversation');
    });
  });

  describe('canWrite', () => {
    it('should always allow assistant role to write', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: 'read',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.canWrite({
        conversation,
        userId: 'user-2',
        tenantId: 'tenant-1',
        role: 'assistant',
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('system_role');
    });

    it('should always allow system role to write', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: 'read',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.canWrite({
        conversation,
        userId: 'user-2',
        tenantId: 'tenant-1',
        role: 'system',
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('system_role');
    });

    it('should allow tenant users to write to tenant conversations with edit access', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test',
        shareAudience: 'tenant',
        tenantAccess: 'edit',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.canWrite({
        conversation,
        userId: 'user-2',
        tenantId: 'tenant-1',
        role: 'user',
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('tenant_edit_access');
    });

    it('should allow owner to write to their conversation', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: 'read',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.canWrite({
        conversation,
        userId: 'user-1',
        tenantId: 'tenant-1',
        role: 'user',
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('owner');
    });

    it('should deny non-owner writing to private conversations', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: 'read',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.canWrite({
        conversation,
        userId: 'user-2',
        tenantId: 'tenant-1',
        role: 'user',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('not_authorized');
    });

    it('should allow writing to system conversations (no userId)', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: null,
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: 'read',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.canWrite({
        conversation,
        userId: 'user-1',
        tenantId: 'tenant-1',
        role: 'user',
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('system_conversation');
    });
  });
});

describe('OpenFGAAuthorizationService', () => {
  let service: OpenFGAAuthorizationService;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    service = new OpenFGAAuthorizationService({
      apiUrl: 'http://localhost:8080',
      storeId: 'test-store',
      authorizationModelId: 'test-model',
    });
  });

  describe('canRead', () => {
    it('should allow reading when OpenFGA check returns allowed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ allowed: true }),
      });

      const conversation: ConversationRecord = {
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: 'read',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.canRead({
        conversation,
        userId: 'user-1',
        tenantId: 'tenant-1',
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('openfga_authorized');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/stores/test-store/check',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"user":"user:user-1"'),
        })
      );
    });

    it('should deny reading when OpenFGA check returns not allowed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ allowed: false }),
      });

      const conversation: ConversationRecord = {
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: 'read',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.canRead({
        conversation,
        userId: 'user-2',
        tenantId: 'tenant-1',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('openfga_denied');
    });

    it('should deny when no userId provided', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: 'read',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.canRead({
        conversation,
        userId: null,
        tenantId: 'tenant-1',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('no_user_id');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should throw error when OpenFGA check fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const conversation: ConversationRecord = {
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: 'read',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await expect(
        service.canRead({
          conversation,
          userId: 'user-1',
          tenantId: 'tenant-1',
        })
      ).rejects.toThrow('OpenFGA check failed: 500');
    });
  });

  describe('canWrite', () => {
    it('should always allow assistant role', async () => {
      const conversation: ConversationRecord = {
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: 'read',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.canWrite({
        conversation,
        userId: 'user-2',
        tenantId: 'tenant-1',
        role: 'assistant',
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('system_role');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should check can_edit relation for user role', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ allowed: true }),
      });

      const conversation: ConversationRecord = {
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Test',
        shareAudience: 'private',
        tenantAccess: 'read',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.canWrite({
        conversation,
        userId: 'user-1',
        tenantId: 'tenant-1',
        role: 'user',
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('openfga_authorized');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/stores/test-store/check',
        expect.objectContaining({
          body: expect.stringContaining('"relation":"can_edit"'),
        })
      );
    });
  });

  describe('healthCheck', () => {
    it('should return healthy when OpenFGA is reachable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const result = await service.healthCheck();

      expect(result.healthy).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/stores/test-store',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should return unhealthy when OpenFGA is unreachable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await service.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('500');
    });

    it('should return unhealthy on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });
});

describe('HybridAuthorizationService', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  it('should use OpenFGA for openfga-enabled conversations', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ allowed: true }),
    });

    const conversation: ConversationRecord = {
      id: 'conv-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      title: 'Test',
      shareAudience: 'private',
      tenantAccess: 'read',
      authorizationModel: 'openfga',
      authorizationSpec: {
        storeId: 'custom-store',
        authorizationModelId: 'custom-model',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const service = new HybridAuthorizationService(conversation, {
      apiUrl: 'http://localhost:8080',
      storeId: 'default-store',
      authorizationModelId: 'default-model',
    });

    const result = await service.canRead({
      conversation,
      userId: 'user-1',
      tenantId: 'tenant-1',
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('openfga_authorized');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('custom-store'),
      expect.any(Object)
    );
  });

  it('should fall back to RLS when OpenFGA fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const conversation: ConversationRecord = {
      id: 'conv-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      title: 'Test',
      shareAudience: 'private',
      tenantAccess: 'read',
      authorizationModel: 'openfga',
      authorizationSpec: {
        storeId: 'test-store',
        fallbackShareAudience: 'public',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const service = new HybridAuthorizationService(conversation, {
      apiUrl: 'http://localhost:8080',
      storeId: 'default-store',
    });

    const result = await service.canRead({
      conversation,
      userId: 'user-2',
      tenantId: 'tenant-1',
    });

    // Should fall back to RLS with public audience
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('public_conversation');
  });

  it('should use RLS for non-openfga conversations', async () => {
    const conversation: ConversationRecord = {
      id: 'conv-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      title: 'Test',
      shareAudience: 'public',
      tenantAccess: 'read',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const service = new HybridAuthorizationService(conversation, {
      apiUrl: 'http://localhost:8080',
      storeId: 'default-store',
    });

    const result = await service.canRead({
      conversation,
      userId: 'user-2',
      tenantId: 'tenant-1',
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('public_conversation');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should use conversation-specific OpenFGA config when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ allowed: true }),
    });

    const conversation: ConversationRecord = {
      id: 'conv-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      title: 'Test',
      shareAudience: 'private',
      tenantAccess: 'read',
      authorizationModel: 'openfga',
      authorizationSpec: {
        storeId: 'conversation-store',
        authorizationModelId: 'conversation-model',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const service = new HybridAuthorizationService(conversation, {
      apiUrl: 'http://localhost:8080',
      storeId: 'default-store',
      authorizationModelId: 'default-model',
    });

    await service.canRead({
      conversation,
      userId: 'user-1',
      tenantId: 'tenant-1',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8080/stores/conversation-store/check',
      expect.objectContaining({
        body: expect.stringContaining('"authorization_model_id":"conversation-model"'),
      })
    );
  });
});

describe('createAuthorizationService', () => {
  it('should create HybridAuthorizationService when OpenFGA is configured', () => {
    const conversation: ConversationRecord = {
      id: 'conv-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      title: 'Test',
      shareAudience: 'private',
      tenantAccess: 'read',
      authorizationModel: 'openfga',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const service = createAuthorizationService(conversation, {
      openfga: {
        apiUrl: 'http://localhost:8080',
        storeId: 'test-store',
        authorizationModelId: 'test-model',
      },
    });

    expect(service).toBeInstanceOf(HybridAuthorizationService);
  });

  it('should create SupabaseRLSAuthorizationService by default', () => {
    const conversation: ConversationRecord = {
      id: 'conv-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      title: 'Test',
      shareAudience: 'private',
      tenantAccess: 'read',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const service = createAuthorizationService(conversation);

    expect(service).toBeInstanceOf(SupabaseRLSAuthorizationService);
  });

  it('should create SupabaseRLSAuthorizationService when OpenFGA config is missing', () => {
    const conversation: ConversationRecord = {
      id: 'conv-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      title: 'Test',
      shareAudience: 'private',
      tenantAccess: 'read',
      authorizationModel: 'openfga',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const service = createAuthorizationService(conversation);

    expect(service).toBeInstanceOf(SupabaseRLSAuthorizationService);
  });
});
