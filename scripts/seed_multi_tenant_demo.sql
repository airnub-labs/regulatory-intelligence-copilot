-- ========================================
-- Multi-Tenant Demo Seed Data
-- ========================================
-- Creates 3 users with multiple tenant memberships
-- Demonstrates full multi-tenant functionality
--
-- Test credentials:
--   alice@example.com / password123
--   bob@example.com / password123
--   charlie@example.com / password123
--
-- Alice has access to:
--   - Alice's Workspace (personal)
--   - Acme Corp (owner)
--   - Startup XYZ (admin)
--
-- Bob has access to:
--   - Bob's Workspace (personal)
--   - Acme Corp (member)
--
-- Charlie has access to:
--   - Charlie's Workspace (personal)
--   - Startup XYZ (owner)
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
