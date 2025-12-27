import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { RedisConversationEventHub, RedisConversationListEventHub } from './redisEventHub.js';
import type { SseSubscriber, ConversationEventType, ConversationListEventType } from './eventHub.js';

describe('RedisConversationEventHub', () => {
  const mockConfig = {
    url: 'redis://localhost:6379',
    token: 'test-token',
  };

  it('should create an instance with valid config', () => {
    const hub = new RedisConversationEventHub(mockConfig);
    expect(hub).toBeDefined();
  });

  it('should support subscribe/unsubscribe pattern', () => {
    const hub = new RedisConversationEventHub(mockConfig);
    const mockSubscriber: SseSubscriber<ConversationEventType> = {
      send: vi.fn(),
      onClose: vi.fn(),
    };

    const unsubscribe = hub.subscribe('tenant1', 'conv1', mockSubscriber);
    expect(typeof unsubscribe).toBe('function');

    // Unsubscribe
    unsubscribe();
    expect(mockSubscriber.onClose).toHaveBeenCalled();
  });

  it('should broadcast to local subscribers immediately', () => {
    const hub = new RedisConversationEventHub(mockConfig);
    const mockSubscriber: SseSubscriber<ConversationEventType> = {
      send: vi.fn(),
      onClose: vi.fn(),
    };

    hub.subscribe('tenant1', 'conv1', mockSubscriber);
    hub.broadcast('tenant1', 'conv1', 'message', { text: 'test' });

    expect(mockSubscriber.send).toHaveBeenCalledWith('message', { text: 'test' });
  });

  it('should handle multiple subscribers', () => {
    const hub = new RedisConversationEventHub(mockConfig);
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
    const hub = new RedisConversationEventHub(mockConfig);
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

  it('should provide health check method', async () => {
    const hub = new RedisConversationEventHub(mockConfig);
    const result = await hub.healthCheck();

    expect(result).toHaveProperty('healthy');
    expect(typeof result.healthy).toBe('boolean');
  });

  it('should support graceful shutdown', async () => {
    const hub = new RedisConversationEventHub(mockConfig);
    const mockSubscriber: SseSubscriber<ConversationEventType> = {
      send: vi.fn(),
      onClose: vi.fn(),
    };

    hub.subscribe('tenant1', 'conv1', mockSubscriber);
    await hub.shutdown();

    expect(mockSubscriber.onClose).toHaveBeenCalled();
  });
});

describe('RedisConversationListEventHub', () => {
  const mockConfig = {
    url: 'redis://localhost:6379',
    token: 'test-token',
  };

  it('should create an instance with valid config', () => {
    const hub = new RedisConversationListEventHub(mockConfig);
    expect(hub).toBeDefined();
  });

  it('should support subscribe/unsubscribe pattern', () => {
    const hub = new RedisConversationListEventHub(mockConfig);
    const mockSubscriber: SseSubscriber<ConversationListEventType> = {
      send: vi.fn(),
      onClose: vi.fn(),
    };

    const unsubscribe = hub.subscribe('tenant1', mockSubscriber);
    expect(typeof unsubscribe).toBe('function');

    unsubscribe();
    expect(mockSubscriber.onClose).toHaveBeenCalled();
  });

  it('should broadcast to local subscribers immediately', () => {
    const hub = new RedisConversationListEventHub(mockConfig);
    const mockSubscriber: SseSubscriber<ConversationListEventType> = {
      send: vi.fn(),
      onClose: vi.fn(),
    };

    hub.subscribe('tenant1', mockSubscriber);
    hub.broadcast('tenant1', 'upsert', { conversation: { id: 'conv1' } as any });

    expect(mockSubscriber.send).toHaveBeenCalledWith('upsert', { conversation: { id: 'conv1' } });
  });

  it('should isolate broadcasts by tenant', () => {
    const hub = new RedisConversationListEventHub(mockConfig);
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

  it('should provide health check method', async () => {
    const hub = new RedisConversationListEventHub(mockConfig);
    const result = await hub.healthCheck();

    expect(result).toHaveProperty('healthy');
    expect(typeof result.healthy).toBe('boolean');
  });

  it('should support graceful shutdown', async () => {
    const hub = new RedisConversationListEventHub(mockConfig);
    const mockSubscriber: SseSubscriber<ConversationListEventType> = {
      send: vi.fn(),
      onClose: vi.fn(),
    };

    hub.subscribe('tenant1', mockSubscriber);
    await hub.shutdown();

    expect(mockSubscriber.onClose).toHaveBeenCalled();
  });
});

describe('Event Hub Integration', () => {
  it('should maintain separate state for conversation and list hubs', () => {
    const config = {
      url: 'redis://localhost:6379',
      token: 'test-token',
    };

    const conversationHub = new RedisConversationEventHub(config);
    const listHub = new RedisConversationListEventHub(config);

    const convSubscriber: SseSubscriber<ConversationEventType> = { send: vi.fn() };
    const listSubscriber: SseSubscriber<ConversationListEventType> = { send: vi.fn() };

    conversationHub.subscribe('tenant1', 'conv1', convSubscriber);
    listHub.subscribe('tenant1', listSubscriber);

    conversationHub.broadcast('tenant1', 'conv1', 'message', { text: 'test' });
    listHub.broadcast('tenant1', 'upsert', { conversation: { id: 'conv1' } as any });

    expect(convSubscriber.send).toHaveBeenCalledTimes(1);
    expect(listSubscriber.send).toHaveBeenCalledTimes(1);
  });
});
