import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  SupabaseRealtimeConversationEventHub,
  SupabaseRealtimeConversationListEventHub,
  type SupabaseRealtimeEventHubConfig,
} from './supabaseEventHub.js';
import type { SseSubscriber, ConversationEventType, ConversationListEventType } from './eventHub.js';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

// Mock Supabase RealtimeChannel
function createMockChannel(): RealtimeChannel {
  const listeners = new Map<string, Array<(payload: unknown) => void>>();
  let subscribeCallback: ((status: string) => void) | null = null;

  return {
    on: vi.fn((type: string, filter: unknown, callback: (payload: unknown) => void) => {
      const key = `${type}:${JSON.stringify(filter)}`;
      if (!listeners.has(key)) {
        listeners.set(key, []);
      }
      listeners.get(key)!.push(callback);
      return {} as RealtimeChannel;
    }),
    subscribe: vi.fn((callback: (status: string) => void) => {
      subscribeCallback = callback;
      // Simulate successful subscription
      setTimeout(() => callback('SUBSCRIBED'), 0);
      return {} as RealtimeChannel;
    }),
    unsubscribe: vi.fn(() => Promise.resolve('ok')),
    send: vi.fn((message: { type: string; event: string; payload: unknown }) => {
      // Simulate broadcasting to listeners (for testing, we won't actually trigger callbacks)
      return Promise.resolve('ok');
    }),
    _triggerBroadcast: (event: string, payload: unknown) => {
      const key = `broadcast:${JSON.stringify({ event })}`;
      const callbacks = listeners.get(key) || [];
      callbacks.forEach(cb => cb({ payload }));
    },
  } as unknown as RealtimeChannel;
}

// Mock Supabase Client
function createMockSupabaseClient(): SupabaseClient {
  const channels = new Map<string, RealtimeChannel>();

  return {
    channel: vi.fn((name: string, options?: unknown) => {
      if (!channels.has(name)) {
        channels.set(name, createMockChannel());
      }
      return channels.get(name)!;
    }),
    _getChannel: (name: string) => channels.get(name),
  } as unknown as SupabaseClient;
}

describe('SupabaseRealtimeConversationEventHub', () => {
  let mockClient: SupabaseClient;
  let config: SupabaseRealtimeEventHubConfig;

  beforeEach(() => {
    mockClient = createMockSupabaseClient();
    config = {
      client: mockClient,
      prefix: 'test-events',
      instanceId: 'test-instance',
    };
  });

  describe('constructor', () => {
    it('should create an instance with client config', () => {
      const hub = new SupabaseRealtimeConversationEventHub(config);
      expect(hub).toBeDefined();
    });

    it('should create an instance with URL and key config', () => {
      const hub = new SupabaseRealtimeConversationEventHub({
        supabaseUrl: 'https://test.supabase.co',
        supabaseKey: 'test-key',
        prefix: 'test-events',
      });
      expect(hub).toBeDefined();
    });

    it('should use default prefix if not provided', () => {
      const hub = new SupabaseRealtimeConversationEventHub({ client: mockClient });
      expect(hub).toBeDefined();
    });

    it('should generate instanceId if not provided', () => {
      const hub = new SupabaseRealtimeConversationEventHub({ client: mockClient });
      expect(hub).toBeDefined();
    });
  });

  describe('subscribe', () => {
    it('should support subscribe/unsubscribe pattern', async () => {
      const hub = new SupabaseRealtimeConversationEventHub(config);
      const mockSubscriber: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
        onClose: vi.fn(),
      };

      const unsubscribe = hub.subscribe('tenant1', 'conv1', mockSubscriber);
      expect(typeof unsubscribe).toBe('function');

      // Wait for async channel creation
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify channel was created
      expect(mockClient.channel).toHaveBeenCalledWith(
        'test-events:conversation:tenant1:conv1',
        expect.objectContaining({ config: { broadcast: { self: false } } }),
      );

      // Unsubscribe
      unsubscribe();
      expect(mockSubscriber.onClose).toHaveBeenCalled();
    });

    it('should reuse existing channel for multiple subscribers', async () => {
      const hub = new SupabaseRealtimeConversationEventHub(config);
      const subscriber1: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };
      const subscriber2: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant1', 'conv1', subscriber1);
      hub.subscribe('tenant1', 'conv1', subscriber2);

      await new Promise(resolve => setTimeout(resolve, 10));

      // Channel should only be created once
      expect(mockClient.channel).toHaveBeenCalledTimes(1);
    });

    it('should create separate channels for different conversations', async () => {
      const hub = new SupabaseRealtimeConversationEventHub(config);
      const subscriber1: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };
      const subscriber2: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant1', 'conv1', subscriber1);
      hub.subscribe('tenant1', 'conv2', subscriber2);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockClient.channel).toHaveBeenCalledWith(
        'test-events:conversation:tenant1:conv1',
        expect.anything(),
      );
      expect(mockClient.channel).toHaveBeenCalledWith(
        'test-events:conversation:tenant1:conv2',
        expect.anything(),
      );
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe from channel when last subscriber is removed', async () => {
      const hub = new SupabaseRealtimeConversationEventHub(config);
      const mockSubscriber: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
        onClose: vi.fn(),
      };

      const unsubscribe = hub.subscribe('tenant1', 'conv1', mockSubscriber);
      await new Promise(resolve => setTimeout(resolve, 10));

      const channel = (mockClient as unknown as { _getChannel: (name: string) => RealtimeChannel })._getChannel(
        'test-events:conversation:tenant1:conv1',
      );

      unsubscribe();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(channel?.unsubscribe).toHaveBeenCalled();
    });

    it('should not unsubscribe from channel when other subscribers remain', async () => {
      const hub = new SupabaseRealtimeConversationEventHub(config);
      const subscriber1: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
        onClose: vi.fn(),
      };
      const subscriber2: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
        onClose: vi.fn(),
      };

      const unsubscribe1 = hub.subscribe('tenant1', 'conv1', subscriber1);
      const unsubscribe2 = hub.subscribe('tenant1', 'conv1', subscriber2);
      await new Promise(resolve => setTimeout(resolve, 10));

      const channel = (mockClient as unknown as { _getChannel: (name: string) => RealtimeChannel })._getChannel(
        'test-events:conversation:tenant1:conv1',
      );

      unsubscribe1();
      expect(subscriber1.onClose).toHaveBeenCalled();
      expect(channel?.unsubscribe).not.toHaveBeenCalled();

      unsubscribe2();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(subscriber2.onClose).toHaveBeenCalled();
      expect(channel?.unsubscribe).toHaveBeenCalled();
    });
  });

  describe('broadcast', () => {
    it('should broadcast to local subscribers immediately', () => {
      const hub = new SupabaseRealtimeConversationEventHub(config);
      const mockSubscriber: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
        onClose: vi.fn(),
      };

      hub.subscribe('tenant1', 'conv1', mockSubscriber);
      hub.broadcast('tenant1', 'conv1', 'message', { text: 'test' });

      expect(mockSubscriber.send).toHaveBeenCalledWith('message', { text: 'test' });
    });

    it('should send message to Supabase channel', async () => {
      const hub = new SupabaseRealtimeConversationEventHub(config);
      const mockSubscriber: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant1', 'conv1', mockSubscriber);
      await new Promise(resolve => setTimeout(resolve, 10));

      const channel = (mockClient as unknown as { _getChannel: (name: string) => RealtimeChannel })._getChannel(
        'test-events:conversation:tenant1:conv1',
      );

      hub.broadcast('tenant1', 'conv1', 'message', { text: 'test' });
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(channel?.send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'conversation',
        payload: expect.objectContaining({
          event: 'message',
          data: { text: 'test' },
          instanceId: 'test-instance',
        }),
      });
    });

    it('should handle multiple subscribers', () => {
      const hub = new SupabaseRealtimeConversationEventHub(config);
      const subscriber1: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };
      const subscriber2: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant1', 'conv1', subscriber1);
      hub.subscribe('tenant1', 'conv1', subscriber2);
      hub.broadcast('tenant1', 'conv1', 'message', { text: 'test' });

      expect(subscriber1.send).toHaveBeenCalledWith('message', { text: 'test' });
      expect(subscriber2.send).toHaveBeenCalledWith('message', { text: 'test' });
    });

    it('should isolate broadcasts by conversation', () => {
      const hub = new SupabaseRealtimeConversationEventHub(config);
      const subscriber1: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };
      const subscriber2: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant1', 'conv1', subscriber1);
      hub.subscribe('tenant1', 'conv2', subscriber2);
      hub.broadcast('tenant1', 'conv1', 'message', { text: 'test' });

      expect(subscriber1.send).toHaveBeenCalledWith('message', { text: 'test' });
      expect(subscriber2.send).not.toHaveBeenCalled();
    });

    it('should ignore messages from same instance', async () => {
      const hub = new SupabaseRealtimeConversationEventHub(config);
      const mockSubscriber: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant1', 'conv1', mockSubscriber);
      await new Promise(resolve => setTimeout(resolve, 10));

      const channel = (mockClient as unknown as { _getChannel: (name: string) => RealtimeChannel })._getChannel(
        'test-events:conversation:tenant1:conv1',
      ) as RealtimeChannel & { _triggerBroadcast: (event: string, payload: unknown) => void };

      // Clear the local send call from broadcast
      vi.clearAllMocks();

      // Simulate receiving a message from the same instance
      channel._triggerBroadcast('conversation', {
        event: 'message',
        data: { text: 'remote' },
        timestamp: Date.now(),
        instanceId: 'test-instance',
      });

      // Should not call send since it's from the same instance
      expect(mockSubscriber.send).not.toHaveBeenCalled();
    });

    it('should handle messages from different instances', async () => {
      const hub = new SupabaseRealtimeConversationEventHub(config);
      const mockSubscriber: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant1', 'conv1', mockSubscriber);
      await new Promise(resolve => setTimeout(resolve, 10));

      const channel = (mockClient as unknown as { _getChannel: (name: string) => RealtimeChannel })._getChannel(
        'test-events:conversation:tenant1:conv1',
      ) as RealtimeChannel & { _triggerBroadcast: (event: string, payload: unknown) => void };

      // Clear the local send call from broadcast
      vi.clearAllMocks();

      // Simulate receiving a message from a different instance
      channel._triggerBroadcast('conversation', {
        event: 'message',
        data: { text: 'remote' },
        timestamp: Date.now(),
        instanceId: 'different-instance',
      });

      // Should call send since it's from a different instance
      expect(mockSubscriber.send).toHaveBeenCalledWith('message', { text: 'remote' });
    });
  });

  describe('shutdown', () => {
    it('should support graceful shutdown', async () => {
      const hub = new SupabaseRealtimeConversationEventHub(config);
      const mockSubscriber: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
        onClose: vi.fn(),
      };

      hub.subscribe('tenant1', 'conv1', mockSubscriber);
      await new Promise(resolve => setTimeout(resolve, 10));

      const channel = (mockClient as unknown as { _getChannel: (name: string) => RealtimeChannel })._getChannel(
        'test-events:conversation:tenant1:conv1',
      );

      await hub.shutdown();

      expect(mockSubscriber.onClose).toHaveBeenCalled();
      expect(channel?.unsubscribe).toHaveBeenCalled();
    });

    it('should not process messages after shutdown', async () => {
      const hub = new SupabaseRealtimeConversationEventHub(config);
      const mockSubscriber: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant1', 'conv1', mockSubscriber);
      await new Promise(resolve => setTimeout(resolve, 10));

      const channel = (mockClient as unknown as { _getChannel: (name: string) => RealtimeChannel })._getChannel(
        'test-events:conversation:tenant1:conv1',
      ) as RealtimeChannel & { _triggerBroadcast: (event: string, payload: unknown) => void };

      await hub.shutdown();
      vi.clearAllMocks();

      // Try to trigger a broadcast after shutdown
      channel._triggerBroadcast('conversation', {
        event: 'message',
        data: { text: 'post-shutdown' },
        timestamp: Date.now(),
        instanceId: 'different-instance',
      });

      expect(mockSubscriber.send).not.toHaveBeenCalled();
    });

    it('should handle shutdown with multiple channels', async () => {
      const hub = new SupabaseRealtimeConversationEventHub(config);
      const subscriber1: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
        onClose: vi.fn(),
      };
      const subscriber2: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
        onClose: vi.fn(),
      };

      hub.subscribe('tenant1', 'conv1', subscriber1);
      hub.subscribe('tenant1', 'conv2', subscriber2);
      await new Promise(resolve => setTimeout(resolve, 10));

      await hub.shutdown();

      expect(subscriber1.onClose).toHaveBeenCalled();
      expect(subscriber2.onClose).toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status on successful check', async () => {
      const hub = new SupabaseRealtimeConversationEventHub(config);
      const result = await hub.healthCheck();

      expect(result).toHaveProperty('healthy');
      expect(result.healthy).toBe(true);
    });

    it('should return unhealthy status on unsubscribe failure', async () => {
      const failingClient = createMockSupabaseClient();
      const failingChannel = createMockChannel();
      failingChannel.unsubscribe = vi.fn(() => Promise.resolve('error'));
      (failingClient.channel as ReturnType<typeof vi.fn>).mockReturnValue(failingChannel);

      const hub = new SupabaseRealtimeConversationEventHub({
        client: failingClient,
        prefix: 'test-events',
      });

      const result = await hub.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('unsubscribe status: error');
    });

    it('should return unhealthy status on subscription error', async () => {
      const failingClient = createMockSupabaseClient();
      const failingChannel = createMockChannel();
      failingChannel.subscribe = vi.fn((callback: (status: string) => void) => {
        setTimeout(() => callback('CHANNEL_ERROR'), 0);
        return {} as RealtimeChannel;
      });
      (failingClient.channel as ReturnType<typeof vi.fn>).mockReturnValue(failingChannel);

      const hub = new SupabaseRealtimeConversationEventHub({
        client: failingClient,
        prefix: 'test-events',
      });

      const result = await hub.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Realtime channel error');
    });

    it('should return unhealthy status on subscription timeout', async () => {
      const failingClient = createMockSupabaseClient();
      const failingChannel = createMockChannel();
      failingChannel.subscribe = vi.fn((callback: (status: string) => void) => {
        setTimeout(() => callback('TIMED_OUT'), 0);
        return {} as RealtimeChannel;
      });
      (failingClient.channel as ReturnType<typeof vi.fn>).mockReturnValue(failingChannel);

      const hub = new SupabaseRealtimeConversationEventHub({
        client: failingClient,
        prefix: 'test-events',
      });

      const result = await hub.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Realtime channel subscribe timeout');
    });
  });
});

describe('SupabaseRealtimeConversationListEventHub', () => {
  let mockClient: SupabaseClient;
  let config: SupabaseRealtimeEventHubConfig;

  beforeEach(() => {
    mockClient = createMockSupabaseClient();
    config = {
      client: mockClient,
      prefix: 'test-events',
      instanceId: 'test-instance',
    };
  });

  describe('constructor', () => {
    it('should create an instance with client config', () => {
      const hub = new SupabaseRealtimeConversationListEventHub(config);
      expect(hub).toBeDefined();
    });

    it('should create an instance with URL and key config', () => {
      const hub = new SupabaseRealtimeConversationListEventHub({
        supabaseUrl: 'https://test.supabase.co',
        supabaseKey: 'test-key',
        prefix: 'test-events',
      });
      expect(hub).toBeDefined();
    });

    it('should use default prefix if not provided', () => {
      const hub = new SupabaseRealtimeConversationListEventHub({ client: mockClient });
      expect(hub).toBeDefined();
    });

    it('should generate instanceId if not provided', () => {
      const hub = new SupabaseRealtimeConversationListEventHub({ client: mockClient });
      expect(hub).toBeDefined();
    });
  });

  describe('subscribe', () => {
    it('should support subscribe/unsubscribe pattern', async () => {
      const hub = new SupabaseRealtimeConversationListEventHub(config);
      const mockSubscriber: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
        onClose: vi.fn(),
      };

      const unsubscribe = hub.subscribe('tenant1', mockSubscriber);
      expect(typeof unsubscribe).toBe('function');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockClient.channel).toHaveBeenCalledWith(
        'test-events:conversation-list:tenant1',
        expect.objectContaining({ config: { broadcast: { self: false } } }),
      );

      unsubscribe();
      expect(mockSubscriber.onClose).toHaveBeenCalled();
    });

    it('should reuse existing channel for multiple subscribers', async () => {
      const hub = new SupabaseRealtimeConversationListEventHub(config);
      const subscriber1: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };
      const subscriber2: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant1', subscriber1);
      hub.subscribe('tenant1', subscriber2);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockClient.channel).toHaveBeenCalledTimes(1);
    });

    it('should create separate channels for different tenants', async () => {
      const hub = new SupabaseRealtimeConversationListEventHub(config);
      const subscriber1: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };
      const subscriber2: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant1', subscriber1);
      hub.subscribe('tenant2', subscriber2);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockClient.channel).toHaveBeenCalledWith('test-events:conversation-list:tenant1', expect.anything());
      expect(mockClient.channel).toHaveBeenCalledWith('test-events:conversation-list:tenant2', expect.anything());
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe from channel when last subscriber is removed', async () => {
      const hub = new SupabaseRealtimeConversationListEventHub(config);
      const mockSubscriber: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
        onClose: vi.fn(),
      };

      const unsubscribe = hub.subscribe('tenant1', mockSubscriber);
      await new Promise(resolve => setTimeout(resolve, 10));

      const channel = (mockClient as unknown as { _getChannel: (name: string) => RealtimeChannel })._getChannel(
        'test-events:conversation-list:tenant1',
      );

      unsubscribe();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(channel?.unsubscribe).toHaveBeenCalled();
    });

    it('should not unsubscribe from channel when other subscribers remain', async () => {
      const hub = new SupabaseRealtimeConversationListEventHub(config);
      const subscriber1: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
        onClose: vi.fn(),
      };
      const subscriber2: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
        onClose: vi.fn(),
      };

      const unsubscribe1 = hub.subscribe('tenant1', subscriber1);
      const unsubscribe2 = hub.subscribe('tenant1', subscriber2);
      await new Promise(resolve => setTimeout(resolve, 10));

      const channel = (mockClient as unknown as { _getChannel: (name: string) => RealtimeChannel })._getChannel(
        'test-events:conversation-list:tenant1',
      );

      unsubscribe1();
      expect(subscriber1.onClose).toHaveBeenCalled();
      expect(channel?.unsubscribe).not.toHaveBeenCalled();

      unsubscribe2();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(subscriber2.onClose).toHaveBeenCalled();
      expect(channel?.unsubscribe).toHaveBeenCalled();
    });
  });

  describe('broadcast', () => {
    it('should broadcast to local subscribers immediately', () => {
      const hub = new SupabaseRealtimeConversationListEventHub(config);
      const mockSubscriber: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
        onClose: vi.fn(),
      };

      hub.subscribe('tenant1', mockSubscriber);
      hub.broadcast('tenant1', 'upsert', { id: 'conv1' });

      expect(mockSubscriber.send).toHaveBeenCalledWith('upsert', { id: 'conv1' });
    });

    it('should send message to Supabase channel', async () => {
      const hub = new SupabaseRealtimeConversationListEventHub(config);
      const mockSubscriber: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant1', mockSubscriber);
      await new Promise(resolve => setTimeout(resolve, 10));

      const channel = (mockClient as unknown as { _getChannel: (name: string) => RealtimeChannel })._getChannel(
        'test-events:conversation-list:tenant1',
      );

      hub.broadcast('tenant1', 'upsert', { id: 'conv1' });
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(channel?.send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'conversation-list',
        payload: expect.objectContaining({
          event: 'upsert',
          data: { id: 'conv1' },
          instanceId: 'test-instance',
        }),
      });
    });

    it('should handle multiple subscribers', () => {
      const hub = new SupabaseRealtimeConversationListEventHub(config);
      const subscriber1: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };
      const subscriber2: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant1', subscriber1);
      hub.subscribe('tenant1', subscriber2);
      hub.broadcast('tenant1', 'upsert', { id: 'conv1' });

      expect(subscriber1.send).toHaveBeenCalledWith('upsert', { id: 'conv1' });
      expect(subscriber2.send).toHaveBeenCalledWith('upsert', { id: 'conv1' });
    });

    it('should isolate broadcasts by tenant', () => {
      const hub = new SupabaseRealtimeConversationListEventHub(config);
      const subscriber1: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };
      const subscriber2: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant1', subscriber1);
      hub.subscribe('tenant2', subscriber2);
      hub.broadcast('tenant1', 'upsert', { id: 'conv1' });

      expect(subscriber1.send).toHaveBeenCalledWith('upsert', { id: 'conv1' });
      expect(subscriber2.send).not.toHaveBeenCalled();
    });

    it('should ignore messages from same instance', async () => {
      const hub = new SupabaseRealtimeConversationListEventHub(config);
      const mockSubscriber: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant1', mockSubscriber);
      await new Promise(resolve => setTimeout(resolve, 10));

      const channel = (mockClient as unknown as { _getChannel: (name: string) => RealtimeChannel })._getChannel(
        'test-events:conversation-list:tenant1',
      ) as RealtimeChannel & { _triggerBroadcast: (event: string, payload: unknown) => void };

      vi.clearAllMocks();

      channel._triggerBroadcast('conversation-list', {
        event: 'upsert',
        data: { id: 'conv1' },
        timestamp: Date.now(),
        instanceId: 'test-instance',
      });

      expect(mockSubscriber.send).not.toHaveBeenCalled();
    });

    it('should handle messages from different instances', async () => {
      const hub = new SupabaseRealtimeConversationListEventHub(config);
      const mockSubscriber: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant1', mockSubscriber);
      await new Promise(resolve => setTimeout(resolve, 10));

      const channel = (mockClient as unknown as { _getChannel: (name: string) => RealtimeChannel })._getChannel(
        'test-events:conversation-list:tenant1',
      ) as RealtimeChannel & { _triggerBroadcast: (event: string, payload: unknown) => void };

      vi.clearAllMocks();

      channel._triggerBroadcast('conversation-list', {
        event: 'upsert',
        data: { id: 'conv1' },
        timestamp: Date.now(),
        instanceId: 'different-instance',
      });

      expect(mockSubscriber.send).toHaveBeenCalledWith('upsert', { id: 'conv1' });
    });
  });

  describe('shutdown', () => {
    it('should support graceful shutdown', async () => {
      const hub = new SupabaseRealtimeConversationListEventHub(config);
      const mockSubscriber: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
        onClose: vi.fn(),
      };

      hub.subscribe('tenant1', mockSubscriber);
      await new Promise(resolve => setTimeout(resolve, 10));

      const channel = (mockClient as unknown as { _getChannel: (name: string) => RealtimeChannel })._getChannel(
        'test-events:conversation-list:tenant1',
      );

      await hub.shutdown();

      expect(mockSubscriber.onClose).toHaveBeenCalled();
      expect(channel?.unsubscribe).toHaveBeenCalled();
    });

    it('should not process messages after shutdown', async () => {
      const hub = new SupabaseRealtimeConversationListEventHub(config);
      const mockSubscriber: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant1', mockSubscriber);
      await new Promise(resolve => setTimeout(resolve, 10));

      const channel = (mockClient as unknown as { _getChannel: (name: string) => RealtimeChannel })._getChannel(
        'test-events:conversation-list:tenant1',
      ) as RealtimeChannel & { _triggerBroadcast: (event: string, payload: unknown) => void };

      await hub.shutdown();
      vi.clearAllMocks();

      channel._triggerBroadcast('conversation-list', {
        event: 'upsert',
        data: { id: 'conv1' },
        timestamp: Date.now(),
        instanceId: 'different-instance',
      });

      expect(mockSubscriber.send).not.toHaveBeenCalled();
    });

    it('should handle shutdown with multiple channels', async () => {
      const hub = new SupabaseRealtimeConversationListEventHub(config);
      const subscriber1: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
        onClose: vi.fn(),
      };
      const subscriber2: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
        onClose: vi.fn(),
      };

      hub.subscribe('tenant1', subscriber1);
      hub.subscribe('tenant2', subscriber2);
      await new Promise(resolve => setTimeout(resolve, 10));

      await hub.shutdown();

      expect(subscriber1.onClose).toHaveBeenCalled();
      expect(subscriber2.onClose).toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status on successful check', async () => {
      const hub = new SupabaseRealtimeConversationListEventHub(config);
      const result = await hub.healthCheck();

      expect(result).toHaveProperty('healthy');
      expect(result.healthy).toBe(true);
    });

    it('should return unhealthy status on unsubscribe failure', async () => {
      const failingClient = createMockSupabaseClient();
      const failingChannel = createMockChannel();
      failingChannel.unsubscribe = vi.fn(() => Promise.resolve('error'));
      (failingClient.channel as ReturnType<typeof vi.fn>).mockReturnValue(failingChannel);

      const hub = new SupabaseRealtimeConversationListEventHub({
        client: failingClient,
        prefix: 'test-events',
      });

      const result = await hub.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('unsubscribe status: error');
    });

    it('should return unhealthy status on subscription error', async () => {
      const failingClient = createMockSupabaseClient();
      const failingChannel = createMockChannel();
      failingChannel.subscribe = vi.fn((callback: (status: string) => void) => {
        setTimeout(() => callback('CHANNEL_ERROR'), 0);
        return {} as RealtimeChannel;
      });
      (failingClient.channel as ReturnType<typeof vi.fn>).mockReturnValue(failingChannel);

      const hub = new SupabaseRealtimeConversationListEventHub({
        client: failingClient,
        prefix: 'test-events',
      });

      const result = await hub.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Realtime channel error');
    });

    it('should return unhealthy status on subscription timeout', async () => {
      const failingClient = createMockSupabaseClient();
      const failingChannel = createMockChannel();
      failingChannel.subscribe = vi.fn((callback: (status: string) => void) => {
        setTimeout(() => callback('TIMED_OUT'), 0);
        return {} as RealtimeChannel;
      });
      (failingClient.channel as ReturnType<typeof vi.fn>).mockReturnValue(failingChannel);

      const hub = new SupabaseRealtimeConversationListEventHub({
        client: failingClient,
        prefix: 'test-events',
      });

      const result = await hub.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Realtime channel subscribe timeout');
    });
  });
});

describe('Event Hub Integration', () => {
  it('should maintain separate state for conversation and list hubs', () => {
    const mockClient = createMockSupabaseClient();
    const config = {
      client: mockClient,
      prefix: 'test-events',
      instanceId: 'test-instance',
    };

    const conversationHub = new SupabaseRealtimeConversationEventHub(config);
    const listHub = new SupabaseRealtimeConversationListEventHub(config);

    const convSubscriber: SseSubscriber<ConversationEventType> = { send: vi.fn() };
    const listSubscriber: SseSubscriber<ConversationListEventType> = { send: vi.fn() };

    conversationHub.subscribe('tenant1', 'conv1', convSubscriber);
    listHub.subscribe('tenant1', listSubscriber);

    conversationHub.broadcast('tenant1', 'conv1', 'message', { text: 'test' });
    listHub.broadcast('tenant1', 'upsert', { id: 'conv1' });

    expect(convSubscriber.send).toHaveBeenCalledTimes(1);
    expect(listSubscriber.send).toHaveBeenCalledTimes(1);
  });
});
