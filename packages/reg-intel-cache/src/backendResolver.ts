import { createLogger } from '@reg-copilot/reg-intel-observability';
import type { BackendComponent, ResolvedBackend } from './types.js';

const logger = createLogger('RedisBackendResolver');

const PROVIDER_ENV: Record<BackendComponent, string> = {
  cache: 'CACHE_PROVIDER',
  eventHub: 'EVENT_HUB_PROVIDER',
  rateLimit: 'RATE_LIMIT_PROVIDER',
};

function inferBackendFromUrl(url: string): 'redis' | 'upstash' | null {
  const normalized = url.toLowerCase();

  if (normalized.startsWith('redis://') || normalized.startsWith('rediss://')) {
    return 'redis';
  }

  // Only infer Upstash when the URL explicitly targets their service. This keeps
  // `REDIS_URL` defaulting to the Redis/ioredis backend—even for HTTPS endpoints—
  // unless the caller explicitly opts into Upstash via the provider overrides.
  if (normalized.includes('upstash.io')) {
    return 'upstash';
  }

  return null;
}

function normalizeProvider(value: string | undefined): 'redis' | 'upstash' | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'redis' || normalized === 'upstash') {
    return normalized;
  }
  return null;
}

function assertCompatibility(backend: 'redis' | 'upstash', url: string, provider: string): void {
  const inferred = inferBackendFromUrl(url);
  if (inferred && inferred !== backend) {
    throw new Error(
      `[redis-backend] ${provider} forced to ${backend} but URL scheme implies ${inferred}. Adjust ${provider} or REDIS_URL.`,
    );
  }
}

export function resolveRedisBackend(
  component: BackendComponent,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedBackend | null {
  const providerOverride = normalizeProvider(env[PROVIDER_ENV[component]]);
  const redisUrl = env.REDIS_URL;
  const password = env.REDIS_PASSWORD ?? env.REDIS_TOKEN;

  if (!redisUrl) {
    logger.debug({ component }, '[redis-backend] No REDIS_URL configured; returning null backend');
    return null;
  }

  const inferred = inferBackendFromUrl(redisUrl);
  const backend = providerOverride ?? inferred ?? 'redis';

  if (!backend) {
    logger.debug({ component }, '[redis-backend] Unable to infer backend; returning null');
    return null;
  }

  assertCompatibility(backend, redisUrl, PROVIDER_ENV[component]);

  if (backend === 'redis') {
    return {
      backend,
      url: redisUrl,
      password,
    };
  }

  const token = password;
  if (!token) {
    throw new Error('[redis-backend] Upstash backend selected but REDIS_PASSWORD/REDIS_TOKEN missing');
  }

  return {
    backend: 'upstash',
    url: redisUrl,
    token,
  };
}

/**
 * Provide a minimal summary of the resolved backend for logging or telemetry without
 * exposing credentials. Useful when callers only need to report which backend type
 * (redis, upstash, or none) was selected and, when available, the configured URL.
 */
export function describeRedisBackendSelection(backend: ResolvedBackend | null): {
  backend: 'redis' | 'upstash' | 'none';
  url?: string;
} {
  if (!backend) return { backend: 'none' };
  return { backend: backend.backend, url: backend.url };
}
