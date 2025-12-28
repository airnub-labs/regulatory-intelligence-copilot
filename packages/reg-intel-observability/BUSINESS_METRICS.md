# Business Metrics

This document describes the custom business metrics available for the Regulatory Intelligence Copilot.

## Overview

The observability package provides custom OpenTelemetry metrics to track key business operations:

- **Agent Selection**: Track which agents are being used and how often
- **Graph Query Performance**: Monitor graph database query latency and throughput
- **LLM Token Usage**: Track LLM API costs and usage patterns
- **Egress Guard Operations**: Monitor PII/sensitive data blocking rates

## Metrics Reference

### Agent Selection Metrics

**Metric**: `regintel.agent.selection.total` (Counter)
**Description**: Total number of agent selections by type

**Attributes**:
- `agentType` (string): Type of agent (e.g., "domain_expert", "general")
- `agentName` (string, optional): Specific agent name
- `domain` (string, optional): Domain area (e.g., "social_safety_net")
- `jurisdiction` (string, optional): Jurisdiction code (e.g., "IE", "UK")

**Usage**:
```typescript
import { recordAgentSelection } from '@reg-copilot/reg-intel-observability';

recordAgentSelection({
  agentType: 'domain_expert',
  agentName: 'GlobalRegulatoryComplianceAgent',
  domain: 'social_safety_net',
  jurisdiction: 'IE',
});
```

### Graph Query Metrics

**Metrics**:
- `regintel.graph.query.duration` (Histogram, ms)
- `regintel.graph.query.total` (Counter)

**Attributes**:
- `operation` (string): Operation type ("read", "write", "raw")
- `queryType` (string, optional): Query language ("cypher")
- `success` (boolean): Whether query succeeded
- `nodeCount` (number, optional): Number of nodes returned

**Usage**:
```typescript
import { recordGraphQuery } from '@reg-copilot/reg-intel-observability';

recordGraphQuery(123.45, {
  operation: 'read',
  queryType: 'cypher',
  success: true,
  nodeCount: 15,
});
```

### LLM Token Usage Metrics

**Metrics**:
- `regintel.llm.tokens.total` (Counter)
- `regintel.llm.request.duration` (Histogram, ms)

**Attributes** (token usage):
- `provider` (string): LLM provider ("anthropic", "openai", etc.)
- `model` (string): Model identifier
- `tokenType` ("input" | "output" | "total")
- `tokens` (number): Token count
- `cached` (boolean, optional): Whether tokens were cached

**Attributes** (request duration):
- `provider` (string): LLM provider
- `model` (string): Model identifier
- `success` (boolean): Whether request succeeded
- `streaming` (boolean, optional): Whether streaming was used
- `cached` (boolean, optional): Whether response was cached

**Usage**:
```typescript
import { recordLlmTokenUsage, recordLlmRequest } from '@reg-copilot/reg-intel-observability';

// Record token usage
recordLlmTokenUsage({
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
  tokenType: 'input',
  tokens: 1024,
  cached: false,
});

// Record request duration
recordLlmRequest(1500.5, {
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
  success: true,
  streaming: true,
});
```

### Egress Guard Metrics

**Metrics**:
- `regintel.egressguard.scan.total` (Counter)
- `regintel.egressguard.block.total` (Counter)

**Attributes**:
- `scanType` ("llm_request" | "llm_response" | "sandbox_output" | "agent_output")
- `blocked` (boolean): Whether content was blocked
- `piiDetected` (boolean, optional): Whether PII was detected
- `sensitiveDataTypes` (string, optional): Comma-separated list of detected types

**Usage**:
```typescript
import { recordEgressGuardScan } from '@reg-copilot/reg-intel-observability';

recordEgressGuardScan({
  scanType: 'llm_response',
  blocked: true,
  piiDetected: true,
  sensitiveDataTypes: ['email', 'phone'],
});
```

## Helper Utilities

### withMetricTiming

Wrap async operations with automatic duration tracking:

```typescript
import { withMetricTiming } from '@reg-copilot/reg-intel-observability';

const result = await withMetricTiming(
  async () => {
    // Your operation here
    return await doSomething();
  },
  (durationMs, success) => {
    // Record metric with duration and success status
    recordSomeMetric(durationMs, { success });
  }
);
```

## Initialization

Business metrics are automatically initialized when you call `initObservability()`:

```typescript
import { initObservability } from '@reg-copilot/reg-intel-observability';

await initObservability({
  serviceName: 'reg-copilot',
  metricsExporter: {
    url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
  },
});

// Business metrics are now ready to use
```

## Viewing Metrics

Metrics are exported to the configured OTEL Collector endpoint. From there, they can be:

1. **Prometheus**: Scraped and visualized in Grafana
2. **Datadog**: Forwarded to Datadog for monitoring
3. **CloudWatch**: Sent to AWS CloudWatch Metrics
4. **Any OTLP-compatible backend**

Example Prometheus query:
```promql
# Average graph query duration over last 5 minutes
rate(regintel_graph_query_duration_sum[5m]) / rate(regintel_graph_query_duration_count[5m])

# Agent selection rate by type
sum(rate(regintel_agent_selection_total[5m])) by (agentType)

# LLM token usage rate
sum(rate(regintel_llm_tokens_total[5m])) by (provider, model, tokenType)

# Egress guard block rate
rate(regintel_egressguard_block_total[5m]) / rate(regintel_egressguard_scan_total[5m])
```

## Integration Examples

### GraphClient Integration

The `GraphClient` already has metrics integration built-in:

```typescript
import { createGraphClient } from '@reg-copilot/reg-intel-core';

const graphClient = createGraphClient();

// Metrics are automatically recorded for all queries
const context = await graphClient.getRulesForProfileAndJurisdiction('profileId', 'IE');
```

### EgressGuard Integration

The `EgressGuard` supports metrics via the `scanType` option:

```typescript
import { sanitizeTextWithAudit } from '@reg-copilot/reg-intel-llm';

const result = sanitizeTextWithAudit(text, {
  context: 'chat',
  scanType: 'llm_response', // Enables metrics recording
});
```

## Best Practices

1. **Always provide context attributes**: Include relevant attributes (provider, model, operation type) to enable useful aggregations
2. **Use appropriate scan types**: Specify `scanType` when using EgressGuard to track where sanitization is happening
3. **Track both success and failure**: Record metrics for both successful and failed operations to identify issues
4. **Monitor token costs**: Track LLM token usage to understand and optimize costs
5. **Set up alerts**: Configure alerts for high block rates, slow queries, or unexpected agent selection patterns
