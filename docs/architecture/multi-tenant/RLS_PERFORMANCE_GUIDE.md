# RLS Performance Optimization Guide

**Version**: 1.0
**Date**: 2026-01-06
**Status**: 🟢 Active
**Issue**: LOW-1: RLS Policy Performance Optimization

## Overview

This guide explains how to monitor, analyze, and optimize Row-Level Security (RLS) policy performance in the multi-tenant architecture.

## Table of Contents

1. [Understanding RLS Performance](#understanding-rls-performance)
2. [Monitoring Query Performance](#monitoring-query-performance)
3. [Analyzing Slow Queries](#analyzing-slow-queries)
4. [Optimization Techniques](#optimization-techniques)
5. [Maintenance Tasks](#maintenance-tasks)

---

## Understanding RLS Performance

### How RLS Policies Work

RLS policies are executed as part of every query against a table. For example:

```sql
CREATE POLICY conversations_tenant_access
    ON conversations
    FOR SELECT
    TO authenticated
    USING (
        tenant_id IN (
            SELECT tenant_id
            FROM tenant_memberships
            WHERE user_id = auth.uid()
              AND status = 'active'
        )
    );
```

**What happens on every SELECT:**
1. PostgreSQL checks if `auth.uid()` exists
2. Subquery executes to find user's active tenants
3. Main query filters by `tenant_id IN (...)`
4. Results are returned only if RLS policy passes

### Performance Considerations

**Factors affecting RLS performance:**
- **Number of tenants per user**: More tenants = longer subquery execution
- **Query complexity**: JOINs and nested queries compound RLS overhead
- **Index coverage**: Missing indexes force sequential scans
- **Table size**: Larger tables take longer to filter

**When RLS becomes slow:**
- Users with >50 tenants may experience degradation
- Queries on large tables (>1M rows) without proper indexes
- Complex queries with multiple JOINs and RLS checks on each table

---

## Monitoring Query Performance

### Automatic Slow Query Logging

All queries slower than `SLOW_QUERY_THRESHOLD_MS` (default: 100ms) are automatically logged.

**Configure threshold** in `.env`:
```env
SLOW_QUERY_THRESHOLD_MS=100
```

### Manual Query Measurement

```typescript
import { measureQuery } from '@/lib/supabase/queryPerformance'

const { data, error } = await measureQuery(
  () => supabase
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenantId),
  {
    query_type: 'select',
    table_name: 'conversations',
    tenant_id: tenantId,
    user_id: userId,
  }
)
```

### Viewing Performance Statistics

**Get stats for last 24 hours:**
```typescript
import { getQueryPerformanceStats } from '@/lib/supabase/queryPerformance'

const stats = await getQueryPerformanceStats(24, 100)

stats.forEach(stat => {
  console.log(`Table: ${stat.table_name}`)
  console.log(`  Query type: ${stat.query_type}`)
  console.log(`  Avg time: ${stat.avg_execution_time_ms}ms`)
  console.log(`  Max time: ${stat.max_execution_time_ms}ms`)
  console.log(`  Count: ${stat.query_count}`)
})
```

**Via SQL:**
```sql
SELECT * FROM get_query_performance_stats(24, 100);
```

### Monitoring Dashboard

**View summary:**
```sql
SELECT * FROM copilot_internal.rls_performance_summary
ORDER BY avg_query_time_24h_ms DESC;
```

This shows:
- Tenants with slowest queries
- Number of users/memberships per tenant
- Average query time for each tenant

---

## Analyzing Slow Queries

### Using EXPLAIN ANALYZE

**In development only:**
```typescript
import { analyzeQueryPlan } from '@/lib/supabase/queryPerformance'

const plan = await analyzeQueryPlan(`
  SELECT * FROM conversations
  WHERE tenant_id IN (
    SELECT tenant_id FROM tenant_memberships
    WHERE user_id = 'xxx' AND status = 'active'
  )
`)

console.log(JSON.stringify(plan, null, 2))
```

**Via SQL:**
```sql
SELECT * FROM analyze_query_performance(
  'SELECT * FROM conversations WHERE tenant_id = ''xxx'''
);
```

### Reading EXPLAIN Output

**Look for:**
1. **Sequential Scans** - Indicates missing indexes
   ```
   Seq Scan on conversations (cost=0.00..10000.00)
   ```
   **Fix**: Add index on filtered column

2. **Nested Loop with high cost** - Inefficient JOINs
   ```
   Nested Loop (cost=100.00..50000.00)
   ```
   **Fix**: Ensure JOIN columns are indexed

3. **SubPlan execution** - RLS policy subquery
   ```
   SubPlan 1
     -> Index Scan on tenant_memberships
   ```
   **Good**: Using index
   **Bad**: Sequential scan here

### Identifying Users with Many Tenants

```typescript
import { getUserTenantCount } from '@/lib/supabase/queryPerformance'

const count = await getUserTenantCount(userId)

if (count > 50) {
  console.warn(`User ${userId} has ${count} tenants - may experience slow queries`)
}
```

---

## Optimization Techniques

### 1. Composite Indexes

**Already created** by migration `20260107000004_rls_performance_optimization.sql`:

- `idx_memberships_user_tenant_status` - For user membership lookups
- `idx_memberships_tenant_role_user` - For role-based access checks
- `idx_user_context_user_current_tenant` - For current tenant lookups
- `idx_tenants_owner_active` - For ownership checks

### 2. Partial Indexes

Indexes with `WHERE` clause to reduce size and improve performance:

```sql
CREATE INDEX idx_memberships_active
    ON tenant_memberships(user_id, tenant_id)
    WHERE status = 'active';
```

**Benefits:**
- Smaller index size
- Faster updates (inactive memberships don't update index)
- Faster scans (only active memberships)

### 3. Covering Indexes

Include all columns needed by query to avoid table lookups:

```sql
CREATE INDEX idx_memberships_covering
    ON tenant_memberships(user_id, tenant_id, role, status)
    WHERE status = 'active';
```

**Query can be satisfied entirely from index:**
```sql
SELECT tenant_id, role
FROM tenant_memberships
WHERE user_id = 'xxx' AND status = 'active';
```

### 4. Query Optimization

**Before:**
```typescript
const { data } = await supabase
  .from('conversations')
  .select('*, messages(*)')
  .eq('tenant_id', tenantId)
```

**After:**
```typescript
// Fetch conversations first
const { data: conversations } = await supabase
  .from('conversations')
  .select('id, title, created_at')
  .eq('tenant_id', tenantId)

// Fetch messages separately (or use pagination)
const conversationIds = conversations.map(c => c.id)
const { data: messages } = await supabase
  .from('messages')
  .select('*')
  .in('conversation_id', conversationIds)
  .limit(100)
```

### 5. Materialized Views (Advanced)

For very slow aggregations, consider materialized views:

```sql
CREATE MATERIALIZED VIEW user_tenant_summary AS
SELECT
    user_id,
    array_agg(tenant_id) as tenant_ids,
    COUNT(*) as tenant_count
FROM tenant_memberships
WHERE status = 'active'
GROUP BY user_id;

CREATE UNIQUE INDEX ON user_tenant_summary(user_id);

-- Refresh periodically
REFRESH MATERIALIZED VIEW CONCURRENTLY user_tenant_summary;
```

---

## Maintenance Tasks

### Daily: Monitor Slow Queries

```sql
-- Check for queries > 500ms in last 24 hours
SELECT
    query_type,
    table_name,
    COUNT(*) as count,
    ROUND(AVG(execution_time_ms), 2) as avg_ms,
    MAX(execution_time_ms) as max_ms
FROM copilot_internal.slow_query_log
WHERE created_at >= NOW() - INTERVAL '24 hours'
  AND execution_time_ms > 500
GROUP BY query_type, table_name
ORDER BY avg_ms DESC;
```

### Weekly: Verify Index Usage

```sql
SELECT * FROM get_rls_index_usage()
WHERE index_scans < 100;
```

**Low scan count indicates:**
- Index not being used
- Consider removing unused indexes
- May need different index structure

### Monthly: Cleanup Old Logs

```sql
SELECT cleanup_slow_query_logs();
```

Or set up cron job:
```sql
-- Add to pg_cron
SELECT cron.schedule(
    'cleanup-slow-query-logs',
    '0 2 * * 0', -- 2 AM every Sunday
    'SELECT cleanup_slow_query_logs();'
);
```

### Quarterly: Review RLS Policies

1. **Identify most-used tables:**
   ```sql
   SELECT table_name, COUNT(*) as query_count
   FROM slow_query_log
   WHERE created_at >= NOW() - INTERVAL '90 days'
   GROUP BY table_name
   ORDER BY query_count DESC;
   ```

2. **Review RLS policies** on top 10 tables
3. **Test with EXPLAIN ANALYZE** for users with many tenants
4. **Add indexes** if sequential scans found

---

## Troubleshooting

### Problem: Queries suddenly slow

**Check:**
1. Index statistics: `SELECT * FROM pg_stat_user_indexes;`
2. Table bloat: `SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) FROM pg_tables;`
3. Recent schema changes

**Fix:**
```sql
-- Rebuild indexes
REINDEX TABLE tenant_memberships;

-- Update statistics
ANALYZE tenant_memberships;

-- Vacuum if bloated
VACUUM ANALYZE tenant_memberships;
```

### Problem: User with many tenants experiencing slowness

**Verify:**
```sql
SELECT get_user_tenant_count('user-id');
```

**Options:**
1. Archive inactive tenants
2. Implement pagination for tenant lists
3. Cache user's tenant list in Redis

### Problem: Slow query log growing too fast

**Check size:**
```sql
SELECT pg_size_pretty(pg_total_relation_size('copilot_internal.slow_query_log'));
```

**Fix:**
1. Increase `SLOW_QUERY_THRESHOLD_MS`
2. Run cleanup more frequently
3. Implement log rotation

---

## Best Practices

1. **Always measure before optimizing** - Use `measureQuery()` to identify real bottlenecks
2. **Index coverage** - Ensure RLS subqueries hit indexes
3. **Limit result sets** - Use pagination, don't fetch thousands of rows
4. **Monitor trends** - Weekly review of `get_query_performance_stats()`
5. **Test with realistic data** - Users with 50+ tenants, tables with 1M+ rows

---

## Reference

### Database Functions

- `get_query_performance_stats(p_hours_back, p_min_execution_time_ms)` - Performance stats
- `get_user_tenant_count(p_user_id)` - Count user's tenants
- `get_rls_index_usage()` - Index usage statistics
- `analyze_query_performance(p_query)` - EXPLAIN ANALYZE helper
- `cleanup_slow_query_logs()` - Remove old logs

### TypeScript Functions

- `measureQuery(queryFn, metadata)` - Measure and log query
- `logSlowQuery(log)` - Manually log slow query
- `getQueryPerformanceStats(hoursBack, minMs)` - Fetch performance stats
- `getUserTenantCount(userId)` - Get tenant count
- `getRLSIndexUsage()` - Get index usage
- `analyzeQueryPlan(query)` - Development EXPLAIN helper

### Environment Variables

- `SLOW_QUERY_THRESHOLD_MS` - Threshold for logging (default: 100)

---

**Last Updated**: 2026-01-06
**Maintained By**: Engineering Team
