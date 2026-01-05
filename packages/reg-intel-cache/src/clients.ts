import Redis from 'ioredis';
import { createRequire } from 'module';
import { createLogger } from '@reg-copilot/reg-intel-observability';
import type { RedisKeyValueClient, RedisPubSubClient, ResolvedBackend } from './types.js';

const logger = createLogger('RedisClientFactory');

const require = createRequire(import.meta.url);

/**
 * Upstash Redis client interface
 * Maps to underlying @upstash/redis library methods
 */
interface UpstashRedisInstance {
  get(key: string): Promise<string | null>;
  setex(key: string, ttlSeconds: number, value: string): Promise<void>; // Low-level Redis command
  set?(key: string, value: string, options?: { ex?: number }): Promise<void>; // Alternative set method
  del(...keys: string[]): Promise<number | void>;
  ping(): Promise<string>;
  publish?(channel: string, message: string): Promise<number | void>;
  subscribe?(
    channel: string,
    handler: (message: unknown, channel: string) => void,
  ): Promise<void> | void;
  unsubscribe?(channel: string): Promise<void> | void;
}

type UpstashRedisConstructor = new (config: { url: string; token: string }) => UpstashRedisInstance;

const keyValueCache = new Map<string, RedisKeyValueClient>();
const pubSubCache = new Map<string, { pub: RedisPubSubClient; sub: RedisPubSubClient }>();
const redisConnectionCache = new Map<string, Redis>();
const upstashConnectionCache = new Map<string, UpstashRedisInstance>();

function getCacheKey(backend: ResolvedBackend): string {
  return `${backend.backend}:${backend.url}`;
}

function getIORedis(backend: Extract<ResolvedBackend, { backend: 'redis' }>): Redis {
  const key = getCacheKey(backend);
  const cached = redisConnectionCache.get(key);
  if (cached) return cached;

  const client = new Redis(backend.url, backend.password ? { password: backend.password } : undefined);
  redisConnectionCache.set(key, client);
  return client;
}

let upstashRedisConstructor: UpstashRedisConstructor | null = null;

function loadUpstashRedisConstructor(): UpstashRedisConstructor {
  if (upstashRedisConstructor) return upstashRedisConstructor;

  try {
    const mod = require('@upstash/redis') as { Redis: UpstashRedisConstructor };
    upstashRedisConstructor = mod.Redis;
    return upstashRedisConstructor;
  } catch (error) {
    const message =
      'Upstash Redis backend selected but @upstash/redis is not installed. Add it to optionalDependencies or disable Upstash.';
    logger.error({ error }, message);
    throw new Error(message);
  }
}

function getUpstashRedis(
  backend: Extract<ResolvedBackend, { backend: 'upstash' }>,
): UpstashRedisInstance {
  const key = getCacheKey(backend);
  const cached = upstashConnectionCache.get(key);
  if (cached) return cached;

  const UpstashRedis = loadUpstashRedisConstructor();
  const client = new UpstashRedis({ url: backend.url, token: backend.token });
  upstashConnectionCache.set(key, client);
  return client;
}

/**
 * IORedis adapter implementing industry-standard cache interface
 * Wraps low-level Redis commands (setex) into high-level cache API (set)
 */
class IORedisKeyValueClient implements RedisKeyValueClient {
  constructor(private readonly client: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined) {
      // Use SETEX for TTL-based storage
      await this.client.setex(key, ttlSeconds, value);
    } else {
      // Use SETEX with very long TTL (1 year) for permanent-ish storage
      // Note: Redis doesn't have true permanent keys with SET in cluster mode
      await this.client.setex(key, 31536000, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }
}

/**
 * Upstash Redis adapter implementing industry-standard cache interface
 * Wraps low-level Redis commands (setex) into high-level cache API (set)
 */
class UpstashKeyValueClient implements RedisKeyValueClient {
  constructor(private readonly client: UpstashRedisInstance) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined) {
      // Use SETEX for TTL-based storage
      await this.client.setex(key, ttlSeconds, value);
    } else {
      // Use SET for permanent storage (if available)
      if (this.client.set) {
        await this.client.set(key, value);
      } else {
        // Fallback: use SETEX with very long TTL
        await this.client.setex(key, 31536000, value); // 1 year
      }
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }
}

class IORedisPubSubClient implements RedisPubSubClient {
  private listeners = new Map<string, (message: string) => void>();
  private listening = false;

  constructor(private readonly client: Redis) {}

  private ensureListener(): void {
    if (this.listening) return;
    this.client.on('message', (channel: string, message: string | Buffer) => {
      const handler = this.listeners.get(channel);
      if (!handler) return;
      const payload = typeof message === 'string' ? message : message?.toString?.() ?? '';
      handler(payload);
    });
    this.listening = true;
  }

  async publish(channel: string, message: string): Promise<number> {
    return this.client.publish(channel, message);
  }

  async subscribe(channel: string, handler: (message: string) => void): Promise<void> {
    this.listeners.set(channel, handler);
    this.ensureListener();
    await this.client.subscribe(channel);
  }

  async unsubscribe(channel: string): Promise<void> {
    this.listeners.delete(channel);
    await this.client.unsubscribe(channel);
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }
}

class UpstashPubSubClient implements RedisPubSubClient {
  constructor(private readonly client: UpstashRedisInstance) {}

  async publish(channel: string, message: string): Promise<number | void> {
    if (!this.client.publish) {
      throw new Error('Upstash Redis client missing publish implementation');
    }

    return this.client.publish(channel, message);
  }

  async subscribe(channel: string, handler: (message: string) => void): Promise<void> {
    await (this.client as any).subscribe(channel, (message: unknown, messageChannel: string) => {
      if (messageChannel !== channel) return;
      const payload = typeof message === 'string' ? message : JSON.stringify(message);
      handler(payload);
    });
  }

  async unsubscribe(channel: string): Promise<void> {
    await (this.client as any).unsubscribe(channel);
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }
}

export function createKeyValueClient(backend: ResolvedBackend | null): RedisKeyValueClient | null {
  if (!backend) return null;
  const cacheKey = getCacheKey(backend);
  const cached = keyValueCache.get(cacheKey);
  if (cached) return cached;

  const client =
    backend.backend === 'redis'
      ? new IORedisKeyValueClient(getIORedis(backend))
      : new UpstashKeyValueClient(getUpstashRedis(backend));
  keyValueCache.set(cacheKey, client);
  logger.info({ backend: backend.backend }, '[redis] created key-value client');
  return client;
}

export function createPubSubClientPair(
  backend: ResolvedBackend | null,
): { pub: RedisPubSubClient; sub: RedisPubSubClient } | null {
  if (!backend) return null;
  const cacheKey = getCacheKey(backend);
  const cached = pubSubCache.get(cacheKey);
  if (cached) return cached;

  const pubSub =
    backend.backend === 'redis'
      ? {
          pub: new IORedisPubSubClient(getIORedis(backend)),
          sub: new IORedisPubSubClient(getIORedis(backend).duplicate()),
        }
      : {
          pub: new UpstashPubSubClient(getUpstashRedis(backend)),
          sub: new UpstashPubSubClient(getUpstashRedis(backend)),
        };

  pubSubCache.set(cacheKey, pubSub);
  logger.info({ backend: backend.backend }, '[redis] created pub/sub clients');
  return pubSub;
}
