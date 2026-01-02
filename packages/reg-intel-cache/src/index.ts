/**
 * @packageDocumentation
 * @module @reg-copilot/reg-intel-cache
 */

import { createKeyValueClient, createPubSubClientPair } from './clients.js';
import { createFailOpenRateLimiter, createRateLimiter } from './rateLimiter.js';
import { resolveRedisBackend, summarizeBackend } from './backendResolver.js';

export type { RedisKeyValueClient, RedisPubSubClient, RateLimiter } from './types.js';
export type { BackendComponent, ResolvedBackend } from './types.js';
export { createKeyValueClient, createPubSubClientPair, resolveRedisBackend, summarizeBackend };
export { createRateLimiter, createFailOpenRateLimiter };
