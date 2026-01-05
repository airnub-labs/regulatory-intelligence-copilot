-- ========================================
-- Backfill Personal Tenants for Existing Users
-- ========================================
-- Date: 2026-01-05
-- Purpose: Create personal tenants for all existing users
--
-- IMPORTANT: Run this AFTER 20260105000000_multi_tenant_user_model.sql
--
-- This migration:
-- 1. Creates a personal tenant for each existing user
-- 2. Adds the user as owner of their personal tenant
-- 3. Sets the personal tenant as their active tenant
-- 4. Preserves existing data relationships
-- ========================================

DO $$
DECLARE
    v_user RECORD;
    v_tenant_id UUID;
    v_slug TEXT;
    v_counter INTEGER;
    v_users_migrated INTEGER := 0;
    v_users_skipped INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting migration: Creating personal tenants for existing users';
    RAISE NOTICE '================================================';

    -- Loop through all active users
    FOR v_user IN
        SELECT
            id,
            email,
            raw_user_meta_data->>'full_name' as full_name,
            created_at
        FROM auth.users
        WHERE deleted_at IS NULL
          AND email IS NOT NULL
        ORDER BY created_at ASC
    LOOP
        -- Check if user already has a tenant
        IF EXISTS (
            SELECT 1
            FROM copilot_internal.tenant_memberships
            WHERE user_id = v_user.id
              AND status = 'active'
        ) THEN
            RAISE NOTICE 'User % already has tenant membership, skipping', v_user.email;
            v_users_skipped := v_users_skipped + 1;
            CONTINUE;
        END IF;

        -- Generate unique slug
        v_slug := regexp_replace(
            lower(split_part(v_user.email, '@', 1)),
            '[^a-z0-9-]',
            '-',
            'g'
        );

        -- Handle empty slugs
        IF v_slug = '' OR v_slug IS NULL THEN
            v_slug := 'user';
        END IF;

        -- Make slug unique
        v_counter := 0;
        WHILE EXISTS (SELECT 1 FROM copilot_internal.tenants WHERE slug = v_slug || CASE WHEN v_counter > 0 THEN '-' || v_counter ELSE '' END) LOOP
            v_counter := v_counter + 1;
            IF v_counter > 1000 THEN
                v_slug := v_slug || '-' || substring(v_user.id::text from 1 for 8);
                EXIT;
            END IF;
        END LOOP;

        IF v_counter > 0 THEN
            v_slug := v_slug || '-' || v_counter;
        END IF;

        -- Create personal tenant
        INSERT INTO copilot_internal.tenants (
            name,
            slug,
            type,
            owner_id,
            plan,
            created_at,
            updated_at
        )
        VALUES (
            COALESCE(v_user.full_name, split_part(v_user.email, '@', 1)) || '''s Workspace',
            v_slug,
            'personal',
            v_user.id,
            'free',
            v_user.created_at, -- Preserve original creation date
            NOW()
        )
        RETURNING id INTO v_tenant_id;

        -- Add owner membership
        INSERT INTO copilot_internal.tenant_memberships (
            tenant_id,
            user_id,
            role,
            status,
            joined_at,
            created_at
        )
        VALUES (
            v_tenant_id,
            v_user.id,
            'owner',
            'active',
            v_user.created_at,
            v_user.created_at
        );

        -- Set as active tenant
        INSERT INTO copilot_internal.user_preferences (
            user_id,
            active_tenant_id,
            updated_at
        )
        VALUES (
            v_user.id,
            v_tenant_id,
            NOW()
        );

        v_users_migrated := v_users_migrated + 1;

        RAISE NOTICE 'Created personal tenant for user: % (tenant_id: %)', v_user.email, v_tenant_id;
    END LOOP;

    RAISE NOTICE '================================================';
    RAISE NOTICE 'Migration complete!';
    RAISE NOTICE 'Users migrated: %', v_users_migrated;
    RAISE NOTICE 'Users skipped: %', v_users_skipped;
    RAISE NOTICE '================================================';
END $$;

-- ========================================
-- Verification Queries
-- ========================================

-- Verify all active users have a personal tenant
DO $$
DECLARE
    v_users_without_tenant INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_users_without_tenant
    FROM auth.users u
    WHERE u.deleted_at IS NULL
      AND u.email IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM copilot_internal.tenant_memberships tm
          WHERE tm.user_id = u.id
            AND tm.status = 'active'
      );

    IF v_users_without_tenant > 0 THEN
        RAISE WARNING 'VERIFICATION FAILED: % users still without tenant membership!', v_users_without_tenant;
        RAISE WARNING 'Run the following query to identify them:';
        RAISE WARNING 'SELECT id, email FROM auth.users WHERE deleted_at IS NULL AND id NOT IN (SELECT user_id FROM copilot_internal.tenant_memberships WHERE status = ''active'')';
    ELSE
        RAISE NOTICE 'VERIFICATION PASSED: All users have tenant memberships ✓';
    END IF;
END $$;

-- Verify all users have an active tenant set
DO $$
DECLARE
    v_users_without_active_tenant INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_users_without_active_tenant
    FROM auth.users u
    WHERE u.deleted_at IS NULL
      AND u.email IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM copilot_internal.user_preferences up
          WHERE up.user_id = u.id
            AND up.active_tenant_id IS NOT NULL
      );

    IF v_users_without_active_tenant > 0 THEN
        RAISE WARNING 'VERIFICATION FAILED: % users without active tenant!', v_users_without_active_tenant;
    ELSE
        RAISE NOTICE 'VERIFICATION PASSED: All users have active tenant ✓';
    END IF;
END $$;

-- ========================================
-- Summary Report
-- ========================================

-- Show summary of created tenants
SELECT
    'Personal Tenants Created' as metric,
    COUNT(*)::text as value
FROM copilot_internal.tenants
WHERE type = 'personal'

UNION ALL

SELECT
    'Total Tenant Memberships' as metric,
    COUNT(*)::text as value
FROM copilot_internal.tenant_memberships
WHERE status = 'active'

UNION ALL

SELECT
    'Users with Active Tenant' as metric,
    COUNT(DISTINCT user_id)::text as value
FROM copilot_internal.user_preferences
WHERE active_tenant_id IS NOT NULL;

-- ========================================
-- End of Migration
-- ========================================
