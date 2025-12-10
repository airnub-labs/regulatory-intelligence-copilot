# Outstanding Implementation Tasks

> **Last Updated**: 2025-12-10
> **Status**: Active roadmap for remaining work

This document consolidates all outstanding implementation tasks from previously scattered documentation. It serves as the single source of truth for what needs to be implemented.

---

## Quick Reference

| Domain | Priority | Estimated Effort | Status |
|--------|----------|------------------|--------|
| Conversation Paths | Medium | 2-4 hours | 98% complete |
| Production Deployment | High | 4-8 hours | Blocked on production |
| Scenario Engine | Low | 8-16 hours | Not started |
| Testing | Medium | 8-12 hours | Partial |
| Graph Algorithms | Low | 8-16 hours | Optional |
| Content Seeding | Medium | 16-40 hours | Not started |

---

## 1. Conversation Paths (Final 2%)

**Reference**: `docs/architecture/conversation-branching-and-merging.md`

### Outstanding Tasks

- [ ] **Wire up onBranch handler in page.tsx** (~30-60 min)
  - Import BranchDialog from `@reg-copilot/reg-intel-ui`
  - Add state for branch dialog open/close
  - Create handleBranch handler that opens dialog
  - Pass messageId, onEdit, onBranch props to Message components

- [ ] **AI Merge Summarization polish** (optional, 2-4 hours)
  - Improve summarization prompts in `mergeSummarizer.ts`
  - Add preview before merge confirmation
  - Allow editing of generated summaries

### Verification
- Test branching flow: hover message → click branch → create branch
- Test merging flow: select merge mode → generate summary → confirm
- Test path switching: verify message history updates correctly

---

## 2. Production Deployment

**Reference**: `docs/architecture/execution-context/spec_v_0_1.md`

### Outstanding Tasks

- [ ] **Add metrics collection** (4-6 hours)
  - Use OpenTelemetry metrics API
  - Track: sandbox_created, sandbox_reused, sandbox_errors
  - Track: tool_execution_count, tool_execution_duration
  - Configure Prometheus scraping endpoint

- [ ] **Schedule cleanup job with Vercel Cron** (1-2 hours)
  - Create `/api/cron/cleanup-execution-contexts` route
  - Add to `vercel.json`:
    ```json
    {
      "crons": [{
        "path": "/api/cron/cleanup-execution-contexts",
        "schedule": "0 */6 * * *"
      }]
    }
    ```
  - Test cleanup job manually before deployment

- [ ] **Multi-instance SSE fan-out** (4-8 hours)
  - Replace single-instance ConversationEventHub with Redis pub/sub
  - Required for horizontal scaling in production
  - Add Redis connection configuration

### Environment Variables Required
```bash
# E2B
E2B_API_KEY=your_api_key

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=https://your-collector
OTEL_SERVICE_NAME=regulatory-intelligence-copilot

# Redis (for SSE fan-out)
REDIS_URL=redis://localhost:6379
```

---

## 3. Scenario Engine Integration

**Reference**: `docs/architecture/engines/scenario-engine/spec_v_0_1.md`

### Outstanding Tasks

- [ ] **Implement runtime scenario execution** (8-12 hours)
  - Wire scenario engine hooks documented in spec
  - Create scenario runner service
  - Integrate with ComplianceEngine orchestration

- [ ] **Create scenario templates** (4-8 hours)
  - Tax calculation scenarios
  - Benefit eligibility scenarios
  - Cross-jurisdiction comparison scenarios

### Dependencies
- Requires completed conversation context store
- Requires graph seeding with scenario-relevant data

---

## 4. Timeline Engine Coverage

**Reference**: `docs/architecture/engines/timeline-engine/spec_v_0_2.md`

### Outstanding Tasks

- [ ] **Expand timeline scenarios** (4-8 hours)
  - Add more deadline types (filing, payment, registration)
  - Add transition events (threshold changes, rate changes)
  - Add multi-jurisdiction timeline coordination

- [ ] **Connect to persisted context** (2-4 hours)
  - Store timeline computations in conversation context
  - Allow resumption of timeline reasoning across sessions

---

## 5. Testing

**Reference**: Multiple architecture docs

### Unit Tests Outstanding

- [ ] **Path system unit tests** (2-4 hours)
  - `packages/reg-intel-conversations/src/__tests__/pathStores.test.ts`
  - Test path CRUD operations
  - Test path resolution with inheritance
  - Test branch/merge logic

- [ ] **Merge summarizer tests** (1-2 hours)
  - `packages/reg-intel-core/src/__tests__/mergeSummarizer.test.ts`
  - Test summary generation
  - Test custom prompts
  - Test edge cases (empty branch, long branch)

### Integration Tests Outstanding

- [ ] **Path API integration tests** (2-4 hours)
  - `apps/demo-web/tests/api/paths.test.ts`
  - Test full branch → merge cycle
  - Test concurrent path updates
  - Test RLS policy enforcement

- [ ] **E2B execution context tests** (2-4 hours)
  - Test sandbox creation and reuse
  - Test context isolation between paths
  - Test cleanup on merge

### E2E Tests Outstanding

- [ ] **Conversation branching E2E** (2-4 hours)
  - Test full user flow through UI
  - Test path switching visually
  - Test merge summary display

---

## 6. Graph Algorithms (Optional Enhancement)

**Reference**: `docs/architecture/graph/algorithms_v_0_1.md`

### Outstanding Tasks

- [ ] **Leiden community detection** (4-8 hours)
  - Implement optional community detection
  - Use for enhanced GraphRAG retrieval
  - Add configuration flags to enable/disable

- [ ] **Centrality metrics** (4-8 hours)
  - PageRank for node importance
  - Betweenness centrality for key connectors
  - Use for better context selection in LLM prompts

### Why Optional
These algorithms enhance retrieval quality but core functionality works without them. Implement based on observed retrieval quality issues.

---

## 7. Content & Seeding

**Reference**: `docs/architecture/graph/schema_v_0_6.md`

### Outstanding Tasks

- [ ] **Comprehensive jurisdiction seeding** (16-24 hours)
  - IE: Income tax, CGT, social welfare, benefits
  - UK: PAYE, national insurance, benefits
  - NI: Special region handling under UK
  - IM/CI: Crown dependency modeling
  - EU: Cross-border coordination
  - CTA: Common Travel Area agreements

- [ ] **Domain-specific agents** (8-16 hours)
  - IE Social Safety Net Agent (exists, needs expansion)
  - IE Self-Employed Tax Agent
  - IE CGT Investor Agent
  - EU Cross-Border Coordinator Agent

- [ ] **Mutual exclusions and dependencies** (4-8 hours)
  - Model benefit interactions
  - Model relief incompatibilities
  - Model threshold interdependencies

---

## 8. Authorization (Future)

**Reference**: `docs/architecture/data_privacy_and_architecture_boundaries_v_0_1.md`

### Outstanding Tasks

- [ ] **ReBAC service integration** (8-16 hours)
  - Evaluate OpenFGA or similar
  - Wire `authorization_model`/`authorization_spec` fields
  - Implement relationship-based access control

- [ ] **Extend RLS policies** (4-8 hours)
  - Add share-based access (already schematized)
  - Add organization-level access
  - Add role-based filtering

### Dependencies
- Blocked on authentication implementation
- Consider deferring until multi-tenant production deployment

---

## Archived Documentation

The following documents are now superseded by this consolidated plan:

| Document | Status | Action |
|----------|--------|--------|
| `docs/development/implementation-plans/OUTSTANDING_TASKS.md` | Outdated | Archive |
| `docs/development/implementation-plans/PHASE_2_PLAN.md` | Complete | Archive |
| `docs/development/implementation-plans/PHASE_3_PLAN.md` | Complete | Archive |
| `docs/development/implementation-plans/PHASE_3_IMPLEMENTATION.md` | Complete | Archive |
| `docs/development/implementation-plans/PHASE_4_IMPLEMENTATION_PLAN.md` | Mostly complete | Archive |
| `docs/development/implementation-plans/IMPLEMENTATION_STATUS_v_0_4.md` | Outdated | Archive |
| `docs/development/implementation-plans/IMPLEMENTATION_SUMMARY.md` | Complete | Keep as reference |
| `docs/development/V0_6_IMPLEMENTATION_STATUS.md` | Outdated | Archive |
| `docs/development/PATH_SYSTEM_IMPLEMENTATION_PLAN.md` | 98% complete | Archive |
| `docs/development/PATH_SYSTEM_STATUS.md` | Current | Keep as reference |
| `docs/development/PHASE_4_UI_IMPLEMENTATION.md` | Complete | Archive |
| `docs/architecture/IMPLEMENTATION-PLAN.md` | 98% complete | Archive |
| `docs/architecture/execution-context/IMPLEMENTATION_PLAN.md` | Complete | Keep as reference |
| `docs/architecture/execution-context/IMPLEMENTATION_STATE.json` | Current | Keep as state tracker |

---

## Priority Recommendations

### Immediate (This Week)
1. Wire up onBranch handler in page.tsx (30 min)
2. Manual testing of branch/merge flow (30 min)

### Short-term (Next Sprint)
1. Add unit tests for path system
2. Configure Vercel Cron for cleanup job
3. Add basic metrics collection

### Medium-term (Next Month)
1. Redis pub/sub for SSE fan-out
2. Timeline engine coverage expansion
3. Integration tests

### Long-term (Backlog)
1. Scenario engine integration
2. Graph algorithms
3. Comprehensive content seeding
4. ReBAC authorization

---

## References

### Current Architecture
- `docs/architecture/architecture_v_0_7.md` - System architecture
- `docs/architecture/execution-context/spec_v_0_1.md` - E2B execution context spec
- `docs/architecture/conversation-branching-and-merging.md` - Path system architecture
- `docs/architecture/graph/schema_v_0_6.md` - Graph schema

### Implementation State
- `docs/architecture/execution-context/IMPLEMENTATION_STATE.json` - E2B progress tracker
- `docs/development/PATH_SYSTEM_STATUS.md` - Path system status

### Package Documentation
- `packages/reg-intel-ui/README.md` - UI component library
- `packages/reg-intel-conversations/README.md` - Conversation stores
- `packages/reg-intel-core/README.md` - Core engine

---

**Document Version**: 1.0
**Author**: Consolidated from multiple sources
**Status**: Active
