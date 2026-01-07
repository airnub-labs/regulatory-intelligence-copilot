# Migration Summary: Internal Functions Security Improvement

**Migration:** `20260107000006_move_internal_functions.sql`
**Date:** 2026-01-07
**Status:** ✅ **COMPLETED**
**Security Impact:** HIGH - Reduces API attack surface

---

## What Changed

### Functions Moved to `copilot_internal` Schema

The following 6 internal/admin functions were moved from `public` to `copilot_internal` schema:

1. **`analyze_query_performance`** - Development tool for EXPLAIN ANALYZE
2. **`get_query_performance_stats`** - Performance monitoring metrics
3. **`get_rls_index_usage`** - Internal index usage statistics
4. **`get_user_tenant_count`** - User tenant count utility
5. **`conversation_store_healthcheck`** - Infrastructure health check
6. **`current_tenant_id`** - Legacy function (use `get_current_tenant_id` instead)

### Security Improvements

**Before:**
- ❌ All 21 functions exposed via PostgREST API
- ❌ Anyone could call admin/monitoring tools
- ❌ Internal tools accessible to external users

**After:**
- ✅ Only 15 user-facing functions in `public` schema
- ✅ Admin tools protected in `copilot_internal` schema
- ✅ 29% reduction in API attack surface
- ✅ Functions only callable server-side with service role

---

## Application Code Changes

### 1. Server-Side Healthcheck Updated

**File:** `apps/demo-web/src/lib/server/conversations.ts`

```diff
async function validateSupabaseHealth() {
-  if (!supabaseClient) return;
-  const { data, error } = await supabaseClient.rpc('conversation_store_healthcheck');
+  if (!supabaseClient || !supabaseInternalClient) return;
+  // Use internal client since healthcheck function is in copilot_internal schema
+  const { data, error } = await supabaseInternalClient.rpc('conversation_store_healthcheck');
```

### 2. New Server-Side Performance Utilities

**File:** `apps/demo-web/src/lib/server/queryPerformance.ts` (NEW)

Created server-only versions of monitoring functions:
- `getQueryPerformanceStats()`
- `getUserTenantCount()`
- `getRLSIndexUsage()`
- `analyzeQueryPlan()`
- `conversationStoreHealthcheck()`

All use service role client with `copilot_internal` schema access.

### 3. Client-Side Functions Deprecated

**File:** `apps/demo-web/src/lib/supabase/queryPerformance.ts`

Admin functions now throw helpful errors:
```typescript
export async function getQueryPerformanceStats() {
  throw new Error(
    'getQueryPerformanceStats is now a server-side only function. ' +
    'Import from @/lib/server/queryPerformance'
  );
}
```

**Client-side functions that still work:**
- `logSlowQuery()` - Client can still log slow queries
- `measureQuery()` - Client can still measure performance

---

## Migration Guide

### If You're Using Admin Functions

**Before (Client-Side - WILL BREAK):**
```typescript
import { getQueryPerformanceStats } from '@/lib/supabase/queryPerformance';

// ❌ This will throw an error after migration
const stats = await getQueryPerformanceStats();
```

**After (Server-Side - WORKS):**
```typescript
import { getQueryPerformanceStats } from '@/lib/server/queryPerformance';

// ✅ Use in server components, API routes, server actions
const stats = await getQueryPerformanceStats();
```

### Server Component Example
```typescript
// app/admin/performance/page.tsx
import { getQueryPerformanceStats } from '@/lib/server/queryPerformance';

export default async function PerformancePage() {
  const stats = await getQueryPerformanceStats(24, 100);

  return (
    <div>
      <h1>Query Performance</h1>
      {stats.map(stat => (
        <div key={stat.table_name}>
          {stat.table_name}: {stat.avg_execution_time_ms}ms avg
        </div>
      ))}
    </div>
  );
}
```

### API Route Example
```typescript
// app/api/admin/stats/route.ts
import { NextResponse } from 'next/server';
import { getQueryPerformanceStats } from '@/lib/server/queryPerformance';

export async function GET() {
  const stats = await getQueryPerformanceStats();
  return NextResponse.json({ stats });
}
```

---

## Verification

### Check Functions in Correct Schema
```sql
-- Should return 6 rows, all in copilot_internal
SELECT n.nspname, p.proname
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname IN (
  'analyze_query_performance',
  'get_query_performance_stats',
  'get_rls_index_usage',
  'get_user_tenant_count',
  'conversation_store_healthcheck',
  'current_tenant_id'
);
```

### Verify API Exposure
```bash
# Check what's exposed via PostgREST
curl http://localhost:54321/rest/v1/ | jq '.paths | keys'

# Should NOT see:
# - /rpc/analyze_query_performance
# - /rpc/get_query_performance_stats
# - /rpc/get_rls_index_usage
# - /rpc/get_user_tenant_count
# - /rpc/conversation_store_healthcheck
# - /rpc/current_tenant_id
```

---

## Rollback Plan

If needed, rollback with:

```sql
-- Move functions back to public schema
ALTER FUNCTION copilot_internal.analyze_query_performance SET SCHEMA public;
ALTER FUNCTION copilot_internal.get_query_performance_stats SET SCHEMA public;
ALTER FUNCTION copilot_internal.get_rls_index_usage SET SCHEMA public;
ALTER FUNCTION copilot_internal.get_user_tenant_count SET SCHEMA public;
ALTER FUNCTION copilot_internal.conversation_store_healthcheck SET SCHEMA public;
ALTER FUNCTION copilot_internal.current_tenant_id SET SCHEMA public;

-- Restore grants
GRANT EXECUTE ON FUNCTION public.analyze_query_performance TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_query_performance_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rls_index_usage TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_count TO authenticated;
GRANT EXECUTE ON FUNCTION public.conversation_store_healthcheck TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_tenant_id TO authenticated;
```

---

## Testing Checklist

- [x] Migration runs without errors
- [x] Functions moved to copilot_internal schema
- [x] Application code updated to use server-side functions
- [x] Client-side code throws helpful errors
- [x] Server healthcheck works
- [ ] Test admin dashboard (if you have one)
- [ ] Test performance monitoring endpoints
- [ ] Verify functions NOT accessible via client RPC

---

## Impact Analysis

### Security
- ✅ Reduced attack surface by 29% (6/21 functions protected)
- ✅ Admin tools no longer publicly accessible
- ✅ Development tools protected from misuse

### Performance
- ✅ No performance impact (same queries, different schema)
- ✅ No additional latency

### Compatibility
- ⚠️ Breaking change for client-side usage (minimal impact - these were admin functions)
- ✅ Server-side code updated
- ✅ Clear deprecation notices

### Maintenance
- ✅ Clearer separation of concerns (public API vs internal tools)
- ✅ Better security posture for SOC2 compliance
- ✅ Easier to audit what's exposed publicly

---

## Next Steps

1. **Monitor Errors:** Watch logs for any code still trying to call deprecated functions
2. **Update Admin Dashboards:** If you have admin pages using these functions, update imports
3. **SOC2 Compliance:** Document this improvement in security controls
4. **Continue Migration:** See `docs/security/SOC2_SCHEMA_ARCHITECTURE_PROPOSAL.md` for full plan

---

## Questions?

- Check the full proposal: `docs/security/SOC2_SCHEMA_ARCHITECTURE_PROPOSAL.md`
- Review the audit: `docs/security/SECURITY_AUDIT_SUMMARY.md`
- Ask in #engineering or #security channels
