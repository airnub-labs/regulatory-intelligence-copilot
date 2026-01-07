/**
 * Server-Side Query Performance Monitoring Utilities
 *
 * SECURITY: These functions require service role access
 * and call copilot_internal schema functions.
 *
 * DO NOT import this file client-side - it will fail.
 * Use this only in server components, API routes, and server actions.
 */

import 'server-only';
import { createInfrastructureServiceClient } from '@/lib/supabase/infrastructureServiceClient';
import { createLogger } from '@reg-copilot/reg-intel-observability';

const logger = createLogger('ServerQueryPerformance');

// Create a service client with copilot_internal schema access
const supabaseInternal = createInfrastructureServiceClient('QueryPerformanceMonitoring', {
  db: { schema: 'copilot_internal' },
});

export interface QueryPerformanceStats {
  query_type: string;
  table_name: string | null;
  avg_execution_time_ms: number;
  max_execution_time_ms: number;
  query_count: number;
  slowest_tenant_id: string | null;
}

/**
 * Gets query performance statistics for analysis (Server-side only)
 *
 * @param hoursBack - Number of hours to analyze (default: 24)
 * @param minExecutionTimeMs - Minimum execution time to include (default: 100ms)
 * @returns Performance statistics grouped by query type and table
 *
 * @example
 * // In a server component or API route
 * const stats = await getQueryPerformanceStats(24, 100);
 * stats.forEach(stat => {
 *   console.log(`${stat.table_name}: avg ${stat.avg_execution_time_ms}ms`);
 * });
 */
export async function getQueryPerformanceStats(
  hoursBack: number = 24,
  minExecutionTimeMs: number = 100
): Promise<QueryPerformanceStats[]> {
  try {
    const { data, error } = await supabaseInternal.rpc('get_query_performance_stats', {
      p_hours_back: hoursBack,
      p_min_execution_time_ms: minExecutionTimeMs,
    });

    if (error) {
      logger.error({ error }, 'Failed to get query performance stats');
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error({ error }, 'Failed to get query performance stats');
    return [];
  }
}

/**
 * Gets the number of tenants a user belongs to (Server-side only)
 *
 * Useful for identifying users who may experience RLS performance issues
 * due to large numbers of tenant memberships.
 *
 * @param userId - User ID
 * @returns Number of active tenants
 */
export async function getUserTenantCount(userId: string): Promise<number> {
  try {
    const { data, error } = await supabaseInternal.rpc('get_user_tenant_count', {
      p_user_id: userId,
    });

    if (error) {
      logger.error({ error, userId }, 'Failed to get user tenant count');
      return 0;
    }

    return (data as number) || 0;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to get user tenant count');
    return 0;
  }
}

/**
 * Gets RLS index usage statistics (Server-side only)
 *
 * Use this to verify that indexes created for RLS optimization
 * are actually being used by queries.
 *
 * @returns Index usage statistics
 */
export async function getRLSIndexUsage(): Promise<
  Array<{
    index_name: string;
    table_name: string;
    index_scans: number;
    tuples_read: number;
    tuples_fetched: number;
    index_size_mb: number;
  }>
> {
  try {
    const { data, error } = await supabaseInternal.rpc('get_rls_index_usage');

    if (error) {
      logger.error({ error }, 'Failed to get RLS index usage');
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error({ error }, 'Failed to get RLS index usage');
    return [];
  }
}

/**
 * Development helper: Analyzes a query with EXPLAIN ANALYZE (Server-side only)
 *
 * WARNING: Only use in development. This executes the query!
 *
 * @param query - SQL query to analyze
 * @returns Query execution plan
 *
 * @example
 * // In a server component (development only)
 * const plan = await analyzeQueryPlan(
 *   'SELECT * FROM conversations WHERE tenant_id = \'xxx\''
 * );
 * console.log(JSON.stringify(plan, null, 2));
 */
export async function analyzeQueryPlan(query: string): Promise<unknown> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('analyzeQueryPlan should only be used in development');
  }

  try {
    const { data, error } = await supabaseInternal.rpc('analyze_query_performance', {
      p_query: query,
    });

    if (error) {
      logger.error({ error, query }, 'Failed to analyze query');
      throw error;
    }

    return data;
  } catch (error) {
    logger.error({ error, query }, 'Failed to analyze query');
    throw error;
  }
}

/**
 * Health check for conversation store infrastructure (Server-side only)
 *
 * @returns Health check results
 */
export async function conversationStoreHealthcheck(): Promise<
  Array<{
    table_name: string;
    rls_enabled: boolean;
    policy_count: number;
  }>
> {
  try {
    const { data, error } = await supabaseInternal.rpc('conversation_store_healthcheck');

    if (error) {
      logger.error({ error }, 'Failed to run conversation store healthcheck');
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error({ error }, 'Failed to run conversation store healthcheck');
    return [];
  }
}
