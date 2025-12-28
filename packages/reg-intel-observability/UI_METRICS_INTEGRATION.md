# UI Metrics Integration Guide

This guide shows how to integrate the UI/UX business metrics into your React components to track user interactions with the path system.

## Overview

UI metrics help you understand:
- **How users navigate**: Breadcrumb clicks, path switching patterns
- **How users create branches**: Via edit vs. button, frequency patterns
- **How users merge paths**: Merge modes, preview usage
- **How users interact with messages**: Scroll patterns, edit frequency

## Client-Side Metrics Flow

Since these are client-side events, metrics should be sent to the backend via the existing `/api/client-telemetry` endpoint, which forwards them to the OTEL Collector.

## Integration Examples

### 1. Breadcrumb Navigation Tracking

**Component**: `PathBreadcrumbNav` or `PathBreadcrumbs`

```typescript
import { recordBreadcrumbNavigate } from '@reg-copilot/reg-intel-observability';

const PathBreadcrumbs: React.FC<Props> = ({ paths, activePath, onNavigate }) => {
  const handleBreadcrumbClick = (targetPath: ConversationPath) => {
    // Record breadcrumb navigation
    recordBreadcrumbNavigate({
      fromPathId: activePath.id,
      toPathId: targetPath.id,
      pathDepth: paths.findIndex(p => p.id === targetPath.id) + 1,
      conversationId: conversationId,
    });

    // Navigate to the path
    onNavigate(targetPath);
  };

  return (
    // ... breadcrumb rendering
  );
};
```

### 2. Branch Creation Tracking

**Component**: `BranchDialog` or message edit handlers

#### Via Branch Button

```typescript
import { recordBranchCreate } from '@reg-copilot/reg-intel-observability';

const BranchDialog: React.FC<Props> = ({ onBranchCreated }) => {
  const handleCreate = async (name: string, description: string) => {
    const newPath = await createBranch({ name, description, sourcePathId: currentPath.id });

    // Record branch creation via button
    recordBranchCreate({
      method: 'button',
      conversationId: conversationId,
      sourcePathId: currentPath.id,
    });

    onBranchCreated(newPath);
  };

  return (
    // ... dialog UI
  );
};
```

#### Via Message Edit

```typescript
import { recordBranchCreate, recordMessageEdit } from '@reg-copilot/reg-intel-observability';

const MessageComponent: React.FC<Props> = ({ message, onEdit }) => {
  const handleEditSubmit = async (newContent: string) => {
    const result = await editMessage(message.id, newContent);

    // Record message edit
    recordMessageEdit({
      messageId: message.id,
      editType: 'content',
      createsBranch: result.branchCreated,
      conversationId: conversationId,
      pathId: currentPath.id,
    });

    // If edit created a branch, record it
    if (result.branchCreated) {
      recordBranchCreate({
        method: 'edit',
        conversationId: conversationId,
        sourcePathId: currentPath.id,
        fromMessageId: message.id,
      });
    }

    onEdit(result);
  };

  return (
    // ... message UI
  );
};
```

### 3. Path Switching Tracking

**Component**: `PathSelector` or breadcrumb navigation

#### Via Path Selector

```typescript
import { recordPathSwitch } from '@reg-copilot/reg-intel-observability';

const PathSelector: React.FC<Props> = ({ paths, activePath, onPathChange }) => {
  const handleSelect = (selectedPath: ConversationPath) => {
    // Record path switch
    recordPathSwitch({
      fromPathId: activePath.id,
      toPathId: selectedPath.id,
      switchMethod: 'selector',
      conversationId: conversationId,
    });

    onPathChange(selectedPath);
  };

  return (
    // ... selector UI
  );
};
```

#### Via Breadcrumb (combined with breadcrumb metrics)

```typescript
const handleBreadcrumbClick = (targetPath: ConversationPath) => {
  // Record breadcrumb navigation
  recordBreadcrumbNavigate({
    fromPathId: activePath.id,
    toPathId: targetPath.id,
    pathDepth: paths.findIndex(p => p.id === targetPath.id) + 1,
    conversationId: conversationId,
  });

  // Also record as path switch
  recordPathSwitch({
    fromPathId: activePath.id,
    toPathId: targetPath.id,
    switchMethod: 'breadcrumb',
    conversationId: conversationId,
  });

  onNavigate(targetPath);
};
```

### 4. Merge Operation Tracking

**Component**: `MergeDialog`

#### Merge Preview

```typescript
import { recordMergePreview, recordMergeExecute } from '@reg-copilot/reg-intel-observability';

const MergeDialog: React.FC<Props> = ({ sourcePath, targetPath }) => {
  const handlePreview = async () => {
    // Record preview request
    recordMergePreview({
      sourcePathId: sourcePath.id,
      targetPathId: targetPath.id,
      conversationId: conversationId,
    });

    const preview = await fetchMergePreview(sourcePath.id, targetPath.id);
    setPreviewData(preview);
  };

  const handleMergeExecute = async (mode: 'full' | 'summary' | 'selective') => {
    // Record merge execution
    recordMergeExecute({
      mergeMode: mode,
      sourcePathId: sourcePath.id,
      targetPathId: targetPath.id,
      messageCount: sourcePath.messageCount,
      conversationId: conversationId,
    });

    await executeMerge(sourcePath.id, targetPath.id, mode);
  };

  return (
    // ... merge dialog UI
  );
};
```

### 5. Message Scroll Tracking

**Component**: `PathAwareMessageList` or message container

```typescript
import { recordMessageScroll } from '@reg-copilot/reg-intel-observability';
import { useEffect, useRef } from 'react';

const MessageList: React.FC<Props> = ({ messages }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);
  const scrollThrottle = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Throttle scroll events to avoid excessive metrics
      if (scrollThrottle.current) {
        clearTimeout(scrollThrottle.current);
      }

      scrollThrottle.current = setTimeout(() => {
        const currentScrollTop = container.scrollTop;
        const scrollDirection = currentScrollTop > lastScrollTop.current ? 'down' : 'up';

        // Record scroll event (throttled)
        recordMessageScroll({
          scrollDirection,
          messageCount: messages.length,
          conversationId: conversationId,
          pathId: currentPath.id,
        });

        lastScrollTop.current = currentScrollTop;
      }, 1000); // Throttle to once per second
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollThrottle.current) {
        clearTimeout(scrollThrottle.current);
      }
    };
  }, [messages.length]);

  return (
    <div ref={scrollContainerRef}>
      {/* ... message list rendering */}
    </div>
  );
};
```

## Sending Metrics to Backend

### Option 1: Direct API Call (Simple)

```typescript
import { recordBranchCreate } from '@reg-copilot/reg-intel-observability';

// On the client side, you would send this to your backend
const sendMetricToBackend = async (metricData: object) => {
  await fetch('/api/client-telemetry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'metric',
      data: metricData,
      timestamp: new Date().toISOString(),
    }),
  });
};

// Then in your component:
const handleBranchCreate = async () => {
  const metricData = {
    metric: 'regintel.ui.branch.create.total',
    attributes: {
      method: 'button',
      conversationId: conversationId,
      sourcePathId: currentPath.id,
    },
  };

  // Send to backend
  await sendMetricToBackend(metricData);

  // Proceed with branch creation
  await createBranch(...);
};
```

### Option 2: Batched Telemetry (Recommended)

Use the existing client telemetry batching system:

```typescript
// telemetryClient.ts
import { TelemetryBatchQueue } from '@reg-copilot/reg-intel-observability';

const telemetryQueue = new TelemetryBatchQueue({
  endpoint: '/api/client-telemetry',
  batchSize: 20,
  flushIntervalMs: 2000,
});

export const recordUIMetric = (metricName: string, attributes: Record<string, any>) => {
  telemetryQueue.enqueue({
    type: 'metric',
    name: metricName,
    attributes,
    timestamp: Date.now(),
  });
};

// Then in your components:
import { recordUIMetric } from './telemetryClient';

const handleBranchCreate = async () => {
  recordUIMetric('regintel.ui.branch.create.total', {
    method: 'button',
    conversationId: conversationId,
    sourcePathId: currentPath.id,
  });

  await createBranch(...);
};
```

## Best Practices

### 1. Throttle High-Frequency Events

```typescript
// ❌ Bad: Records every scroll event
container.addEventListener('scroll', () => {
  recordMessageScroll({ ... });
});

// ✅ Good: Throttle to reasonable intervals
const throttledScroll = throttle(() => {
  recordMessageScroll({ ... });
}, 1000);

container.addEventListener('scroll', throttledScroll);
```

### 2. Include Context

Always include `conversationId` and `pathId` when available:

```typescript
// ✅ Good: Full context
recordBranchCreate({
  method: 'button',
  conversationId: conversationId,
  sourcePathId: currentPath.id,
});

// ❌ Incomplete: Missing context
recordBranchCreate({
  method: 'button',
});
```

### 3. Record at the Right Time

```typescript
// ✅ Good: Record after successful operation
const handleMerge = async () => {
  await executeMerge(sourcePath.id, targetPath.id, mode);

  recordMergeExecute({
    mergeMode: mode,
    sourcePathId: sourcePath.id,
    targetPathId: targetPath.id,
  });
};

// ❌ Bad: Record before operation (might fail)
const handleMerge = async () => {
  recordMergeExecute({ ... }); // Recorded even if merge fails

  await executeMerge(...);
};
```

### 4. Use Batch Sending

```typescript
// ✅ Good: Batch metrics for efficiency
const telemetryBatch = [];
telemetryBatch.push({ metric: 'regintel.ui.branch.create.total', ... });
telemetryBatch.push({ metric: 'regintel.ui.path.switch.total', ... });

// Send batch every 2 seconds or when batch size reaches 20
sendTelemetryBatch(telemetryBatch);
```

## Analysis Queries

Once integrated, you can analyze usage patterns with Prometheus:

```promql
# Branch creation methods comparison
sum(rate(regintel_ui_branch_create_total[1h])) by (method)

# Most used merge modes
sum(rate(regintel_ui_merge_execute_total[1h])) by (mergeMode)

# Path switching frequency
rate(regintel_ui_path_switch_total[5m])

# Breadcrumb navigation rate
rate(regintel_ui_breadcrumb_navigate_total[5m])

# Message edit frequency that creates branches
sum(rate(regintel_ui_message_edit_total{createsBranch="true"}[1h]))
```

## Grafana Dashboard Example

Create panels for:

1. **Branch Creation Methods** (Pie chart)
   - Query: `sum(rate(regintel_ui_branch_create_total[1h])) by (method)`

2. **Merge Operation Modes** (Pie chart)
   - Query: `sum(rate(regintel_ui_merge_execute_total[1h])) by (mergeMode)`

3. **Path Navigation Methods** (Bar chart)
   - Query: `sum(rate(regintel_ui_path_switch_total[1h])) by (switchMethod)`

4. **User Engagement Timeline** (Time series)
   - Queries:
     - Branch creations: `sum(rate(regintel_ui_branch_create_total[5m]))`
     - Path switches: `sum(rate(regintel_ui_path_switch_total[5m]))`
     - Merges: `sum(rate(regintel_ui_merge_execute_total[5m]))`

This data helps you:
- Understand which features are most used
- Identify UI/UX friction points
- Optimize workflows based on actual usage patterns
- Validate product decisions with real data
