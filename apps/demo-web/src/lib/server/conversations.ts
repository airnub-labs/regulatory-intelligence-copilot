import {
  ConversationEventHub,
  InMemoryConversationContextStore,
  InMemoryConversationStore,
  SupabaseConversationContextStore,
  SupabaseConversationStore,
} from '@reg-copilot/reg-intel-conversations';
import { createClient } from '@supabase/supabase-js';

const conversationStoreMode =
  (process.env.COPILOT_CONVERSATIONS_MODE ?? process.env.COPILOT_CONVERSATIONS_STORE ?? 'auto')
    .trim()
    .toLowerCase();

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

const supabaseClient =
  conversationStoreMode !== 'memory' && supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        db: { schema: 'copilot_internal' },
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

export const conversationStore = supabaseClient
  ? new SupabaseConversationStore(supabaseClient)
  : new InMemoryConversationStore();

export const conversationContextStore = supabaseClient
  ? new SupabaseConversationContextStore(supabaseClient)
  : new InMemoryConversationContextStore();

export const conversationEventHub = new ConversationEventHub();
