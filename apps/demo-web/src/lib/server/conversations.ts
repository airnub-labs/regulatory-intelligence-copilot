import 'server-only';

import {
  RedisConversationEventHub,
  RedisConversationListEventHub,
  SupabaseRealtimeConversationEventHub,
  SupabaseRealtimeConversationListEventHub,
  SupabaseConversationContextStore,
  SupabaseConversationPathStore,
  createConversationConfigStore,
  createConversationStore,
  type ConversationConfigStore,
  type ConversationStore,
  type ExecutionContextManager,
} from '@reg-copilot/reg-intel-conversations';
import {
  createKeyValueClient,
  createPubSubClientPair,
  describeRedisBackendSelection,
  resolveRedisBackend,
} from '@reg-copilot/reg-intel-cache';
import { createTracingFetch, createLogger } from '@reg-copilot/reg-intel-observability';
import { createClient } from '@supabase/supabase-js';
import { createInfrastructureServiceClient } from '@/lib/supabase/infrastructureServiceClient';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { createExecutionContextManager } from '@reg-copilot/reg-intel-next-adapter';
import { checkE2BQuotaBeforeOperation } from '../e2bCostTracking';

const logger = createLogger('ConversationStoreWiring');

/**
 * Individual flag to enable/disable conversation config caching specifically.
 * Set ENABLE_CONVERSATION_CONFIG_CACHE=false to disable this cache.
 * Defaults to true.
 */
const ENABLE_CONVERSATION_CONFIG_CACHE = process.env.ENABLE_CONVERSATION_CONFIG_CACHE !== 'false';

/**
 * Individual flag to enable/disable Redis-backed event hubs for SSE distribution.
 * Set ENABLE_REDIS_EVENT_HUBS=false to disable Redis event hubs (falls back to Supabase Realtime).
 * Defaults to true.
 */
const ENABLE_REDIS_EVENT_HUBS = process.env.ENABLE_REDIS_EVENT_HUBS !== 'false';

type EventHubTransportPreference = 'redis' | 'supabase';

function normalizeEventHubTransport(value: string | undefined): EventHubTransportPreference {
  const normalized = (value ?? 'redis').trim().toLowerCase();
  if (normalized === 'supabase') {
    return 'supabase';
  }
  return 'redis';
}

const EVENT_HUB_TRANSPORT = normalizeEventHubTransport(process.env.EVENT_HUB_TRANSPORT);

const normalizeConversationStoreMode = (
  process.env.COPILOT_CONVERSATIONS_MODE ?? process.env.COPILOT_CONVERSATIONS_STORE ?? 'auto'
)
  .trim()
  .toLowerCase();

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
const supabaseRealtimeKey =
  supabaseServiceKey ?? process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const nextPhase = process.env.NEXT_PHASE;
const isDevLike = process.env.NODE_ENV !== 'production';
const tracingFetch = createTracingFetch();

if (normalizeConversationStoreMode === 'memory') {
  throw new Error('COPILOT_CONVERSATIONS_MODE=memory is not supported in clustered deployments');
}

const isProductionBuildPhase = nextPhase === PHASE_PRODUCTION_BUILD;

if (!supabaseUrl || !supabaseServiceKey) {
  const message =
    'Supabase credentials missing; set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable the Supabase conversation store';
  if (isProductionBuildPhase) {
    logger.warn({ mode: normalizeConversationStoreMode }, message);
  } else {
    throw new Error(message);
  }
}

const supabaseClient =
  supabaseUrl && supabaseServiceKey
    ? createInfrastructureServiceClient('ConversationStore', {
        global: { fetch: tracingFetch },
      })
    : null;

const supabaseInternalClient =
  supabaseUrl && supabaseServiceKey
    ? createInfrastructureServiceClient('ConversationStoreInternal', {
        db: { schema: 'copilot_internal' },
        global: { fetch: tracingFetch },
      })
    : null;

const supabaseRealtimeClient =
  supabaseUrl && supabaseRealtimeKey
    ? supabaseClient ?? (() => {
        // If supabaseRealtimeKey is the service role key, use infrastructure client
        // Otherwise create a client with the provided key (could be anon key)
        if (supabaseRealtimeKey === supabaseServiceKey && supabaseServiceKey) {
          return createInfrastructureServiceClient('ConversationRealtimeStore', {
            global: { fetch: tracingFetch },
          });
        }
        return createClient(supabaseUrl, supabaseRealtimeKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { fetch: tracingFetch },
        });
      })()
    : null;

async function validateSupabaseHealth() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.rpc('conversation_store_healthcheck');
  if (error) {
    throw new Error(`Supabase conversation healthcheck failed: ${error.message}`);
  }

  const rows = (data as Array<{ table_name: string; rls_enabled: boolean; policy_count: number }>) ?? [];
  const missingTables = ['conversations', 'conversation_messages'].filter(
    table => !rows.find(row => row.table_name === table)
  );
  if (missingTables.length > 0) {
    throw new Error(`Supabase is missing required tables: ${missingTables.join(', ')}`);
  }

  const rlsIssues = rows.filter(row => !row.rls_enabled || row.policy_count === 0);
  if (rlsIssues.length > 0) {
    const detail = rlsIssues
      .map(row => `${row.table_name} (rls: ${row.rls_enabled}, policies: ${row.policy_count})`)
      .join('; ');
    throw new Error(`Supabase RLS misconfigured for: ${detail}`);
  }
}

if (supabaseClient) {
  logger.info(
    { mode: normalizeConversationStoreMode, supabaseUrl },
    'Using SupabaseConversationStore'
  );
  void validateSupabaseHealth().catch(error => {
    logger.error({ err: error }, 'Supabase readiness check failed');
  });
} else {
  logger.info({ mode: normalizeConversationStoreMode }, 'Using in-memory conversation store');
}

// Configure Redis backend and shared clients
const cacheBackend = resolveRedisBackend('cache');
const eventBackend = ENABLE_REDIS_EVENT_HUBS ? resolveRedisBackend('eventHub') : null;
const sharedKeyValueClient = cacheBackend ? createKeyValueClient(cacheBackend) : null;
const eventHubClients = eventBackend ? createPubSubClientPair(eventBackend) : null;

/**
 * Optional: Enable conversation caching for high-traffic scenarios.
 * Defaults to true (opt-out via ENABLE_CONVERSATION_CACHING=false).
 */
const ENABLE_CONVERSATION_CACHING = process.env.ENABLE_CONVERSATION_CACHING !== 'false';

// Create Redis client for conversation config caching
const configRedisClient = ENABLE_CONVERSATION_CONFIG_CACHE ? sharedKeyValueClient : null;

// Create Redis client for conversation caching (opt-in)
const conversationRedisClient = ENABLE_CONVERSATION_CACHING ? sharedKeyValueClient : null;

if (!supabaseClient || !supabaseInternalClient) {
  if (!isProductionBuildPhase) {
    throw new Error('Supabase credentials are required for conversation storage in multi-instance deployments');
  }
  logger.warn({ phase: nextPhase }, 'Supabase clients not available during build - using placeholder stores');
}

// Create conversation store with optional caching
// During build phase, we create a placeholder that will throw at runtime if used
export const conversationStore: ConversationStore = (supabaseClient && supabaseInternalClient)
  ? createConversationStore({
      supabase: supabaseClient,
      supabaseInternal: supabaseInternalClient,
      redis: conversationRedisClient ?? undefined,
      enableCaching: ENABLE_CONVERSATION_CACHING,
      cacheTtlSeconds: 60, // 1 minute for active conversations
    })
  : (new Proxy({} as ConversationStore, {
      get: () => {
        throw new Error('ConversationStore not initialized - Supabase credentials required');
      },
    }));

// Log which conversation store implementation is being used
if (conversationRedisClient) {
  logger.info(
    {
      hasRedis: true,
      cacheTtl: 60,
      conversationCachingEnabled: ENABLE_CONVERSATION_CACHING,
      backend: describeRedisBackendSelection(cacheBackend)
    },
    'Using CachingConversationStore (Supabase + Redis)'
  );
} else {
  const reason = !ENABLE_CONVERSATION_CACHING
    ? 'conversation caching not enabled (set ENABLE_CONVERSATION_CACHING=true)'
    : 'Redis credentials not configured';
  logger.info({ hasRedis: false, reason }, 'Using SupabaseConversationStore (no caching)');
}

export const conversationContextStore = (supabaseClient && supabaseInternalClient)
  ? new SupabaseConversationContextStore(supabaseClient, supabaseInternalClient)
  : (new Proxy({} as InstanceType<typeof SupabaseConversationContextStore>, {
      get: () => {
        throw new Error('ConversationContextStore not initialized - Supabase credentials required');
      },
    }));

export const conversationPathStore = (supabaseClient && supabaseInternalClient)
  ? new SupabaseConversationPathStore(supabaseClient, supabaseInternalClient)
  : (new Proxy({} as InstanceType<typeof SupabaseConversationPathStore>, {
      get: () => {
        throw new Error('ConversationPathStore not initialized - Supabase credentials required');
      },
    }));

// Create conversation config store with caching
export const conversationConfigStore: ConversationConfigStore = supabaseInternalClient
  ? createConversationConfigStore({
      supabase: supabaseInternalClient,
      redis: configRedisClient ?? undefined,
      cacheTtlSeconds: 300, // 5 minutes
      logger,
    })
  : (new Proxy({} as ConversationConfigStore, {
      get: () => {
        throw new Error('ConversationConfigStore not initialized - Supabase credentials required');
      },
    }));

// Log which config store implementation is being used
if (configRedisClient) {
  logger.info(
    {
      hasRedis: true,
      cacheTtl: 300,
      conversationConfigCacheEnabled: ENABLE_CONVERSATION_CONFIG_CACHE,
      backend: describeRedisBackendSelection(cacheBackend)
    },
    'Using CachingConversationConfigStore (Supabase + Redis)'
  );
} else {
  const reason = !ENABLE_CONVERSATION_CONFIG_CACHE
    ? 'conversation config cache disabled via ENABLE_CONVERSATION_CONFIG_CACHE=false'
    : 'Redis credentials not configured';
  logger.info({ hasRedis: false, reason }, 'Using SupabaseConversationConfigStore (no caching)');
}

// Configure event hubs with Redis support for distributed SSE

let conversationEventHub: RedisConversationEventHub | SupabaseRealtimeConversationEventHub;
let conversationListEventHub: RedisConversationListEventHub | SupabaseRealtimeConversationListEventHub;

const redisEventHubAvailable = ENABLE_REDIS_EVENT_HUBS && Boolean(eventHubClients);
const supabaseEventHubAvailable = Boolean(supabaseRealtimeClient && supabaseUrl && supabaseRealtimeKey);

const preferRedisEventHub = EVENT_HUB_TRANSPORT === 'redis';
const preferSupabaseEventHub = EVENT_HUB_TRANSPORT === 'supabase';

// Use Redis event hubs if preferred and available
if (preferRedisEventHub && redisEventHubAvailable && eventHubClients) {
  logger.info(
    {
      backend: describeRedisBackendSelection(eventBackend),
      mode: normalizeConversationStoreMode,
      redisEventHubsEnabled: ENABLE_REDIS_EVENT_HUBS
    },
    'Using Redis-backed event hubs for distributed SSE'
  );

  const clients = eventHubClients

  conversationEventHub = new RedisConversationEventHub({
    clients,
    prefix: 'copilot:events',
    healthCheckClient: sharedKeyValueClient ?? undefined,
  });

  conversationListEventHub = new RedisConversationListEventHub({
    clients,
    prefix: 'copilot:events',
    healthCheckClient: sharedKeyValueClient ?? undefined,
  });

  // Verify Redis connectivity
  void conversationEventHub.healthCheck().then(result => {
    if (result.healthy) {
      logger.info('Redis event hub health check passed');
    } else {
      logger.error({ error: result.error }, 'Redis event hub health check failed');
    }
  });
} else if (preferSupabaseEventHub && supabaseEventHubAvailable) {
  logger.info(
    { supabaseUrl, mode: normalizeConversationStoreMode },
    'Using Supabase Realtime event hubs for distributed SSE',
  );

  conversationEventHub = new SupabaseRealtimeConversationEventHub({
    client: supabaseRealtimeClient!,
    prefix: 'copilot:events',
  });

  conversationListEventHub = new SupabaseRealtimeConversationListEventHub({
    client: supabaseRealtimeClient!,
    prefix: 'copilot:events',
  });

  void conversationEventHub.healthCheck().then(result => {
    if (result.healthy) {
      logger.info('Supabase Realtime event hub health check passed');
    } else {
      logger.error({ error: result.error }, 'Supabase Realtime event hub health check failed');
    }
  });
} else {
  const preferred = EVENT_HUB_TRANSPORT;
  const message =
    'Distributed SSE requires Redis or Supabase Realtime credentials; set REDIS_URL/REDIS_PASSWORD (or REDIS_TOKEN) or SUPABASE_URL/SUPABASE_ANON_KEY.';

  if (!redisEventHubAvailable && preferRedisEventHub) {
    logger.warn({ preferred, mode: normalizeConversationStoreMode }, 'Redis event hub requested but unavailable; falling back');
  }

  if (!supabaseEventHubAvailable && preferSupabaseEventHub) {
    logger.warn(
      { preferred, mode: normalizeConversationStoreMode },
      'Supabase Realtime event hub requested but unavailable; falling back',
    );
  }

  if (isDevLike || isProductionBuildPhase) {
    logger.warn({ mode: normalizeConversationStoreMode }, message);
    // Provide stub event hubs for build/dev mode
    // Type assertion needed for stub implementations during build
    conversationEventHub = {
      healthCheck: async () => ({ healthy: false, error: 'No credentials configured' }),
      publish: async () => {},
    } as unknown as typeof conversationEventHub;
    conversationListEventHub = {
      healthCheck: async () => ({ healthy: false, error: 'No credentials configured' }),
      publish: async () => {},
    } as unknown as typeof conversationListEventHub;
  } else {
    logger.error({ mode: normalizeConversationStoreMode }, message);
    throw new Error(message);
  }
}

export { conversationEventHub, conversationListEventHub };

// Configure OpenFGA for fine-grained authorization (optional)
// If not configured, conversations will use Supabase RLS-based authorization
const openfgaApiUrl = process.env.OPENFGA_API_URL;
const openfgaStoreId = process.env.OPENFGA_STORE_ID;
const openfgaAuthorizationModelId = process.env.OPENFGA_AUTHORIZATION_MODEL_ID;

export const openfgaConfig =
  openfgaApiUrl && openfgaStoreId
    ? {
        apiUrl: openfgaApiUrl,
        storeId: openfgaStoreId,
        authorizationModelId: openfgaAuthorizationModelId,
      }
    : undefined;

if (openfgaConfig) {
  logger.info(
    {
      apiUrl: openfgaConfig.apiUrl,
      storeId: openfgaConfig.storeId,
      hasModelId: Boolean(openfgaConfig.authorizationModelId),
    },
    'OpenFGA authorization configured'
  );
} else {
  logger.info('OpenFGA not configured; using Supabase RLS-based authorization');
}

// Create ExecutionContextManager if E2B is configured
// This enables code execution tools in the chat
const e2bApiKey = process.env.E2B_API_KEY;

let executionContextManager: ExecutionContextManager | undefined;

if (e2bApiKey) {
  if (!supabaseClient) {
    const message = 'Supabase client required for execution context manager when E2B is enabled';
    logger.error(message);
    throw new Error(message);
  }

  executionContextManager = createExecutionContextManager({
    supabaseClient,
    e2bApiKey,
    defaultTtlMinutes: 30,
    sandboxTimeoutMs: 600000, // 10 minutes
    enableLogging: true,
    quotaCheckCallback: checkE2BQuotaBeforeOperation, // Phase 3: Pre-request E2B quota gate
  });

  logger.info('ExecutionContextManager initialized with E2B integration and quota enforcement');
} else {
  logger.info('E2B_API_KEY not configured; code execution tools disabled');
}

export { executionContextManager };
