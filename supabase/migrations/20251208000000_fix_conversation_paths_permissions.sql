-- Migration: Fix conversation_paths table permissions
-- This migration adds explicit GRANT permissions for service_role and authenticated
-- to perform operations on the conversation_paths table in the copilot_internal schema.
--
-- Issue: "permission denied for table conversation_paths" when trying to create
-- a primary path for a new conversation.
--
-- Solution: Grant table-level permissions to service_role and authenticated roles.
-- RLS policies alone are not sufficient; PostgreSQL requires explicit GRANT permissions
-- at the table level before RLS policies are evaluated.

-- =============================================================================
-- Grant all privileges on conversation_paths to service_role
-- =============================================================================

GRANT ALL PRIVILEGES ON TABLE copilot_internal.conversation_paths TO service_role;

-- =============================================================================
-- Grant specific privileges on conversation_paths to authenticated
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE copilot_internal.conversation_paths TO authenticated;

-- =============================================================================
-- Grant all privileges on conversation_messages to service_role (if not already granted)
-- =============================================================================

GRANT ALL PRIVILEGES ON TABLE copilot_internal.conversation_messages TO service_role;

-- =============================================================================
-- Grant specific privileges on conversation_messages to authenticated (if not already granted)
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE copilot_internal.conversation_messages TO authenticated;

-- =============================================================================
-- Grant all privileges on conversations to service_role (if not already granted)
-- =============================================================================

GRANT ALL PRIVILEGES ON TABLE copilot_internal.conversations TO service_role;

-- =============================================================================
-- Grant specific privileges on conversations to authenticated (if not already granted)
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE copilot_internal.conversations TO authenticated;

-- =============================================================================
-- Grant all privileges on conversation_contexts to service_role (if not already granted)
-- =============================================================================

GRANT ALL PRIVILEGES ON TABLE copilot_internal.conversation_contexts TO service_role;

-- =============================================================================
-- Grant specific privileges on conversation_contexts to authenticated (if not already granted)
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE copilot_internal.conversation_contexts TO authenticated;
