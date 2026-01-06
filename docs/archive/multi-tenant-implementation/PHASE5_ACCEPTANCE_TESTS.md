# Phase 5: Multi-Tenant Acceptance Tests

**Date**: 2026-01-06
**Status**: Test Specification
**Phase**: Phase 5 - Seed Data & Testing

---

## Overview

This document provides comprehensive acceptance tests for the multi-tenant architecture implementation. These tests validate workspace isolation, user permissions, workspace switching, and team collaboration features.

---

## Prerequisites

### 1. Database Setup

```bash
# Apply seed data
psql -h localhost -U postgres -d postgres -f scripts/seed_multi_tenant_demo.sql
```

### 2. Test Accounts

| User | Email | Password | Workspaces |
|------|-------|----------|------------|
| Alice | alice@example.com | password123 | Alice's Workspace (personal), Acme Corp (owner), Startup XYZ (admin) |
| Bob | bob@example.com | password123 | Bob's Workspace (personal), Acme Corp (member) |
| Charlie | charlie@example.com | password123 | Charlie's Workspace (personal), Startup XYZ (owner) |

### 3. Test Environment

```bash
# Start development server
npm run dev

# Application should be running at http://localhost:3000
```

---

## Test Suite 1: User Authentication & Workspace Access

### Test 1.1: Login as Alice

**Objective**: Verify Alice can log in and sees her default workspace

**Steps**:
1. Navigate to http://localhost:3000/login
2. Enter email: `alice@example.com`
3. Enter password: `password123`
4. Click "Sign In"

**Expected Results**:
- ✅ Successfully authenticated
- ✅ Redirected to main chat page
- ✅ Header shows "Alice's Workspace" in tenant switcher
- ✅ Conversations list shows only Alice's personal conversations:
  - "Alice Personal Project 1"
  - "Alice Personal Project 2"
- ✅ No conversations from other workspaces visible

### Test 1.2: Login as Bob

**Objective**: Verify Bob can log in and sees his default workspace

**Steps**:
1. Sign out if currently signed in
2. Navigate to http://localhost:3000/login
3. Enter email: `bob@example.com`
4. Enter password: `password123`
5. Click "Sign In"

**Expected Results**:
- ✅ Successfully authenticated
- ✅ Header shows "Bob's Workspace" in tenant switcher
- ✅ Conversations list shows only Bob's personal conversation:
  - "Bob Personal Notes"
- ✅ No access to Alice's or Charlie's data

### Test 1.3: Login as Charlie

**Objective**: Verify Charlie can log in and sees his default workspace

**Steps**:
1. Sign out if currently signed in
2. Navigate to http://localhost:3000/login
3. Enter email: `charlie@example.com`
4. Enter password: `password123`
5. Click "Sign In"

**Expected Results**:
- ✅ Successfully authenticated
- ✅ Header shows "Charlie's Workspace" in tenant switcher
- ✅ Conversations list shows only Charlie's personal conversation:
  - "Charlie Ideas"

---

## Test Suite 2: Workspace Switching

### Test 2.1: Alice Switches to Acme Corp

**Objective**: Verify workspace switching updates data visibility

**Setup**: Login as Alice (alice@example.com)

**Steps**:
1. Click on tenant switcher dropdown (shows "Alice's Workspace")
2. Verify dropdown shows all Alice's workspaces:
   - ✅ Alice's Workspace (👤 Personal, Owner) - Active
   - ✅ Acme Corp (👥 Team, Owner)
   - ✅ Startup XYZ (👥 Team, Admin)
3. Click "Acme Corp"
4. Wait for page reload

**Expected Results**:
- ✅ Page reloads automatically
- ✅ Header shows "Acme Corp" in tenant switcher
- ✅ Conversations list shows only Acme Corp conversations:
  - "Acme Corp Q1 Strategy" (by Alice)
  - "Acme Corp Product Roadmap" (by Bob)
  - "Acme Corp Team Meeting Notes" (by Alice)
- ✅ Alice's personal conversations no longer visible
- ✅ URL remains at /

### Test 2.2: Alice Switches to Startup XYZ

**Objective**: Verify switching between team workspaces

**Setup**: Alice currently viewing Acme Corp workspace

**Steps**:
1. Click tenant switcher dropdown
2. Click "Startup XYZ"
3. Wait for page reload

**Expected Results**:
- ✅ Header shows "Startup XYZ" in tenant switcher
- ✅ Conversations list shows only Startup XYZ conversations:
  - "Startup XYZ MVP Features" (by Charlie)
  - "Startup XYZ Investor Pitch" (by Alice)
- ✅ No Acme Corp conversations visible
- ✅ No personal workspace conversations visible

### Test 2.3: Alice Switches Back to Personal Workspace

**Objective**: Verify switching back to personal workspace

**Steps**:
1. Click tenant switcher dropdown
2. Click "Alice's Workspace"
3. Wait for page reload

**Expected Results**:
- ✅ Header shows "Alice's Workspace"
- ✅ Back to original personal conversations
- ✅ No team workspace conversations visible

### Test 2.4: Bob Switches to Acme Corp

**Objective**: Verify Bob (member role) can switch to team workspace

**Setup**: Login as Bob (bob@example.com)

**Steps**:
1. Click tenant switcher dropdown
2. Verify dropdown shows:
   - ✅ Bob's Workspace (👤 Personal, Owner) - Active
   - ✅ Acme Corp (👥 Team, Member)
3. Click "Acme Corp"
4. Wait for page reload

**Expected Results**:
- ✅ Header shows "Acme Corp"
- ✅ Sees same Acme Corp conversations as Alice
- ✅ Can view conversations created by Alice
- ✅ No access to Startup XYZ (not a member)

---

## Test Suite 3: Workspace Creation

### Test 3.1: Create Team Workspace

**Objective**: Verify new workspace creation flow

**Setup**: Login as Alice

**Steps**:
1. Click tenant switcher dropdown
2. Click "Create Workspace" button at bottom of dropdown
3. Modal opens
4. Enter workspace name: `Test Company`
5. Observe auto-generated slug: `test-company`
6. Select workspace type: "Team"
7. Click "Create Workspace"
8. Wait for creation and page reload

**Expected Results**:
- ✅ Modal shows loading state while creating
- ✅ Page reloads after creation
- ✅ Automatically switched to new workspace
- ✅ Header shows "Test Company"
- ✅ Conversations list is empty (new workspace)
- ✅ Tenant switcher dropdown now includes "Test Company"

### Test 3.2: Create Enterprise Workspace

**Objective**: Verify enterprise workspace creation

**Setup**: Login as Bob

**Steps**:
1. Click tenant switcher dropdown
2. Click "Create Workspace"
3. Enter workspace name: `Big Enterprise Inc`
4. Verify slug: `big-enterprise-inc`
5. Select workspace type: "Enterprise"
6. Click "Create Workspace"

**Expected Results**:
- ✅ Workspace created successfully
- ✅ Automatically switched to new workspace
- ✅ Workspace type is "Enterprise" (verify in Team settings)
- ✅ Plan is set to "enterprise" (verify in database)

### Test 3.3: Custom Slug Override

**Objective**: Verify manual slug editing works

**Steps**:
1. Open create workspace modal
2. Enter name: `My Awesome Team!!!`
3. Auto-generated slug shows: `my-awesome-team`
4. Manually edit slug to: `awesome-team-2024`
5. Click "Create Workspace"

**Expected Results**:
- ✅ Workspace created with custom slug
- ✅ URL slug matches custom value
- ✅ Workspace accessible via custom slug

### Test 3.4: Validation - Empty Name

**Objective**: Verify form validation prevents empty names

**Steps**:
1. Open create workspace modal
2. Leave name field empty
3. Attempt to click "Create Workspace"

**Expected Results**:
- ✅ "Create Workspace" button is disabled
- ✅ Cannot submit form with empty name

---

## Test Suite 4: Team Members Page

### Test 4.1: View Personal Workspace Members

**Objective**: Verify team members page shows owner for personal workspace

**Setup**: Login as Alice, switch to "Alice's Workspace"

**Steps**:
1. Click "Team" in sidebar navigation
2. Navigate to /settings/team

**Expected Results**:
- ✅ Page loads successfully
- ✅ Shows "Team Settings" header
- ✅ Shows workspace name: "Alice's Workspace"
- ✅ Shows workspace type: "Personal"
- ✅ Shows 1 team member:
  - Email: alice@example.com
  - Role: Owner (with shield icon)
  - Status: Active (green badge)
  - Join date: Today's date
- ✅ "Back to Chat" button navigates to /

### Test 4.2: View Team Workspace Members (Acme Corp)

**Objective**: Verify team members list for multi-member workspace

**Setup**: Login as Alice, switch to "Acme Corp"

**Steps**:
1. Click "Team" in sidebar
2. View team members page

**Expected Results**:
- ✅ Shows workspace name: "Acme Corp"
- ✅ Shows workspace type: "Team"
- ✅ Shows 2 team members:
  - **Alice Anderson** (alice@example.com)
    - Role: Owner
    - Status: Active
  - **Bob Builder** (bob@example.com)
    - Role: Member
    - Status: Active
- ✅ Total members: 2
- ✅ Active members: 2

### Test 4.3: View Team Members as Member Role

**Objective**: Verify member role can view team members

**Setup**: Login as Bob, switch to "Acme Corp"

**Steps**:
1. Navigate to /settings/team
2. View team members list

**Expected Results**:
- ✅ Bob can view all team members
- ✅ Sees same member list as Alice
- ✅ No edit capabilities (viewing only)

### Test 4.4: Team Members Isolation

**Objective**: Verify team members are isolated per workspace

**Setup**: Login as Charlie, switch to "Startup XYZ"

**Steps**:
1. Navigate to /settings/team
2. View team members

**Expected Results**:
- ✅ Shows only Startup XYZ members:
  - Charlie Chen (owner)
  - Alice Anderson (admin)
- ✅ Does NOT show Bob (he's not in Startup XYZ)
- ✅ Shows 2 total members
- ✅ Shows workspace type: "Team"

---

## Test Suite 5: Data Isolation & RLS

### Test 5.1: Conversation Isolation

**Objective**: Verify users cannot see conversations from workspaces they don't belong to

**Test Steps**:

1. **As Alice**:
   - Login as alice@example.com
   - Switch to "Alice's Workspace"
   - Note conversation count (should be 2)

2. **As Bob**:
   - Login as bob@example.com
   - Switch to "Bob's Workspace"
   - Should NOT see Alice's personal conversations
   - Should see only Bob's conversation (1 total)

3. **As Charlie**:
   - Login as charlie@example.com
   - Switch to "Charlie's Workspace"
   - Should NOT see Alice's or Bob's personal conversations
   - Should see only Charlie's conversation (1 total)

**Expected Results**:
- ✅ Each user sees ONLY their own personal workspace conversations
- ✅ No cross-workspace data leakage
- ✅ Database RLS policies enforcing isolation

### Test 5.2: Team Workspace Access Control

**Objective**: Verify team workspace access is membership-based

**Test Steps**:

1. **Charlie attempts to access Acme Corp**:
   - Login as charlie@example.com
   - Open tenant switcher
   - Verify "Acme Corp" is NOT in the dropdown
   - Charlie should have no way to access Acme Corp data

2. **Bob attempts to access Startup XYZ**:
   - Login as bob@example.com
   - Open tenant switcher
   - Verify "Startup XYZ" is NOT in dropdown
   - Bob should have no way to access Startup XYZ data

**Expected Results**:
- ✅ Users only see workspaces they're members of
- ✅ No unauthorized workspace access possible
- ✅ Tenant switcher dropdown filters by membership

### Test 5.3: Create Conversation in Different Workspaces

**Objective**: Verify new conversations are correctly scoped to active tenant

**Setup**: Login as Alice

**Test Steps**:

1. Switch to "Alice's Workspace" (personal)
2. Create new conversation: "Personal Task 1"
3. Verify it appears in conversation list
4. Switch to "Acme Corp"
5. Verify "Personal Task 1" is NOT visible in Acme Corp
6. Create new conversation: "Acme Q2 Planning"
7. Verify it appears in Acme Corp conversation list
8. Switch back to "Alice's Workspace"
9. Verify "Acme Q2 Planning" is NOT visible in personal workspace

**Expected Results**:
- ✅ Conversations are correctly scoped to tenant_id
- ✅ Switching workspaces shows only relevant conversations
- ✅ No conversation leakage between workspaces

---

## Test Suite 6: API Security

### Test 6.1: Verify API Routes Require Authentication

**Objective**: Ensure all API routes require valid session

**Test Steps**:

```bash
# Test without authentication
curl http://localhost:3000/api/conversations \
  -H "Content-Type: application/json"

# Expected: 401 Unauthorized or redirect to login
```

**Expected Results**:
- ✅ Returns 401 Unauthorized
- ✅ No data returned without valid session

### Test 6.2: Verify Tenant Context in API Calls

**Objective**: Ensure API routes respect active tenant

**Manual Test**:
1. Login as Alice
2. Switch to "Acme Corp"
3. Open browser DevTools → Network tab
4. Create new conversation
5. Inspect POST /api/conversations request
6. Verify conversation created with Acme Corp tenant_id

**Expected Results**:
- ✅ Conversation has correct tenant_id
- ✅ getTenantContext() correctly identifies active tenant
- ✅ RLS policies enforce tenant scoping

---

## Test Suite 7: Edge Cases & Error Handling

### Test 7.1: Switch Tenant While Creating Conversation

**Objective**: Verify graceful handling of race conditions

**Steps**:
1. Login as Alice
2. Start typing new conversation
3. Quickly switch to different workspace
4. Observe behavior

**Expected Results**:
- ✅ Page reloads after tenant switch
- ✅ Draft conversation is lost (expected behavior)
- ✅ No data corruption
- ✅ User lands in correct workspace

### Test 7.2: Access Workspace After Membership Removed

**Objective**: Verify access is revoked when membership is removed

**Database Setup**:
```sql
-- Remove Bob from Acme Corp
UPDATE copilot_internal.tenant_memberships
SET status = 'removed'
WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  AND tenant_id = (SELECT id FROM copilot_internal.tenants WHERE slug = 'acme-corp');
```

**Test Steps**:
1. Login as Bob
2. Refresh page
3. Open tenant switcher

**Expected Results**:
- ✅ Acme Corp no longer appears in dropdown
- ✅ If Bob was on Acme Corp workspace, auto-switched to personal workspace
- ✅ No access to Acme Corp data

### Test 7.3: Create Workspace with Duplicate Slug

**Objective**: Verify unique slug constraint is enforced

**Steps**:
1. Login as Alice
2. Create workspace modal
3. Enter name: "Acme Corp" (duplicate)
4. Slug auto-generates to: "acme-corp" (already exists)
5. Attempt to create

**Expected Results**:
- ✅ Error message shown: "Workspace slug already exists"
- ✅ Creation fails gracefully
- ✅ User can edit slug to resolve conflict

---

## Test Suite 8: Performance & UX

### Test 8.1: Workspace Switching Speed

**Objective**: Verify workspace switching is performant

**Steps**:
1. Login as Alice
2. Switch between workspaces rapidly
3. Measure time to complete switch

**Expected Results**:
- ✅ Switch completes in < 2 seconds
- ✅ Page reload is smooth
- ✅ No flickering or broken states
- ✅ All data loads correctly after switch

### Test 8.2: Large Workspace Member List

**Objective**: Verify team page handles many members

**Database Setup**:
```sql
-- Add 50 members to Acme Corp (for load testing)
-- Run scripts/test_large_membership.sql
```

**Steps**:
1. Navigate to /settings/team for Acme Corp
2. Observe rendering performance

**Expected Results**:
- ✅ Page loads in < 1 second
- ✅ All members render correctly
- ✅ No pagination needed for < 100 members
- ✅ Scrolling is smooth

---

## Test Suite 9: Database Verification

### Test 9.1: Verify RLS Policies Active

**SQL Verification**:
```sql
-- Run verification script
\i scripts/verify_rls_policies.sql
```

**Expected Results**:
- ✅ All tables have RLS enabled
- ✅ Policies exist for SELECT, INSERT, UPDATE, DELETE
- ✅ Tenant context function works correctly

### Test 9.2: Verify Tenant Isolation at DB Level

**SQL Test**:
```sql
-- Set session as Alice in Acme Corp workspace
SELECT set_config('app.current_user_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
SELECT set_config('app.current_tenant_id', 'aaaacccc-1111-2222-3333-444444444444', false);

-- Query conversations
SELECT COUNT(*) FROM copilot_internal.conversations;
-- Should return 3 (only Acme Corp conversations)

-- Switch to Alice's personal workspace
SELECT set_config('app.current_tenant_id', '11111111-1111-1111-1111-111111111111', false);

-- Query conversations again
SELECT COUNT(*) FROM copilot_internal.conversations;
-- Should return 2 (only Alice's personal conversations)
```

**Expected Results**:
- ✅ Different tenant contexts return different data
- ✅ No way to bypass RLS at database level
- ✅ Policies enforce strict isolation

---

## Regression Tests

### After Each Code Change:

1. **Smoke Test**:
   - Login as Alice ✅
   - Switch between 3 workspaces ✅
   - Create new conversation in each ✅
   - Verify data isolation ✅

2. **Security Test**:
   - Verify RLS policies still active ✅
   - Verify API authentication required ✅
   - Verify tenant context enforced ✅

3. **UI Test**:
   - Tenant switcher displays correctly ✅
   - Team members page loads ✅
   - Workspace creation modal works ✅

---

## Success Criteria

All tests must pass for Phase 5 to be considered complete:

- [x] **Authentication**: All 3 users can log in
- [x] **Workspace Access**: Users see correct workspaces in dropdown
- [x] **Workspace Switching**: Switching updates data visibility correctly
- [x] **Workspace Creation**: New workspaces can be created
- [x] **Team Members**: Team page shows correct members per workspace
- [x] **Data Isolation**: No cross-workspace data leakage
- [x] **API Security**: All routes require authentication and respect tenant context
- [x] **RLS Enforcement**: Database policies enforce isolation
- [x] **Error Handling**: Edge cases handled gracefully
- [x] **Performance**: Switching and navigation is responsive

---

## Appendix: Manual Database Queries for Verification

### Check User's Workspaces
```sql
SELECT
  t.name,
  tm.role,
  tm.status,
  (up.current_tenant_id = t.id) AS is_active
FROM copilot_internal.tenants t
JOIN copilot_internal.tenant_memberships tm ON tm.tenant_id = t.id
LEFT JOIN copilot_internal.user_preferences up ON up.user_id = tm.user_id
WHERE tm.user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' -- Alice
ORDER BY is_active DESC, t.name;
```

### Check Conversation Distribution
```sql
SELECT
  t.name AS workspace,
  u.email AS creator,
  COUNT(c.id) AS conversation_count
FROM copilot_internal.conversations c
JOIN copilot_internal.tenants t ON t.id = c.tenant_id
JOIN auth.users u ON u.id = c.user_id
WHERE t.slug IN ('alice-personal', 'bob-personal', 'charlie-personal', 'acme-corp', 'startup-xyz')
GROUP BY t.name, u.email
ORDER BY t.name, u.email;
```

### Verify RLS Policies Enabled
```sql
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'copilot_internal'
ORDER BY tablename;
```

---

**Test Report Template**: Use this template to document test execution results:

```
Test Execution Report
=====================
Date: ___________
Tester: ___________
Environment: ___________

Test Suite 1: User Authentication - [ ] Pass / [ ] Fail
Test Suite 2: Workspace Switching - [ ] Pass / [ ] Fail
Test Suite 3: Workspace Creation - [ ] Pass / [ ] Fail
Test Suite 4: Team Members Page - [ ] Pass / [ ] Fail
Test Suite 5: Data Isolation - [ ] Pass / [ ] Fail
Test Suite 6: API Security - [ ] Pass / [ ] Fail
Test Suite 7: Edge Cases - [ ] Pass / [ ] Fail
Test Suite 8: Performance - [ ] Pass / [ ] Fail
Test Suite 9: Database Verification - [ ] Pass / [ ] Fail

Issues Found:
1. ___________
2. ___________

Overall Status: [ ] All Tests Pass / [ ] Some Failures
```

---

**End of Acceptance Tests**
