export type RedisBackend = {
  backend: 'redis';
  url: string;
  password?: string;
};

export type UpstashBackend = {
  backend: 'upstash';
  url: string;
  token: string;
};

export type ResolvedBackend = RedisBackend | UpstashBackend;

export type BackendComponent = 'cache' | 'eventHub' | 'rateLimit';

export interface RedisKeyValueClient {
  get(key: string): Promise<string | null>;
  setex(key: string, ttlSeconds: number, value: string): Promise<void>;
  del(...keys: string[]): Promise<number | void>;
  ping?(): Promise<string>;
}

export interface RedisPubSubClient {
  publish(channel: string, message: string): Promise<number | void>;
  subscribe(channel: string, handler: (message: string) => void): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  ping?(): Promise<string>;
}

export interface RateLimiter {
  check(identifier: string): Promise<boolean>;
  getType(): 'redis' | 'upstash' | 'allowall'; // Added 'allowall' for transparent failover
}

// Re-export transparent failover types for convenience
export type { TransparentCache, CacheBackend } from './transparentCache.js';
export type { TransparentRateLimiter, RateLimiterBackend } from './transparentRateLimiter.js';
