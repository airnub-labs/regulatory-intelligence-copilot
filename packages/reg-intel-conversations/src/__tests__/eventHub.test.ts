/**
 * Unit tests for Event Hub
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConversationEventHub,
  ConversationListEventHub,
  type SseSubscriber,
  type ConversationEventType,
  type ConversationListEventType,
} from '../eventHub.js';

describe('ConversationEventHub', () => {
  let hub: ConversationEventHub;

  beforeEach(() => {
    hub = new ConversationEventHub();
  });

  describe('subscribe', () => {
    it('should subscribe a subscriber to a conversation', () => {
      const subscriber: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };

      const unsubscribe = hub.subscribe('tenant-1', 'conv-1', subscriber);

      expect(unsubscribe).toBeInstanceOf(Function);
    });

    it('should allow multiple subscribers for same conversation', () => {
      const subscriber1: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };
      const subscriber2: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant-1', 'conv-1', subscriber1);
      hub.subscribe('tenant-1', 'conv-1', subscriber2);

      // Broadcast should reach both subscribers
      hub.broadcast('tenant-1', 'conv-1', 'message', { content: 'test' });

      expect(subscriber1.send).toHaveBeenCalledWith('message', { content: 'test' });
      expect(subscriber2.send).toHaveBeenCalledWith('message', { content: 'test' });
    });

    it('should isolate subscribers by tenant and conversation', () => {
      const subscriber1: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };
      const subscriber2: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant-1', 'conv-1', subscriber1);
      hub.subscribe('tenant-1', 'conv-2', subscriber2);

      hub.broadcast('tenant-1', 'conv-1', 'message', { content: 'test' });

      expect(subscriber1.send).toHaveBeenCalled();
      expect(subscriber2.send).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe a subscriber', () => {
      const subscriber: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };

      const unsubscribe = hub.subscribe('tenant-1', 'conv-1', subscriber);
      unsubscribe();

      hub.broadcast('tenant-1', 'conv-1', 'message', { content: 'test' });

      expect(subscriber.send).not.toHaveBeenCalled();
    });

    it('should call onClose callback when unsubscribing', () => {
      const onClose = vi.fn();
      const subscriber: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
        onClose,
      };

      const unsubscribe = hub.subscribe('tenant-1', 'conv-1', subscriber);
      unsubscribe();

      expect(onClose).toHaveBeenCalled();
    });

    it('should remove conversation key when last subscriber unsubscribes', () => {
      const subscriber: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };

      const unsubscribe = hub.subscribe('tenant-1', 'conv-1', subscriber);
      unsubscribe();

      // Broadcast should not throw error
      expect(() => {
        hub.broadcast('tenant-1', 'conv-1', 'message', { content: 'test' });
      }).not.toThrow();
    });

    it('should handle unsubscribe when no subscribers exist', () => {
      const subscriber: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };

      expect(() => {
        hub.unsubscribe('tenant-1', 'conv-1', subscriber);
      }).not.toThrow();
    });
  });

  describe('broadcast', () => {
    it('should broadcast message event to all subscribers', () => {
      const subscriber1: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };
      const subscriber2: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant-1', 'conv-1', subscriber1);
      hub.subscribe('tenant-1', 'conv-1', subscriber2);

      const data = { id: 'msg-1', content: 'Hello' };
      hub.broadcast('tenant-1', 'conv-1', 'message', data);

      expect(subscriber1.send).toHaveBeenCalledWith('message', data);
      expect(subscriber2.send).toHaveBeenCalledWith('message', data);
    });

    it('should broadcast metadata event', () => {
      const subscriber: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant-1', 'conv-1', subscriber);

      const data = { title: 'New Title' };
      hub.broadcast('tenant-1', 'conv-1', 'metadata', data);

      expect(subscriber.send).toHaveBeenCalledWith('metadata', data);
    });

    it('should broadcast error event', () => {
      const subscriber: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant-1', 'conv-1', subscriber);

      const data = { error: 'Something went wrong' };
      hub.broadcast('tenant-1', 'conv-1', 'error', data);

      expect(subscriber.send).toHaveBeenCalledWith('error', data);
    });

    it('should broadcast done event', () => {
      const subscriber: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant-1', 'conv-1', subscriber);

      hub.broadcast('tenant-1', 'conv-1', 'done', {});

      expect(subscriber.send).toHaveBeenCalledWith('done', {});
    });

    it('should broadcast pinned message event', () => {
      const subscriber: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant-1', 'conv-1', subscriber);

      const data = { messageId: 'msg-1' };
      hub.broadcast('tenant-1', 'conv-1', 'message:pinned', data);

      expect(subscriber.send).toHaveBeenCalledWith('message:pinned', data);
    });

    it('should broadcast unpinned message event', () => {
      const subscriber: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant-1', 'conv-1', subscriber);

      const data = { messageId: 'msg-1' };
      hub.broadcast('tenant-1', 'conv-1', 'message:unpinned', data);

      expect(subscriber.send).toHaveBeenCalledWith('message:unpinned', data);
    });

    it('should not throw when broadcasting to conversation with no subscribers', () => {
      expect(() => {
        hub.broadcast('tenant-1', 'conv-1', 'message', { content: 'test' });
      }).not.toThrow();
    });

    it('should isolate broadcasts by tenant', () => {
      const subscriber1: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };
      const subscriber2: SseSubscriber<ConversationEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant-1', 'conv-1', subscriber1);
      hub.subscribe('tenant-2', 'conv-1', subscriber2);

      hub.broadcast('tenant-1', 'conv-1', 'message', { content: 'test' });

      expect(subscriber1.send).toHaveBeenCalled();
      expect(subscriber2.send).not.toHaveBeenCalled();
    });
  });
});

describe('ConversationListEventHub', () => {
  let hub: ConversationListEventHub;

  beforeEach(() => {
    hub = new ConversationListEventHub();
  });

  describe('subscribe', () => {
    it('should subscribe a subscriber to a tenant', () => {
      const subscriber: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };

      const unsubscribe = hub.subscribe('tenant-1', subscriber);

      expect(unsubscribe).toBeInstanceOf(Function);
    });

    it('should allow multiple subscribers for same tenant', () => {
      const subscriber1: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };
      const subscriber2: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant-1', subscriber1);
      hub.subscribe('tenant-1', subscriber2);

      hub.broadcast('tenant-1', 'upsert', { id: 'conv-1' });

      expect(subscriber1.send).toHaveBeenCalledWith('upsert', { id: 'conv-1' });
      expect(subscriber2.send).toHaveBeenCalledWith('upsert', { id: 'conv-1' });
    });

    it('should isolate subscribers by tenant', () => {
      const subscriber1: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };
      const subscriber2: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant-1', subscriber1);
      hub.subscribe('tenant-2', subscriber2);

      hub.broadcast('tenant-1', 'upsert', { id: 'conv-1' });

      expect(subscriber1.send).toHaveBeenCalled();
      expect(subscriber2.send).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe a subscriber', () => {
      const subscriber: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };

      const unsubscribe = hub.subscribe('tenant-1', subscriber);
      unsubscribe();

      hub.broadcast('tenant-1', 'upsert', { id: 'conv-1' });

      expect(subscriber.send).not.toHaveBeenCalled();
    });

    it('should call onClose callback when unsubscribing', () => {
      const onClose = vi.fn();
      const subscriber: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
        onClose,
      };

      const unsubscribe = hub.subscribe('tenant-1', subscriber);
      unsubscribe();

      expect(onClose).toHaveBeenCalled();
    });

    it('should handle unsubscribe when no subscribers exist', () => {
      const subscriber: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };

      expect(() => {
        hub.unsubscribe('tenant-1', subscriber);
      }).not.toThrow();
    });
  });

  describe('broadcast', () => {
    it('should broadcast snapshot event', () => {
      const subscriber: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant-1', subscriber);

      const data = { conversations: [] };
      hub.broadcast('tenant-1', 'snapshot', data);

      expect(subscriber.send).toHaveBeenCalledWith('snapshot', data);
    });

    it('should broadcast upsert event', () => {
      const subscriber: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant-1', subscriber);

      const data = { id: 'conv-1', title: 'New Conversation' };
      hub.broadcast('tenant-1', 'upsert', data);

      expect(subscriber.send).toHaveBeenCalledWith('upsert', data);
    });

    it('should broadcast archived event', () => {
      const subscriber: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant-1', subscriber);

      const data = { id: 'conv-1' };
      hub.broadcast('tenant-1', 'archived', data);

      expect(subscriber.send).toHaveBeenCalledWith('archived', data);
    });

    it('should broadcast unarchived event', () => {
      const subscriber: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant-1', subscriber);

      const data = { id: 'conv-1' };
      hub.broadcast('tenant-1', 'unarchived', data);

      expect(subscriber.send).toHaveBeenCalledWith('unarchived', data);
    });

    it('should broadcast deleted event', () => {
      const subscriber: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant-1', subscriber);

      const data = { id: 'conv-1' };
      hub.broadcast('tenant-1', 'deleted', data);

      expect(subscriber.send).toHaveBeenCalledWith('deleted', data);
    });

    it('should broadcast renamed event', () => {
      const subscriber: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant-1', subscriber);

      const data = { id: 'conv-1', title: 'New Title' };
      hub.broadcast('tenant-1', 'renamed', data);

      expect(subscriber.send).toHaveBeenCalledWith('renamed', data);
    });

    it('should broadcast sharing event', () => {
      const subscriber: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant-1', subscriber);

      const data = { id: 'conv-1', shareAudience: 'public' };
      hub.broadcast('tenant-1', 'sharing', data);

      expect(subscriber.send).toHaveBeenCalledWith('sharing', data);
    });

    it('should not throw when broadcasting to tenant with no subscribers', () => {
      expect(() => {
        hub.broadcast('tenant-1', 'upsert', { id: 'conv-1' });
      }).not.toThrow();
    });

    it('should broadcast to all subscribers of a tenant', () => {
      const subscriber1: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };
      const subscriber2: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };
      const subscriber3: SseSubscriber<ConversationListEventType> = {
        send: vi.fn(),
      };

      hub.subscribe('tenant-1', subscriber1);
      hub.subscribe('tenant-1', subscriber2);
      hub.subscribe('tenant-1', subscriber3);

      const data = { id: 'conv-1' };
      hub.broadcast('tenant-1', 'upsert', data);

      expect(subscriber1.send).toHaveBeenCalledWith('upsert', data);
      expect(subscriber2.send).toHaveBeenCalledWith('upsert', data);
      expect(subscriber3.send).toHaveBeenCalledWith('upsert', data);
    });
  });
});
