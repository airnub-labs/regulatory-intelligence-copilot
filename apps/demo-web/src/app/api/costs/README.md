# Cost Tracking API

RESTful API endpoints for querying LLM costs and managing quotas.

## Endpoints

### 1. Query Cost Records

**POST** `/api/costs/query`

Query detailed cost records with filtering and sorting.

**Request:**
```json
{
  "startTime": "2024-01-01T00:00:00Z",
  "endTime": "2024-01-31T23:59:59Z",
  "groupBy": ["tenant", "task"],
  "tenantIds": ["acme-corp"],
  "userIds": ["user-123"],
  "tasks": ["main-chat"],
  "limit": 100,
  "sortBy": "cost_desc"
}
```

**Response:**
```json
{
  "records": [
    {
      "id": "rec-123",
      "timestamp": "2024-01-15T10:23:45Z",
      "provider": "openai",
      "model": "gpt-4",
      "inputTokens": 1000,
      "outputTokens": 500,
      "totalTokens": 1500,
      "inputCostUsd": 0.03,
      "outputCostUsd": 0.06,
      "totalCostUsd": 0.09,
      "isEstimated": false,
      "tenantId": "acme-corp",
      "userId": "user-123",
      "task": "main-chat",
      "conversationId": "conv-456",
      "success": true
    }
  ],
  "count": 1
}
```

---

### 2. Aggregate Costs

**POST** `/api/costs/aggregate`

Get aggregated cost metrics across multiple dimensions.

**Request:**
```json
{
  "startTime": "2024-01-01T00:00:00Z",
  "endTime": "2024-01-31T23:59:59Z",
  "groupBy": ["tenant"],
  "limit": 10,
  "sortBy": "cost_desc"
}
```

**Response:**
```json
{
  "aggregates": [
    {
      "dimension": "tenantId",
      "value": "acme-corp",
      "totalCostUsd": 234.56,
      "requestCount": 1234,
      "totalTokens": 567890,
      "avgCostPerRequest": 0.19,
      "firstRequest": "2024-01-01T10:23:45Z",
      "lastRequest": "2024-01-31T18:45:12Z"
    }
  ],
  "count": 1
}
```

**GroupBy Dimensions:**
- `tenant` - Group by tenant ID
- `user` - Group by user ID
- `task` - Group by task/touchpoint
- `conversation` - Group by conversation ID
- `provider` - Group by LLM provider
- `model` - Group by model name

**Sort Options:**
- `cost_desc` - Highest cost first (default)
- `cost_asc` - Lowest cost first
- `time_desc` - Most recent first
- `time_asc` - Oldest first
- `count_desc` - Most requests first

---

### 3. Get Total Cost

**POST** `/api/costs/total`

Get total cost for a specific scope and time range.

**Request:**
```json
{
  "scope": "tenant",
  "scopeId": "acme-corp",
  "startTime": "2024-01-01T00:00:00Z",
  "endTime": "2024-01-31T23:59:59Z"
}
```

**Response:**
```json
{
  "scope": "tenant",
  "scopeId": "acme-corp",
  "totalCostUsd": 234.56,
  "startTime": "2024-01-01T00:00:00Z",
  "endTime": "2024-01-31T23:59:59Z"
}
```

**Scopes:**
- `platform` - Total platform-wide costs
- `tenant` - Costs for a specific tenant (requires scopeId)
- `user` - Costs for a specific user (requires scopeId)
- `task` - Costs for a specific task (requires scopeId)
- `conversation` - Costs for a specific conversation (requires scopeId)

---

### 4. Get Quota Status

**GET** `/api/costs/quotas?scope=tenant&scopeId=acme-corp`

Get current quota status for a scope.

**Response:**
```json
{
  "id": "quota-123",
  "scope": "tenant",
  "scopeId": "acme-corp",
  "limitUsd": 1000,
  "period": "month",
  "currentSpendUsd": 234.56,
  "periodStart": "2024-01-01T00:00:00Z",
  "periodEnd": "2024-02-01T00:00:00Z",
  "isExceeded": false,
  "warningThreshold": 0.8,
  "warningExceeded": false
}
```

---

### 5. Set Quota

**POST** `/api/costs/quotas`

Set or update a quota for a scope.

**Request:**
```json
{
  "scope": "tenant",
  "scopeId": "acme-corp",
  "limitUsd": 1000,
  "period": "month",
  "warningThreshold": 0.8
}
```

**Response:**
```json
{
  "id": "quota-123",
  "scope": "tenant",
  "scopeId": "acme-corp",
  "limitUsd": 1000,
  "period": "month",
  "currentSpendUsd": 0,
  "periodStart": "2024-01-01T00:00:00Z",
  "periodEnd": "2024-02-01T00:00:00Z",
  "isExceeded": false,
  "warningThreshold": 0.8,
  "warningExceeded": false
}
```

**Quota Periods:**
- `hour` - Hourly quota
- `day` - Daily quota
- `week` - Weekly quota (Monday-Sunday)
- `month` - Monthly quota (1st to end of month)

---

### 6. Reset Quota

**DELETE** `/api/costs/quotas?scope=tenant&scopeId=acme-corp`

Reset quota for a scope (starts new period).

**Response:**
```json
{
  "success": true
}
```

---

### 7. Check Quota

**POST** `/api/costs/quotas/check`

Check if a request would exceed quota limits.

**Request:**
```json
{
  "scope": "tenant",
  "scopeId": "acme-corp",
  "estimatedCostUsd": 0.05
}
```

**Response (Allowed):**
```json
{
  "allowed": true,
  "quota": {
    "id": "quota-123",
    "scope": "tenant",
    "scopeId": "acme-corp",
    "limitUsd": 1000,
    "period": "month",
    "currentSpendUsd": 234.56,
    "periodStart": "2024-01-01T00:00:00Z",
    "periodEnd": "2024-02-01T00:00:00Z",
    "isExceeded": false,
    "warningThreshold": 0.8,
    "warningExceeded": false
  },
  "remainingBudgetUsd": 765.44
}
```

**Response (Denied):**
```json
{
  "allowed": false,
  "quota": {
    "id": "quota-123",
    "scope": "tenant",
    "scopeId": "acme-corp",
    "limitUsd": 1000,
    "period": "month",
    "currentSpendUsd": 999.99,
    "periodStart": "2024-01-01T00:00:00Z",
    "periodEnd": "2024-02-01T00:00:00Z",
    "isExceeded": true
  },
  "reason": "Quota exceeded: would spend $1000.04 but limit is $1000.00",
  "remainingBudgetUsd": 0.01
}
```

---

## Usage Examples

### TypeScript Client

```typescript
// Query costs for a tenant in the last month
const response = await fetch('/api/costs/aggregate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    startTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    endTime: new Date().toISOString(),
    groupBy: ['tenant'],
    tenantIds: ['acme-corp'],
    limit: 1,
  }),
});

const { aggregates } = await response.json();
console.log(`Total cost: $${aggregates[0].totalCostUsd.toFixed(2)}`);
```

### Set Monthly Quota

```typescript
// Set $1000/month quota for a tenant
await fetch('/api/costs/quotas', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    scope: 'tenant',
    scopeId: 'acme-corp',
    limitUsd: 1000,
    period: 'month',
    warningThreshold: 0.8,
  }),
});
```

### Check Quota Before Request

```typescript
// Check if request would exceed quota
const checkResponse = await fetch('/api/costs/quotas/check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    scope: 'tenant',
    scopeId: 'acme-corp',
    estimatedCostUsd: 0.05,
  }),
});

const { allowed, reason } = await checkResponse.json();
if (!allowed) {
  throw new Error(`Quota exceeded: ${reason}`);
}
```

---

## Error Responses

All endpoints return standard error responses:

**503 Service Unavailable** - Cost tracking not initialized
```json
{
  "error": "Cost tracking storage not initialized"
}
```

**400 Bad Request** - Invalid request parameters
```json
{
  "error": "scope parameter is required"
}
```

**404 Not Found** - Resource not found
```json
{
  "error": "Quota not found"
}
```

**500 Internal Server Error** - Server error
```json
{
  "error": "Internal server error"
}
```

---

## Initialization

Cost tracking must be initialized in your Next.js app before using these APIs:

```typescript
// app/api/route.ts or middleware.ts
import {
  initCostTracking,
  InMemoryCostStorage,
  InMemoryQuotaProvider,
} from '@reg-copilot/reg-intel-observability';

initCostTracking({
  storage: new InMemoryCostStorage({ maxRecords: 100_000 }),
  quotas: new InMemoryQuotaProvider(),
  enforceQuotas: false, // Set true to enforce quotas in recordLlmCost()
  onQuotaWarning: (quota) => {
    console.warn(`Quota warning: ${quota.scope}:${quota.scopeId} at ${quota.currentSpendUsd}/${quota.limitUsd}`);
  },
  onQuotaExceeded: (quota) => {
    console.error(`Quota exceeded: ${quota.scope}:${quota.scopeId}`);
  },
});
```

---

## Related Documentation

- **Technical Spec:** `/docs/features/MULTI_DIMENSIONAL_LLM_COST_TRACKING.md`
- **Sales Materials:** `/docs/features/COST_TRACKING_SALES_SHEET.md`
- **Architecture:** `/docs/architecture/LLM_COST_TRACKING_ARCHITECTURE.md`
