import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  SupabaseRealtimeConversationEventHub,
  SupabaseRealtimeConversationListEventHub,
} from './supabaseEventHub.js';
import type { SseSubscriber, ConversationEventType, ConversationListEventType } from './eventHub.js';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

// Mock Supabase client
function createMockSupabaseClient() {
  const channelCallbacks = new Map<string, Map<string, (payload: any) => void>>();
  const channels = new Map<string, RealtimeChannel>();

  const createMockChannel = (channelName: string): RealtimeChannel => {
    const callbacks = new Map<string, (payload: any) => void>();
    channelCallbacks.set(channelName, callbacks);

    let subscribeCallback: ((status: string) => void) | null = null;

    const mockChannel = {
      on: vi.fn((type: string, config: any, callback: (payload: any) => void) => {
        if (type === 'broadcast') {
          callbacks.set(config.event, callback);
        }
        return mockChannel;
      }),
      subscribe: vi.fn((callback: (status: string) => void) => {
        subscribeCallback = callback;
        // Simulate successful subscription
        setTimeout(() => callback('SUBSCRIBED'), 0);
        return mockChannel;
      }),
      send: vi.fn((message: any) => {
        // Simulate broadcasting to other instances
        const callback = callbacks.get(message.event);
        if (callback) {
          // Simulate receiving the message from another instance
          setTimeout(() => {
            callback({ payload: message.payload });
          }, 0);
        }
        return Promise.resolve('ok');
      }),
      unsubscribe: vi.fn(() => {
        channelCallbacks.delete(channelName);
        return Promise.resolve('ok');
      }),
    } as unknown as RealtimeChannel;

    channels.set(channelName, mockChannel);
    return mockChannel;
  };

  const client = {
    channel: vi.fn((channelName: string, config?: any) => {
      const existing = channels.get(channelName);
      if (existing) return existing;
      return createMockChannel(channelName);
    }),
  } as unknown as SupabaseClient;

  return { client, channels, channelCallbacks };
}

describe('SupabaseRealtimeConversationEventHub', () => {
  let mockClient: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    mockClient = createMockSupabaseClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create an instance with valid config', () => {
    const hub = new SupabaseRealtimeConversationEventHub({
      client: mockClient.client,
    });
    expect(hub).toBeDefined();
  });

  it('should create instance with URL and key config', () => {
    const hub = new SupabaseRealtimeConversationEventHub({
      supabaseUrl: 'https://test.supabase.co',
      supabaseKey: 'test-key',
    });
    expect(hub).toBeDefined();
  });

  it('should create instance with custom prefix and instanceId', () => {
    const hub = new SupabaseRealtimeConversationEventHub({
      client: mockClient.client,
      prefix: 'custom-prefix',
      instanceId: 'custom-instance-123',
    });
    expect(hub).toBeDefined();
  });

  it('should support subscribe/unsubscribe pattern', async () => {
    const hub = new SupabaseRealtimeConversationEventHub({
      client: mockClient.client,
    });
    const mockSubscriber: SseSubscriber<ConversationEventType> = {
      send: vi.fn(),
      onClose: vi.fn(),
    };

    const unsubscribe = hub.subscribe('tenant1', 'conv1', mockSubscriber);
    expect(typeof unsubscribe).toBe('function');

    // Wait for subscription to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify channel was created and subscribed
    expect(mockClient.client.channel).toHaveBeenCalledWith(
      'copilot:events:conversation:tenant1:conv1',
      { config: { broadcast: { self: false } } },
    );

    // Unsubscribe
    unsubscribe();
    expect(mockSubscriber.onClose).toHaveBeenCalled();
  });

  it('should broadcast to local subscribers immediately', () => {
    const hub = new SupabaseRealtimeConversationEventHub({
      client: mockClient.client,
    });
    const mockSubscriber: SseSubscriber<ConversationEventType> = {
      send: vi.fn(),
      onClose: vi.fn(),
    };

    hub.subscribe('tenant1', 'conv1', mockSubscriber);
    hub.broadcast('tenant1', 'conv1', 'message', { text: 'test' });

    expect(mockSubscriber.send).toHaveBeenCalledWith('message', { text: 'test' });
  });

  it('should handle multiple subscribers', () => {
    const hub = new SupabaseRealtimeConversationEventHub({
      client: mockClient.client,
    });
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
    const hub = new SupabaseRealtimeConversationEventHub({
      client: mockClient.client,
    });
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

  it('should isolate broadcasts by tenant', () => {
    const hub = new SupabaseRealtimeConversationEventHub({
      client: mockClient.client,
    });
    const subscriber1: SseSubscriber<ConversationEventType> = {
      send: vi.fn(),
    };
    const subscriber2: SseSubscriber<ConversationEventType> = {
      send: vi.fn(),
    };

    hub.subscribe('tenant1', 'conv1', subscriber1);
    hub.subscribe('tenant2', 'conv1', subscriber2);
    hub.broadcast('tenant1', 'conv1', 'message', { text: 'test' });

    expect(subscriber1.send).toHaveBeenCalledWith('message', { text: 'test' });
    expect(subscriber2.send).not.toHaveBeenCalled();
  });

  it('should reuse existing channel for same conversation', async () => {
    const hub = new SupabaseRealtimeConversationEventHub({
      client: mockClient.client,
    });
    const subscriber1: SseSubscriber<ConversationEventType> = { send: vi.fn() };
    const subscriber2: SseSubscriber<ConversationEventType> = { send: vi.fn() };

    hub.subscribe('tenant1', 'conv1', subscriber1);
    hub.subscribe('tenant1', 'conv1', subscriber2);

    await new Promise(resolve => setTimeout(resolve, 10));

    // Channel should only be created once
    expect(mockClient.client.channel).toHaveBeenCalledTimes(1);
  });

  it('should unsubscribe from channel when last subscriber removed', async () => {
    const hub = new SupabaseRealtimeConversationEventHub({
      client: mockClient.client,
    });
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

    const channelName = 'copilot:events:conversation:tenant1:conv1';
    const channel = mockClient.channels.get(channelName);

    // Remove first subscriber - channel should remain
    unsubscribe1();
    expect(channel?.unsubscribe).not.toHaveBeenCalled();

    // Remove last subscriber - channel should be unsubscribed
    unsubscribe2();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(channel?.unsubscribe).toHaveBeenCalled();
  });

  it('should filter out messages from same instance', async () => {
    const instanceId = 'test-instance-123';
    const hub = new SupabaseRealtimeConversationEventHub({
      client: mockClient.client,
      instanceId,
    });
    const subscriber: SseSubscriber<ConversationEventType> = {
      send: vi.fn(),
    };

    hub.subscribe('tenant1', 'conv1', subscriber);
    await new Promise(resolve => setTimeout(resolve, 10));

    const channelName = 'copilot:events:conversation:tenant1:conv1';
    const callbacks = mockClient.channelCallbacks.get(channelName);
    const broadcastCallback = callbacks?.get('conversation');

    // Simulate receiving a message from the same instance
    broadcastCallback?.({
      payload: {
        event: 'message',
        data: { text: 'test' },
        instanceId,
        timestamp: Date.now(),
      },
    });

    await new Promise(resolve => setTimeout(resolve, 10));

    // Should not trigger local broadcast for same instance
    expect(subscriber.send).not.toHaveBeenCalled();
  });

  it('should process messages from different instances', async () => {
    const hub = new SupabaseRealtimeConversationEventHub({
      client: mockClient.client,
      instanceId: 'instance-1',
    });
    const subscriber: SseSubscriber<ConversationEventType> = {
      send: vi.fn(),
    };

    hub.subscribe('tenant1', 'conv1', subscriber);
    await new Promise(resolve => setTimeout(resolve, 10));

    const channelName = 'copilot:events:conversation:tenant1:conv1';
    const callbacks = mockClient.channelCallbacks.get(channelName);
    const broadcastCallback = callbacks?.get('conversation');

    // Simulate receiving a message from a different instance
    broadcastCallback?.({
      payload: {
        event: 'message',
        data: { text: 'test from other instance' },
        instanceId: 'instance-2',
        timestamp: Date.now(),
      },
    });

    await new Promise(resolve => setTimeout(resolve, 10));

    // Should trigger local broadcast for different instance
    expect(subscriber.send).toHaveBeenCalledWith('message', { text: 'test from other instance' });
  });

  it('should not process messages after shutdown', async () => {
    const hub = new SupabaseRealtimeConversationEventHub({
      client: mockClient.client,
    });
    const subscriber: SseSubscriber<ConversationEventType> = {
      send: vi.fn(),
      onClose: vi.fn(),
    };

    hub.subscribe('tenant1', 'conv1', subscriber);
    await new Promise(resolve => setTimeout(resolve, 10));

    await hub.shutdown();

    const channelName = 'copilot:events:conversation:tenant1:conv1';
    const callbacks = mockClient.channelCallbacks.get(channelName);
    const broadcastCallback = callbacks?.get('conversation');

    // Try to send message after shutdown
    broadcastCallback?.({
      payload: {
        event: 'message',
        data: { text: 'after shutdown' },
        instanceId: 'other-instance',
        timestamp: Date.now(),
      },
    });

    await new Promise(resolve => setTimeout(resolve, 10));

    // Should not process messages after shutdown
    expect(subscriber.send).not.toHaveBeenCalled();
  });

  it('should provide health check method', async () => {
    const hub = new SupabaseRealtimeConversationEventHub({
      client: mockClient.client,
    });
    const result = await hub.healthCheck();

    expect(result).toHaveProperty('healthy');
    expect(typeof result.healthy).toBe('boolean');
  });

  it('should return healthy status on successful health check', async () => {
    const hub = new SupabaseRealtimeConversationEventHub({
      client: mockClient.client,
    });
    const result = await hub.healthCheck();

    expect(result.healthy).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should support graceful shutdown', async () => {
    const hub = new SupabaseRealtimeConversationEventHub({
      client: mockClient.client,
    });
    const mockSubscriber: SseSubscriber<ConversationEventType> = {
      send: vi.fn(),
      onClose: vi.fn(),
    };

    hub.subscribe('tenant1', 'conv1', mockSubscriber);
    await new Promise(resolve => setTimeout(resolve, 10));

    await hub.shutdown();

    expect(mockSubscriber.onClose).toHaveBeenCalled();
  });

  it('should unsubscribe all channels on shutdown', async () => {
    const hub = new SupabaseRealtimeConversationEventHub({
      client: mockClient.client,
    });

    const subscriber1: SseSubscriber<ConversationEventType> = { send: vi.fn(), onClose: vi.fn() };
    const subscriber2: SseSubscriber<ConversationEventType> = { send: vi.fn(), onClose: vi.fn() };

    hub.subscribe('tenant1', 'conv1', subscriber1);
    hub.subscribe('tenant1', 'conv2', subscriber2);

    await new Promise(resolve => setTimeout(resolve, 10));

    const channel1 = mockClient.channels.get('copilot:events:conversation:tenant1:conv1');
    const channel2 = mockClient.channels.get('copilot:events:conversation:tenant1:conv2');

    await hub.shutdown();

    expect(channel1?.unsubscribe).toHaveBeenCalled();
    expect(channel2?.unsubscribe).toHaveBeenCalled();
  });

  it('should handle malformed remote messages gracefully', async () => {
    const hub = new SupabaseRealtimeConversationEventHub({
      client: mockClient.client,
      instanceId: 'instance-1',
    });
    const subscriber: SseSubscriber<ConversationEventType> = {
      send: vi.fn(),
    };

    hub.subscribe('tenant1', 'conv1', subscriber);
    await new Promise(resolve => setTimeout(resolve, 10));

    const channelName = 'copilot:events:conversation:tenant1:conv1';
    const callbacks = mockClient.channelCallbacks.get(channelName);
    const broadcastCallback = callbacks?.get('conversation');

    // Send payload without required fields
    broadcastCallback?.({
      payload: {
        // Missing event, data fields
        instanceId: 'instance-2',
        timestamp: Date.now(),
      },
    });

    await new Promise(resolve => setTimeout(resolve, 10));

    // Should handle gracefully - will call send with undefined values
    expect(subscriber.send).toHaveBeenCalledWith(undefined, undefined);
  });
});

describe('SupabaseRealtimeConversationListEventHub', () => {
  let mockClient: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    mockClient = createMockSupabaseClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create an instance with valid config', () => {
    const hub = new SupabaseRealtimeConversationListEventHub({
      client: mockClient.client,
    });
    expect(hub).toBeDefined();
  });

  it('should create instance with URL and key config', () => {
    const hub = new SupabaseRealtimeConversationListEventHub({
      supabaseUrl: 'https://test.supabase.co',
      supabaseKey: 'test-key',
    });
    expect(hub).toBeDefined();
  });

  it('should support subscribe/unsubscribe pattern', async () => {
    const hub = new SupabaseRealtimeConversationListEventHub({
      client: mockClient.client,
    });
    const mockSubscriber: SseSubscriber<ConversationListEventType> = {
      send: vi.fn(),
      onClose: vi.fn(),
    };

    const unsubscribe = hub.subscribe('tenant1', mockSubscriber);
    expect(typeof unsubscribe).toBe('function');

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockClient.client.channel).toHaveBeenCalledWith(
      'copilot:events:conversation-list:tenant1',
      { config: { broadcast: { self: false } } },
    );

    unsubscribe();
    expect(mockSubscriber.onClose).toHaveBeenCalled();
  });

  it('should broadcast to local subscribers immediately', () => {
    const hub = new SupabaseRealtimeConversationListEventHub({
      client: mockClient.client,
    });
    const mockSubscriber: SseSubscriber<ConversationListEventType> = {
      send: vi.fn(),
      onClose: vi.fn(),
    };

    hub.subscribe('tenant1', mockSubscriber);
    hub.broadcast('tenant1', 'upsert', { conversation: { id: 'conv1' } as any });

    expect(mockSubscriber.send).toHaveBeenCalledWith('upsert', { conversation: { id: 'conv1' } });
  });

  it('should handle multiple subscribers', () => {
    const hub = new SupabaseRealtimeConversationListEventHub({
      client: mockClient.client,
    });
    const subscriber1: SseSubscriber<ConversationListEventType> = {
      send: vi.fn(),
    };
    const subscriber2: SseSubscriber<ConversationListEventType> = {
      send: vi.fn(),
    };

    hub.subscribe('tenant1', subscriber1);
    hub.subscribe('tenant1', subscriber2);
    hub.broadcast('tenant1', 'upsert', { conversation: { id: 'conv1' } as any });

    expect(subscriber1.send).toHaveBeenCalledWith('upsert', { conversation: { id: 'conv1' } });
    expect(subscriber2.send).toHaveBeenCalledWith('upsert', { conversation: { id: 'conv1' } });
  });

  it('should isolate broadcasts by tenant', () => {
    const hub = new SupabaseRealtimeConversationListEventHub({
      client: mockClient.client,
    });
    const subscriber1: SseSubscriber<ConversationListEventType> = {
      send: vi.fn(),
    };
    const subscriber2: SseSubscriber<ConversationListEventType> = {
      send: vi.fn(),
    };

    hub.subscribe('tenant1', subscriber1);
    hub.subscribe('tenant2', subscriber2);
    hub.broadcast('tenant1', 'upsert', { conversation: { id: 'conv1' } as any });

    expect(subscriber1.send).toHaveBeenCalledWith('upsert', { conversation: { id: 'conv1' } });
    expect(subscriber2.send).not.toHaveBeenCalled();
  });

  it('should reuse existing channel for same tenant', async () => {
    const hub = new SupabaseRealtimeConversationListEventHub({
      client: mockClient.client,
    });
    const subscriber1: SseSubscriber<ConversationListEventType> = { send: vi.fn() };
    const subscriber2: SseSubscriber<ConversationListEventType> = { send: vi.fn() };

    hub.subscribe('tenant1', subscriber1);
    hub.subscribe('tenant1', subscriber2);

    await new Promise(resolve => setTimeout(resolve, 10));

    // Channel should only be created once
    expect(mockClient.client.channel).toHaveBeenCalledTimes(1);
  });

  it('should unsubscribe from channel when last subscriber removed', async () => {
    const hub = new SupabaseRealtimeConversationListEventHub({
      client: mockClient.client,
    });
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

    const channelName = 'copilot:events:conversation-list:tenant1';
    const channel = mockClient.channels.get(channelName);

    // Remove first subscriber - channel should remain
    unsubscribe1();
    expect(channel?.unsubscribe).not.toHaveBeenCalled();

    // Remove last subscriber - channel should be unsubscribed
    unsubscribe2();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(channel?.unsubscribe).toHaveBeenCalled();
  });

  it('should filter out messages from same instance', async () => {
    const instanceId = 'test-instance-456';
    const hub = new SupabaseRealtimeConversationListEventHub({
      client: mockClient.client,
      instanceId,
    });
    const subscriber: SseSubscriber<ConversationListEventType> = {
      send: vi.fn(),
    };

    hub.subscribe('tenant1', subscriber);
    await new Promise(resolve => setTimeout(resolve, 10));

    const channelName = 'copilot:events:conversation-list:tenant1';
    const callbacks = mockClient.channelCallbacks.get(channelName);
    const broadcastCallback = callbacks?.get('conversation-list');

    // Simulate receiving a message from the same instance
    broadcastCallback?.({
      payload: {
        event: 'upsert',
        data: { conversation: { id: 'conv1' } },
        instanceId,
        timestamp: Date.now(),
      },
    });

    await new Promise(resolve => setTimeout(resolve, 10));

    // Should not trigger local broadcast for same instance
    expect(subscriber.send).not.toHaveBeenCalled();
  });

  it('should process messages from different instances', async () => {
    const hub = new SupabaseRealtimeConversationListEventHub({
      client: mockClient.client,
      instanceId: 'instance-1',
    });
    const subscriber: SseSubscriber<ConversationListEventType> = {
      send: vi.fn(),
    };

    hub.subscribe('tenant1', subscriber);
    await new Promise(resolve => setTimeout(resolve, 10));

    const channelName = 'copilot:events:conversation-list:tenant1';
    const callbacks = mockClient.channelCallbacks.get(channelName);
    const broadcastCallback = callbacks?.get('conversation-list');

    // Simulate receiving a message from a different instance
    broadcastCallback?.({
      payload: {
        event: 'upsert',
        data: { conversation: { id: 'conv1' } },
        instanceId: 'instance-2',
        timestamp: Date.now(),
      },
    });

    await new Promise(resolve => setTimeout(resolve, 10));

    // Should trigger local broadcast for different instance
    expect(subscriber.send).toHaveBeenCalledWith('upsert', { conversation: { id: 'conv1' } });
  });

  it('should provide health check method', async () => {
    const hub = new SupabaseRealtimeConversationListEventHub({
      client: mockClient.client,
    });
    const result = await hub.healthCheck();

    expect(result).toHaveProperty('healthy');
    expect(typeof result.healthy).toBe('boolean');
  });

  it('should return healthy status on successful health check', async () => {
    const hub = new SupabaseRealtimeConversationListEventHub({
      client: mockClient.client,
    });
    const result = await hub.healthCheck();

    expect(result.healthy).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should support graceful shutdown', async () => {
    const hub = new SupabaseRealtimeConversationListEventHub({
      client: mockClient.client,
    });
    const mockSubscriber: SseSubscriber<ConversationListEventType> = {
      send: vi.fn(),
      onClose: vi.fn(),
    };

    hub.subscribe('tenant1', mockSubscriber);
    await new Promise(resolve => setTimeout(resolve, 10));

    await hub.shutdown();

    expect(mockSubscriber.onClose).toHaveBeenCalled();
  });

  it('should unsubscribe all channels on shutdown', async () => {
    const hub = new SupabaseRealtimeConversationListEventHub({
      client: mockClient.client,
    });

    const subscriber1: SseSubscriber<ConversationListEventType> = { send: vi.fn(), onClose: vi.fn() };
    const subscriber2: SseSubscriber<ConversationListEventType> = { send: vi.fn(), onClose: vi.fn() };

    hub.subscribe('tenant1', subscriber1);
    hub.subscribe('tenant2', subscriber2);

    await new Promise(resolve => setTimeout(resolve, 10));

    const channel1 = mockClient.channels.get('copilot:events:conversation-list:tenant1');
    const channel2 = mockClient.channels.get('copilot:events:conversation-list:tenant2');

    await hub.shutdown();

    expect(channel1?.unsubscribe).toHaveBeenCalled();
    expect(channel2?.unsubscribe).toHaveBeenCalled();
  });

  it('should not process messages after shutdown', async () => {
    const hub = new SupabaseRealtimeConversationListEventHub({
      client: mockClient.client,
    });
    const subscriber: SseSubscriber<ConversationListEventType> = {
      send: vi.fn(),
      onClose: vi.fn(),
    };

    hub.subscribe('tenant1', subscriber);
    await new Promise(resolve => setTimeout(resolve, 10));

    await hub.shutdown();

    const channelName = 'copilot:events:conversation-list:tenant1';
    const callbacks = mockClient.channelCallbacks.get(channelName);
    const broadcastCallback = callbacks?.get('conversation-list');

    // Try to send message after shutdown
    broadcastCallback?.({
      payload: {
        event: 'upsert',
        data: { conversation: { id: 'conv1' } },
        instanceId: 'other-instance',
        timestamp: Date.now(),
      },
    });

    await new Promise(resolve => setTimeout(resolve, 10));

    // Should not process messages after shutdown
    expect(subscriber.send).not.toHaveBeenCalled();
  });

  it('should handle malformed remote messages gracefully', async () => {
    const hub = new SupabaseRealtimeConversationListEventHub({
      client: mockClient.client,
      instanceId: 'instance-1',
    });
    const subscriber: SseSubscriber<ConversationListEventType> = {
      send: vi.fn(),
    };

    hub.subscribe('tenant1', subscriber);
    await new Promise(resolve => setTimeout(resolve, 10));

    const channelName = 'copilot:events:conversation-list:tenant1';
    const callbacks = mockClient.channelCallbacks.get(channelName);
    const broadcastCallback = callbacks?.get('conversation-list');

    // Send payload without required fields
    broadcastCallback?.({
      payload: {
        // Missing event, data fields
        instanceId: 'instance-2',
        timestamp: Date.now(),
      },
    });

    await new Promise(resolve => setTimeout(resolve, 10));

    // Should handle gracefully - will call send with undefined values
    expect(subscriber.send).toHaveBeenCalledWith(undefined, undefined);
  });
});

describe('Event Hub Integration', () => {
  let mockClient: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    mockClient = createMockSupabaseClient();
  });

  it('should maintain separate state for conversation and list hubs', () => {
    const conversationHub = new SupabaseRealtimeConversationEventHub({
      client: mockClient.client,
    });
    const listHub = new SupabaseRealtimeConversationListEventHub({
      client: mockClient.client,
    });

    const convSubscriber: SseSubscriber<ConversationEventType> = { send: vi.fn() };
    const listSubscriber: SseSubscriber<ConversationListEventType> = { send: vi.fn() };

    conversationHub.subscribe('tenant1', 'conv1', convSubscriber);
    listHub.subscribe('tenant1', listSubscriber);

    conversationHub.broadcast('tenant1', 'conv1', 'message', { text: 'test' });
    listHub.broadcast('tenant1', 'upsert', { conversation: { id: 'conv1' } as any });

    expect(convSubscriber.send).toHaveBeenCalledTimes(1);
    expect(listSubscriber.send).toHaveBeenCalledTimes(1);
  });

  it('should use different channels for conversation and list events', async () => {
    const conversationHub = new SupabaseRealtimeConversationEventHub({
      client: mockClient.client,
    });
    const listHub = new SupabaseRealtimeConversationListEventHub({
      client: mockClient.client,
    });

    const convSubscriber: SseSubscriber<ConversationEventType> = { send: vi.fn() };
    const listSubscriber: SseSubscriber<ConversationListEventType> = { send: vi.fn() };

    conversationHub.subscribe('tenant1', 'conv1', convSubscriber);
    listHub.subscribe('tenant1', listSubscriber);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockClient.channels.has('copilot:events:conversation:tenant1:conv1')).toBe(true);
    expect(mockClient.channels.has('copilot:events:conversation-list:tenant1')).toBe(true);
  });
});
