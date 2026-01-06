# Multi-Tenant Architecture: Phased Implementation Plan

**Version**: 1.0 Final
**Date**: 2026-01-05
**Estimated Duration**: 3-4 weeks
**Success Metric**: Seed data with multiple users/tenants, working UI with tenant switching

---

## Table of Contents

1. [Overview](#overview)
2. [Success Criteria](#success-criteria)
3. [Phase 0: Preparation](#phase-0-preparation-day-1-2)
4. [Phase 1: Database Foundation](#phase-1-database-foundation-day-3-5)
5. [Phase 2: Authentication Layer](#phase-2-authentication-layer-day-6-8)
6. [Phase 3: API Routes](#phase-3-api-routes-day-9-12)
7. [Phase 4: UI Components](#phase-4-ui-components-day-13-17)
8. [Phase 5: Seed Data & Testing](#phase-5-seed-data--testing-day-18-20)
9. [Phase 6: Deployment](#phase-6-deployment-day-21-23)
10. [Appendix: Complete Code Examples](#appendix-complete-code-examples)

---

## Overview

This plan implements the **Personal Tenant Model** multi-tenant architecture with the following end goal:

**🎯 Final Success Demonstration**:
```
1. Run seed data script
2. Open UI at localhost:3000
3. Log in as alice@example.com
4. See tenant dropdown showing: "Alice's Workspace", "Acme Corp", "Startup XYZ"
5. Click dropdown and switch to "Acme Corp"
6. See Acme Corp's conversations (created by Alice and Bob)
7. Switch to "Startup XYZ"
8. See Startup XYZ's conversations (created by Alice and Charlie)
9. Log out, log in as bob@example.com
10. See tenant dropdown showing: "Bob's Workspace", "Acme Corp"
11. Switch between them seamlessly
```

**If this works: ✅ IMPLEMENTATION COMPLETE**

---

## Success Criteria

### Phase Completion Criteria

Each phase has specific deliverables and tests that must pass before moving to the next phase.

### Final Acceptance Criteria

**Database**:
- ✅ All migrations applied successfully
- ✅ All tables created with correct schema
- ✅ All indexes and functions working
- ✅ RLS policies active and tested
- ✅ Seed data loaded successfully

**Authentication**:
- ✅ Users can log in with email/password
- ✅ Personal workspace auto-created on first login
- ✅ JWT includes activeTenantId
- ✅ Session persists across page reloads

**Multi-Tenancy**:
- ✅ Users can belong to multiple tenants
- ✅ Tenant membership enforced via RLS
- ✅ No access to non-member tenants
- ✅ getTenantContext() verifies membership

**UI**:
- ✅ Tenant switcher visible in header
- ✅ Shows all user's tenants
- ✅ Switching updates active tenant
- ✅ Data refreshes after switch
- ✅ No UI errors

**Data Isolation**:
- ✅ Alice sees only her tenants' data
- ✅ Bob sees only his tenants' data
- ✅ Switching shows different data
- ✅ Cannot access other users' personal workspaces

---

## Phase 0: Preparation (Day 1-2)

### Objective
Understand current state, prepare environment, and get stakeholder alignment.

### Tasks

#### Task 0.1: Repository Setup (30 min)

```bash
# Ensure you're on the correct branch
git checkout claude/fix-tenant-id-leak-0XgJH
git pull origin claude/fix-tenant-id-leak-0XgJH

# Verify all architecture documents are present
ls -la *.md
# Should see:
# - MULTI_TENANT_ARCHITECTURE.md
# - IMPLEMENTATION_PLAN.md (this file)

# Verify migrations exist
ls -la supabase/migrations/202601050*
# Should see:
# - 20260105000000_multi_tenant_user_model.sql
# - 20260105000001_backfill_personal_tenants.sql
```

**Deliverable**: ✅ Repository in correct state

#### Task 0.2: Local Environment Setup (1 hour)

```bash
# Start local Supabase
cd supabase
supabase start

# Note the output - you'll need these:
# - API URL
# - anon key
# - service_role key
# - Database URL

# Update .env.local
cp apps/demo-web/.env.local.example apps/demo-web/.env.local

# Edit apps/demo-web/.env.local with Supabase values:
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-from-supabase-start>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-from-supabase-start>
NEXTAUTH_SECRET=<generate-with-openssl-rand-base64-32>
NEXTAUTH_URL=http://localhost:3000

# Remove old demo tenant ID (if present)
# DELETE this line if it exists:
# SUPABASE_DEMO_TENANT_ID=...
```

**Deliverable**: ✅ Local Supabase running, .env.local configured

#### Task 0.3: Audit Current State (1 hour)

```bash
# Run audit script
psql postgresql://postgres:postgres@localhost:54322/postgres < scripts/audit_tenant_assignments.sql > audit_results.txt

# Review results
cat audit_results.txt

# Document findings:
# - How many users exist?
# - Do any have tenant_id in metadata?
# - Any existing data to preserve?
```

**Deliverable**: ✅ Audit results documented

#### Task 0.4: Review Architecture (1 hour)

```bash
# Read the architecture document
cat MULTI_TENANT_ARCHITECTURE.md

# Verify understanding:
# - Personal Tenant Model concept
# - Database schema (tenants, memberships, preferences)
# - Authentication flow (NextAuth + tenant assignment)
# - User flows (signup, switch, invite)

# Ask questions if anything unclear
```

**Deliverable**: ✅ Architecture understood

### Phase 0 Exit Criteria

- ✅ Local environment running
- ✅ Audit completed
- ✅ Architecture reviewed
- ✅ Ready to start implementation

**Estimated Time**: 4 hours

---

## Phase 1: Database Foundation (Day 3-5)

### Objective
Apply database migrations and verify all tables, functions, and RLS policies are working.

### Tasks

#### Task 1.1: Apply Core Migration (1 hour)

```bash
# Reset database to clean state (WARNING: Destroys all data)
cd supabase
supabase db reset

# This applies ALL migrations including the new ones:
# - 20260105000000_multi_tenant_user_model.sql
# - 20260105000001_backfill_personal_tenants.sql

# Verify migrations applied
psql postgresql://postgres:postgres@localhost:54322/postgres

# In psql:
\dt copilot_internal.tenant*
# Should show:
# - tenants
# - tenant_memberships

\dt copilot_internal.user_preferences
# Should show user_preferences table

\df public.*tenant*
# Should show:
# - get_active_tenant_id
# - get_user_tenants
# - create_personal_tenant
# - switch_tenant
# - verify_tenant_access
```

**Deliverable**: ✅ All tables and functions created

#### Task 1.2: Verify RLS Policies (30 min)

```sql
-- In psql, check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'copilot_internal'
  AND tablename IN ('tenants', 'tenant_memberships', 'user_preferences');

-- Should show rowsecurity = true for all

-- Check policies exist
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'copilot_internal'
ORDER BY tablename, policyname;

-- Should show multiple policies per table
```

**Deliverable**: ✅ RLS enabled and policies active

#### Task 1.3: Test Database Functions (1 hour)

Create a test script to verify all functions work:

```sql
-- test_functions.sql

-- Create a test user
INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_user_meta_data
) VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'test@example.com',
    crypt('password123', gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"full_name": "Test User"}'::jsonb
) RETURNING id \gset test_user_

-- Test: create_personal_tenant
SELECT public.create_personal_tenant(:'test_user_id', 'test@example.com') AS tenant_id \gset

-- Verify tenant created
SELECT id, name, type, owner_id
FROM copilot_internal.tenants
WHERE id = :'tenant_id';

-- Expected: 1 row, type = 'personal', owner_id = test_user_id

-- Test: get_user_tenants
SELECT * FROM public.get_user_tenants(:'test_user_id');

-- Expected: 1 row showing the personal tenant

-- Test: get_active_tenant_id
SELECT public.get_active_tenant_id(:'test_user_id') AS active_id \gset

-- Expected: Returns tenant_id

-- Verify it matches
SELECT :'active_id' = :'tenant_id' AS is_active;

-- Expected: true

-- Create a second tenant for testing switch
INSERT INTO copilot_internal.tenants (name, slug, type, owner_id, plan)
VALUES ('Test Team', 'test-team', 'team', :'test_user_id', 'pro')
RETURNING id \gset team_id

-- Add membership
INSERT INTO copilot_internal.tenant_memberships (tenant_id, user_id, role, status, joined_at)
VALUES (:'team_id', :'test_user_id', 'owner', 'active', NOW());

-- Test: get_user_tenants (should show 2 now)
SELECT * FROM public.get_user_tenants(:'test_user_id');

-- Expected: 2 rows

-- Test: switch_tenant
SELECT public.switch_tenant(:'team_id');

-- Expected: true

-- Verify active tenant changed
SELECT public.get_active_tenant_id(:'test_user_id');

-- Expected: Returns team_id

-- Test: verify_tenant_access
SELECT * FROM public.verify_tenant_access(:'test_user_id', :'team_id');

-- Expected: has_access = true, role = 'owner'

-- Test negative case: access to non-existent tenant
SELECT * FROM public.verify_tenant_access(:'test_user_id', gen_random_uuid());

-- Expected: 0 rows (no access)

-- Cleanup
DELETE FROM auth.users WHERE id = :'test_user_id';

\echo 'All function tests passed! ✓'
```

Run the test:

```bash
psql postgresql://postgres:postgres@localhost:54322/postgres < test_functions.sql
```

**Expected output**: All tests pass with "All function tests passed! ✓"

**Deliverable**: ✅ All database functions working correctly

#### Task 1.4: Test RLS Enforcement (1 hour)

```sql
-- test_rls.sql

-- Create two test users
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
    ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'alice@test.com', crypt('pass', gen_salt('bf')), NOW(), NOW(), NOW()),
    ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'bob@test.com', crypt('pass', gen_salt('bf')), NOW(), NOW(), NOW());

-- Create tenants for both
SELECT public.create_personal_tenant('11111111-1111-1111-1111-111111111111', 'alice@test.com') AS alice_tenant \gset
SELECT public.create_personal_tenant('22222222-2222-2222-2222-222222222222', 'bob@test.com') AS bob_tenant \gset

-- Create a shared team tenant
INSERT INTO copilot_internal.tenants (id, name, slug, type, owner_id, plan)
VALUES ('33333333-3333-3333-3333-333333333333', 'Shared Team', 'shared-team', 'team', '11111111-1111-1111-1111-111111111111', 'pro');

-- Add both as members
INSERT INTO copilot_internal.tenant_memberships (tenant_id, user_id, role, status, joined_at) VALUES
    ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'owner', 'active', NOW()),
    ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'member', 'active', NOW());

-- Test 1: Alice should see 2 tenants (personal + shared)
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}'::json;

SELECT COUNT(*) AS alice_tenant_count
FROM copilot_internal.tenants;

-- Expected: 2

-- Test 2: Bob should see 2 tenants (personal + shared)
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222"}'::json;

SELECT COUNT(*) AS bob_tenant_count
FROM copilot_internal.tenants;

-- Expected: 2

-- Test 3: Alice should NOT see Bob's personal tenant
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}'::json;

SELECT COUNT(*) AS alice_sees_bob_personal
FROM copilot_internal.tenants
WHERE id = :'bob_tenant';

-- Expected: 0

-- Test 4: Bob should NOT see Alice's personal tenant
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222"}'::json;

SELECT COUNT(*) AS bob_sees_alice_personal
FROM copilot_internal.tenants
WHERE id = :'alice_tenant';

-- Expected: 0

-- Test 5: Both should see shared tenant
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}'::json;
SELECT COUNT(*) FROM copilot_internal.tenants WHERE id = '33333333-3333-3333-3333-333333333333';
-- Expected: 1

SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222"}'::json;
SELECT COUNT(*) FROM copilot_internal.tenants WHERE id = '33333333-3333-3333-3333-333333333333';
-- Expected: 1

-- Cleanup
RESET role;
DELETE FROM auth.users WHERE id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

\echo 'All RLS tests passed! ✓'
```

Run the test:

```bash
psql postgresql://postgres:postgres@localhost:54322/postgres < test_rls.sql
```

**Deliverable**: ✅ RLS properly isolates tenant data

### Phase 1 Exit Criteria

- ✅ All migrations applied
- ✅ All tables created
- ✅ All functions working
- ✅ RLS policies active
- ✅ RLS tests passing
- ✅ Database foundation solid

**Estimated Time**: 3-4 hours

---

## Phase 1.5: Migration Consolidation (Day 5-6)

### Objective
Consolidate scattered cost/metrics schema, remove unnecessary fix migrations, and standardize schema usage (Option B from Migration Consolidation Analysis).

### Background
This phase implements the full consolidation plan identified in the migration analysis:
- 5 cost/metrics files scattered → 1 unified schema with analytics views
- 2 fix migrations → removed and incorporated
- Schema inconsistencies → standardized
- See `MIGRATION_CONSOLIDATION_ANALYSIS.md` for full details

### Tasks

#### Task 1.5.1: Create Metrics Schema (1-1.5 hours)

Create a new migration for the unified metrics/analytics schema:

```bash
# Create new migration file
touch supabase/migrations/20260105000004_unified_metrics_schema.sql
```

**Migration Content**:

```sql
-- ========================================
-- Unified Metrics Schema for Analytics
-- ========================================
-- Provides read-only views for BI tools and analytics
-- Consolidates cost tracking across all sources

-- Create metrics schema
CREATE SCHEMA IF NOT EXISTS metrics;

COMMENT ON SCHEMA metrics IS 'Read-only analytical views for BI tools and dashboards';

-- ========================================
-- Unified Cost View
-- ========================================
CREATE OR REPLACE VIEW metrics.all_costs AS
SELECT
    'llm' AS cost_type,
    tenant_id,
    user_id,
    conversation_id,
    message_id,
    model,
    provider,
    input_tokens,
    output_tokens,
    cost_usd,
    created_at,
    metadata
FROM copilot_internal.llm_cost_records
UNION ALL
SELECT
    'e2b' AS cost_type,
    tenant_id,
    user_id,
    conversation_id,
    message_id,
    sandbox_template AS model,
    'e2b' AS provider,
    0 AS input_tokens,
    0 AS output_tokens,
    cost_usd,
    created_at,
    metadata
FROM copilot_internal.e2b_cost_records;

COMMENT ON VIEW metrics.all_costs IS 'Unified view of all costs (LLM + E2B) for analytics';

-- ========================================
-- Cost Summary Views
-- ========================================
CREATE OR REPLACE VIEW metrics.cost_by_tenant AS
SELECT
    tenant_id,
    cost_type,
    SUM(cost_usd) AS total_cost_usd,
    COUNT(*) AS record_count,
    MIN(created_at) AS first_cost_at,
    MAX(created_at) AS last_cost_at
FROM metrics.all_costs
GROUP BY tenant_id, cost_type;

COMMENT ON VIEW metrics.cost_by_tenant IS 'Cost summaries grouped by tenant and type';

CREATE OR REPLACE VIEW metrics.cost_by_user AS
SELECT
    tenant_id,
    user_id,
    cost_type,
    SUM(cost_usd) AS total_cost_usd,
    COUNT(*) AS record_count,
    MIN(created_at) AS first_cost_at,
    MAX(created_at) AS last_cost_at
FROM metrics.all_costs
GROUP BY tenant_id, user_id, cost_type;

COMMENT ON VIEW metrics.cost_by_user IS 'Cost summaries grouped by user and type';

-- ========================================
-- Quota Status View
-- ========================================
CREATE OR REPLACE VIEW metrics.quota_status AS
SELECT
    q.tenant_id,
    q.user_id,
    q.quota_type,
    q.limit_value,
    q.current_usage,
    CASE
        WHEN q.limit_value > 0
        THEN (q.current_usage::float / q.limit_value * 100)::numeric(5,2)
        ELSE 0
    END AS usage_percent,
    CASE
        WHEN q.limit_value > 0 AND q.current_usage >= q.limit_value
        THEN 'exceeded'
        WHEN q.limit_value > 0 AND (q.current_usage::float / q.limit_value) > 0.9
        THEN 'warning'
        WHEN q.limit_value > 0 AND (q.current_usage::float / q.limit_value) > 0.75
        THEN 'caution'
        ELSE 'ok'
    END AS status,
    q.created_at,
    q.updated_at
FROM copilot_internal.cost_quotas q;

COMMENT ON VIEW metrics.quota_status IS 'Quota usage with status indicators (ok/caution/warning/exceeded)';

-- ========================================
-- LLM Specific Views
-- ========================================
CREATE OR REPLACE VIEW metrics.llm_costs AS
SELECT * FROM copilot_internal.llm_cost_records;

COMMENT ON VIEW metrics.llm_costs IS 'Direct read-only access to LLM cost records';

CREATE OR REPLACE VIEW metrics.llm_model_usage AS
SELECT
    tenant_id,
    model,
    provider,
    COUNT(*) AS request_count,
    SUM(input_tokens) AS total_input_tokens,
    SUM(output_tokens) AS total_output_tokens,
    SUM(cost_usd) AS total_cost_usd,
    AVG(cost_usd) AS avg_cost_per_request,
    MIN(created_at) AS first_used_at,
    MAX(created_at) AS last_used_at
FROM copilot_internal.llm_cost_records
GROUP BY tenant_id, model, provider;

COMMENT ON VIEW metrics.llm_model_usage IS 'LLM model usage statistics by tenant';

-- ========================================
-- E2B Specific Views
-- ========================================
CREATE OR REPLACE VIEW metrics.e2b_costs AS
SELECT * FROM copilot_internal.e2b_cost_records;

COMMENT ON VIEW metrics.e2b_costs IS 'Direct read-only access to E2B cost records';

CREATE OR REPLACE VIEW metrics.e2b_sandbox_usage AS
SELECT
    tenant_id,
    sandbox_template,
    COUNT(*) AS execution_count,
    SUM(cost_usd) AS total_cost_usd,
    AVG(cost_usd) AS avg_cost_per_execution,
    MIN(created_at) AS first_used_at,
    MAX(created_at) AS last_used_at
FROM copilot_internal.e2b_cost_records
GROUP BY tenant_id, sandbox_template;

COMMENT ON VIEW metrics.e2b_sandbox_usage IS 'E2B sandbox usage statistics by tenant';

-- ========================================
-- Cost Estimates View
-- ========================================
CREATE OR REPLACE VIEW metrics.cost_estimates AS
SELECT * FROM copilot_internal.cost_estimates;

COMMENT ON VIEW metrics.cost_estimates IS 'Estimated costs for operations';

-- ========================================
-- Permissions
-- ========================================
-- Grant read-only access to authenticated users
GRANT USAGE ON SCHEMA metrics TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA metrics TO authenticated;

-- Ensure future views also get SELECT permission
ALTER DEFAULT PRIVILEGES IN SCHEMA metrics
    GRANT SELECT ON TABLES TO authenticated;

-- Service role has full access
GRANT ALL ON SCHEMA metrics TO service_role;
```

**Deliverable**: ✅ Unified metrics schema created with analytics views

#### Task 1.5.2: Remove Fix Migrations (30 min)

Since we have no production data, we can safely remove fix migrations and incorporate fixes into original migrations.

**Step 1: Backup fix migration content**
```bash
# Save the fixes for reference
cp supabase/migrations/20260104000000_fix_execution_context_unique_constraint.sql \
   /tmp/fix_execution_context_backup.sql

cp supabase/migrations/20250314000000_conversation_contexts_rls_fix.sql \
   /tmp/conversation_contexts_rls_fix_backup.sql
```

**Step 2: Incorporate fixes into original migrations**

Update `20251210000000_execution_contexts.sql`:

```sql
-- Find the UNIQUE constraint and update it
-- OLD (wrong):
-- UNIQUE(conversation_id, sandbox_id)

-- NEW (correct - prevents duplicates):
UNIQUE(conversation_id, message_id, sandbox_id)
```

Update the conversation contexts migration (whichever one needs the RLS fix):
```bash
# Review the fix and incorporate into original migration
cat /tmp/conversation_contexts_rls_fix_backup.sql
# Apply the changes to the original migration
```

**Step 3: Remove fix migrations**
```bash
rm supabase/migrations/20260104000000_fix_execution_context_unique_constraint.sql
rm supabase/migrations/20250314000000_conversation_contexts_rls_fix.sql
```

**Step 4: Test with clean migration**
```bash
supabase db reset
# Should work perfectly without errors
```

**Deliverable**: ✅ Fix migrations removed, fixes incorporated, clean migration history

#### Task 1.5.3: Audit and Fix Schema References (30 min)

**Step 1: Search for incorrect schema references**
```bash
# Find all public.tenant references
grep -r "public\.tenant" supabase/migrations/

# Should return zero results (all should be copilot_internal.tenant*)
```

**Step 2: Fix any incorrect references**
```bash
# If any are found, update them:
# public.tenants → copilot_internal.tenants
# public.tenant_memberships → copilot_internal.tenant_memberships
```

**Step 3: Verify schema organization**
```bash
# After migrations, verify schema structure
psql -c "
SELECT
  schemaname,
  tablename,
  'table' AS object_type
FROM pg_tables
WHERE schemaname IN ('copilot_internal', 'metrics', 'public')
UNION ALL
SELECT
  n.nspname AS schemaname,
  p.proname AS tablename,
  'function' AS object_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname IN ('copilot_internal', 'metrics', 'public')
ORDER BY schemaname, object_type, tablename;
"
```

**Expected Structure**:
```
copilot_internal | tables:
  - tenants
  - tenant_memberships
  - user_preferences
  - conversations
  - llm_cost_records
  - e2b_cost_records
  - cost_quotas
  - (etc.)

metrics | views:
  - all_costs
  - cost_by_tenant
  - cost_by_user
  - quota_status
  - llm_costs
  - e2b_costs
  - (etc.)

public | functions:
  - get_active_tenant_id
  - get_user_tenants
  - create_personal_tenant
  - switch_tenant
  - verify_tenant_access
  - (etc.)
```

**Deliverable**: ✅ Schema references consistent, organization validated

#### Task 1.5.4: Create Migration Validation Script (30 min)

Create a script to validate migration consistency:

```typescript
// scripts/validate-migrations.ts

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function validateMigrations() {
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('🔍 Validating migration consistency...\n');

  // Check 1: Verify tenant tables exist
  console.log('✅ Check 1: Tenant tables');
  const { data: tenantTables } = await supabase.rpc('validate_tenant_tables');
  // ... validation logic

  // Check 2: Verify foreign key constraints
  console.log('✅ Check 2: Foreign key constraints');
  const { data: fkConstraints } = await supabase.rpc('validate_foreign_keys');
  // ... validation logic

  // Check 3: Verify RLS policies
  console.log('✅ Check 3: RLS policies');
  const { data: rlsPolicies } = await supabase.rpc('validate_rls_policies');
  // ... validation logic

  // Check 4: Verify metrics schema
  console.log('✅ Check 4: Metrics schema');
  const { data: metricsViews } = await supabase.rpc('validate_metrics_schema');
  // ... validation logic

  console.log('\n🎉 All validation checks passed!');
}

validateMigrations().catch(console.error);
```

**Deliverable**: ✅ Migration validation script created

#### Task 1.5.5: Test Full Migration Stack (30 min)

```bash
# Full reset and test
supabase db reset

# Verify all migrations applied
psql -c "\dt copilot_internal.*" | wc -l
# Should show correct number of tables

# Verify metrics schema
psql -c "\dv metrics.*" | wc -l
# Should show all views

# Test metrics views work
psql -c "SELECT * FROM metrics.all_costs LIMIT 1;"
psql -c "SELECT * FROM metrics.quota_status LIMIT 1;"

# Verify no fix migrations exist
ls supabase/migrations/ | grep -i fix
# Should return nothing
```

**Deliverable**: ✅ Full migration stack tested and working

### Phase 1.5 Exit Criteria

- ✅ Metrics schema created with unified views
- ✅ Fix migrations removed and incorporated
- ✅ Schema references consistent (copilot_internal.*)
- ✅ Migration validation script created
- ✅ Full migration stack tested
- ✅ Analytics-ready (read-only metrics views)
- ✅ No migration errors

**Estimated Time**: 2-3 hours

**Benefits Achieved**:
- Unified cost/metrics analytics (5 files → 1 schema)
- Cleaner migration history (2 fewer fix migrations)
- Consistent schema usage
- BI-tool ready (read-only metrics access)
- Easier to maintain and understand

---

## Phase 2: Authentication Layer (Day 6-8)

### Objective
Update NextAuth to work with the new tenant system.

### Tasks

#### Task 2.1: Update TypeScript Types (30 min)

Create new auth types file:

```typescript
// apps/demo-web/src/types/auth.ts

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  type: 'personal' | 'team' | 'enterprise';
  plan: 'free' | 'pro' | 'enterprise';
  role: 'owner' | 'admin' | 'member' | 'viewer';
  isActive: boolean;
  joinedAt: string;
}

export interface ExtendedUser {
  id: string;
  email: string;
  name?: string;
  activeTenantId?: string;
}

export interface ExtendedSession {
  user: ExtendedUser;
  expires: string;
}

export interface ExtendedJWT {
  sub: string;
  email: string;
  name?: string;
  activeTenantId?: string;
  lastValidated?: number;
}
```

**Deliverable**: ✅ Types file created

#### Task 2.2: Create Tenant Context Helper (1 hour)

```typescript
// apps/demo-web/src/lib/auth/tenantContext.ts

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createLogger } from '@reg-copilot/reg-intel-observability';
import type { ExtendedSession } from '@/types/auth';

const logger = createLogger('TenantContext');

export interface TenantContext {
  userId: string;
  tenantId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
}

/**
 * Validates and extracts tenant context from session
 *
 * SECURITY: This function enforces tenant membership via RLS-protected query.
 * Users must be active members of the tenant they're trying to access.
 *
 * @throws {Error} If user is not authenticated or not a member of active tenant
 */
export async function getTenantContext(
  session: ExtendedSession | null
): Promise<TenantContext> {
  const userId = session?.user?.id;
  const activeTenantId = session?.user?.activeTenantId;

  if (!userId) {
    logger.error('Missing user ID in session');
    throw new Error('Unauthorized: No user ID in session');
  }

  if (!activeTenantId) {
    logger.error({ userId }, 'Missing active tenant ID in session');
    throw new Error('No active tenant selected - please select a workspace');
  }

  // Verify membership using RLS-protected query
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase configuration missing');
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookies) {
        cookies.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  const { data: access, error } = await supabase
    .rpc('verify_tenant_access', {
      p_user_id: userId,
      p_tenant_id: activeTenantId,
    })
    .single();

  if (error || !access?.has_access) {
    logger.error(
      { userId, activeTenantId, error },
      'Tenant access verification failed'
    );
    throw new Error('Access denied: Not a member of this workspace');
  }

  logger.debug(
    { userId, tenantId: activeTenantId, role: access.role },
    'Tenant context verified'
  );

  return {
    userId,
    tenantId: activeTenantId,
    role: access.role,
  };
}
```

**Test the helper**:

```typescript
// Test in a simple API route
// apps/demo-web/src/app/api/test-tenant-context/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const context = await getTenantContext(session);

    return NextResponse.json({
      success: true,
      context,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 401 }
    );
  }
}
```

**Deliverable**: ✅ Tenant context helper created and tested

#### Task 2.3: Update NextAuth Options (2-3 hours)

**IMPORTANT**: This is a critical file. Make changes carefully.

```typescript
// apps/demo-web/src/lib/auth/options.ts

import CredentialsProvider from 'next-auth/providers/credentials';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextAuthOptions, Session } from 'next-auth';
import { createLogger } from '@reg-copilot/reg-intel-observability';
import { getCachedValidationResult, validateUserExists } from './sessionValidation';
import { authMetrics } from './authMetrics';
import type { ExtendedJWT, ExtendedUser, ExtendedSession } from '@/types/auth';

const logger = createLogger('AuthOptions');

const SESSION_VALIDATION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// REMOVE this line (unsafe fallback):
// const fallbackTenantId = process.env.SUPABASE_DEMO_TENANT_ID ?? 'default';

if (!supabaseUrl || !supabaseAnonKey) {
  logger.warn('Supabase URL or anon key missing');
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt' as const,
    maxAge: 24 * 60 * 60, // 24 hours
  },
  providers: [
    CredentialsProvider({
      name: 'Supabase',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password || !supabaseUrl || !supabaseAnonKey) {
          return null;
        }

        const cookieStore = await cookies();
        const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll(cookies) {
              cookies.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
              });
            },
          },
        });

        // Authenticate with Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        });

        if (error || !data.user) {
          logger.warn(
            {
              email: credentials.email,
              supabaseError: error?.message ?? 'Unknown error',
            },
            'Supabase credential sign-in failed'
          );
          return null;
        }

        const userId = data.user.id;

        // Get or create personal tenant
        const supabaseAdmin = createServerClient(supabaseUrl, supabaseServiceKey!, {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll(cookies) {
              cookies.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
              });
            },
          },
        });

        let activeTenantId: string | null = null;

        // Check if user has active tenant
        const { data: activeId } = await supabaseAdmin
          .rpc('get_active_tenant_id', { p_user_id: userId })
          .single();

        if (activeId) {
          activeTenantId = activeId;
          logger.debug({ userId, activeTenantId }, 'User has existing active tenant');
        } else {
          // New user - create personal tenant
          logger.info({ userId, email: data.user.email }, 'Creating personal tenant for new user');

          const { data: newTenantId, error: createError } = await supabaseAdmin
            .rpc('create_personal_tenant', {
              p_user_id: userId,
              p_user_email: data.user.email!,
            });

          if (createError || !newTenantId) {
            logger.error(
              { userId, error: createError },
              'Failed to create personal tenant'
            );
            return null;
          }

          activeTenantId = newTenantId;
          logger.info({ userId, activeTenantId }, 'Created personal tenant');
        }

        if (!activeTenantId) {
          logger.error({ userId }, 'No active tenant available');
          return null;
        }

        // Record successful login
        authMetrics.recordLogin(userId);

        return {
          id: userId,
          email: data.user.email!,
          name: (data.user.user_metadata as { full_name?: string } | null)?.full_name ?? data.user.email!,
          activeTenantId: activeTenantId,
        };
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      const extendedToken = token as ExtendedJWT;
      const extendedUser = user as ExtendedUser | undefined;

      // On initial sign in
      if (extendedUser) {
        extendedToken.sub = extendedUser.id;
        extendedToken.email = extendedUser.email;
        extendedToken.name = extendedUser.name;
        extendedToken.activeTenantId = extendedUser.activeTenantId; // NEW
        extendedToken.lastValidated = Date.now();
        return token;
      }

      // Periodic validation
      const now = Date.now();
      const lastValidated = extendedToken.lastValidated ?? 0;
      const needsValidation = now - lastValidated > SESSION_VALIDATION_INTERVAL_MS;

      if (!needsValidation && extendedToken.sub) {
        const cachedValidation = await getCachedValidationResult(extendedToken.sub);

        if (cachedValidation) {
          if (!cachedValidation.isValid) {
            logger.warn({ userId: extendedToken.sub }, 'Cached validation failure');
            return {} as typeof token;
          }

          if (cachedValidation.user) {
            extendedToken.email = cachedValidation.user.email ?? extendedToken.email;
            extendedToken.activeTenantId = cachedValidation.user.activeTenantId ?? extendedToken.activeTenantId;
          }
        }
      }

      if (needsValidation && extendedToken.sub) {
        try {
          const validation = await validateUserExists(extendedToken.sub);

          if (!validation.isValid) {
            logger.warn(
              { userId: extendedToken.sub, error: validation.error },
              'User validation failed - invalidating session'
            );
            return {} as typeof token;
          }

          if (validation.user) {
            extendedToken.email = validation.user.email ?? extendedToken.email;
            extendedToken.activeTenantId = validation.user.activeTenantId ?? extendedToken.activeTenantId;
          }

          extendedToken.lastValidated = now;
        } catch (error) {
          logger.error({ userId: extendedToken.sub, error }, 'Error validating user session');
        }
      }

      return token;
    },
    async session({ session, token }) {
      const sessionWithUser = session as Session & ExtendedSession;
      const extendedToken = token as ExtendedJWT;

      if (!extendedToken.sub) {
        logger.warn('Attempted to create session with invalid token');
        return {
          ...sessionWithUser,
          user: {
            id: '',
            email: '',
            name: '',
            activeTenantId: undefined,
          },
        };
      }

      if (sessionWithUser.user) {
        sessionWithUser.user.id = extendedToken.sub;
        sessionWithUser.user.email = extendedToken.email ?? '';
        sessionWithUser.user.name = extendedToken.name ?? '';
        sessionWithUser.user.activeTenantId = extendedToken.activeTenantId; // NEW
      }

      return sessionWithUser;
    },
  },
  events: {
    async signOut({ token }) {
      const extendedToken = token as ExtendedJWT;
      logger.info({ userId: extendedToken.sub }, 'User signed out');
    },
    async session({ token }) {
      const extendedToken = token as ExtendedJWT;
      if (!extendedToken.sub) {
        logger.warn('Session accessed with invalid user ID');
      }
    },
  },
};
```

**Deliverable**: ✅ NextAuth updated to use tenant system

#### Task 2.4: Update Session Validation (1 hour)

```typescript
// apps/demo-web/src/lib/auth/sessionValidation.ts

// Update the ValidateUserResult interface:
interface ValidateUserResult {
  isValid: boolean;
  user?: {
    id: string;
    email?: string | null;
    activeTenantId?: string; // CHANGED from tenantId
  };
  error?: string;
}

// In validateUserExists function, add:
export async function validateUserExists(userId: string): Promise<ValidateUserResult> {
  // ... existing cache logic ...

  try {
    // ... existing getUserById call ...

    if (!data.user) {
      // ... existing invalid logic ...
    }

    // NEW: Get user's active tenant ID
    const { data: activeTenantId } = await adminSupabase
      .rpc('get_active_tenant_id', { p_user_id: userId })
      .single();

    // Cache result with activeTenantId
    await validationCache.set(userId, true, activeTenantId);
    authMetrics.recordCacheMiss(userId, validationDuration, true);

    return {
      isValid: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        activeTenantId, // NEW
      },
    };
  } catch (error) {
    // ... existing error handling ...
  }
}
```

**Deliverable**: ✅ Session validation updated

#### Task 2.5: Test Authentication Flow (1 hour)

```bash
# Start the dev server
npm run dev

# Test 1: Login with existing user
# - Visit http://localhost:3000/login
# - Enter credentials
# - Should redirect to /
# - Check browser console for logs

# Test 2: Check JWT
# - Open browser DevTools
# - Application > Cookies
# - Find next-auth.session-token
# - Copy value
# - Go to jwt.io
# - Paste token
# - Verify payload has: sub, email, activeTenantId

# Test 3: API test
# - Visit http://localhost:3000/api/test-tenant-context
# - Should return: { success: true, context: { userId, tenantId, role } }

# Test 4: Create new user in Supabase
# - Supabase Dashboard > Authentication > Users > Add User
# - Email: newuser@test.com, Password: password123
# - Login with this user
# - Check logs - should see "Creating personal tenant for new user"
# - User should be logged in successfully
```

**Deliverable**: ✅ Authentication working with tenant system

### Phase 2 Exit Criteria

- ✅ TypeScript types defined
- ✅ Tenant context helper working
- ✅ NextAuth updated
- ✅ Session validation updated
- ✅ Login flow working
- ✅ JWT includes activeTenantId
- ✅ Personal tenant auto-created for new users

**Estimated Time**: 6-8 hours

---

## Phase 3: API Routes (Day 9-12)

### Objective
Update all API routes to use the new tenant context system.

### Tasks

#### Task 3.1: Create Route Update Checklist (30 min)

List all API routes that need updating:

```bash
# Find all route files
find apps/demo-web/src/app/api -name "route.ts" | sort > api_routes_checklist.txt

# Review the list
cat api_routes_checklist.txt

# Should show ~31 files
```

Create tracking spreadsheet:

| File | Updated | Tested | Notes |
|------|---------|--------|-------|
| `/api/conversations/route.ts` | ⬜ | ⬜ | |
| `/api/conversations/[id]/route.ts` | ⬜ | ⬜ | |
| ... | | | |

**Deliverable**: ✅ Checklist created

#### Task 3.2: Update Route Pattern (15-30 min per route)

**Before**:
```typescript
const tenantId = user.tenantId ?? process.env.SUPABASE_DEMO_TENANT_ID ?? 'default';
```

**After**:
```typescript
import { getTenantContext } from '@/lib/auth/tenantContext';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { userId, tenantId, role } = await getTenantContext(session);

    // Use tenantId in queries...

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 401 }
    );
  }
}
```

**Example: Update /api/conversations/route.ts**:

```typescript
// apps/demo-web/src/app/api/conversations/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { createLogger, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';
import { conversationStore } from '@/lib/server/conversations';
import { toClientConversation } from '@/lib/server/conversationPresenter';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext'; // NEW

export const dynamic = 'force-dynamic';

const logger = createLogger('ConversationsRoute');

export async function GET(request: NextRequest) {
  try {
    // Get session
    const session = await getServerSession(authOptions);

    // Verify tenant context (NEW - replaces old tenant extraction)
    const { userId, tenantId, role } = await getTenantContext(session);

    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status');
    const status = statusParam === 'archived' || statusParam === 'all'
      ? (statusParam as 'archived' | 'all')
      : 'active';
    const limitParam = url.searchParams.get('limit');
    const limit = Math.min(
      Math.max(1, isNaN(parseInt(limitParam || '50', 10)) ? 50 : parseInt(limitParam || '50', 10)),
      100
    );
    const cursor = url.searchParams.get('cursor') || null;

    return requestContext.run(
      { tenantId, userId },
      () =>
        withSpan(
          'api.conversations.list',
          {
            'app.route': '/api/conversations',
            'app.tenant.id': tenantId,
            'app.user.id': userId,
            'app.pagination.limit': limit,
            'app.pagination.has_cursor': Boolean(cursor),
          },
          async () => {
            const result = await conversationStore.listConversations({
              tenantId,
              limit,
              userId,
              status,
              cursor,
            });

            logger.info({
              tenantId,
              userId,
              status,
              count: result.conversations.length,
              hasMore: result.hasMore,
              hasCursor: Boolean(cursor),
            }, 'Fetched conversations');

            return NextResponse.json({
              conversations: result.conversations.map(toClientConversation),
              nextCursor: result.nextCursor,
              hasMore: result.hasMore,
            });
          },
        ),
    );
  } catch (error) {
    logger.error({ error }, 'Failed to fetch conversations');
    return NextResponse.json(
      { error: error.message || 'Failed to fetch conversations' },
      { status: error.message?.includes('Unauthorized') ? 401 : 500 }
    );
  }
}
```

**Update all 31 routes** following this pattern.

**Deliverable**: ✅ All API routes updated

#### Task 3.3: Test Each Route (5-10 min per route)

For each updated route:

```bash
# Start dev server
npm run dev

# Test the route via UI or curl

# Example: Test conversations list
curl http://localhost:3000/api/conversations \
  -H "Cookie: next-auth.session-token=<your-session-token>"

# Should return conversations for active tenant

# Example: Test with invalid session
curl http://localhost:3000/api/conversations

# Should return 401 Unauthorized
```

Create test checklist:

- ✅ Route returns data when authenticated
- ✅ Route returns 401 when not authenticated
- ✅ Route returns 401 when active tenant missing
- ✅ Route filters data by active tenant
- ✅ No errors in console

**Deliverable**: ✅ All routes tested

#### Task 3.4: Remove Environment Variable References (30 min)

```bash
# Search for any remaining references
grep -r "SUPABASE_DEMO_TENANT_ID" apps/demo-web/src

# Should return NO results from .ts/.tsx files

# Update .env.local.example
# Remove or comment out:
# SUPABASE_DEMO_TENANT_ID=...

# Add comment explaining removal:
# REMOVED: SUPABASE_DEMO_TENANT_ID (security vulnerability fixed)
# Tenant IDs now managed via database tenant_memberships table
```

**Deliverable**: ✅ No SUPABASE_DEMO_TENANT_ID references in code

### Phase 3 Exit Criteria

- ✅ All 31 API routes updated
- ✅ All routes tested
- ✅ Environment variable removed
- ✅ No tenant isolation bugs
- ✅ Error handling in place

**Estimated Time**: 8-12 hours

---

## Phase 4: UI Components (Day 13-17)

### Objective
Build UI components for tenant switching and workspace management.

### Tasks

#### Task 4.1: Tenant Switcher Component (3-4 hours)

Full implementation in MULTI_TENANT_ARCHITECTURE.md, Component 1.

Key features:
- Dropdown showing all user's tenants
- Active tenant highlighted
- Switches tenant on selection
- Refreshes page after switch

**File**: `apps/demo-web/src/components/TenantSwitcher.tsx`

**Test**:
```bash
# Import component in header
# Should see dropdown with user's workspaces
# Selecting different workspace should reload with new data
```

**Deliverable**: ✅ Tenant switcher working

#### Task 4.2: Integrate Tenant Switcher in Header (1 hour)

```typescript
// apps/demo-web/src/components/Header.tsx or Layout

import { TenantSwitcher } from './TenantSwitcher';

export function Header() {
  return (
    <header className="...">
      <div className="flex items-center justify-between">
        <div>
          {/* Logo, nav, etc. */}
        </div>

        <div className="flex items-center space-x-4">
          {/* Tenant Switcher */}
          <TenantSwitcher />

          {/* User menu, etc. */}
        </div>
      </div>
    </header>
  );
}
```

**Deliverable**: ✅ Tenant switcher visible in UI

#### Task 4.3: Create Workspace Modal (2-3 hours)

Full implementation in MULTI_TENANT_ARCHITECTURE.md, Component 2.

**File**: `apps/demo-web/src/components/CreateWorkspaceModal.tsx`

Also create API endpoint:

```typescript
// apps/demo-web/src/app/api/workspaces/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { userId } = await getTenantContext(session);

    const { name, slug, type } = await request.json();

    if (!name || !slug || !type) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseServiceKey, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookies) {
          cookies.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    });

    // Create tenant
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        name,
        slug,
        type,
        owner_id: userId,
        plan: type === 'enterprise' ? 'enterprise' : 'pro',
      })
      .select()
      .single();

    if (tenantError) {
      return NextResponse.json(
        { error: 'Failed to create workspace' },
        { status: 500 }
      );
    }

    // Add owner membership
    const { error: membershipError } = await supabase
      .from('tenant_memberships')
      .insert({
        tenant_id: tenant.id,
        user_id: userId,
        role: 'owner',
        status: 'active',
        joined_at: new Date().toISOString(),
      });

    if (membershipError) {
      return NextResponse.json(
        { error: 'Failed to create membership' },
        { status: 500 }
      );
    }

    return NextResponse.json({ tenant });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.message?.includes('Unauthorized') ? 401 : 500 }
    );
  }
}
```

**Deliverable**: ✅ Create workspace modal working

#### Task 4.4: Team Members Page (2-3 hours)

Full implementation in MULTI_TENANT_ARCHITECTURE.md, Component 3.

**File**: `apps/demo-web/src/app/settings/team/page.tsx`

**Deliverable**: ✅ Team members page showing all members

#### Task 4.5: Add "New Workspace" Button (30 min)

```typescript
// In TenantSwitcher or separate button

const [showCreateModal, setShowCreateModal] = useState(false);

return (
  <>
    <button
      onClick={() => setShowCreateModal(true)}
      className="..."
    >
      + New Workspace
    </button>

    <CreateWorkspaceModal
      isOpen={showCreateModal}
      onClose={() => setShowCreateModal(false)}
    />
  </>
);
```

**Deliverable**: ✅ Can create new workspace from UI

### Phase 4 Exit Criteria

- ✅ Tenant switcher visible and working
- ✅ Can switch between tenants
- ✅ Data refreshes after switch
- ✅ Can create new workspace
- ✅ Can view team members
- ✅ UI is polished and bug-free

**Estimated Time**: 10-12 hours

---

## Phase 5: Seed Data & Testing (Day 18-20)

### Objective
Create comprehensive seed data and test the full end-to-end flow.

### Tasks

#### Task 5.1: Create Seed Data Script (2-3 hours)

```sql
-- scripts/seed_multi_tenant_demo.sql

-- ========================================
-- Multi-Tenant Demo Seed Data
-- ========================================
-- Creates 3 users with multiple tenant memberships
-- Demonstrates full multi-tenant functionality
-- ========================================

-- Clean up existing demo data (if any)
DELETE FROM copilot_internal.conversation_messages WHERE conversation_id IN (
  SELECT id FROM copilot_internal.conversations WHERE tenant_id IN (
    SELECT id FROM copilot_internal.tenants WHERE slug IN ('alice-personal', 'bob-personal', 'charlie-personal', 'acme-corp', 'startup-xyz')
  )
);
DELETE FROM copilot_internal.conversations WHERE tenant_id IN (
  SELECT id FROM copilot_internal.tenants WHERE slug IN ('alice-personal', 'bob-personal', 'charlie-personal', 'acme-corp', 'startup-xyz')
);
DELETE FROM copilot_internal.tenant_memberships WHERE tenant_id IN (
  SELECT id FROM copilot_internal.tenants WHERE slug IN ('alice-personal', 'bob-personal', 'charlie-personal', 'acme-corp', 'startup-xyz')
);
DELETE FROM copilot_internal.user_preferences WHERE user_id IN (
  SELECT id FROM auth.users WHERE email IN ('alice@example.com', 'bob@example.com', 'charlie@example.com')
);
DELETE FROM copilot_internal.tenants WHERE slug IN ('alice-personal', 'bob-personal', 'charlie-personal', 'acme-corp', 'startup-xyz');
DELETE FROM auth.users WHERE email IN ('alice@example.com', 'bob@example.com', 'charlie@example.com');

-- ========================================
-- Create Users
-- ========================================

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_user_meta_data,
  raw_app_meta_data,
  aud,
  role
) VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '00000000-0000-0000-0000-000000000000',
    'alice@example.com',
    crypt('password123', gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"full_name": "Alice Anderson"}'::jsonb,
    '{}'::jsonb,
    'authenticated',
    'authenticated'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '00000000-0000-0000-0000-000000000000',
    'bob@example.com',
    crypt('password123', gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"full_name": "Bob Builder"}'::jsonb,
    '{}'::jsonb,
    'authenticated',
    'authenticated'
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '00000000-0000-0000-0000-000000000000',
    'charlie@example.com',
    crypt('password123', gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"full_name": "Charlie Chen"}'::jsonb,
    '{}'::jsonb,
    'authenticated',
    'authenticated'
  );

-- ========================================
-- Create Tenants
-- ========================================

-- Personal workspaces
INSERT INTO copilot_internal.tenants (id, name, slug, type, owner_id, plan) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Alice''s Workspace', 'alice-personal', 'personal', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'free'),
  ('22222222-2222-2222-2222-222222222222', 'Bob''s Workspace', 'bob-personal', 'personal', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'free'),
  ('33333333-3333-3333-3333-333333333333', 'Charlie''s Workspace', 'charlie-personal', 'personal', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'free');

-- Team workspaces
INSERT INTO copilot_internal.tenants (id, name, slug, type, owner_id, plan) VALUES
  ('aaaacccc-1111-2222-3333-444444444444', 'Acme Corp', 'acme-corp', 'team', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pro'),
  ('bbbbeee0-5555-6666-7777-888888888888', 'Startup XYZ', 'startup-xyz', 'team', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'pro');

-- ========================================
-- Create Memberships
-- ========================================

-- Personal workspace memberships (owners)
INSERT INTO copilot_internal.tenant_memberships (tenant_id, user_id, role, status, joined_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner', 'active', NOW()),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner', 'active', NOW()),
  ('33333333-3333-3333-3333-333333333333', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'owner', 'active', NOW());

-- Acme Corp memberships (Alice owner, Bob member)
INSERT INTO copilot_internal.tenant_memberships (tenant_id, user_id, role, status, joined_at) VALUES
  ('aaaacccc-1111-2222-3333-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner', 'active', NOW()),
  ('aaaacccc-1111-2222-3333-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member', 'active', NOW());

-- Startup XYZ memberships (Charlie owner, Alice admin)
INSERT INTO copilot_internal.tenant_memberships (tenant_id, user_id, role, status, joined_at) VALUES
  ('bbbbeee0-5555-6666-7777-888888888888', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'owner', 'active', NOW()),
  ('bbbbeee0-5555-6666-7777-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin', 'active', NOW());

-- ========================================
-- Set Active Tenants
-- ========================================

INSERT INTO copilot_internal.user_preferences (user_id, active_tenant_id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'), -- Alice -> Personal
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222'), -- Bob -> Personal
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '33333333-3333-3333-3333-333333333333'); -- Charlie -> Personal

-- ========================================
-- Create Sample Conversations
-- ========================================

-- Alice's personal workspace conversations
INSERT INTO copilot_internal.conversations (id, tenant_id, user_id, title, created_at) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice Personal Project 1', NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice Personal Project 2', NOW() - INTERVAL '1 day');

-- Bob's personal workspace conversations
INSERT INTO copilot_internal.conversations (id, tenant_id, user_id, title, created_at) VALUES
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Bob Personal Notes', NOW() - INTERVAL '3 days');

-- Charlie's personal workspace conversations
INSERT INTO copilot_internal.conversations (id, tenant_id, user_id, title, created_at) VALUES
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Charlie Ideas', NOW() - INTERVAL '1 day');

-- Acme Corp conversations (Alice and Bob)
INSERT INTO copilot_internal.conversations (id, tenant_id, user_id, title, created_at) VALUES
  (gen_random_uuid(), 'aaaacccc-1111-2222-3333-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Acme Corp Q1 Strategy', NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), 'aaaacccc-1111-2222-3333-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Acme Corp Product Roadmap', NOW() - INTERVAL '4 days'),
  (gen_random_uuid(), 'aaaacccc-1111-2222-3333-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Acme Corp Team Meeting Notes', NOW() - INTERVAL '1 day');

-- Startup XYZ conversations (Charlie and Alice)
INSERT INTO copilot_internal.conversations (id, tenant_id, user_id, title, created_at) VALUES
  (gen_random_uuid(), 'bbbbeee0-5555-6666-7777-888888888888', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Startup XYZ MVP Features', NOW() - INTERVAL '6 days'),
  (gen_random_uuid(), 'bbbbeee0-5555-6666-7777-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Startup XYZ Investor Pitch', NOW() - INTERVAL '2 days');

-- ========================================
-- Verification
-- ========================================

-- Count users
SELECT 'Users created:' AS metric, COUNT(*)::text AS value
FROM auth.users
WHERE email IN ('alice@example.com', 'bob@example.com', 'charlie@example.com');

-- Count tenants
SELECT 'Tenants created:' AS metric, COUNT(*)::text AS value
FROM copilot_internal.tenants
WHERE slug IN ('alice-personal', 'bob-personal', 'charlie-personal', 'acme-corp', 'startup-xyz');

-- Count memberships
SELECT 'Memberships created:' AS metric, COUNT(*)::text AS value
FROM copilot_internal.tenant_memberships
WHERE tenant_id IN (SELECT id FROM copilot_internal.tenants WHERE slug IN ('alice-personal', 'bob-personal', 'charlie-personal', 'acme-corp', 'startup-xyz'));

-- Show Alice's tenants
SELECT 'Alice''s Tenants:' AS info;
SELECT t.name, tm.role, (up.active_tenant_id = t.id) AS is_active
FROM copilot_internal.tenants t
JOIN copilot_internal.tenant_memberships tm ON tm.tenant_id = t.id
LEFT JOIN copilot_internal.user_preferences up ON up.user_id = tm.user_id
WHERE tm.user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
ORDER BY is_active DESC, t.name;

-- Show Bob's tenants
SELECT 'Bob''s Tenants:' AS info;
SELECT t.name, tm.role, (up.active_tenant_id = t.id) AS is_active
FROM copilot_internal.tenants t
JOIN copilot_internal.tenant_memberships tm ON tm.tenant_id = t.id
LEFT JOIN copilot_internal.user_preferences up ON up.user_id = tm.user_id
WHERE tm.user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
ORDER BY is_active DESC, t.name;

-- Show Charlie's tenants
SELECT 'Charlie''s Tenants:' AS info;
SELECT t.name, tm.role, (up.active_tenant_id = t.id) AS is_active
FROM copilot_internal.tenants t
JOIN copilot_internal.tenant_memberships tm ON tm.tenant_id = t.id
LEFT JOIN copilot_internal.user_preferences up ON up.user_id = tm.user_id
WHERE tm.user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
ORDER BY is_active DESC, t.name;

-- Count conversations per tenant
SELECT t.name, COUNT(c.id) AS conversation_count
FROM copilot_internal.tenants t
LEFT JOIN copilot_internal.conversations c ON c.tenant_id = t.id
WHERE t.slug IN ('alice-personal', 'bob-personal', 'charlie-personal', 'acme-corp', 'startup-xyz')
GROUP BY t.name
ORDER BY t.name;

\echo ''
\echo '========================================='
\echo 'Seed data created successfully!'
\echo '========================================='
\echo ''
\echo 'Test credentials:'
\echo '  alice@example.com / password123'
\echo '  bob@example.com / password123'
\echo '  charlie@example.com / password123'
\echo ''
\echo 'Alice has access to:'
\echo '  - Alice''s Workspace (personal)'
\echo '  - Acme Corp (owner)'
\echo '  - Startup XYZ (admin)'
\echo ''
\echo 'Bob has access to:'
\echo '  - Bob''s Workspace (personal)'
\echo '  - Acme Corp (member)'
\echo ''
\echo 'Charlie has access to:'
\echo '  - Charlie''s Workspace (personal)'
\echo '  - Startup XYZ (owner)'
\echo ''
```

**Run the seed script**:

```bash
psql postgresql://postgres:postgres@localhost:54322/postgres < scripts/seed_multi_tenant_demo.sql
```

**Deliverable**: ✅ Seed data loaded successfully

#### Task 5.2: End-to-End Acceptance Test (2-3 hours)

**Test Script**:

```markdown
# Multi-Tenant Acceptance Test

## Setup
1. ✅ Seed data loaded
2. ✅ Dev server running (npm run dev)
3. ✅ Browser open to localhost:3000

## Test 1: Alice Login and Tenant Switching

### Step 1.1: Login as Alice
- Go to http://localhost:3000/login
- Email: alice@example.com
- Password: password123
- Click "Sign In"
- **Expected**: Redirected to home page

### Step 1.2: Verify Alice's Tenants
- Look at tenant switcher dropdown in header
- **Expected**: Shows 3 tenants:
  - Alice's Workspace ✓ (active)
  - Acme Corp
  - Startup XYZ

### Step 1.3: Verify Personal Workspace Data
- Check conversations list
- **Expected**: Shows 2 conversations:
  - Alice Personal Project 1
  - Alice Personal Project 2

### Step 1.4: Switch to Acme Corp
- Click tenant dropdown
- Select "Acme Corp"
- Wait for page reload
- **Expected**:
  - Page reloads
  - Tenant dropdown now shows "Acme Corp ✓"
  - Conversations list shows 3 conversations:
    - Acme Corp Q1 Strategy (Alice)
    - Acme Corp Product Roadmap (Bob)
    - Acme Corp Team Meeting Notes (Alice)

### Step 1.5: Switch to Startup XYZ
- Click tenant dropdown
- Select "Startup XYZ"
- Wait for page reload
- **Expected**:
  - Page reloads
  - Tenant dropdown shows "Startup XYZ ✓"
  - Conversations list shows 2 conversations:
    - Startup XYZ MVP Features (Charlie)
    - Startup XYZ Investor Pitch (Alice)

### Step 1.6: Verify Isolation
- **Expected**: Alice cannot see:
  - Bob's personal workspace
  - Charlie's personal workspace

## Test 2: Bob Login and Tenant Switching

### Step 2.1: Logout and Login as Bob
- Click user menu → Logout
- Login with bob@example.com / password123
- **Expected**: Logged in successfully

### Step 2.2: Verify Bob's Tenants
- Check tenant dropdown
- **Expected**: Shows 2 tenants:
  - Bob's Workspace ✓ (active)
  - Acme Corp

### Step 2.3: Verify Personal Workspace
- **Expected**: Shows 1 conversation:
  - Bob Personal Notes

### Step 2.4: Switch to Acme Corp
- Select "Acme Corp" from dropdown
- **Expected**: Shows same 3 Acme Corp conversations as Alice saw

### Step 2.5: Verify Isolation
- **Expected**: Bob cannot see:
  - Alice's personal workspace
  - Charlie's personal workspace
  - Startup XYZ (not a member)

## Test 3: Charlie Login

### Step 3.1: Login as Charlie
- Logout
- Login with charlie@example.com / password123

### Step 3.2: Verify Charlie's Tenants
- **Expected**: Shows 2 tenants:
  - Charlie's Workspace ✓
  - Startup XYZ

### Step 3.3: Verify No Access to Acme Corp
- **Expected**: Charlie does NOT see Acme Corp in dropdown

## Test 4: Data Isolation Verification

### Step 4.1: Create Conversation in Personal Workspace
- Login as Alice
- Select "Alice's Workspace"
- Create new conversation: "Test Personal Conversation"
- **Expected**: Conversation created

### Step 4.2: Verify Not Visible to Others
- Logout, login as Bob
- Check Bob's conversations
- **Expected**: Does NOT see "Test Personal Conversation"

### Step 4.3: Create Conversation in Shared Workspace
- Still as Bob
- Switch to "Acme Corp"
- Create new conversation: "Bob's Acme Conversation"
- **Expected**: Conversation created

### Step 4.4: Verify Visible to Team Members
- Logout, login as Alice
- Switch to "Acme Corp"
- **Expected**: DOES see "Bob's Acme Conversation"

## Test 5: Create New Workspace (if implemented)

### Step 5.1: Create Team Workspace
- Login as Alice
- Click "+ New Workspace"
- Enter:
  - Name: "Test Team"
  - Slug: "test-team"
  - Type: team
- Click "Create"
- **Expected**: Workspace created, auto-switched to it

### Step 5.2: Verify in Tenant List
- Check dropdown
- **Expected**: Shows "Test Team ✓" as active

## Success Criteria

ALL tests above must pass:
- ✅ Users can log in
- ✅ Users see correct tenants in dropdown
- ✅ Switching tenants updates data
- ✅ Data properly isolated per tenant
- ✅ Team members see shared data
- ✅ Personal workspaces are private
- ✅ New workspaces can be created

If ALL pass: 🎉 **IMPLEMENTATION SUCCESSFUL**
```

**Execute the test script** and document results.

**Deliverable**: ✅ All acceptance tests passing

#### Task 5.3: Performance Testing (1 hour)

```bash
# Test 1: Login Performance
# - Time from login submit to home page load
# - Target: <2 seconds

# Test 2: Tenant Switching Performance
# - Time from dropdown selection to data reload
# - Target: <1 second

# Test 3: API Response Times
# - Test /api/conversations with different tenant sizes
# - Target: <500ms for typical data sets

# Test 4: Concurrent Users
# - Open 3 browser tabs, login as different users
# - All should work simultaneously
# - No session conflicts

# Document results
```

**Deliverable**: ✅ Performance acceptable

### Phase 5 Exit Criteria

- ✅ Seed data script created
- ✅ Seed data loaded successfully
- ✅ All acceptance tests passing
- ✅ Performance tests passing
- ✅ No critical bugs
- ✅ Ready for deployment

**Estimated Time**: 6-8 hours

---

## Phase 6: Deployment (Day 21-23)

### Objective
Deploy to production safely with monitoring.

### Tasks

#### Task 6.1: Pre-Deployment Checklist (1 hour)

```markdown
## Pre-Deployment Checklist

### Code Review
- ✅ All 31 API routes updated
- ✅ No SUPABASE_DEMO_TENANT_ID references in code
- ✅ All UI components implemented
- ✅ All tests passing
- ✅ No console errors
- ✅ Code reviewed

### Database
- ✅ Migrations tested in local
- ✅ Migrations tested in staging
- ✅ Backfill script tested
- ✅ RLS policies active
- ✅ Indexes created

### Documentation
- ✅ Architecture doc complete
- ✅ Implementation plan complete
- ✅ Seed data script documented
- ✅ Deployment guide ready

### Environment Variables
- ✅ Production .env configured
- ✅ SUPABASE_DEMO_TENANT_ID removed
- ✅ NEXTAUTH_SECRET set
- ✅ Supabase keys configured
```

**Deliverable**: ✅ All pre-deployment checks pass

#### Task 6.2: Staging Deployment (2-3 hours)

```bash
# Deploy database to staging
supabase db push --linked-project staging

# Deploy application to staging
vercel deploy --preview

# Run seed data in staging
psql $STAGING_DATABASE_URL < scripts/seed_multi_tenant_demo.sql

# Test in staging
# - Run full acceptance test
# - Verify no errors
# - Check performance

# Monitor for 2 hours
# - No errors in logs
# - Performance acceptable
# - All features working
```

**Deliverable**: ✅ Staging deployment successful

#### Task 6.3: Production Deployment (2 hours)

```bash
# Backup production database
pg_dump $PRODUCTION_DATABASE_URL > backup_before_multi_tenant.sql

# Apply migrations
supabase db push --linked-project production

# Verify migrations
psql $PRODUCTION_DATABASE_URL -c "\dt copilot_internal.tenant*"

# Deploy application
vercel deploy --prod

# Load seed data (optional, for demo)
# psql $PRODUCTION_DATABASE_URL < scripts/seed_multi_tenant_demo.sql

# Monitor logs
vercel logs --prod --follow
```

**Deliverable**: ✅ Production deployment successful

#### Task 6.4: Post-Deployment Validation (4 hours)

```bash
# Test 1: Login with production user
# - Should work
# - Personal tenant created if needed

# Test 2: Check logs for errors
# - No "missing tenant_id" errors
# - No 401 unauthorized errors (unless legitimate)

# Test 3: Verify database
psql $PRODUCTION_DATABASE_URL

# Count tenants created
SELECT COUNT(*) FROM copilot_internal.tenants;

# Count active memberships
SELECT COUNT(*) FROM copilot_internal.tenant_memberships WHERE status = 'active';

# Test 4: Performance monitoring
# - API response times normal
# - No degradation vs baseline

# Test 5: User feedback
# - Monitor support tickets
# - Check for tenant-related issues
```

**Deliverable**: ✅ Production validated, no critical issues

### Phase 6 Exit Criteria

- ✅ Staging deployment successful
- ✅ Production deployment successful
- ✅ All migrations applied
- ✅ No errors in logs
- ✅ User testing successful
- ✅ Performance acceptable
- ✅ Monitoring in place

**Estimated Time**: 8-10 hours

---

## Appendix: Complete Code Examples

### A1: Supabase Client Utilities

```typescript
// apps/demo-web/src/lib/supabase/client.ts

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### A2: Example API Route (Complete)

See Phase 3, Task 3.2 for complete `/api/conversations/route.ts`

### A3: Environment Variables Template

```bash
# apps/demo-web/.env.local

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# NextAuth
NEXTAUTH_SECRET=your-secret-here
NEXTAUTH_URL=http://localhost:3000

# Redis (optional, for distributed caching)
REDIS_URL=redis://localhost:6379

# REMOVED (security vulnerability fixed):
# SUPABASE_DEMO_TENANT_ID=...
```

---

## Summary

**Total Estimated Time**: 3-4 weeks (with team of 1-2 developers)

**Phase Breakdown**:
- Phase 0: Preparation (4 hours)
- Phase 1: Database (3-4 hours)
- Phase 2: Authentication (6-8 hours)
- Phase 3: API Routes (8-12 hours)
- Phase 4: UI Components (10-12 hours)
- Phase 5: Seed Data & Testing (6-8 hours)
- Phase 6: Deployment (8-10 hours)

**Success Metric**: Seed data loaded, UI working, tenant switching functional.

**Final Test**:
```bash
# Run seed data
psql < scripts/seed_multi_tenant_demo.sql

# Start app
npm run dev

# Test
# 1. Login as alice@example.com
# 2. See 3 workspaces in dropdown
# 3. Switch between them
# 4. See different data in each
# 5. ✅ SUCCESS!
```

---

**End of Implementation Plan**

This plan provides a complete roadmap from current state to fully functional multi-tenant architecture with UI-based tenant switching.
