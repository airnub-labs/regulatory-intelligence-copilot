import 'server-only';

import {
  RedisConversationEventHub,
  RedisConversationListEventHub,
  SupabaseRealtimeConversationEventHub,
  SupabaseRealtimeConversationListEventHub,
  InMemoryConversationContextStore,
  InMemoryConversationStore,
  InMemoryConversationPathStore,
  SupabaseConversationContextStore,
  SupabaseConversationStore,
  SupabaseConversationPathStore,
  createConversationConfigStore,
  createConversationStore,
  type ConversationConfigStore,
  type ConversationStore,
} from '@reg-copilot/reg-intel-conversations';
import { createTracingFetch, createLogger } from '@reg-copilot/reg-intel-observability';
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import { PHASE_DEVELOPMENT_SERVER, PHASE_TEST } from 'next/constants';
import { createExecutionContextManager } from '@reg-copilot/reg-intel-next-adapter';

const logger = createLogger('ConversationStoreWiring');

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
// Only allow dev-like behavior in actual dev/test phases, not during production builds.
// This ensures production builds fail if database credentials are missing, preventing
// accidental deployments with an in-memory store.
const isDevPhase = nextPhase === PHASE_DEVELOPMENT_SERVER || nextPhase === PHASE_TEST;
const isDevLike = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' || isDevPhase;
const tracingFetch = createTracingFetch();

if (normalizeConversationStoreMode === 'memory' && !isDevLike) {
  throw new Error('COPILOT_CONVERSATIONS_MODE=memory is not permitted outside dev/test environments');
}

if (normalizeConversationStoreMode !== 'memory' && (!supabaseUrl || !supabaseServiceKey)) {
  const message =
    'Supabase credentials missing; set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable the Supabase conversation store';
  if (isDevLike) {
    logger.warn({ mode: normalizeConversationStoreMode }, message);
  } else {
    throw new Error(message);
  }
}

const supabaseClient =
  normalizeConversationStoreMode !== 'memory' && supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { fetch: tracingFetch },
      })
    : null;

const supabaseInternalClient =
  normalizeConversationStoreMode !== 'memory' && supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        db: { schema: 'copilot_internal' },
        global: { fetch: tracingFetch },
      })
    : null;

const supabaseRealtimeClient =
  supabaseUrl && supabaseRealtimeKey
    ? supabaseClient ??
      createClient(supabaseUrl, supabaseRealtimeKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { fetch: tracingFetch },
      })
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

// Configure Redis for caching (shared with event hubs and config store)
const redisUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.REDIS_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.REDIS_TOKEN;

// Create Redis client for caching
const redisClient =
  redisUrl && redisToken
    ? new Redis({
        url: redisUrl,
        token: redisToken,
      })
    : null;

// Optional: Enable conversation caching for high-traffic scenarios
const ENABLE_CONVERSATION_CACHING = process.env.ENABLE_CONVERSATION_CACHING === 'true';

// Create conversation store with optional caching
export const conversationStore: ConversationStore = createConversationStore({
  supabase: supabaseClient ?? undefined,
  supabaseInternal: supabaseInternalClient ?? undefined,
  redis: ENABLE_CONVERSATION_CACHING ? redisClient ?? undefined : undefined,
  enableCaching: ENABLE_CONVERSATION_CACHING,
  cacheTtlSeconds: 60, // 1 minute for active conversations
});

// Log which conversation store implementation is being used
if (supabaseClient) {
  if (ENABLE_CONVERSATION_CACHING && redisClient) {
    logger.info(
      { hasRedis: true, cacheTtl: 60 },
      'Using CachingConversationStore (Supabase + Redis)'
    );
  } else {
    logger.info({ hasRedis: false }, 'Using SupabaseConversationStore (no caching)');
  }
} else {
  logger.warn('Using InMemoryConversationStore (not suitable for production)');
}

export const conversationContextStore = supabaseClient
  ? new SupabaseConversationContextStore(supabaseClient, supabaseInternalClient ?? undefined)
  : new InMemoryConversationContextStore();

export const conversationPathStore = supabaseClient
  ? new SupabaseConversationPathStore(supabaseClient, supabaseInternalClient ?? undefined)
  : new InMemoryConversationPathStore();

// Create conversation config store with caching
export const conversationConfigStore: ConversationConfigStore = createConversationConfigStore({
  supabase: supabaseInternalClient ?? undefined,
  redis: redisClient ?? undefined,
  cacheTtlSeconds: 300, // 5 minutes
  logger,
});

// Log which config store implementation is being used
if (supabaseInternalClient) {
  if (redisClient) {
    logger.info(
      { hasRedis: true, cacheTtl: 300 },
      'Using CachingConversationConfigStore (Supabase + Redis)'
    );
  } else {
    logger.info({ hasRedis: false }, 'Using SupabaseConversationConfigStore (no caching)');
  }
} else {
  logger.warn('Using InMemoryConversationConfigStore (not suitable for production)');
}

// Configure event hubs with Redis support for distributed SSE

let conversationEventHub: RedisConversationEventHub | SupabaseRealtimeConversationEventHub;
let conversationListEventHub: RedisConversationListEventHub | SupabaseRealtimeConversationListEventHub;

if (redisUrl && redisToken) {
  logger.info(
    { redisUrl, mode: normalizeConversationStoreMode },
    'Using Redis-backed event hubs for distributed SSE'
  );

  conversationEventHub = new RedisConversationEventHub({
    url: redisUrl,
    token: redisToken,
    prefix: 'copilot:events',
  });

  conversationListEventHub = new RedisConversationListEventHub({
    url: redisUrl,
    token: redisToken,
    prefix: 'copilot:events',
  });

  // Verify Redis connectivity
  void conversationEventHub.healthCheck().then(result => {
    if (result.healthy) {
      logger.info('Redis event hub health check passed');
    } else {
      logger.error({ error: result.error }, 'Redis event hub health check failed');
    }
  });
} else if (supabaseRealtimeClient && supabaseUrl && supabaseRealtimeKey) {
  logger.info(
    { supabaseUrl, mode: normalizeConversationStoreMode },
    'Using Supabase Realtime event hubs for distributed SSE',
  );

  conversationEventHub = new SupabaseRealtimeConversationEventHub({
    client: supabaseRealtimeClient,
    prefix: 'copilot:events',
  });

  conversationListEventHub = new SupabaseRealtimeConversationListEventHub({
    client: supabaseRealtimeClient,
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
  const message =
    'Distributed SSE requires Redis or Supabase Realtime credentials; set REDIS_URL/REDIS_TOKEN or SUPABASE_URL/SUPABASE_ANON_KEY.';
  logger.error({ mode: normalizeConversationStoreMode }, message);
  throw new Error(message);
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
export const executionContextManager = e2bApiKey
  ? createExecutionContextManager({
      mode: normalizeConversationStoreMode === 'memory' ? 'memory' : 'supabase',
      supabaseClient: supabaseClient ?? undefined,
      e2bApiKey,
      defaultTtlMinutes: 30,
      sandboxTimeoutMs: 600000, // 10 minutes
      enableLogging: true,
    })
  : undefined;

if (executionContextManager) {
  logger.info('ExecutionContextManager initialized with E2B integration');
} else {
  logger.info('E2B_API_KEY not configured; code execution tools disabled');
}
