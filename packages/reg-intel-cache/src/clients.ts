import Redis from 'ioredis';
import { Redis as UpstashRedis } from '@upstash/redis';
import { createLogger } from '@reg-copilot/reg-intel-observability';
import type { RedisKeyValueClient, RedisPubSubClient, ResolvedBackend } from './types.js';

const logger = createLogger('RedisClientFactory');

const keyValueCache = new Map<string, RedisKeyValueClient>();
const pubSubCache = new Map<string, { pub: RedisPubSubClient; sub: RedisPubSubClient }>();
const redisConnectionCache = new Map<string, Redis>();
const upstashConnectionCache = new Map<string, UpstashRedis>();

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

function getUpstashRedis(backend: Extract<ResolvedBackend, { backend: 'upstash' }>): UpstashRedis {
  const key = getCacheKey(backend);
  const cached = upstashConnectionCache.get(key);
  if (cached) return cached;

  const client = new UpstashRedis({ url: backend.url, token: backend.token });
  upstashConnectionCache.set(key, client);
  return client;
}

class IORedisKeyValueClient implements RedisKeyValueClient {
  constructor(private readonly client: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    await this.client.setex(key, ttlSeconds, value);
  }

  async del(...keys: string[]): Promise<void> {
    await this.client.del(...keys);
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }
}

class UpstashKeyValueClient implements RedisKeyValueClient {
  constructor(private readonly client: UpstashRedis) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    await this.client.setex(key, ttlSeconds, value);
  }

  async del(...keys: string[]): Promise<number | void> {
    return this.client.del(...keys);
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
    this.client.on('message', (channel, message) => {
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
  constructor(private readonly client: UpstashRedis) {}

  async publish(channel: string, message: string): Promise<number | void> {
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
