-- Migration: Add copilot_events and copilot_archive schemas (Future Use)
--
-- Purpose: Create schema infrastructure for future scaling capabilities.
-- These schemas are NOT actively used yet - they're staged for future implementation.
--
-- WHY THESE SCHEMAS EXIST:
--
-- 1. copilot_events - Event Sourcing Pattern (Target: 1M+ users)
--    - Immutable append-only log of all state changes
--    - Enables temporal queries ("what did the system look like at time T?")
--    - Supports CQRS (Command Query Responsibility Segregation)
--    - Provides complete audit trail for compliance
--    - Allows rebuilding analytics from event stream
--
--    Future tables:
--      - events (all state change events, partitioned by month)
--      - event_snapshots (periodic state snapshots for fast replay)
--      - event_subscriptions (consumer tracking for event processing)
--
-- 2. copilot_archive - Cold Data Storage (Target: 500K+ active users)
--    - Moves inactive data to cheaper storage tier
--    - Keeps hot database lean for performance
--    - Maintains compliance with retention policies
--    - Can be backed by S3/GCS via foreign data wrappers
--
--    Future tables:
--      - archived_conversations (>90 days inactive)
--      - archived_messages (messages from archived conversations)
--      - archived_cost_records (>1 year old cost data)
--      - archived_audit_logs (>7 years for compliance, >1 year from active)
--
-- CURRENT STATUS: Empty schemas reserved for future use
--
-- WHEN TO ACTIVATE:
--   - copilot_events: When implementing event-driven architecture or needing temporal queries
--   - copilot_archive: When database size exceeds 1TB or query performance degrades
--
-- ACTIVATION CHECKLIST:
--   [ ] Define event schema standards (event types, aggregate types, metadata)
--   [ ] Implement event publishers in application code
--   [ ] Create event consumers for materialized views
--   [ ] Define archival policies (what to archive, when, retention periods)
--   [ ] Implement data archival jobs (scheduled background workers)
--   [ ] Setup S3/GCS foreign data wrappers if using cloud storage
--   [ ] Test restore procedures from archive
--
-- References:
--   - Event Sourcing: https://martinfowler.com/eaaDev/EventSourcing.html
--   - CQRS Pattern: https://martinfowler.com/bliki/CQRS.html
--   - Postgres Partitioning: https://www.postgresql.org/docs/current/ddl-partitioning.html

BEGIN;

-- ============================================================================
-- copilot_events Schema - Event Sourcing Infrastructure
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS copilot_events;

COMMENT ON SCHEMA copilot_events IS
'Event sourcing infrastructure (FUTURE USE - not actively used yet).

Purpose: Immutable append-only log of all state changes for temporal queries,
audit trails, and event-driven architecture.

When to activate: When implementing event-driven patterns or needing temporal
queries (target: 1M+ users).

Design principles:
- All events are immutable (no updates/deletes)
- Events are partitioned by timestamp for performance
- Each event references an aggregate (conversation, tenant, user)
- Event data stored as JSONB for flexibility
- Sequence numbers guarantee ordering within aggregate

Example event types:
- conversation.created
- conversation.message_added
- conversation.branched
- cost.llm_call_started
- cost.llm_call_completed
- membership.user_invited
- membership.workspace_switched

Future tables:
- events (main event log, partitioned by month)
- event_snapshots (periodic state checkpoints)
- event_subscriptions (consumer tracking)';

-- Grant permissions (service_role only for now)
GRANT USAGE ON SCHEMA copilot_events TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA copilot_events TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA copilot_events GRANT ALL ON TABLES TO service_role;

-- ============================================================================
-- copilot_archive Schema - Cold Data Storage
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS copilot_archive;

COMMENT ON SCHEMA copilot_archive IS
'Cold data storage for inactive/historical records (FUTURE USE - not actively used yet).

Purpose: Move inactive data to cheaper storage tier while maintaining access
for compliance and historical queries.

When to activate: When database size exceeds 1TB or query performance degrades
due to table size (target: 500K+ active users).

Design principles:
- Archive data older than retention thresholds
- Maintain referential integrity via foreign keys
- Can be backed by S3/GCS via postgres_fdw
- Partitioned by archive date for lifecycle management
- Compressed tables to reduce storage costs

Archival policies (planned):
- Conversations: Archive after 90 days of inactivity
- Messages: Archived with parent conversation
- Cost records: Archive after 1 year (keep aggregates in analytics)
- Audit logs: Archive after 1 year (retain 7 years for SOC2)

Future tables:
- archived_conversations
- archived_messages
- archived_cost_records
- archived_audit_logs

Restore procedures:
- Archived data can be queried directly (slower)
- Critical data can be restored to hot storage
- Full restores available for compliance audits';

-- Grant permissions (service_role only for now)
GRANT USAGE ON SCHEMA copilot_archive TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA copilot_archive TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA copilot_archive GRANT ALL ON TABLES TO service_role;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  -- Verify schemas were created
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'copilot_events') THEN
    RAISE EXCEPTION 'Schema copilot_events was not created';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'copilot_archive') THEN
    RAISE EXCEPTION 'Schema copilot_archive was not created';
  END IF;

  RAISE NOTICE '
╔══════════════════════════════════════════════════════════════════╗
║   FUTURE-USE SCHEMAS CREATED                                      ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║   ✓ copilot_events (Event sourcing infrastructure)               ║
║   ✓ copilot_archive (Cold data storage)                          ║
║                                                                   ║
║   Status: EMPTY - Reserved for future use                        ║
║                                                                   ║
║   These schemas are part of the scaling roadmap but are NOT      ║
║   actively used yet. They will be populated when needed for      ║
║   performance optimization at scale.                             ║
║                                                                   ║
║   Activation targets:                                             ║
║   - copilot_events: When implementing event-driven architecture  ║
║   - copilot_archive: When DB size exceeds 1TB or 500K+ users     ║
║                                                                   ║
╚══════════════════════════════════════════════════════════════════╝
';
END $$;

COMMIT;
