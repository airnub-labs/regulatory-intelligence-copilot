# Phase 4: Monitoring Dashboard Queries

**Date**: 2026-01-04
**Purpose**: SQL and PromQL queries for E2B and LLM cost monitoring dashboards

---

## E2B Cost Monitoring Queries

### 1. Current Active Sandboxes by Tenant

**Purpose**: Monitor active sandbox count per tenant

```sql
-- Active sandboxes per tenant
SELECT
  tenant_id,
  COUNT(*) as active_sandboxes,
  array_agg(DISTINCT sandbox_id) as sandbox_ids,
  MIN(created_at) as oldest_sandbox,
  MAX(created_at) as newest_sandbox,
  AVG(EXTRACT(EPOCH FROM (NOW() - created_at))/60)::int as avg_age_minutes
FROM copilot_internal.execution_contexts
WHERE sandbox_status IN ('creating', 'ready')
  AND terminated_at IS NULL
  AND expires_at > NOW()
GROUP BY tenant_id
ORDER BY active_sandboxes DESC;
```

### 2. E2B Costs Today by Tenant

**Purpose**: Track daily E2B spending per tenant

```sql
-- E2B costs today (top 10 tenants)
SELECT
  tenant_id,
  COUNT(*) as executions,
  ROUND(SUM(total_cost_usd)::numeric, 4) as total_cost_usd,
  ROUND(AVG(total_cost_usd)::numeric, 6) as avg_cost_per_execution,
  ROUND(SUM(execution_time_seconds)::numeric, 2) as total_execution_seconds,
  ROUND(AVG(execution_time_seconds)::numeric, 2) as avg_execution_seconds
FROM copilot_internal.e2b_cost_records
WHERE recorded_at >= CURRENT_DATE
GROUP BY tenant_id
ORDER BY total_cost_usd DESC
LIMIT 10;
```

### 3. E2B Costs This Week

**Purpose**: Weekly cost trends

```sql
-- E2B costs this week by day
SELECT
  DATE(recorded_at) as date,
  COUNT(*) as executions,
  ROUND(SUM(total_cost_usd)::numeric, 2) as total_cost_usd,
  COUNT(DISTINCT tenant_id) as unique_tenants,
  COUNT(DISTINCT sandbox_id) as unique_sandboxes
FROM copilot_internal.e2b_cost_records
WHERE recorded_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(recorded_at)
ORDER BY date DESC;
```

### 4. E2B Costs by Tier

**Purpose**: Compare costs across E2B tiers

```sql
-- E2B costs by tier (last 30 days)
SELECT
  tier,
  COUNT(*) as executions,
  ROUND(SUM(total_cost_usd)::numeric, 2) as total_cost_usd,
  ROUND(AVG(total_cost_usd)::numeric, 6) as avg_cost_per_execution,
  ROUND(SUM(execution_time_seconds)::numeric, 2) as total_seconds,
  ROUND(AVG(execution_time_seconds)::numeric, 2) as avg_seconds
FROM copilot_internal.e2b_cost_records
WHERE recorded_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY tier
ORDER BY total_cost_usd DESC;
```

### 5. Long-Running Sandboxes (Cost Alert)

**Purpose**: Identify sandboxes running for extended periods (potential cost waste)

```sql
-- Long-running sandboxes (> 2 hours)
SELECT
  id as context_id,
  tenant_id,
  conversation_id,
  path_id,
  sandbox_id,
  sandbox_status,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at))/3600 as age_hours,
  expires_at,
  EXTRACT(EPOCH FROM (expires_at - NOW()))/60 as ttl_remaining_minutes
FROM copilot_internal.execution_contexts
WHERE sandbox_status IN ('creating', 'ready')
  AND terminated_at IS NULL
  AND created_at < NOW() - INTERVAL '2 hours'
ORDER BY created_at ASC;
```

### 6. E2B Quota Utilization by Tenant

**Purpose**: Monitor quota usage across tenants

```sql
-- E2B quota utilization (tenants >50%)
SELECT
  scope_id as tenant_id,
  resource_type,
  ROUND(limit_usd::numeric, 2) as limit_usd,
  ROUND(current_spend_usd::numeric, 2) as spend_usd,
  ROUND((current_spend_usd / limit_usd * 100)::numeric, 1) as utilization_percent,
  ROUND((limit_usd - current_spend_usd)::numeric, 2) as remaining_usd,
  period,
  period_start,
  period_end,
  CASE
    WHEN current_spend_usd / limit_usd >= 1.0 THEN 'EXCEEDED'
    WHEN current_spend_usd / limit_usd >= 0.9 THEN 'CRITICAL'
    WHEN current_spend_usd / limit_usd >= 0.8 THEN 'WARNING'
    ELSE 'OK'
  END as status
FROM copilot_internal.cost_quotas
WHERE scope = 'tenant'
  AND resource_type = 'e2b'
  AND (current_spend_usd / limit_usd) >= 0.5
ORDER BY utilization_percent DESC;
```

### 7. Sandbox Lifecycle Metrics

**Purpose**: Track sandbox creation/termination success rates

```sql
-- Sandbox lifecycle stats (last 24 hours)
SELECT
  sandbox_status,
  COUNT(*) as count,
  ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(terminated_at, NOW()) - created_at))/60)::numeric, 2) as avg_lifetime_minutes,
  MIN(created_at) as first_created,
  MAX(created_at) as last_created
FROM copilot_internal.execution_contexts
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY sandbox_status
ORDER BY count DESC;
```

---

## LLM Cost Monitoring Queries

### 8. LLM Costs Today by Model

**Purpose**: Track daily LLM spending by model

```sql
-- LLM costs today by model
SELECT
  provider,
  model,
  COUNT(*) as requests,
  ROUND(SUM(total_cost_usd)::numeric, 4) as total_cost_usd,
  ROUND(AVG(total_cost_usd)::numeric, 6) as avg_cost_per_request,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  ROUND(AVG(input_tokens)::numeric, 0) as avg_input_tokens,
  ROUND(AVG(output_tokens)::numeric, 0) as avg_output_tokens
FROM copilot_internal.llm_cost_records
WHERE recorded_at >= CURRENT_DATE
GROUP BY provider, model
ORDER BY total_cost_usd DESC;
```

### 9. LLM vs E2B Cost Breakdown

**Purpose**: Compare LLM and E2B costs

```sql
-- Cost breakdown: LLM vs E2B (last 30 days)
WITH llm_costs AS (
  SELECT
    tenant_id,
    SUM(total_cost_usd) as llm_cost,
    COUNT(*) as llm_requests
  FROM copilot_internal.llm_cost_records
  WHERE recorded_at >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY tenant_id
),
e2b_costs AS (
  SELECT
    tenant_id,
    SUM(total_cost_usd) as e2b_cost,
    COUNT(*) as e2b_executions
  FROM copilot_internal.e2b_cost_records
  WHERE recorded_at >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY tenant_id
)
SELECT
  COALESCE(l.tenant_id, e.tenant_id) as tenant_id,
  ROUND(COALESCE(l.llm_cost, 0)::numeric, 2) as llm_cost_usd,
  ROUND(COALESCE(e.e2b_cost, 0)::numeric, 2) as e2b_cost_usd,
  ROUND((COALESCE(l.llm_cost, 0) + COALESCE(e.e2b_cost, 0))::numeric, 2) as total_cost_usd,
  ROUND((COALESCE(l.llm_cost, 0) / NULLIF(COALESCE(l.llm_cost, 0) + COALESCE(e.e2b_cost, 0), 0) * 100)::numeric, 1) as llm_percent,
  ROUND((COALESCE(e.e2b_cost, 0) / NULLIF(COALESCE(l.llm_cost, 0) + COALESCE(e.e2b_cost, 0), 0) * 100)::numeric, 1) as e2b_percent,
  COALESCE(l.llm_requests, 0) as llm_requests,
  COALESCE(e.e2b_executions, 0) as e2b_executions
FROM llm_costs l
FULL OUTER JOIN e2b_costs e ON l.tenant_id = e.tenant_id
ORDER BY total_cost_usd DESC
LIMIT 20;
```

### 10. Combined Quota Status

**Purpose**: Unified view of LLM + E2B quota utilization

```sql
-- Combined quota status
WITH quota_status AS (
  SELECT
    scope_id as tenant_id,
    resource_type,
    ROUND(limit_usd::numeric, 2) as limit_usd,
    ROUND(current_spend_usd::numeric, 2) as spend_usd,
    ROUND((current_spend_usd / limit_usd * 100)::numeric, 1) as utilization_percent,
    period
  FROM copilot_internal.cost_quotas
  WHERE scope = 'tenant'
)
SELECT
  llm.tenant_id,
  llm.limit_usd as llm_limit,
  llm.spend_usd as llm_spend,
  llm.utilization_percent as llm_utilization,
  e2b.limit_usd as e2b_limit,
  e2b.spend_usd as e2b_spend,
  e2b.utilization_percent as e2b_utilization,
  (llm.spend_usd + COALESCE(e2b.spend_usd, 0)) as total_spend,
  CASE
    WHEN llm.utilization_percent >= 100 OR COALESCE(e2b.utilization_percent, 0) >= 100 THEN 'EXCEEDED'
    WHEN llm.utilization_percent >= 90 OR COALESCE(e2b.utilization_percent, 0) >= 90 THEN 'CRITICAL'
    WHEN llm.utilization_percent >= 80 OR COALESCE(e2b.utilization_percent, 0) >= 80 THEN 'WARNING'
    ELSE 'OK'
  END as status
FROM quota_status llm
LEFT JOIN quota_status e2b
  ON llm.tenant_id = e2b.tenant_id
  AND e2b.resource_type = 'e2b'
WHERE llm.resource_type = 'llm'
ORDER BY total_spend DESC;
```

---

## OpenTelemetry / Prometheus Queries (PromQL)

### E2B Sandbox Operation Duration (P95)

```promql
# 95th percentile E2B sandbox operation duration
histogram_quantile(0.95,
  sum(rate(regintel_e2b_sandbox_operation_duration_bucket[5m])) by (le, operation, tier)
)
```

### E2B Sandbox Creation Rate

```promql
# Sandbox creation rate per minute
sum(rate(regintel_e2b_sandbox_operation_total{operation="create"}[5m])) by (tier, success)
```

### E2B Cost Rate (USD/hour)

```promql
# E2B cost burn rate in USD per hour
sum(rate(regintel_e2b_cost_total[1h])) by (tier, tenantId) * 3600
```

### E2B Active Sandboxes (Gauge)

```promql
# Number of active E2B sandboxes
regintel_e2b_sandbox_active{tenantId="$tenant_id"}
```

### E2B Quota Utilization (Percentage)

```promql
# E2B quota utilization percentage
regintel_e2b_quota_utilization{tenantId="$tenant_id"}
```

### E2B Error Rate

```promql
# E2B error rate (errors per minute)
sum(rate(regintel_e2b_errors_total[5m])) by (operation, errorType)
```

### LLM Cost Rate (USD/hour)

```promql
# LLM cost burn rate in USD per hour
sum(rate(regintel_llm_cost_total[1h])) by (provider, model, tenantId) * 3600
```

### Total Cost Rate (LLM + E2B)

```promql
# Total platform cost burn rate (USD/hour)
(
  sum(rate(regintel_llm_cost_total[1h])) +
  sum(rate(regintel_e2b_cost_total[1h]))
) * 3600
```

---

## Grafana Dashboard Panels

### Panel 1: E2B Cost Trend (Time Series)

**Query**: SQL or PromQL for E2B costs over time
**Visualization**: Time series line chart
**Breakdown**: By tenant, tier
**Thresholds**: Warning at $50/day, Critical at $100/day

### Panel 2: Active Sandboxes (Gauge)

**Query**: Active sandbox count
**Visualization**: Gauge
**Thresholds**: Warning at 10, Critical at 20

### Panel 3: Quota Utilization (Bar Gauge)

**Query**: Combined quota status (Query #10)
**Visualization**: Horizontal bar gauge
**Thresholds**:
- Green: 0-70%
- Yellow: 70-90%
- Red: 90-100%

### Panel 4: Cost Breakdown (Pie Chart)

**Query**: LLM vs E2B costs (Query #9)
**Visualization**: Pie chart
**Legend**: Show percentages

### Panel 5: Long-Running Sandboxes Alert (Table)

**Query**: Long-running sandboxes (Query #5)
**Visualization**: Table
**Highlight**: Rows with age > 4 hours in red

### Panel 6: Sandbox Lifecycle (Stat Panel)

**Query**: Sandbox lifecycle stats (Query #7)
**Visualization**: Stat panels
**Metrics**:
- Created (today)
- Terminated (today)
- Success rate
- Avg lifetime

---

## Alerting Rules

### Alert 1: High E2B Costs

**Condition**: E2B costs > $100/day for single tenant
**Severity**: Warning
**Notification**: Slack #cost-alerts

```sql
SELECT tenant_id, ROUND(SUM(total_cost_usd)::numeric, 2) as cost
FROM copilot_internal.e2b_cost_records
WHERE recorded_at >= CURRENT_DATE
GROUP BY tenant_id
HAVING SUM(total_cost_usd) > 100;
```

### Alert 2: Long-Running Sandbox

**Condition**: Sandbox running > 4 hours
**Severity**: Warning
**Notification**: Slack #ops-alerts

```sql
SELECT * FROM copilot_internal.execution_contexts
WHERE sandbox_status IN ('creating', 'ready')
  AND terminated_at IS NULL
  AND created_at < NOW() - INTERVAL '4 hours';
```

### Alert 3: Quota Exceeded

**Condition**: Tenant quota >= 100%
**Severity**: Critical
**Notification**: Slack #cost-alerts, Email

```sql
SELECT scope_id, resource_type, current_spend_usd, limit_usd
FROM copilot_internal.cost_quotas
WHERE scope = 'tenant'
  AND current_spend_usd >= limit_usd;
```

### Alert 4: Sandbox Creation Failure Rate High

**PromQL Condition**: Sandbox creation failure rate > 10%

```promql
sum(rate(regintel_e2b_sandbox_operation_total{operation="create",success="false"}[5m]))
/
sum(rate(regintel_e2b_sandbox_operation_total{operation="create"}[5m]))
> 0.1
```

---

## Usage Examples

### Find Most Expensive Conversation

```sql
-- Most expensive conversation (LLM + E2B combined)
WITH llm_by_conversation AS (
  SELECT
    conversation_id,
    SUM(total_cost_usd) as llm_cost
  FROM copilot_internal.llm_cost_records
  WHERE conversation_id IS NOT NULL
  GROUP BY conversation_id
),
e2b_by_conversation AS (
  SELECT
    conversation_id,
    SUM(total_cost_usd) as e2b_cost
  FROM copilot_internal.e2b_cost_records
  WHERE conversation_id IS NOT NULL
  GROUP BY conversation_id
)
SELECT
  COALESCE(l.conversation_id, e.conversation_id) as conversation_id,
  ROUND(COALESCE(l.llm_cost, 0)::numeric, 4) as llm_cost,
  ROUND(COALESCE(e.e2b_cost, 0)::numeric, 4) as e2b_cost,
  ROUND((COALESCE(l.llm_cost, 0) + COALESCE(e.e2b_cost, 0))::numeric, 4) as total_cost
FROM llm_by_conversation l
FULL OUTER JOIN e2b_by_conversation e ON l.conversation_id = e.conversation_id
ORDER BY total_cost DESC
LIMIT 10;
```

### Cost Per User

```sql
-- Cost per user (last 30 days)
WITH llm_by_user AS (
  SELECT
    user_id,
    SUM(total_cost_usd) as llm_cost,
    COUNT(*) as llm_requests
  FROM copilot_internal.llm_cost_records
  WHERE user_id IS NOT NULL
    AND recorded_at >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY user_id
),
e2b_by_user AS (
  SELECT
    user_id,
    SUM(total_cost_usd) as e2b_cost,
    COUNT(*) as e2b_executions
  FROM copilot_internal.e2b_cost_records
  WHERE user_id IS NOT NULL
    AND recorded_at >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY user_id
)
SELECT
  COALESCE(l.user_id, e.user_id) as user_id,
  ROUND(COALESCE(l.llm_cost, 0)::numeric, 2) as llm_cost,
  ROUND(COALESCE(e.e2b_cost, 0)::numeric, 2) as e2b_cost,
  ROUND((COALESCE(l.llm_cost, 0) + COALESCE(e.e2b_cost, 0))::numeric, 2) as total_cost,
  COALESCE(l.llm_requests, 0) as llm_requests,
  COALESCE(e.e2b_executions, 0) as e2b_executions
FROM llm_by_user l
FULL OUTER JOIN e2b_by_user e ON l.user_id = e.user_id
ORDER BY total_cost DESC
LIMIT 20;
```

---

**End of Monitoring Queries**
