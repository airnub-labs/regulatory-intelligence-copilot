/**
 * Redis client interfaces for event hub pub/sub
 *
 * These interfaces are compatible with the reg-intel-cache package types.
 * Using local definitions keeps the eventhub package independent.
 */

/**
 * Pub/sub client interface for publishing and subscribing to Redis channels
 */
export interface RedisPubSubClient {
  /**
   * Publish a message to a channel
   * @param channel The channel name
   * @param message The message to publish
   * @returns The number of clients that received the message (or void for some implementations)
   */
  publish(channel: string, message: string): Promise<number | void>;

  /**
   * Subscribe to a channel
   * @param channel The channel name
   * @param handler Callback invoked for each message received
   */
  subscribe(channel: string, handler: (message: string) => void): Promise<void>;

  /**
   * Unsubscribe from a channel
   * @param channel The channel name
   */
  unsubscribe(channel: string): Promise<void>;

  /**
   * Ping the Redis server (optional, for health checks)
   */
  ping?(): Promise<string>;
}

/**
 * Key-value client interface (optional, for health checks)
 */
export interface RedisKeyValueClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  ping?(): Promise<string>;
}

/**
 * Configuration for Redis-backed event hubs
 */
export interface RedisEventHubConfig {
  /**
   * Redis pub/sub clients (separate pub and sub clients for Redis pub/sub requirements)
   */
  clients: {
    pub: RedisPubSubClient;
    sub: RedisPubSubClient;
  };

  /**
   * Prefix for Redis pub/sub channel names
   * @default 'copilot:events'
   */
  prefix?: string;

  /**
   * Optional client for health checks (can use ping)
   */
  healthCheckClient?: RedisKeyValueClient;

  /**
   * Optional pre-generated instance ID
   * If not provided, one will be generated automatically
   */
  instanceId?: string;
}
