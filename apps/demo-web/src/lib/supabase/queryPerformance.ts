/**
 * Query Performance Monitoring Utilities
 *
 * LOW-1: RLS Policy Performance Optimization
 *
 * Utilities for monitoring and analyzing query performance,
 * particularly for RLS policy-heavy queries.
 *
 * USAGE:
 * - In development: Use logSlowQuery() to identify bottlenecks
 * - In production: Queries slower than threshold are automatically logged
 * - Use getQueryPerformanceStats() to analyze trends
 */

import { createClient } from '@/lib/supabase/client'
import { createLogger } from '@reg-copilot/reg-intel-observability'

const logger = createLogger('QueryPerformance')

// Threshold for logging slow queries (milliseconds)
const SLOW_QUERY_THRESHOLD_MS = Number(process.env.SLOW_QUERY_THRESHOLD_MS) || 100

export interface SlowQueryLog {
  user_id?: string
  tenant_id?: string
  query_type: 'select' | 'insert' | 'update' | 'delete' | 'rpc'
  table_name?: string
  function_name?: string
  execution_time_ms: number
  query_params?: Record<string, any>
}

export interface QueryPerformanceStats {
  query_type: string
  table_name: string | null
  avg_execution_time_ms: number
  max_execution_time_ms: number
  query_count: number
  slowest_tenant_id: string | null
}

/**
 * Logs a slow query to the database for analysis
 *
 * @param log - Slow query details
 *
 * @example
 * const start = Date.now()
 * const { data } = await supabase.from('conversations').select('*')
 * const duration = Date.now() - start
 *
 * if (duration > SLOW_QUERY_THRESHOLD_MS) {
 *   await logSlowQuery({
 *     query_type: 'select',
 *     table_name: 'conversations',
 *     execution_time_ms: duration,
 *     tenant_id: currentTenantId,
 *   })
 * }
 */
export async function logSlowQuery(log: SlowQueryLog): Promise<void> {
  try {
    const supabase = createClient()

    // Only log in production if above threshold
    if (process.env.NODE_ENV === 'production' && log.execution_time_ms < SLOW_QUERY_THRESHOLD_MS) {
      return
    }

    // Log to database (uses service role internally)
    await supabase.from('slow_query_log').insert({
      user_id: log.user_id,
      tenant_id: log.tenant_id,
      query_type: log.query_type,
      table_name: log.table_name,
      function_name: log.function_name,
      execution_time_ms: log.execution_time_ms,
      query_params: log.query_params,
    })

    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      logger.warn(
        {
          ...log,
          threshold_ms: SLOW_QUERY_THRESHOLD_MS,
        },
        'Slow query detected'
      )
    }
  } catch (error) {
    // Don't fail the request if logging fails
    logger.error({ error, log }, 'Failed to log slow query')
  }
}

/**
 * Wrapper function to measure and log query performance
 *
 * @param queryFn - Async function that executes the query
 * @param metadata - Query metadata for logging
 * @returns Query result
 *
 * @example
 * const { data, error } = await measureQuery(
 *   () => supabase.from('conversations').select('*').eq('tenant_id', tenantId),
 *   {
 *     query_type: 'select',
 *     table_name: 'conversations',
 *     tenant_id: tenantId,
 *   }
 * )
 */
export async function measureQuery<T>(
  queryFn: () => Promise<T>,
  metadata: Omit<SlowQueryLog, 'execution_time_ms'>
): Promise<T> {
  const start = Date.now()

  try {
    const result = await queryFn()
    const duration = Date.now() - start

    // Log if slow
    if (duration > SLOW_QUERY_THRESHOLD_MS) {
      await logSlowQuery({
        ...metadata,
        execution_time_ms: duration,
      })
    }

    return result
  } catch (error) {
    const duration = Date.now() - start

    // Log failed queries if they were slow
    if (duration > SLOW_QUERY_THRESHOLD_MS) {
      await logSlowQuery({
        ...metadata,
        execution_time_ms: duration,
      })
    }

    throw error
  }
}

/**
 * Gets query performance statistics for analysis
 *
 * @param hoursBack - Number of hours to analyze (default: 24)
 * @param minExecutionTimeMs - Minimum execution time to include (default: 100ms)
 * @returns Performance statistics grouped by query type and table
 *
 * @example
 * const stats = await getQueryPerformanceStats(24, 100)
 * stats.forEach(stat => {
 *   console.log(`${stat.table_name}: avg ${stat.avg_execution_time_ms}ms`)
 * })
 */
export async function getQueryPerformanceStats(
  hoursBack: number = 24,
  minExecutionTimeMs: number = 100
): Promise<QueryPerformanceStats[]> {
  try {
    const supabase = createClient()

    const { data, error } = await supabase.rpc('get_query_performance_stats', {
      p_hours_back: hoursBack,
      p_min_execution_time_ms: minExecutionTimeMs,
    })

    if (error) {
      logger.error({ error }, 'Failed to get query performance stats')
      return []
    }

    return data || []
  } catch (error) {
    logger.error({ error }, 'Failed to get query performance stats')
    return []
  }
}

/**
 * Gets the number of tenants a user belongs to
 *
 * Useful for identifying users who may experience RLS performance issues
 * due to large numbers of tenant memberships.
 *
 * @param userId - User ID
 * @returns Number of active tenants
 */
export async function getUserTenantCount(userId: string): Promise<number> {
  try {
    const supabase = createClient()

    const { data, error } = await supabase
      .rpc('get_user_tenant_count', {
        p_user_id: userId,
      })
      .single<number>()

    if (error) {
      logger.error({ error, userId }, 'Failed to get user tenant count')
      return 0
    }

    return (data as number) || 0
  } catch (error) {
    logger.error({ error, userId }, 'Failed to get user tenant count')
    return 0
  }
}

/**
 * Gets RLS index usage statistics
 *
 * Use this to verify that indexes created for RLS optimization
 * are actually being used by queries.
 *
 * @returns Index usage statistics
 */
export async function getRLSIndexUsage(): Promise<
  Array<{
    index_name: string
    table_name: string
    index_scans: number
    tuples_read: number
    tuples_fetched: number
    index_size_mb: number
  }>
> {
  try {
    const supabase = createClient()

    const { data, error } = await supabase.rpc('get_rls_index_usage')

    if (error) {
      logger.error({ error }, 'Failed to get RLS index usage')
      return []
    }

    return data || []
  } catch (error) {
    logger.error({ error }, 'Failed to get RLS index usage')
    return []
  }
}

/**
 * Development helper: Analyzes a query with EXPLAIN ANALYZE
 *
 * WARNING: Only use in development. This executes the query!
 *
 * @param query - SQL query to analyze
 * @returns Query execution plan
 *
 * @example
 * const plan = await analyzeQueryPlan(
 *   'SELECT * FROM conversations WHERE tenant_id = \'xxx\''
 * )
 * console.log(JSON.stringify(plan, null, 2))
 */
export async function analyzeQueryPlan(query: string): Promise<any> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('analyzeQueryPlan should only be used in development')
  }

  try {
    const supabase = createClient()

    const { data, error } = await supabase.rpc('analyze_query_performance', {
      p_query: query,
    })

    if (error) {
      logger.error({ error, query }, 'Failed to analyze query')
      throw error
    }

    return data
  } catch (error) {
    logger.error({ error, query }, 'Failed to analyze query')
    throw error
  }
}
