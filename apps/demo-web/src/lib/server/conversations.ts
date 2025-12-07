import 'server-only';

import {
  ConversationEventHub,
  ConversationListEventHub,
  InMemoryConversationContextStore,
  InMemoryConversationStore,
  SupabaseConversationContextStore,
  SupabaseConversationStore,
} from '@reg-copilot/reg-intel-conversations';
import { createTracingFetch } from '@reg-copilot/reg-intel-observability';
import { createClient } from '@supabase/supabase-js';
import { PHASE_DEVELOPMENT_SERVER, PHASE_TEST } from 'next/constants';

const normalizeConversationStoreMode = (
  process.env.COPILOT_CONVERSATIONS_MODE ?? process.env.COPILOT_CONVERSATIONS_STORE ?? 'auto'
)
  .trim()
  .toLowerCase();

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
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
    console.warn(`[conversation-store:${normalizeConversationStoreMode}] ${message}`);
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
  console.info(`[conversation-store:${normalizeConversationStoreMode}] Using SupabaseConversationStore`, {
    supabaseUrl,
  });
  void validateSupabaseHealth().catch(error => {
    console.error('[conversation-store] Supabase readiness check failed', error);
  });
} else {
  console.info(`[conversation-store:${normalizeConversationStoreMode}] Using in-memory conversation store`);
}

export const conversationStore = supabaseClient
  ? new SupabaseConversationStore(supabaseClient, supabaseInternalClient ?? undefined)
  : new InMemoryConversationStore();

export const conversationContextStore = supabaseClient
  ? new SupabaseConversationContextStore(supabaseClient, supabaseInternalClient ?? undefined)
  : new InMemoryConversationContextStore();

export const conversationEventHub = new ConversationEventHub();
export const conversationListEventHub = new ConversationListEventHub();
