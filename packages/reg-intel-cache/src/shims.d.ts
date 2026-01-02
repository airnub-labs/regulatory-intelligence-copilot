declare module 'ioredis' {
  export interface RedisOptions {
    password?: string;
  }

  export default class Redis {
    constructor(url?: string, options?: RedisOptions);
    get(key: string): Promise<string | null>;
    setex(key: string, ttl: number, value: string): Promise<void>;
    del(...keys: string[]): Promise<number>;
    ping(): Promise<string>;
    publish(channel: string, message: string): Promise<number>;
    subscribe(channel: string): Promise<void>;
    unsubscribe(channel: string): Promise<void>;
    on(event: 'message', listener: (channel: string, message: string | Buffer) => void): void;
    duplicate(): Redis;
    eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
  }
}

declare module '@upstash/redis' {
  export class Redis {
    constructor(config: { url: string; token: string });
    get(key: string): Promise<string | null>;
    setex(key: string, ttlSeconds: number, value: string): Promise<void>;
    del(...keys: string[]): Promise<number | void>;
    ping(): Promise<string>;
    publish?(channel: string, message: string): Promise<number | void>;
    subscribe?(channel: string, handler: (message: unknown, channel: string) => void): Promise<void> | void;
    unsubscribe?(channel: string): Promise<void> | void;
  }
}

declare module '@upstash/ratelimit' {
  export class Ratelimit {
    constructor(config: {
      redis: { url: string; token: string };
      limiter: unknown;
      analytics?: boolean;
      prefix?: string;
    });
    static slidingWindow(limit: number, window: string): unknown;
    limit(identifier: string): Promise<{ success: boolean } | { success: boolean; reset: number }>;
  }
}
