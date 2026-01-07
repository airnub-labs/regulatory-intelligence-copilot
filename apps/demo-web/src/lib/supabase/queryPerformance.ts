/**
 * Query Performance Monitoring Utilities
 *
 * ⚠️ DEPRECATION NOTICE:
 * The admin functions in this file (getQueryPerformanceStats, getUserTenantCount,
 * getRLSIndexUsage, analyzeQueryPlan) have been moved to copilot_internal schema
 * for security reasons and are no longer accessible via client-side code.
 *
 * Use @/lib/server/queryPerformance instead for server-side monitoring.
 *
 * ONLY logSlowQuery() and measureQuery() remain in this file for client-side use.
 *
 * LOW-1: RLS Policy Performance Optimization
 *
 * USAGE:
 * - In development: Use logSlowQuery() to identify bottlenecks
 * - In production: Queries slower than threshold are automatically logged
 * - For admin stats: Use @/lib/server/queryPerformance (server-side only)
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
  query_params?: Record<string, string | number | boolean | null>
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

