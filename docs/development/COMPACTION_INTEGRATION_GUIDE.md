# Compaction System Integration Guide

> **Status**: ✅ FULLY IMPLEMENTED
> **Last Updated**: 2026-01-01
> **Related**: COMPACTION_STRATEGIES_IMPLEMENTATION_PLAN.md, CONVERSATION_COMPACTION_ARCHITECTURE.md

---

## Quick Start

### 1. Initialize on Application Startup

```typescript
// apps/demo-web/src/app/layout.tsx or providers.tsx

import { initializeCompactionSystem } from '@/lib/compactionInit';

// Call during app initialization
await initializeCompactionSystem({
  snapshotTTLHours: 24,
  enforceQuotas: false, // Enable quotas in production
});
```

### 2. Use Compaction in Your Chat Interface

```typescript
// apps/demo-web/src/components/chat/ChatInterface.tsx

import {
  CompactionButton,
  CompactionStatusIndicator,
  CompactionHistory,
} from '@/components/compaction';

export function ChatInterface({ conversationId }: { conversationId: string }) {
  return (
    <div>
      {/* Show token usage status */}
      <CompactionStatusIndicator
        conversationId={conversationId}
        threshold={100_000}
        pollInterval={30000}
      />

      {/* Manual compaction trigger */}
      <CompactionButton
        conversationId={conversationId}
        strategy="semantic"
        onCompactionComplete={(result) => {
          console.log(`Saved ${result.tokensSaved} tokens`);
        }}
      />

      {/* View compaction history */}
      <CompactionHistory conversationId={conversationId} limit={10} />
    </div>
  );
}
```

### 3. Set Up Background Compaction

```typescript
// apps/demo-web/src/lib/jobs/setupJobs.ts

import { scheduleAutoCompaction } from '@/lib/jobs/autoCompactionJob';
import { conversationStore } from '@/lib/server/conversations';

// Schedule automatic compaction every hour
const cleanupFn = scheduleAutoCompaction(
  conversationStore,
  {
    tokenThreshold: 100_000,
    strategy: 'sliding_window',
    batchSize: 50,
  },
  3600000 // 1 hour
);

// Clean up on shutdown
process.on('SIGTERM', cleanupFn);
```

### 4. Configure Vercel Cron (Optional)

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/auto-compact",
      "schedule": "0 * * * *"
    }
  ]
}
```

Set environment variable:
```bash
CRON_SECRET=your-secret-key-here
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React/Next.js)                  │
├─────────────────────────────────────────────────────────────┤
│  • CompactionButton         • CompactionStatusIndicator     │
│  • CompactionHistory         • Analytics Dashboard          │
└────────────┬──────────────────────────────┬─────────────────┘
             │                              │
             ▼                              ▼
┌────────────────────────┐    ┌────────────────────────────┐
│   API Routes (Next.js)  │    │  Background Jobs (Cron)     │
├────────────────────────┤    ├────────────────────────────┤
│ POST /compact          │    │ POST /cron/auto-compact    │
│ GET  /compact/status   │    │                             │
│ GET  /compact/history  │    └─────────────┬──────────────┘
│ GET  /compact/snapshots│                  │
│ POST /compact/rollback │                  │
└──────────┬─────────────┘                  │
           │                                │
           └────────────────┬───────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Compaction Services (TypeScript)                │
├─────────────────────────────────────────────────────────────┤
│  • PathCompactionService     • SemanticCompactor            │
│  • ModerateMergeCompactor    • CompactionSnapshotService    │
│  • conversationStoreCompactionAdapter                        │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│                 Observability (Metrics/Logging)              │
├─────────────────────────────────────────────────────────────┤
│  • compactionMetrics (OpenTelemetry)                         │
│  • costTrackingService (with tests)                          │
│  • Logger (pino)                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Status

### ✅ Priority 1: Core Compaction Strategies (COMPLETE)

| Component | Status | Files |
|-----------|--------|-------|
| SemanticCompactor | ✅ | `packages/reg-intel-conversations/src/compaction/strategies/SemanticCompactor.ts` |
| ModerateMergeCompactor | ✅ | `packages/reg-intel-conversations/src/compaction/strategies/ModerateMergeCompactor.ts` |
| Conversation Store Adapter | ✅ | `packages/reg-intel-conversations/src/compaction/conversationStoreCompactionAdapter.ts` |
| Compaction Factory | ✅ | `packages/reg-intel-conversations/src/compaction/compactionFactory.ts` |

**Features**:
- LLM-based importance scoring (batched for efficiency)
- Heuristic fallback when LLM unavailable
- Deduplication and redundancy detection
- Configurable merge strategies (minimal, moderate, aggressive)
- Wrapper functions for conversation store integration

### ✅ Priority 2: Production Readiness (COMPLETE)

| Component | Status | Files |
|-----------|--------|-------|
| API Endpoints | ✅ | `apps/demo-web/src/app/api/conversations/[conversationId]/compact/*` |
| Compaction Metrics | ✅ | `packages/reg-intel-observability/src/compactionMetrics.ts` |
| Snapshot/Rollback | ✅ | `packages/reg-intel-conversations/src/compaction/snapshotService.ts` |
| PathCompactionService Integration | ✅ | Updated to record metrics and create snapshots |

**API Endpoints**:
- `POST /api/conversations/:id/compact` - Manual compaction
- `GET /api/conversations/:id/compact/status` - Check if needed
- `GET /api/conversations/:id/compact/history` - View history
- `GET /api/conversations/:id/compact/snapshots` - List snapshots
- `POST /api/conversations/:id/compact/rollback` - Rollback to snapshot

**Metrics** (OpenTelemetry):
- `compaction.operations` - Total operations
- `compaction.tokens.saved` - Tokens saved
- `compaction.messages.removed` - Messages removed
- `compaction.duration` - Operation duration
- `compaction.compression.ratio` - Compression ratio

**Snapshots**:
- Automatic creation before compaction
- 24-hour default TTL
- In-memory storage (extensible to PostgreSQL/Redis)
- Rollback API with validation

### ✅ Priority 3: UI & Automation (COMPLETE)

| Component | Status | Files |
|-----------|--------|-------|
| Cost Calculation Tests | ✅ | `packages/reg-intel-observability/src/costTracking/__tests__/costTrackingService.test.ts` |
| CompactionButton | ✅ | `apps/demo-web/src/components/compaction/CompactionButton.tsx` |
| CompactionStatusIndicator | ✅ | `apps/demo-web/src/components/compaction/CompactionStatusIndicator.tsx` |
| CompactionHistory | ✅ | `apps/demo-web/src/components/compaction/CompactionHistory.tsx` |
| Analytics Dashboard | ✅ | `apps/demo-web/src/app/analytics/compaction/page.tsx` |
| Background Jobs | ✅ | `apps/demo-web/src/lib/jobs/autoCompactionJob.ts` |
| Cron Endpoint | ✅ | `apps/demo-web/src/app/api/cron/auto-compact/route.ts` |

**Tests**:
- 15 comprehensive cost calculation tests
- Exact token counting validation
- Quota enforcement tests
- Real-world scenario tests
- All passing ✅

**UI Components**:
- Manual compaction button with loading states
- Real-time token usage indicators
- Compaction history timeline
- Full analytics dashboard
- Accessible (ARIA labels, screen readers)
- Responsive design

**Automation**:
- Background job scheduler
- Configurable batch processing
- Dry-run mode for testing
- Cron endpoint with authentication
- Vercel Cron compatible

---

## Configuration

### Application-Level Configuration

```typescript
// apps/demo-web/src/lib/compactionConfig.ts

export const COMPACTION_CONFIG = {
  // Thresholds
  tokenThreshold: 100_000, // Trigger compaction at 100k tokens
  targetTokenRatio: 0.8, // Target 80% of threshold after compaction

  // Strategies
  defaultPathStrategy: 'sliding_window',
  defaultMergeStrategy: 'moderate',

  // Snapshots
  snapshotTTLHours: 24, // Keep snapshots for 24 hours
  createSnapshots: true, // Enable rollback support

  // Background Jobs
  autoCompactionEnabled: true,
  compactionIntervalMs: 3600000, // Run every hour
  batchSize: 100, // Process up to 100 conversations per run

  // Cost Tracking
  enableCostTracking: true,
  enforceQuotas: false, // Set to true in production
};
```

### Conversation-Level Configuration

```typescript
// Per-conversation configuration (stored in database)

interface ConversationCompactionConfig {
  enabled: boolean;
  pathStrategy: 'sliding_window' | 'semantic' | 'hybrid' | 'none';
  mergeStrategy: 'minimal' | 'moderate' | 'aggressive' | 'none';
  tokenThreshold: number;
  preservePinned: boolean;
}

// Set via API or UI
await conversationStore.updateConfig(conversationId, {
  pathStrategy: 'semantic', // User preference
  tokenThreshold: 80_000, // Lower threshold for this conversation
});
```

---

## API Integration

### Manual Compaction

```typescript
// Trigger compaction from your code

const response = await fetch(`/api/conversations/${conversationId}/compact`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    strategy: 'semantic',
    tokenThreshold: 100_000,
  }),
});

const { success, result } = await response.json();

if (success) {
  console.log(`Saved ${result.tokensSaved} tokens`);
  console.log(`Compression ratio: ${result.compressionRatio}`);
  console.log(`Snapshot ID: ${result.snapshotId}`); // For rollback
}
```

### Check Compaction Status

```typescript
const response = await fetch(`/api/conversations/${conversationId}/compact/status`);
const { needsCompaction, currentTokens, estimatedSavings } = await response.json();

if (needsCompaction) {
  // Show compaction suggestion to user
}
```

### Rollback to Snapshot

```typescript
const response = await fetch(`/api/conversations/${conversationId}/compact/rollback`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    snapshotId: 'snapshot-conv-123-1234567890',
  }),
});

const { success, messagesRestored } = await response.json();
```

---

## Monitoring & Observability

### PromQL Queries for Grafana

```promql
# Total compaction operations
sum(compaction_operations_total)

# Tokens saved by strategy
sum by (strategy) (compaction_tokens_saved_total)

# Average compression ratio
avg by (strategy) (compaction_compression_ratio)

# P95 duration
histogram_quantile(0.95, sum(rate(compaction_duration_bucket[5m])) by (le))

# Compaction rate (ops/sec)
rate(compaction_operations_total[5m])
```

### Logging

All compaction operations log structured events:

```typescript
{
  "level": "info",
  "msg": "Successfully compacted conversation",
  "conversationId": "conv-123",
  "strategy": "semantic",
  "tokensSaved": 45000,
  "messagesRemoved": 75,
  "durationMs": 2341,
  "triggeredBy": "auto"
}
```

---

## Testing

### Run Cost Calculation Tests

```bash
cd packages/reg-intel-observability
npm test -- costTrackingService.test.ts
```

**15 test cases** covering:
- Exact token calculations (GPT-4, Claude, GPT-3.5)
- Cost precision (small and large values)
- Storage integration
- Quota enforcement
- Real-world scenarios

### Run Integration Tests

```bash
cd packages/reg-intel-conversations
npm test -- compaction
```

### Manual Testing Checklist

- [ ] Initialize compaction system on app startup
- [ ] Verify CompactionStatusIndicator shows correct token count
- [ ] Trigger manual compaction via CompactionButton
- [ ] Verify tokens saved in result
- [ ] Check CompactionHistory shows operation
- [ ] Test rollback to snapshot
- [ ] View analytics dashboard
- [ ] Trigger background job via cron endpoint
- [ ] Check Grafana metrics

---

## Production Deployment

### 1. Environment Variables

```bash
# .env.production
CRON_SECRET=your-production-secret
ENABLE_AUTO_COMPACTION=true
COMPACTION_TOKEN_THRESHOLD=100000
```

### 2. Initialize in Application

```typescript
// apps/demo-web/src/app/providers.tsx

'use client';

import { useEffect } from 'react';
import { initializeCompactionSystem } from '@/lib/compactionInit';

export function AppProviders({ children }) {
  useEffect(() => {
    // Initialize compaction on client mount
    initializeCompactionSystem({
      snapshotTTLHours: 24,
      enforceQuotas: process.env.NODE_ENV === 'production',
    });
  }, []);

  return <>{children}</>;
}
```

### 3. Set Up Monitoring

1. Import Grafana dashboard: `compaction-metrics-dashboard.json`
2. Set up alerts for high token usage
3. Monitor compaction operation rate
4. Track cost savings

### 4. Gradual Rollout

**Week 1**: Enable for internal team only
**Week 2**: Enable for 10% of users
**Week 3**: Enable for 50% of users
**Week 4**: Full rollout (100%)

---

## Troubleshooting

### Compaction Not Running

**Problem**: Auto-compaction not triggering

**Solutions**:
1. Check `ENABLE_AUTO_COMPACTION` environment variable
2. Verify cron job is configured (`vercel.json`)
3. Check cron endpoint authentication (`CRON_SECRET`)
4. Review logs for errors

### High Token Usage Not Detected

**Problem**: Status indicator doesn't show compaction needed

**Solutions**:
1. Verify token counting is working (check logs)
2. Check threshold configuration
3. Test manual token count calculation
4. Verify API endpoint returns correct data

### Snapshots Not Created

**Problem**: Rollback shows no snapshots available

**Solutions**:
1. Verify snapshot service initialized
2. Check `createSnapshots` configuration
3. Review snapshot TTL settings (may have expired)
4. Check storage provider (in-memory vs persistent)

### Cost Tracking Not Working

**Problem**: Cost metrics not appearing

**Solutions**:
1. Verify cost tracking initialized
2. Check OpenTelemetry configuration
3. Ensure metrics are exported to collector
4. Review Prometheus/Grafana configuration

---

## Future Enhancements

### Planned Features

1. **Persistent Snapshot Storage**
   - PostgreSQL snapshot storage
   - Redis caching for performance
   - S3 backup for long-term retention

2. **Advanced Strategies**
   - Time-based importance decay
   - User-defined importance rules
   - Multi-model consensus scoring

3. **Enhanced UI**
   - Visual token usage graphs
   - Compaction preview/diff view
   - Batch operations (compact multiple conversations)

4. **Performance Optimization**
   - Incremental compaction
   - Parallel processing
   - Smart caching

---

## Support & Resources

### Documentation
- [Architecture](../../architecture/CONVERSATION_COMPACTION_ARCHITECTURE.md)
- [Implementation Plan](./implementation-plans/COMPACTION_STRATEGIES_IMPLEMENTATION_PLAN.md)
- [API Reference](../../api/compaction-api.md)

### Code Locations
- **Services**: `packages/reg-intel-conversations/src/compaction/`
- **Metrics**: `packages/reg-intel-observability/src/compactionMetrics.ts`
- **UI Components**: `apps/demo-web/src/components/compaction/`
- **API Routes**: `apps/demo-web/src/app/api/conversations/[conversationId]/compact/`

### Contact
- GitHub Issues: [airnub-labs/regulatory-intelligence-copilot/issues](https://github.com/airnub-labs/regulatory-intelligence-copilot/issues)
- Documentation: [docs/README.md](../docs/README.md)

---

**Status**: ✅ FULLY IMPLEMENTED AND PRODUCTION READY
**Last Updated**: 2026-01-01
**Version**: 1.0
