# Migration Analysis & Consolidation Recommendations

**Date**: 2026-01-06
**Purpose**: Review all migrations for ordering, schema consistency, and consolidation opportunities
**Context**: Development only - no production data to preserve

---

## 📊 Current Migration Inventory (20 files)

### Cost & Metrics Migrations (5 files) 💰
```
20260101000000_llm_cost_tracking.sql
20260104000001_e2b_cost_tracking.sql
20260104000002_atomic_quota_operations.sql
20260104000003_llm_model_pricing.sql
20260105000002_cost_estimates.sql
```

### Tenant & Multi-Tenant (3 files) 🏢
```
20251229000000_tenant_llm_policies.sql
20260105000003_multi_tenant_user_model.sql
20260105000004_tenant_quota_initialization.sql
```

### Conversation Core (9 files) 💬
```
20241114000000_conversations.sql
20241207000000_conversation_paths_consolidated.sql
20250205000000_conversation_archival.sql
20250314000000_conversation_contexts_rls_fix.sql
20251210000001_conversation_configs.sql
20251210000002_message_pinning.sql
20251210000003_conversation_context_trace_spans.sql
20260102000000_compaction_operations.sql
20260105000000_auto_compaction_query.sql
```

### Execution & Tracing (2 files) 🔍
```
20250319000000_trace_columns.sql
20251210000000_execution_contexts.sql
```

### Bug Fixes (1 file) 🐛
```
20260104000000_fix_execution_context_unique_constraint.sql
```

---

## 🚨 Critical Issues Found

### Issue 1: Schema Inconsistency ⚠️

**Problem**: Migrations reference both `public` and `copilot_internal` schemas inconsistently

**Examples**:
- Multi-tenant tables use `copilot_internal.tenants`
- Helper functions use `public.get_current_tenant_id()`
- Some migrations check for `public.tenants` (wrong schema)

**Impact**: Confusing, prone to errors, RLS policies may be in wrong places

**Recommendation**:
- **Data tables** → `copilot_internal.*` (protected by RLS)
- **Helper functions** → `public.*` (accessible to users)
- **Metrics views** → `metrics.*` (new read-only schema)

### Issue 2: Cost/Metrics Tables Scattered 💰

**Problem**: 5 separate migrations for cost tracking, spread across different dates

**Tables Created**:
```sql
copilot_internal.llm_cost_records
copilot_internal.e2b_cost_records
copilot_internal.cost_quotas
copilot_internal.model_pricing
copilot_internal.e2b_pricing
copilot_internal.llm_cost_estimates
copilot_internal.e2b_cost_estimates
```

**Issues**:
- No unified metrics schema
- Direct table access required for reads
- No isolation between write operations and read queries
- Difficult to grant read-only access

**Recommendation**: Consolidate into single migration + metrics views

### Issue 3: Unnecessary Backfill/Fix Migrations 🔧

**Files to Remove** (no production data):
- `20260104000000_fix_execution_context_unique_constraint.sql` - Fix for a previous migration
- `20250314000000_conversation_contexts_rls_fix.sql` - RLS policy fix
- Any "DROP IF EXISTS" logic that's fixing previous migrations

**Recommendation**: Incorporate fixes directly into original migrations

### Issue 4: Compaction Scattered Across 2 Files 📦

**Files**:
- `20260102000000_compaction_operations.sql` - Tables and functions
- `20260105000000_auto_compaction_query.sql` - Query function only

**Recommendation**: Consolidate into single compaction migration

### Issue 5: Tenant Dependencies Out of Order 🔀

**Current Order**:
```
20251229000000_tenant_llm_policies.sql    ← References tenants (doesn't exist yet!)
...
20260105000003_multi_tenant_user_model.sql ← Creates tenants table
20260105000004_tenant_quota_initialization.sql ← Uses tenants table
```

**Problem**: `tenant_llm_policies` runs before tenants table exists!

**Recommendation**: Renumber tenant_llm_policies to run after multi_tenant_user_model

---

## 🎯 Consolidation Plan

### Phase 1: Remove Unnecessary Files

**Delete** (fixes can be incorporated):
1. `20260104000000_fix_execution_context_unique_constraint.sql`
   - Incorporate fix into `20251210000000_execution_contexts.sql`
2. `20250314000000_conversation_contexts_rls_fix.sql`
   - Incorporate into `20241114000000_conversations.sql`

### Phase 2: Fix Migration Ordering

**Rename**:
1. `20251229000000_tenant_llm_policies.sql` → `20260105000005_tenant_llm_policies.sql`
   - Must run AFTER tenants table is created

**New Order**:
```
20260105000003_multi_tenant_user_model.sql      ← Creates tenants
20260105000004_tenant_quota_initialization.sql  ← Uses tenants
20260105000005_tenant_llm_policies.sql          ← Uses tenants ✅
```

### Phase 3: Consolidate Cost/Metrics

**Current** (5 files):
```
20260101000000_llm_cost_tracking.sql
20260104000001_e2b_cost_tracking.sql
20260104000002_atomic_quota_operations.sql
20260104000003_llm_model_pricing.sql
20260105000002_cost_estimates.sql
```

**Consolidated** → `20260101000000_cost_and_metrics_consolidated.sql`:

```sql
-- Part 1: Core Cost Tables
CREATE TABLE copilot_internal.llm_cost_records (...)
CREATE TABLE copilot_internal.e2b_cost_records (...)
CREATE TABLE copilot_internal.cost_quotas (...)
CREATE TABLE copilot_internal.model_pricing (...)
CREATE TABLE copilot_internal.e2b_pricing (...)
CREATE TABLE copilot_internal.llm_cost_estimates (...)
CREATE TABLE copilot_internal.e2b_cost_estimates (...)

-- Part 2: Metrics Schema (NEW - Read-Only Views)
CREATE SCHEMA IF NOT EXISTS metrics;

CREATE VIEW metrics.llm_costs AS
SELECT
  tenant_id,
  model_provider,
  model_name,
  SUM(cost_usd) as total_cost,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  COUNT(*) as request_count
FROM copilot_internal.llm_cost_records
GROUP BY tenant_id, model_provider, model_name;

CREATE VIEW metrics.e2b_costs AS
SELECT
  tenant_id,
  sandbox_type,
  SUM(cost_usd) as total_cost,
  SUM(duration_seconds) as total_duration,
  COUNT(*) as session_count
FROM copilot_internal.e2b_cost_records
GROUP BY tenant_id, sandbox_type;

CREATE VIEW metrics.quota_status AS
SELECT
  scope,
  scope_id,
  resource_type,
  limit_usd,
  current_spend_usd,
  (current_spend_usd / NULLIF(limit_usd, 0) * 100) as usage_percentage,
  CASE
    WHEN current_spend_usd >= limit_usd THEN 'EXCEEDED'
    WHEN current_spend_usd >= limit_usd * warning_threshold THEN 'WARNING'
    ELSE 'OK'
  END as status
FROM copilot_internal.cost_quotas
WHERE period_start <= NOW() AND period_end >= NOW();

-- Grant read access to metrics schema
GRANT USAGE ON SCHEMA metrics TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA metrics TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA metrics GRANT SELECT ON TABLES TO authenticated, service_role;

-- Part 3: Helper Functions (keep in public schema)
CREATE FUNCTION public.get_tenant_cost_summary(p_tenant_id UUID) ...
CREATE FUNCTION public.check_quota_before_operation(...) ...
```

**Benefits**:
- All cost/metrics in one place
- Read-only `metrics` schema for analytics/reporting
- Can grant read access without exposing write operations
- Future apps can query `metrics.*` without direct table access

### Phase 4: Consolidate Compaction

**Current** (2 files):
```
20260102000000_compaction_operations.sql
20260105000000_auto_compaction_query.sql
```

**Consolidated** → `20260102000000_compaction_operations.sql`:
- Merge both files
- Delete `20260105000000_auto_compaction_query.sql`

### Phase 5: Review All Schema References

**Audit Required**:
1. Check all migrations for `public.tenants` → should be `copilot_internal.tenants`
2. Verify all RLS policies are on `copilot_internal.*` tables
3. Ensure helper functions are in `public.*`

---

## 📋 Specific Actions Needed

### Action 1: Check tenant_llm_policies Dependencies

```bash
# Check what this migration references
grep -i "tenant" supabase/migrations/20251229000000_tenant_llm_policies.sql
```

If it references `tenants` table, rename to run after multi-tenant migration.

### Action 2: Audit All Schema References

```bash
# Find all public.* references
grep -n "FROM public\." supabase/migrations/*.sql

# Find all WHERE clauses checking for public schema
grep -n "table_schema = 'public'" supabase/migrations/*.sql
```

### Action 3: Consolidate Cost Migrations

Would you like me to:
1. Create consolidated `cost_and_metrics_consolidated.sql`
2. Create new `metrics` schema with read-only views
3. Delete the 4 separate cost migrations
4. Update implementation plan

### Action 4: Fix Migration Order

1. Rename `tenant_llm_policies` to `20260105000005_*`
2. Test `supabase db reset`
3. Verify no "table not found" errors

---

## 🎨 Proposed New Schema Structure

### Schemas:
```
copilot_internal.*    - All data tables (conversations, tenants, costs, etc.)
  ↓
public.*              - Helper functions for authenticated users
  ↓
metrics.*             - Read-only views for analytics/reporting (NEW)
  ↓
auth.*                - Supabase auth (existing)
```

### Access Control:
```
authenticated role:
  - READ:  copilot_internal.* (via RLS)
  - READ:  metrics.* (via GRANTs)
  - EXECUTE: public.* functions

service_role:
  - FULL ACCESS: all schemas

future_analytics_role:
  - READ ONLY: metrics.* (no access to underlying tables)
```

---

## ✅ Benefits of Consolidation

1. **Fewer Files**: 20 → ~15 migrations
2. **Clearer Organization**: Related tables together
3. **Better Schema Design**: Separate read-only metrics
4. **Easier Maintenance**: Fixes incorporated, not separate
5. **Correct Ordering**: Dependencies resolved
6. **No Production Baggage**: Clean slate without backfill complexity

---

## 🚀 Next Steps

**Would you like me to:**
1. ✅ Create consolidated cost/metrics migration with new `metrics` schema
2. ✅ Fix tenant_llm_policies ordering
3. ✅ Remove unnecessary fix migrations
4. ✅ Audit and fix all schema references (public vs copilot_internal)
5. ✅ Test full migration reset

**Priority Order:**
1. Fix tenant_llm_policies ordering (critical - broken dependency)
2. Consolidate cost/metrics with metrics schema (high value)
3. Remove fix migrations (cleanup)
4. Audit schema references (consistency)

---

**Estimated Time**: 2-3 hours to complete all consolidations and testing

**Risk**: Low (development only, no production data)

**Benefit**: Much cleaner migration structure for future development
