/**
 * Compaction Storage Provider
 *
 * Provides persistent storage for compaction operation records in Supabase.
 * This enables the compaction analytics dashboard to display real historical data.
 *
 * @example
 * ```typescript
 * import { initCompactionStorage, recordCompactionToDatabase } from '@reg-copilot/reg-intel-observability';
 *
 * // Initialize with Supabase client
 * await initCompactionStorage();
 *
 * // Records are automatically persisted when recordCompactionOperation is called
 * ```
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Compaction operation record for database storage
 */
export interface CompactionOperationRecord {
  conversationId?: string;
  pathId?: string;
  tenantId?: string;
  userId?: string;
  strategy: string;
  triggeredBy: 'auto' | 'manual';
  tokensBefore: number;
  tokensAfter: number;
  messagesBefore: number;
  messagesAfter: number;
  messagesSummarized: number;
  pinnedPreserved: number;
  durationMs?: number;
  usedLlm: boolean;
  costUsd?: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

// Global Supabase client for compaction storage
let supabaseClient: SupabaseClient | null = null;
let storageInitialized = false;

/**
 * Initialize compaction storage with Supabase
 *
 * Uses environment variables:
 * - SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY
 */
export async function initCompactionStorage(): Promise<boolean> {
  if (storageInitialized && supabaseClient) {
    return true;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[CompactionStorage] Supabase credentials not found. Compaction records will not be persisted.');
    return false;
  }

  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey);
    storageInitialized = true;
    return true;
  } catch (error) {
    console.error('[CompactionStorage] Failed to initialize Supabase client:', error);
    return false;
  }
}

/**
 * Initialize compaction storage with an existing Supabase client
 */
export function initCompactionStorageWithClient(client: SupabaseClient): void {
  supabaseClient = client;
  storageInitialized = true;
}

/**
 * Check if compaction storage is initialized
 */
export function isCompactionStorageInitialized(): boolean {
  return storageInitialized && supabaseClient !== null;
}

/**
 * Record a compaction operation to the database
 *
 * This is called automatically by recordCompactionOperation() if storage is initialized.
 */
export async function recordCompactionToDatabase(
  record: CompactionOperationRecord
): Promise<string | null> {
  if (!supabaseClient) {
    // Try to initialize if not already done
    const initialized = await initCompactionStorage();
    if (!initialized || !supabaseClient) {
      return null;
    }
  }

  try {
    const { data, error } = await supabaseClient.rpc('record_compaction_operation', {
      p_conversation_id: record.conversationId || null,
      p_path_id: record.pathId || null,
      p_tenant_id: record.tenantId || null,
      p_user_id: record.userId || null,
      p_strategy: record.strategy,
      p_triggered_by: record.triggeredBy,
      p_tokens_before: record.tokensBefore,
      p_tokens_after: record.tokensAfter,
      p_messages_before: record.messagesBefore,
      p_messages_after: record.messagesAfter,
      p_messages_summarized: record.messagesSummarized,
      p_pinned_preserved: record.pinnedPreserved,
      p_duration_ms: record.durationMs || null,
      p_used_llm: record.usedLlm,
      p_cost_usd: record.costUsd || 0,
      p_success: record.success,
      p_error: record.error || null,
      p_metadata: record.metadata || {},
    });

    if (error) {
      // Check if it's a "function does not exist" error (table not migrated yet)
      if (error.code === '42883' || error.message.includes('does not exist')) {
        // Silently fail - table not yet created
        return null;
      }
      console.error('[CompactionStorage] Failed to record operation:', error);
      return null;
    }

    return data as string;
  } catch (error) {
    console.error('[CompactionStorage] Error recording compaction operation:', error);
    return null;
  }
}

/**
 * Record a failed compaction operation to the database
 */
export async function recordCompactionFailureToDatabase(record: {
  conversationId?: string;
  pathId?: string;
  tenantId?: string;
  userId?: string;
  strategy: string;
  error: string;
  durationMs?: number;
}): Promise<string | null> {
  return recordCompactionToDatabase({
    conversationId: record.conversationId,
    pathId: record.pathId,
    tenantId: record.tenantId,
    userId: record.userId,
    strategy: record.strategy,
    triggeredBy: 'manual',
    tokensBefore: 0,
    tokensAfter: 0,
    messagesBefore: 0,
    messagesAfter: 0,
    messagesSummarized: 0,
    pinnedPreserved: 0,
    durationMs: record.durationMs,
    usedLlm: false,
    success: false,
    error: record.error,
  });
}
