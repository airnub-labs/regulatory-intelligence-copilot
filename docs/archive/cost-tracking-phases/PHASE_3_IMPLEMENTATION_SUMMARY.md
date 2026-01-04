# Phase 3: Pre-Request Quota Gates & Integration - Implementation Summary

**Date**: 2026-01-04
**Status**: ✅ **COMPLETE**

---

## Executive Summary

Phase 3 implements pre-request quota gates that check quotas BEFORE creating expensive resources (E2B sandboxes) or processing LLM requests. This provides:
- **Fast failure** with proper HTTP 429 responses instead of mid-operation failures
- **Better UX** by rejecting requests immediately when quota exceeded
- **Cost protection** by preventing resource creation when quotas are exhausted
- **Standardized error handling** with detailed quota information

**Key Deliverables:**
- ✅ E2B pre-request quota gates in execution context manager
- ✅ LLM pre-request quota checks in chat API route
- ✅ Standard HTTP 429 error response format with quota details
- ✅ Comprehensive logging for all quota decisions
- ✅ DevOps/Support operational documentation

---

## What Was Implemented

### 1. E2B Pre-Request Quota Gates

**Location**: `packages/reg-intel-conversations/src/executionContextManager.ts`

**Implementation**:
- Added optional `quotaCheckCallback` to `ExecutionContextManagerConfig`
- Callback is invoked BEFORE creating E2B sandbox (line 297-328)
- Estimated cost: $0.03 (5 minutes at standard tier)
- Throws error if quota exceeded, preventing sandbox creation

**Code Flow**:
```typescript
async getOrCreateContext(input) {
  // ... existing context retrieval logic ...

  // PRE-REQUEST QUOTA CHECK (Phase 3)
  if (this.config.quotaCheckCallback) {
    const estimatedCostUsd = 0.03; // ~5 min at $0.0001/sec

    const quotaResult = await this.config.quotaCheckCallback(
      input.tenantId,
      estimatedCostUsd
    );

    if (!quotaResult.allowed) {
      // STOP! Don't create expensive sandbox
      throw new Error(`E2B quota exceeded: ${quotaResult.reason}`);
    }
  }

  // Safe to create sandbox (quota check passed)
  const sandbox = await this.config.e2bClient.create({ ... });
}
```

**Integration**:
- Wired up in `apps/demo-web/src/lib/server/conversations.ts`
- Uses `checkE2BQuotaBeforeOperation` from `e2bCostTracking.ts`
- Configured when `executionContextManager` is created (line 377-386)

### 2. LLM Pre-Request Quota Checks

**Location**: `apps/demo-web/src/lib/costTracking.ts`

**New Function**: `checkLLMQuotaBeforeRequest()`
- Checks LLM quota before processing chat request
- Estimated cost: $0.05 (typical chat request)
- Returns `{ allowed, reason, quotaDetails }`
- Fails open (allows request) if cost tracking not initialized

**Integration**: `apps/demo-web/src/app/api/chat/route.ts`
```typescript
export async function POST(request: Request) {
  // ... auth and tenant resolution ...

  // PRE-REQUEST QUOTA CHECK (Phase 3)
  const quotaCheck = await checkLLMQuotaBeforeRequest(tenantId);

  if (!quotaCheck.allowed) {
    // Return HTTP 429 with SSE stream format
    return createQuotaExceededStreamResponse(
      'llm',
      quotaCheck.reason,
      quotaCheck.quotaDetails
    );
  }

  // Safe to process chat request
  // ...
}
```

### 3. Standard HTTP 429 Error Format

**Location**: `apps/demo-web/src/lib/quotaErrors.ts` (NEW FILE)

**Provides**:
1. **JSON Response Format** (`createQuotaExceededResponse`)
   - Standard HTTP 429 with quota details
   - `Retry-After` header
   - Used for non-streaming API endpoints

2. **SSE Stream Format** (`createQuotaExceededStreamResponse`)
   - SSE error event with quota details
   - Used for streaming chat endpoints
   - Client receives proper error through SSE

3. **Retry-After Calculation** (`calculateRetryAfter`)
   - Calculates seconds until next quota period
   - Daily quotas: Seconds until midnight UTC
   - Weekly quotas: Seconds until next Monday
   - Monthly quotas: Seconds until 1st of next month

**Error Response Structure**:
```json
{
  "error": "quota_exceeded",
  "message": "LLM quota exceeded. Limit: $50.00, Current: $48.50, Requested: $2.00",
  "resourceType": "llm",
  "quotaDetails": {
    "scope": "tenant",
    "scopeId": "acme-corp",
    "resourceType": "llm",
    "limitUsd": 50.00,
    "currentSpendUsd": 48.50,
    "estimatedCostUsd": 2.00,
    "remainingUsd": 1.50,
    "period": "day",
    "utilizationPercent": 97.0
  },
  "retryAfter": 43200
}
```

### 4. Comprehensive Logging

**E2B Quota Logging**:
```typescript
// Before sandbox creation (executionContextManager.ts:303-322)
this.logger.debug({ tenantId, estimatedCostUsd }, 'Checking E2B quota before sandbox creation');

// If quota check passes
this.logger.debug({ tenantId, quotaCheckPassed: true }, 'E2B quota check passed');

// If quota exceeded
this.logger.error({
  tenantId,
  estimatedCostUsd,
  reason: quotaResult.reason
}, 'E2B quota exceeded, cannot create sandbox');
```

**LLM Quota Logging**:
```typescript
// Before chat request (chat/route.ts:61-65)
logger.warn({
  tenantId,
  userId,
  reason: quotaCheck.reason
}, 'Chat request denied due to LLM quota exceeded');

// In quota check function (costTracking.ts:305-310)
logger.warn({
  tenantId,
  estimatedCostUsd,
  currentSpend,
  limit
}, 'LLM quota check failed');

// If quota check passes (costTracking.ts:329-333)
logger.debug({
  tenantId,
  estimatedCostUsd,
  quotaCheckPassed: true
}, 'LLM quota check passed');
```

### 5. Operational Documentation

**Created Files**:
1. `docs/operations/QUOTA_CONFIGURATION_GUIDE.md`
   - Complete quota management guide for DevOps/Support
   - Subscription tier templates (Free/Pro/Enterprise)
   - Onboarding procedures
   - Monitoring queries
   - Troubleshooting procedures
   - Automated onboarding script examples

2. `docs/operations/TENANT_ONBOARDING_CHECKLIST.md`
   - Step-by-step checklist for onboarding new tenants
   - **Critical warning**: NO QUOTA = UNLIMITED ACCESS
   - Tier-specific SQL examples for quota creation
   - Verification steps (MUST have 2 quota records: LLM + E2B)
   - Post-onboarding monitoring procedures

---

## Architecture Changes

### Dependency Injection Pattern

**Before Phase 3**:
- E2B sandboxes created without quota checks
- LLM requests had quota checks but only during cost recording
- No pre-request validation

**After Phase 3**:
- ExecutionContextManager accepts optional `quotaCheckCallback`
- Chat API route performs pre-request quota validation
- Fail-fast pattern: Check quota → Create resource → Record actual cost
- Clean separation of concerns via dependency injection

### Error Handling Flow

```
┌─────────────────────────────────────────────────────────────┐
│ CLIENT REQUEST                                              │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 3: PRE-REQUEST QUOTA CHECK                           │
│ - Check quota with estimated cost                          │
│ - Fast failure if exceeded                                 │
│ - Return HTTP 429 with quota details                       │
└────────────────┬────────────────────────────────────────────┘
                 │ allowed = true
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ RESOURCE CREATION / LLM REQUEST                            │
│ - Create E2B sandbox OR process chat request              │
│ - Perform actual operation                                │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 2: COST RECORDING & QUOTA UPDATE                    │
│ - Record actual cost to database                          │
│ - Increment quota spend (atomic)                          │
│ - Check thresholds (80%, 90%, 100%)                       │
│ - Trigger callbacks if needed                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Files Created/Modified

### Created Files

1. `apps/demo-web/src/lib/quotaErrors.ts` - Standard HTTP 429 error responses
2. `docs/operations/QUOTA_CONFIGURATION_GUIDE.md` - DevOps operational guide
3. `docs/operations/TENANT_ONBOARDING_CHECKLIST.md` - Tenant onboarding checklist
4. `PHASE_3_IMPLEMENTATION_SUMMARY.md` - This file

### Modified Files

1. **packages/reg-intel-conversations/src/executionContextManager.ts**
   - Added `E2BQuotaCheckCallback` type
   - Added `quotaCheckCallback` to `ExecutionContextManagerConfig`
   - Added pre-request quota check before sandbox creation

2. **packages/reg-intel-next-adapter/src/executionContext.ts**
   - Imported `E2BQuotaCheckCallback` type
   - Added `quotaCheckCallback` to `ExecutionContextConfig`
   - Passed callback to ExecutionContextManager constructor

3. **apps/demo-web/src/lib/server/conversations.ts**
   - Imported `checkE2BQuotaBeforeOperation`
   - Wired up quota callback when creating execution context manager

4. **apps/demo-web/src/lib/costTracking.ts**
   - Added `checkLLMQuotaBeforeRequest()` function
   - Pre-request quota validation for LLM requests

5. **apps/demo-web/src/app/api/chat/route.ts**
   - Imported quota check functions and error responses
   - Added pre-request LLM quota check
   - Returns HTTP 429 SSE stream if quota exceeded

---

## Testing

### Automated Tests

**Existing Tests** (from Phase 2):
```bash
npm run test:quotas
```

Tests quota enforcement at the service level:
1. ✓ Verify quotas configured
2. ✓ E2B quota check function
3. ✓ Warning threshold detection
4. ✓ Quota breach denial
5. ✓ Quota spend increment

### Manual Testing

#### Test E2B Pre-Request Quota Gate

```bash
# 1. Set very low E2B quota
psql "..." -c "UPDATE copilot_internal.cost_quotas
SET limit_usd = 0.01, current_spend_usd = 0.00
WHERE scope = 'tenant' AND resource_type = 'e2b';"

# 2. Try to create execution context (should fail BEFORE sandbox creation)
# Make a chat request that triggers code execution
# Expected: Error thrown before sandbox is created
# Log output: "E2B quota exceeded, cannot create sandbox"

# 3. Reset quota
psql "..." -c "UPDATE copilot_internal.cost_quotas
SET limit_usd = 10.00, current_spend_usd = 0.00
WHERE scope = 'tenant' AND resource_type = 'e2b';"
```

**Expected Behavior**:
- Quota check happens at `executionContextManager.ts:297-328`
- Sandbox creation is NEVER attempted
- Error thrown immediately: "E2B quota exceeded: ..."
- No E2B sandbox created (no cost incurred)

#### Test LLM Pre-Request Quota Gate

```bash
# 1. Set very low LLM quota
psql "..." -c "UPDATE copilot_internal.cost_quotas
SET limit_usd = 0.01, current_spend_usd = 0.00
WHERE scope = 'tenant' AND resource_type = 'llm';"

# 2. Make a chat request via the app
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: ..." \
  -d '{"message": "Hello", "conversationId": "..."}'

# Expected response: HTTP 429 with SSE stream
# event: error
# data: {"error":"quota_exceeded","message":"LLM quota exceeded...","resourceType":"llm",...}
#
# event: done
# data: {"status":"quota_exceeded"}

# 3. Reset quota
psql "..." -c "UPDATE copilot_internal.cost_quotas
SET limit_usd = 50.00, current_spend_usd = 0.00
WHERE scope = 'tenant' AND resource_type = 'llm';"
```

**Expected Behavior**:
- Quota check happens at `chat/route.ts:58`
- Request rejected BEFORE streaming starts
- HTTP 429 response with quota details
- No LLM API call made (no cost incurred)

#### Test Retry-After Calculation

```bash
# Temporarily set quota to force HTTP 429
psql "..." -c "UPDATE copilot_internal.cost_quotas
SET limit_usd = 0.01
WHERE scope = 'tenant' AND resource_type = 'llm';"

# Make request and check headers
curl -v -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: ..." \
  -d '{"message": "Hello"}'

# Check for Retry-After header (should be present but not shown in SSE stream)
# Note: SSE responses don't include Retry-After in visible stream,
# but it's available in response headers

# Reset quota
psql "..." -c "UPDATE copilot_internal.cost_quotas
SET limit_usd = 50.00, current_spend_usd = 0.00
WHERE scope = 'tenant' AND resource_type = 'llm';"
```

---

## Configuration

### Environment Variables

Phase 3 uses the same environment variables as Phase 2:

| Variable | Default | Description |
|----------|---------|-------------|
| `ENFORCE_COST_QUOTAS` | `true` | Enable/disable LLM quota enforcement |
| `ENFORCE_E2B_QUOTAS` | `true` | Enable/disable E2B quota enforcement |
| `COST_ALERT_CHANNELS` | `none` | Comma-separated: `slack,email,pagerduty` |
| `COST_ALERT_SLACK_WEBHOOK_URL` | - | Slack webhook for cost alerts |
| `COST_ALERT_EMAIL_SMTP_HOST` | - | SMTP host for email alerts |
| `COST_ALERT_PAGERDUTY_ROUTING_KEY` | - | PagerDuty routing key for alerts |

### Quota Behavior

**No Quota Record = UNLIMITED ACCESS** (by design from Phase 1)

To enable quota enforcement for a tenant:
```sql
-- Create LLM quota
INSERT INTO copilot_internal.cost_quotas (
  scope, scope_id, resource_type, limit_usd, period
) VALUES (
  'tenant', '<TENANT_ID>', 'llm', 50.00, 'day'
);

-- Create E2B quota
INSERT INTO copilot_internal.cost_quotas (
  scope, scope_id, resource_type, limit_usd, period
) VALUES (
  'tenant', '<TENANT_ID>', 'e2b', 10.00, 'day'
);
```

**CRITICAL**: Always create BOTH quotas (LLM + E2B) during tenant onboarding!

---

## Acceptance Criteria

All Phase 3 requirements have been met:

- ✅ **Pre-request quota gates for E2B**
  - Quota checked BEFORE sandbox creation
  - Prevents expensive resource creation if quota exceeded
  - Integrated via dependency injection (quotaCheckCallback)

- ✅ **Pre-request quota gates for LLM**
  - Quota checked BEFORE processing chat request
  - Prevents LLM API calls if quota exceeded
  - Returns HTTP 429 immediately

- ✅ **Standard HTTP 429 error format**
  - JSON response format with quota details
  - SSE stream format for streaming endpoints
  - Retry-After header calculation
  - Both response types implemented

- ✅ **Comprehensive logging**
  - All quota checks logged (debug level)
  - Quota denials logged (warn/error level)
  - Includes tenant ID, estimated cost, reason

- ✅ **DevOps/Support documentation**
  - Quota configuration guide
  - Tenant onboarding checklist
  - Critical warnings about unlimited access
  - Monitoring and troubleshooting procedures

---

## Quota Decision Points

### E2B Quota Gates

| Location | When | Action if Exceeded |
|----------|------|-------------------|
| `executionContextManager.ts:297` | Before sandbox creation | Throw error, prevent sandbox |
| `e2bCostTracking.ts:96` | Before recording cost | Already created, record cost |

**Flow**:
1. **Pre-request check** (Phase 3) → Prevents sandbox creation
2. **Create sandbox** → Only if quota allows
3. **Record actual cost** (Phase 2) → Updates quota spend

### LLM Quota Gates

| Location | When | Action if Exceeded |
|----------|------|-------------------|
| `chat/route.ts:58` | Before processing request | Return HTTP 429, reject request |
| `costTracking.ts` (via service) | During cost recording | Return null, block API call |

**Flow**:
1. **Pre-request check** (Phase 3) → Rejects request early
2. **Process chat request** → Only if quota allows
3. **Record cost during LLM call** (Phase 2) → Updates quota spend

---

## Error Scenarios

### Scenario 1: E2B Quota Exceeded

**Trigger**: User attempts code execution when E2B quota exhausted

**Flow**:
1. Chat request arrives → LLM quota check passes
2. ComplianceEngine determines code execution needed
3. ExecutionContextManager.getOrCreateContext() called
4. **Pre-request quota check fails** (Phase 3)
5. Error thrown: "E2B quota exceeded: ..."
6. Sandbox never created
7. Error propagated to user

**User Experience**:
- Chat message received
- Error message displayed: "Unable to execute code: E2B quota exceeded"
- No sandbox created (cost saved)

### Scenario 2: LLM Quota Exceeded

**Trigger**: User sends chat message when LLM quota exhausted

**Flow**:
1. POST /api/chat received
2. **Pre-request quota check fails** (Phase 3)
3. HTTP 429 returned with SSE stream format
4. No LLM API call made

**User Experience**:
- Chat input submitted
- Error event received via SSE:
  ```
  event: error
  data: {"error":"quota_exceeded","message":"LLM quota exceeded..."}

  event: done
  data: {"status":"quota_exceeded"}
  ```
- Client displays quota exceeded error
- Retry-After duration shown if available

### Scenario 3: Quota Check Service Unavailable

**Behavior**: Fail open (allow request)

**Rationale**:
- Availability > strict enforcement
- Temporary service issues shouldn't break app
- Actual costs still recorded (Phase 2)
- Alerts triggered if spending too high

---

## Monitoring

### Key Metrics to Track

**E2B Quota Gates**:
```sql
-- Count quota check denials
SELECT COUNT(*) as denials_last_hour
FROM application_logs
WHERE timestamp > NOW() - INTERVAL '1 hour'
  AND message LIKE '%E2B quota exceeded%'
  AND level = 'error';
```

**LLM Quota Gates**:
```sql
-- Count quota check denials
SELECT COUNT(*) as denials_last_hour
FROM application_logs
WHERE timestamp > NOW() - INTERVAL '1 hour'
  AND message LIKE '%Chat request denied due to LLM quota exceeded%'
  AND level = 'warn';
```

**Tenants Approaching Limits**:
```sql
-- Tenants at >80% utilization
SELECT
  scope_id as tenant_id,
  resource_type,
  limit_usd,
  current_spend_usd,
  ROUND((current_spend_usd / limit_usd * 100)::numeric, 1) as utilization_percent,
  (limit_usd - current_spend_usd) as remaining_usd
FROM copilot_internal.cost_quotas
WHERE scope = 'tenant'
  AND (current_spend_usd / limit_usd) >= 0.8
  AND (current_spend_usd / limit_usd) < 1.0
ORDER BY utilization_percent DESC;
```

---

## Troubleshooting

### Issue: Quota checks not working

**Symptom**: Requests succeed even after exceeding quota

**Solutions**:
1. Check enforcement enabled:
   ```bash
   echo $ENFORCE_COST_QUOTAS  # Should NOT be 'false'
   echo $ENFORCE_E2B_QUOTAS   # Should NOT be 'false'
   ```

2. Check quota exists:
   ```sql
   SELECT * FROM copilot_internal.cost_quotas
   WHERE scope = 'tenant' AND scope_id = '<TENANT_ID>';
   -- Should return 2 rows (llm + e2b)
   ```

3. Check logs for quota initialization:
   ```bash
   grep "Cost tracking initialized successfully" logs/app.log
   grep "E2B cost tracking initialized successfully" logs/app.log
   ```

### Issue: HTTP 429 not returned

**Symptom**: Request fails but without HTTP 429

**Solutions**:
1. Check quota check happens before processing:
   - E2B: `executionContextManager.ts:297`
   - LLM: `chat/route.ts:58`

2. Verify quota error response is created:
   ```typescript
   // Should call createQuotaExceededStreamResponse
   return createQuotaExceededStreamResponse('llm', message, quotaDetails);
   ```

3. Check logs:
   ```bash
   grep "quota exceeded" logs/app.log
   grep "quota check" logs/app.log
   ```

### Issue: Retry-After not calculated

**Symptom**: HTTP 429 response missing Retry-After

**Solutions**:
1. Check quota has period set:
   ```sql
   SELECT scope_id, resource_type, period
   FROM copilot_internal.cost_quotas
   WHERE scope = 'tenant' AND scope_id = '<TENANT_ID>';
   ```

2. Verify calculation is called:
   ```typescript
   const retryAfter = quotaCheck.quotaDetails?.period
     ? calculateRetryAfter(quotaCheck.quotaDetails.period)
     : undefined;
   ```

---

## Next Steps

Phase 3 is complete! The cost tracking system now has:
1. ✅ Database setup & migration (Phase 1)
2. ✅ Pricing configuration & quota enforcement (Phase 2)
3. ✅ Pre-request quota gates & integration (Phase 3)

### Suggested Future Enhancements

1. **User-Level Quotas**
   - Add user quota checks in addition to tenant quotas
   - Prevent individual user abuse

2. **Dynamic Quota Adjustment**
   - Auto-increase quotas based on usage patterns
   - Tiered quota scaling (e.g., first 100 requests free)

3. **Quota Pooling**
   - Allow tenants to pool quotas across users
   - Enterprise quota sharing

4. **Quota Reservation**
   - Reserve quota capacity for specific operations
   - Priority queuing based on quota availability

5. **Advanced Alerting**
   - Predictive quota exhaustion alerts
   - Weekly/monthly usage summaries
   - Cost trend analysis

---

## Production Deployment Checklist

Before deploying Phase 3 to production:

- [ ] Run Phase 1 verification: `npm run verify:phase1`
- [ ] Run Phase 2 tests: `npm run test:quotas`
- [ ] Review quota configurations for all tenants
- [ ] Ensure all tenants have BOTH quotas configured (LLM + E2B)
- [ ] Configure notification channels (Slack/Email/PagerDuty)
- [ ] Test LLM quota gate with low limit
- [ ] Test E2B quota gate with low limit
- [ ] Verify HTTP 429 responses in staging
- [ ] Check Retry-After headers are present
- [ ] Review logs for quota check decisions
- [ ] Update runbooks with Phase 3 quota gates
- [ ] Train support team on quota exceeded scenarios
- [ ] Set up monitoring dashboards for quota denials
- [ ] Test quota check failure modes (service unavailable)
- [ ] Document rollback procedure

---

## References

- **Phase 1 Summary**: `PHASE_1_IMPLEMENTATION_SUMMARY.md`
- **Phase 2 Summary**: `PHASE_2_IMPLEMENTATION_SUMMARY.md`
- **E2B Implementation Guide**: `E2B_COST_TRACKING_IMPLEMENTATION_GUIDE.md`
- **LLM Cost Tracking Audit**: `LLM_COST_TRACKING_AUDIT.md`
- **Quota Configuration Guide**: `docs/operations/QUOTA_CONFIGURATION_GUIDE.md`
- **Tenant Onboarding Checklist**: `docs/operations/TENANT_ONBOARDING_CHECKLIST.md`
- **Local Development Guide**: `docs/development/local/LOCAL_DEVELOPMENT.md`

---

**End of Phase 3 Implementation Summary**
