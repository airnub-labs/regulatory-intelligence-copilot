import { createLogger } from '@reg-copilot/reg-intel-observability';
import type { BackendComponent, ResolvedBackend } from './types.js';

const logger = createLogger('RedisBackendResolver');

const BACKEND_ENV: Record<BackendComponent, string> = {
  cache: 'CACHE_BACKEND',
  eventHub: 'EVENT_HUB_BACKEND',
  rateLimit: 'RATE_LIMIT_BACKEND',
};

const PROVIDER_ENV: Record<BackendComponent, string> = {
  cache: 'CACHE_PROVIDER',
  eventHub: 'EVENT_HUB_PROVIDER',
  rateLimit: 'RATE_LIMIT_PROVIDER',
};

function inferBackendFromUrl(url: string): 'redis' | 'upstash' | null {
  if (url.startsWith('redis://') || url.startsWith('rediss://')) {
    return 'redis';
  }
  if (url.startsWith('https://')) {
    return 'upstash';
  }
  return null;
}

function normalizeOverride(value: string | undefined): 'auto' | 'redis' | 'upstash' | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'redis' || normalized === 'upstash' || normalized === 'auto') {
    return normalized;
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
  const backendOverride = normalizeOverride(env[BACKEND_ENV[component]]);
  const providerOverride = normalizeProvider(env[PROVIDER_ENV[component]]) ?? 'redis';
  const redisUrl = env.REDIS_URL;
  const password = env.REDIS_PASSWORD ?? env.REDIS_TOKEN;

  if (!redisUrl) {
    logger.debug({ component }, '[redis-backend] No REDIS_URL configured; returning null backend');
    return null;
  }

  const inferred = inferBackendFromUrl(redisUrl);
  const selected = backendOverride ?? 'auto';
  const backend = selected === 'auto' ? inferred ?? providerOverride : selected;

  if (!backend || backend === 'auto') {
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

export function summarizeBackend(backend: ResolvedBackend | null): {
  backend: 'redis' | 'upstash' | 'none';
  url?: string;
} {
  if (!backend) return { backend: 'none' };
  return { backend: backend.backend, url: backend.url };
}
