# Multi-Dimensional LLM Cost Tracking

## Executive Summary

The Regulatory Intelligence Copilot platform provides enterprise-grade LLM cost tracking with **5-dimensional attribution**, enabling precise cost allocation, billing, optimization, and budgeting across your entire AI infrastructure.

### Key Benefits

- 💰 **Accurate Tenant Billing** - Track and bill customers based on actual LLM usage
- 📊 **Granular Cost Attribution** - Understand costs at platform, tenant, user, task, and conversation levels
- 🎯 **Optimization Opportunities** - Identify high-cost touchpoints for model downgrades
- 📈 **Budget Management** - Set and enforce spending limits at any attribution level
- 🔍 **Usage Analytics** - Analyze cost patterns and trends across all dimensions
- 💳 **Show-back/Charge-back** - Allocate AI infrastructure costs to business units

---

## The 5 Dimensions of Cost Tracking

### 1. Platform-Wide Tracking

**What it tracks:** Total LLM costs across all tenants, users, and operations.

**Business value:**
- Monitor total AI infrastructure spend
- Track growth in AI usage month-over-month
- Budget planning for AI infrastructure
- ROI analysis on AI features

**Use cases:**
```typescript
// Query: Total platform spend this month
SELECT
  SUM(cost_usd) as total_cost,
  COUNT(DISTINCT tenant_id) as active_tenants,
  AVG(cost_usd) as avg_cost_per_request
FROM llm_cost_metrics
WHERE timestamp >= DATE_TRUNC('month', CURRENT_DATE)
```

**Metrics captured:**
- `regintel.llm.cost.total{provider,model}`
- Aggregatable across all dimensions

**Sample insights:**
- "Platform spent $12,450 on LLM calls in December 2024"
- "OpenAI costs increased 23% month-over-month"
- "Average cost per LLM request: $0.0045"

---

### 2. Per-Tenant Tracking

**What it tracks:** LLM costs for each organization using your platform.

**Business value:**
- **Metered billing** - Charge customers based on actual usage
- **Quota enforcement** - Prevent runaway costs with spending limits
- **Customer analytics** - Identify high-value customers vs. cost centers
- **Plan optimization** - Right-size pricing tiers based on usage patterns

**Use cases:**
```typescript
// Query: Monthly bill for tenant "acme-corp"
SELECT
  tenant_id,
  SUM(cost_usd) as monthly_cost,
  SUM(CASE WHEN cost_type = 'input' THEN cost_usd END) as input_cost,
  SUM(CASE WHEN cost_type = 'output' THEN cost_usd END) as output_cost,
  COUNT(*) as total_requests
FROM llm_cost_metrics
WHERE tenant_id = 'acme-corp'
  AND timestamp >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY tenant_id
```

**Implementation:**
```typescript
// All LLM requests automatically capture tenant context
const response = await llmClient.chat(messages, {
  model: 'gpt-4',
  tenantId: 'acme-corp',  // Automatic cost attribution
  task: 'main-chat'
});
```

**Metrics captured:**
- `regintel.llm.cost.total{tenantId,provider,model}`
- `regintel.llm.tokens.total{tenantId,tokenType,provider,model}`

**Sample insights:**
- "Acme Corp spent $2,340 this month (within $3,000 quota)"
- "Top 10 tenants by cost represent 67% of total spend"
- "Tenant 'startup-inc' exceeds free tier limit"

**Billing integration example:**
```typescript
// Monthly billing calculation
const tenantCosts = await calculateTenantCosts('acme-corp', {
  startDate: '2024-12-01',
  endDate: '2024-12-31'
});

// Apply pricing tier
const bill = {
  baseCost: tenantCosts.totalCostUsd,
  markup: tenantCosts.totalCostUsd * 0.30, // 30% margin
  total: tenantCosts.totalCostUsd * 1.30,
  breakdown: {
    inputTokenCost: tenantCosts.inputCostUsd,
    outputTokenCost: tenantCosts.outputCostUsd,
    totalRequests: tenantCosts.requestCount
  }
};
```

---

### 3. Per-User Tracking

**What it tracks:** LLM costs for individual users within each tenant.

**Business value:**
- **User quotas** - Limit spending per user seat
- **Usage analytics** - Identify power users vs. inactive seats
- **License optimization** - Right-size user licenses based on actual usage
- **User behavior analysis** - Understand how different roles use AI

**Use cases:**
```typescript
// Query: Top users by cost within tenant
SELECT
  tenant_id,
  user_id,
  SUM(cost_usd) as user_cost,
  COUNT(*) as request_count,
  AVG(cost_usd) as avg_cost_per_request
FROM llm_cost_metrics
WHERE tenant_id = 'acme-corp'
  AND timestamp >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY tenant_id, user_id
ORDER BY user_cost DESC
LIMIT 10
```

**Implementation:**
```typescript
// User context flows from authentication
const response = await llmClient.chat(messages, {
  model: 'gpt-4',
  tenantId: session.tenantId,
  userId: session.userId,  // Track individual user costs
  task: 'regulatory-analysis'
});
```

**Metrics captured:**
- `regintel.llm.cost.total{tenantId,userId,provider,model}`
- `regintel.llm.tokens.total{tenantId,userId,tokenType}`

**Sample insights:**
- "User john@acme.com spent $127 this month (top user)"
- "23 users have not used AI features this month (consider license reduction)"
- "Average cost per active user: $47/month"

**Quota enforcement example:**
```typescript
// Check user quota before expensive operation
const userSpend = await getUserMonthlySpend(tenantId, userId);
const userQuota = await getUserQuota(tenantId, userId); // e.g., $100/month

if (userSpend + estimatedCost > userQuota) {
  throw new QuotaExceededError(
    `User ${userId} would exceed monthly quota of $${userQuota}`
  );
}
```

---

### 4. Per-Task Tracking (Touchpoint-Level)

**What it tracks:** LLM costs for each unique AI operation type in your platform.

**Business value:**
- **Cost optimization** - Identify expensive tasks for model downgrades
- **Feature costing** - Understand true cost of each AI feature
- **Pricing strategy** - Price features based on actual LLM costs
- **ROI per feature** - Measure value vs. cost for each AI capability

**Task taxonomy:**
- `main-chat` - Primary user chat interface
- `egress-guard` - PII/sensitive data scanning
- `pii-sanitizer` - Data sanitization operations
- `document-analysis` - Regulatory document processing
- `compliance-check` - Automated compliance validation
- `summarization` - Document/conversation summarization
- `entity-extraction` - Named entity recognition
- `classification` - Document/message classification

**Use cases:**
```typescript
// Query: Cost breakdown by task type
SELECT
  task,
  SUM(cost_usd) as task_cost,
  COUNT(*) as task_count,
  AVG(cost_usd) as avg_cost,
  SUM(input_tokens) + SUM(output_tokens) as total_tokens
FROM llm_cost_metrics
WHERE timestamp >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY task
ORDER BY task_cost DESC
```

**Implementation:**
```typescript
// Each AI operation specifies its task type
const egressGuardResponse = await llmClient.chat(messages, {
  model: 'gpt-3.5-turbo',  // Cheaper model for guard tasks
  task: 'egress-guard',    // Track costs separately
  tenantId: session.tenantId,
  userId: session.userId
});

const mainChatResponse = await llmClient.chat(messages, {
  model: 'gpt-4',          // Premium model for main chat
  task: 'main-chat',       // Different cost profile
  tenantId: session.tenantId,
  userId: session.userId
});
```

**Metrics captured:**
- `regintel.llm.cost.total{task,provider,model}`
- `regintel.llm.tokens.total{task,tokenType,provider,model}`
- `regintel.llm.request.duration{task,provider,model}`

**Sample insights:**
- "Main chat costs $8,200/month (66% of total)"
- "Egress guard costs only $340/month (using GPT-3.5)"
- "Document analysis averages $0.23 per document"

**Optimization example:**
```typescript
// Cost analysis reveals optimization opportunity
const taskCosts = {
  'main-chat': { cost: 8200, model: 'gpt-4' },
  'egress-guard': { cost: 340, model: 'gpt-3.5-turbo' },
  'summarization': { cost: 2100, model: 'gpt-4' }  // Optimization target!
};

// Downgrade summarization from GPT-4 to GPT-3.5
// Expected savings: ~85% = $1,785/month
await updateTaskPolicy({
  task: 'summarization',
  model: 'gpt-3.5-turbo',  // From: gpt-4
  expectedSavings: 1785
});
```

---

### 5. Per-Conversation Tracking

**What it tracks:** LLM costs for individual conversation sessions.

**Business value:**
- **Session-level ROI** - Measure value of individual conversations
- **Conversation optimization** - Identify long/expensive sessions for compaction
- **Usage patterns** - Understand typical session costs
- **Anomaly detection** - Flag unusually expensive conversations

**Use cases:**
```typescript
// Query: Most expensive conversations
SELECT
  conversation_id,
  tenant_id,
  user_id,
  SUM(cost_usd) as conversation_cost,
  COUNT(*) as message_count,
  MIN(timestamp) as started_at,
  MAX(timestamp) as ended_at
FROM llm_cost_metrics
WHERE timestamp >= DATE_TRUNC('week', CURRENT_DATE)
GROUP BY conversation_id, tenant_id, user_id
ORDER BY conversation_cost DESC
LIMIT 20
```

**Implementation:**
```typescript
// Conversation ID flows through all messages
const response = await llmClient.chat(messages, {
  model: 'gpt-4',
  tenantId: session.tenantId,
  userId: session.userId,
  task: 'main-chat',
  conversationId: conversationId  // Track session costs
});
```

**Metrics captured:**
- `regintel.llm.cost.total{conversationId,tenantId,userId,task}`
- `regintel.llm.tokens.total{conversationId,tokenType}`

**Sample insights:**
- "Conversation #ABC123 cost $47.50 over 2 hours"
- "Average conversation cost: $1.23"
- "Top 5% of conversations account for 34% of costs"

**Compaction triggers:**
```typescript
// Trigger conversation compaction when costs get high
const conversationCost = await getConversationCost(conversationId);
const COMPACTION_THRESHOLD = 10.00; // $10

if (conversationCost > COMPACTION_THRESHOLD) {
  // Apply merge compression to reduce context size
  await compactConversation(conversationId, {
    strategy: 'merge-summarization',
    estimatedSavings: conversationCost * 0.60  // 60% reduction
  });
}
```

---

## Cross-Dimensional Analysis

The real power comes from combining dimensions for sophisticated analysis:

### Example 1: Identify High-Cost Users by Task
```typescript
// Which users spend most on document analysis?
SELECT
  tenant_id,
  user_id,
  task,
  SUM(cost_usd) as cost,
  COUNT(*) as count
FROM llm_cost_metrics
WHERE task = 'document-analysis'
  AND timestamp >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY tenant_id, user_id, task
ORDER BY cost DESC
LIMIT 10
```

### Example 2: Tenant Cost Breakdown by Model
```typescript
// How much does each tenant spend on GPT-4 vs GPT-3.5?
SELECT
  tenant_id,
  provider,
  model,
  SUM(cost_usd) as cost,
  ROUND(100.0 * SUM(cost_usd) / SUM(SUM(cost_usd)) OVER (PARTITION BY tenant_id), 2) as pct_of_tenant
FROM llm_cost_metrics
WHERE timestamp >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY tenant_id, provider, model
ORDER BY tenant_id, cost DESC
```

### Example 3: Task Efficiency by Provider
```typescript
// Which provider is cheapest for each task?
SELECT
  task,
  provider,
  model,
  AVG(cost_usd) as avg_cost,
  AVG(input_tokens + output_tokens) as avg_tokens
FROM llm_cost_metrics
WHERE timestamp >= DATE_TRUNC('week', CURRENT_DATE)
GROUP BY task, provider, model
ORDER BY task, avg_cost ASC
```

---

## Technical Implementation

### Automatic Cost Recording

All LLM operations automatically record costs when token usage is available:

```typescript
// In OpenAiProviderClient.chat()
if (result.usage) {
  const attribution = {
    tenantId: options?.tenantId,
    userId: options?.userId,
    task: options?.task,
    conversationId: options?.conversationId,
  };

  // Record token usage
  recordLlmTokenUsage({
    provider: 'openai',
    model,
    tokenType: 'input',
    tokens: result.usage.promptTokens,
    ...attribution,
  });

  recordLlmTokenUsage({
    provider: 'openai',
    model,
    tokenType: 'output',
    tokens: result.usage.completionTokens,
    ...attribution,
  });

  // Costs are calculated separately via recordLlmCost()
}
```

### Manual Cost Recording

For advanced scenarios, record costs explicitly:

```typescript
import { recordLlmCost } from '@reg-copilot/reg-intel-observability';

// Record cost for external LLM call
await recordLlmCost({
  provider: 'openai',
  model: 'gpt-4',
  inputTokens: 1500,
  outputTokens: 800,
  tenantId: 'acme-corp',
  userId: 'john@acme.com',
  task: 'custom-analysis',
  conversationId: 'conv-123'
});
```

### Cost Calculation

Costs are calculated using the pricing service:

```typescript
import { calculateLlmCost } from '@reg-copilot/reg-intel-observability';

const cost = await calculateLlmCost(
  'openai',      // provider
  'gpt-4',       // model
  1500,          // input tokens
  800            // output tokens
);

console.log(cost);
// {
//   inputCostUsd: 0.045,        // 1500 tokens * $30/1M
//   outputCostUsd: 0.048,       // 800 tokens * $60/1M
//   totalCostUsd: 0.093,
//   pricing: { ... },
//   isEstimated: false
// }
```

---

## OpenTelemetry Integration

All cost metrics are exposed as OpenTelemetry counters:

### Metric: `regintel.llm.cost.total`

**Type:** Counter
**Unit:** USD
**Description:** Total LLM cost in USD with multi-dimensional attribution

**Attributes:**
- `provider` - LLM provider (openai, anthropic, groq, google, local)
- `model` - Model name (gpt-4, claude-3-opus, etc.)
- `tenantId` - Organization identifier (optional)
- `userId` - User identifier (optional)
- `task` - Task/touchpoint type (optional)
- `conversationId` - Conversation session ID (optional)
- `costType` - Cost type: `total`, `input`, or `output`
- `isEstimated` - Whether pricing was estimated (true/false)

**Aggregation:**
- Sum for total costs
- Group by any attribute for breakdowns
- Filter by time range for period analysis

**Example PromQL queries:**
```promql
# Total platform cost last 24h
sum(regintel_llm_cost_total{costType="total"})

# Cost by tenant
sum by (tenantId) (regintel_llm_cost_total{costType="total"})

# Cost by task type
sum by (task) (regintel_llm_cost_total{costType="total"})

# GPT-4 costs only
sum(regintel_llm_cost_total{model="gpt-4",costType="total"})

# Tenant cost rate (per hour)
rate(regintel_llm_cost_total{tenantId="acme-corp",costType="total"}[1h])
```

---

## Cost Optimization Playbook

### Optimization 1: Task-Based Model Routing

**Opportunity:** Use cheaper models for simpler tasks

**Implementation:**
```typescript
// Before: All tasks use GPT-4
const policy = {
  defaultModel: 'gpt-4',
  defaultProvider: 'openai'
};

// After: Task-optimized routing
const policy = {
  defaultModel: 'gpt-4',
  defaultProvider: 'openai',
  tasks: [
    { task: 'main-chat', model: 'gpt-4', provider: 'openai' },
    { task: 'egress-guard', model: 'gpt-3.5-turbo', provider: 'openai' },
    { task: 'pii-sanitizer', model: 'gpt-3.5-turbo', provider: 'openai' },
    { task: 'summarization', model: 'claude-3-haiku', provider: 'anthropic' },
    { task: 'classification', model: 'llama-3-70b', provider: 'groq' }
  ]
};
```

**Savings:** 60-70% on non-critical tasks

### Optimization 2: Conversation Compaction

**Opportunity:** Reduce context size for long conversations

**Metrics to monitor:**
```typescript
// Conversations exceeding cost threshold
SELECT conversation_id, SUM(cost_usd)
FROM llm_cost_metrics
GROUP BY conversation_id
HAVING SUM(cost_usd) > 10.00
```

**Savings:** 40-60% on long conversations

### Optimization 3: Provider Arbitrage

**Opportunity:** Route tasks to most cost-effective provider

**Analysis:**
```typescript
// Compare cost per task across providers
SELECT
  task,
  provider,
  AVG(cost_usd) as avg_cost,
  COUNT(*) as sample_size
FROM llm_cost_metrics
GROUP BY task, provider
ORDER BY task, avg_cost
```

**Savings:** 30-50% by choosing optimal provider per task

### Optimization 4: Caching

**Opportunity:** Cache responses for repeated queries

**Implementation:**
```typescript
// Check cache before LLM call
const cacheKey = hashQuery(messages);
const cached = await cache.get(cacheKey);

if (cached) {
  recordLlmTokenUsage({
    provider: 'cache',
    model: 'cached',
    tokenType: 'total',
    tokens: 0,
    cached: true,
    tenantId, userId, task
  });
  return cached;
}
```

**Savings:** 100% on cache hits

---

## Business Intelligence Dashboards

### Executive Dashboard

**KPIs:**
- Total monthly spend
- Cost per active user
- Month-over-month growth
- Top 10 tenants by cost
- Cost breakdown by provider

### Tenant Admin Dashboard

**KPIs:**
- Current month spend vs. quota
- Cost trend (daily)
- Top users by cost
- Cost breakdown by feature
- Projected end-of-month cost

### Operations Dashboard

**KPIs:**
- Cost per task type
- Average cost per request
- Token efficiency metrics
- Optimization opportunities
- Budget vs. actual tracking

---

## API Reference

### recordLlmCost()

Record LLM cost with multi-dimensional attribution.

```typescript
function recordLlmCost(attributes: {
  provider: string;           // Required: LLM provider
  model: string;              // Required: Model name
  inputTokens: number;        // Required: Input token count
  outputTokens: number;       // Required: Output token count
  tenantId?: string;          // Optional: Organization ID
  userId?: string;            // Optional: User ID
  task?: string;              // Optional: Task/touchpoint type
  conversationId?: string;    // Optional: Conversation session ID
}): Promise<void>
```

**Example:**
```typescript
await recordLlmCost({
  provider: 'openai',
  model: 'gpt-4',
  inputTokens: 1200,
  outputTokens: 600,
  tenantId: 'acme-corp',
  userId: 'john@acme.com',
  task: 'regulatory-analysis',
  conversationId: 'conv-abc-123'
});
```

### calculateLlmCost()

Calculate LLM cost from token counts.

```typescript
function calculateLlmCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): Promise<CostCalculation>

interface CostCalculation {
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  pricing: ModelPricing;
  isEstimated: boolean;
}
```

**Example:**
```typescript
const cost = await calculateLlmCost('anthropic', 'claude-3-opus', 2000, 1000);
console.log(cost.totalCostUsd); // 0.105
```

---

## ROI Calculator

### Example: SAAS Platform with 100 Tenants

**Assumptions:**
- 100 tenants, average 10 users each = 1,000 users
- Average 50 LLM requests per user per month
- Average cost per request: $0.005
- Your markup: 40%

**Without multi-dimensional tracking:**
- Total LLM costs: 1,000 users × 50 requests × $0.005 = **$250/month**
- Billing: Fixed per-seat pricing = **$10/user/month** = $10,000/month
- Your margin: $10,000 - $250 = **$9,750/month**
- **Risk:** Heavy users subsidized by light users, no visibility

**With multi-dimensional tracking:**
- Total LLM costs: **$250/month** (same)
- Metered billing: $250 × 1.4 markup = **$350/month** in LLM pass-through
- Base platform fee: **$8/user/month** = $8,000/month
- Total revenue: $8,000 + $350 = **$8,350/month**
- Your margin: $8,350 - $250 = **$8,100/month**
- **Benefit:** Fair usage pricing, cost visibility, optimization opportunities

**Additional benefits:**
- Identify and upsell heavy users (top 20% usage)
- Optimize costs by 40% through model routing = **Save $100/month**
- Prevent runaway costs with quotas
- Transparent billing builds customer trust

---

## Getting Started

### 1. Enable Cost Tracking

Cost tracking is automatically enabled when you initialize OpenTelemetry metrics:

```typescript
import { initBusinessMetrics } from '@reg-copilot/reg-intel-observability';

// Initialize OpenTelemetry SDK first
const sdk = new NodeSDK({ /* ... */ });
sdk.start();

// Then initialize business metrics
initBusinessMetrics();
```

### 2. Pass Attribution Context

Ensure all LLM requests include attribution context:

```typescript
const response = await llmClient.chat(messages, {
  model: 'gpt-4',
  tenantId: req.session.tenantId,    // From authentication
  userId: req.session.userId,         // From authentication
  task: 'main-chat',                  // From application logic
  conversationId: req.params.convId   // From URL/state
});
```

### 3. Export Metrics

Configure OpenTelemetry to export metrics to your observability platform:

```typescript
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

const exporter = new PrometheusExporter({
  port: 9464,
  endpoint: '/metrics'
});
```

### 4. Build Dashboards

Query metrics in your observability platform (Prometheus, Datadog, New Relic, etc.):

```promql
# Example Grafana dashboard queries
sum by (tenantId) (regintel_llm_cost_total)
rate(regintel_llm_cost_total[1h])
```

### 5. Set Up Alerts

Create alerts for cost anomalies:

```yaml
# Example Prometheus alert
- alert: HighTenantCost
  expr: sum by (tenantId) (regintel_llm_cost_total) > 1000
  for: 1h
  annotations:
    summary: "Tenant {{ $labels.tenantId }} exceeded $1000 in last hour"
```

---

## FAQ

### Q: Does cost tracking add latency to LLM requests?

**A:** No. Cost recording happens asynchronously after the LLM response is returned. The `recordLlmCost()` function uses dynamic imports and graceful error handling to prevent blocking.

### Q: What happens if pricing data is unavailable?

**A:** The system falls back to estimated pricing and sets `isEstimated: true` in metrics. Costs are still tracked, just marked as estimates.

### Q: Can I track costs for local/self-hosted models?

**A:** Yes. Define custom pricing for local models in the pricing database, or use $0 costs for free self-hosted models.

### Q: How do I handle multi-region deployments?

**A:** Each region exports its own metrics. Aggregate at the observability platform level using tenant/user IDs as join keys.

### Q: What's the overhead of storing all these metrics?

**A:** Minimal. Each LLM request generates ~3 metric data points (total, input, output costs). With cardinality controls, this scales to millions of requests.

### Q: Can I retroactively add cost tracking?

**A:** Yes, if you have historical token usage data, you can backfill costs using the `calculateLlmCost()` function.

---

## Support & Resources

- **Architecture:** [LLM_COST_TRACKING_ARCHITECTURE.md](../architecture/LLM_COST_TRACKING_ARCHITECTURE.md)
- **Implementation Plan:** [COMPACTION_STRATEGIES_IMPLEMENTATION_PLAN.md](../development/implementation-plans/COMPACTION_STRATEGIES_IMPLEMENTATION_PLAN.md)
- **API Docs:** See source code in `packages/reg-intel-observability/src/businessMetrics.ts`
- **Sales Materials:** Contact product team for presentation decks

---

**Last Updated:** December 31, 2024
**Version:** 1.0.0
**Status:** Production Ready ✅
