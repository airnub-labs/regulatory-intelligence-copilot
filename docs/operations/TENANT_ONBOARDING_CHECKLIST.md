# Tenant Onboarding Checklist

**Version**: 1.0
**Date**: 2026-01-04

---

## Pre-Onboarding

- [ ] **Contract signed** with agreed subscription tier (Free/Pro/Enterprise)
- [ ] **Pricing tier documented** in CRM/ticketing system
- [ ] **Primary contact email** confirmed
- [ ] **Notification preferences** collected (Slack webhook, email, PagerDuty)

---

## Phase 1: Account Creation

- [ ] **Create tenant in auth system**
  ```bash
  # Generate tenant UUID
  TENANT_ID=$(uuidgen)
  echo "Tenant ID: $TENANT_ID"

  # Create tenant record (your process here)
  ```

- [ ] **Record tenant ID** in tracking system
- [ ] **Create initial admin user** for tenant
- [ ] **Verify authentication** works for admin user

---

## Phase 2: Quota Configuration ⚠️ **CRITICAL**

### ⚠️ WARNING
**If you skip this step, the tenant will have UNLIMITED LLM and E2B access!**

### Check Current Status
- [ ] **Verify NO quotas exist** (should be empty for new tenant):
  ```sql
  SELECT * FROM copilot_internal.cost_quotas
  WHERE scope = 'tenant' AND scope_id = '<TENANT_ID>';

  -- Expected: 0 rows (new tenant)
  ```

### Configure Quotas Based on Tier

#### Option A: Free Tier
- [ ] **Create LLM quota** ($5/day):
  ```sql
  INSERT INTO copilot_internal.cost_quotas (
    scope, scope_id, resource_type, limit_usd, period,
    period_start, period_end, current_spend_usd, warning_threshold
  ) VALUES (
    'tenant', '<TENANT_ID>', 'llm', 5.00, 'day',
    date_trunc('day', NOW()),
    date_trunc('day', NOW() + INTERVAL '1 day'),
    0.00, 0.80
  );
  ```

- [ ] **Create E2B quota** ($2/day):
  ```sql
  INSERT INTO copilot_internal.cost_quotas (
    scope, scope_id, resource_type, limit_usd, period,
    period_start, period_end, current_spend_usd, warning_threshold
  ) VALUES (
    'tenant', '<TENANT_ID>', 'e2b', 2.00, 'day',
    date_trunc('day', NOW()),
    date_trunc('day', NOW() + INTERVAL '1 day'),
    0.00, 0.80
  );
  ```

#### Option B: Pro Tier
- [ ] **Create LLM quota** ($100/day):
  ```sql
  INSERT INTO copilot_internal.cost_quotas (
    scope, scope_id, resource_type, limit_usd, period,
    period_start, period_end, current_spend_usd, warning_threshold
  ) VALUES (
    'tenant', '<TENANT_ID>', 'llm', 100.00, 'day',
    date_trunc('day', NOW()),
    date_trunc('day', NOW() + INTERVAL '1 day'),
    0.00, 0.80
  );
  ```

- [ ] **Create E2B quota** ($20/day):
  ```sql
  INSERT INTO copilot_internal.cost_quotas (
    scope, scope_id, resource_type, limit_usd, period,
    period_start, period_end, current_spend_usd, warning_threshold
  ) VALUES (
    'tenant', '<TENANT_ID>', 'e2b', 20.00, 'day',
    date_trunc('day', NOW()),
    date_trunc('day', NOW() + INTERVAL '1 day'),
    0.00, 0.80
  );
  ```

#### Option C: Enterprise Tier
- [ ] **Create LLM quota** ($100,000/month - tracked but effectively unlimited):
  ```sql
  INSERT INTO copilot_internal.cost_quotas (
    scope, scope_id, resource_type, limit_usd, period,
    period_start, period_end, current_spend_usd, warning_threshold
  ) VALUES (
    'tenant', '<TENANT_ID>', 'llm', 100000.00, 'month',
    date_trunc('month', NOW()),
    date_trunc('month', NOW() + INTERVAL '1 month'),
    0.00, 0.90
  );
  ```

- [ ] **Create E2B quota** ($50,000/month - tracked but effectively unlimited):
  ```sql
  INSERT INTO copilot_internal.cost_quotas (
    scope, scope_id, resource_type, limit_usd, period,
    period_start, period_end, current_spend_usd, warning_threshold
  ) VALUES (
    'tenant', '<TENANT_ID>', 'e2b', 50000.00, 'month',
    date_trunc('month', NOW()),
    date_trunc('month', NOW() + INTERVAL '1 month'),
    0.00, 0.90
  );
  ```

### Verify Quota Configuration ✅
- [ ] **Confirm quotas created** (MUST return 2 rows):
  ```sql
  SELECT scope, resource_type, limit_usd, period, warning_threshold
  FROM copilot_internal.cost_quotas
  WHERE scope = 'tenant' AND scope_id = '<TENANT_ID>';

  -- Expected: 2 rows (llm and e2b)
  -- If 0 rows: ⚠️ STOP! Tenant has unlimited access!
  ```

- [ ] **Verify limits match contract**:
  - LLM limit: $______/day (or /month for enterprise)
  - E2B limit: $______/day (or /month for enterprise)
  - Warning threshold: 80% (0.80) for free/pro, 90% (0.90) for enterprise

---

## Phase 3: Notification Setup

- [ ] **Configure cost alert channels** (if tenant provided):
  - [ ] Slack webhook URL: ________________________
  - [ ] Email addresses: ________________________
  - [ ] PagerDuty routing key: ________________________

- [ ] **Test notifications** (optional but recommended):
  ```sql
  -- Temporarily set low quota to trigger warning
  UPDATE copilot_internal.cost_quotas
  SET limit_usd = 0.01
  WHERE scope = 'tenant' AND scope_id = '<TENANT_ID>' AND resource_type = 'llm';

  -- Have tenant make a request (should trigger warning)
  -- Then reset:
  UPDATE copilot_internal.cost_quotas
  SET limit_usd = <ORIGINAL_LIMIT>
  WHERE scope = 'tenant' AND scope_id = '<TENANT_ID>' AND resource_type = 'llm';
  ```

---

## Phase 4: Access Verification

- [ ] **Admin user can log in** successfully
- [ ] **Admin can access dashboard** at appropriate URL
- [ ] **Admin can create additional users** (if applicable)
- [ ] **Test basic functionality**:
  - [ ] Create a conversation
  - [ ] Send a message
  - [ ] Verify response received

---

## Phase 5: Documentation & Handoff

- [ ] **Send welcome email** to tenant admin with:
  - [ ] Login credentials (if applicable)
  - [ ] Dashboard URL
  - [ ] Support contact information
  - [ ] Getting started guide
  - [ ] Quota limits and monitoring instructions

- [ ] **Document in internal systems**:
  - [ ] Tenant ID: ________________________
  - [ ] Subscription tier: ________________________
  - [ ] Start date: ________________________
  - [ ] Quota limits: LLM $______, E2B $______
  - [ ] Contact email: ________________________

- [ ] **Add to monitoring dashboards**:
  - [ ] Cost tracking dashboard
  - [ ] Quota utilization dashboard
  - [ ] Usage analytics

---

## Phase 6: Post-Onboarding Monitoring (First 7 Days)

- [ ] **Day 1**: Check for any quota issues or authentication problems
- [ ] **Day 3**: Review usage patterns, verify quotas are appropriate
- [ ] **Day 7**: Follow up with tenant to ensure successful onboarding

### Weekly Checks
```sql
-- Check tenant's usage in first week
SELECT
  resource_type,
  limit_usd,
  current_spend_usd,
  ROUND((current_spend_usd / limit_usd * 100)::numeric, 1) as utilization
FROM copilot_internal.cost_quotas
WHERE scope = 'tenant' AND scope_id = '<TENANT_ID>';
```

---

## Common Issues & Fixes

### Issue: Tenant has unlimited access after onboarding
**Root cause**: Forgot to create quota records
**Fix**:
```sql
-- Check quotas
SELECT COUNT(*) FROM copilot_internal.cost_quotas
WHERE scope = 'tenant' AND scope_id = '<TENANT_ID>';

-- If 0, create quotas immediately (see Phase 2)
```

### Issue: Tenant immediately hits quota limits
**Root cause**: Quota too low for their use case
**Fix**:
```sql
-- Increase limits
UPDATE copilot_internal.cost_quotas
SET limit_usd = <NEW_HIGHER_LIMIT>
WHERE scope = 'tenant' AND scope_id = '<TENANT_ID>' AND resource_type = 'llm';

-- Document tier upgrade in CRM
```

### Issue: Quota warnings not being received
**Root cause**: Notification channels not configured
**Fix**:
- Verify environment variables: `COST_ALERT_CHANNELS`, `COST_ALERT_SLACK_WEBHOOK_URL`, etc.
- Test notification delivery
- Check application logs for notification errors

---

## Automated Onboarding Script

**Location**: `scripts/tenant-onboarding.sh`

**Usage**:
```bash
# Onboard a new tenant
./scripts/tenant-onboarding.sh <tenant_id> <tier>

# Example:
./scripts/tenant-onboarding.sh "550e8400-e29b-41d4-a716-446655440000" "pro"
```

**What it does**:
1. Creates LLM and E2B quotas based on tier
2. Sets appropriate limits and warning thresholds
3. Verifies quotas were created successfully
4. Outputs summary for documentation

---

## Tier Comparison

| Tier | LLM Limit | E2B Limit | Period | Warning |
|------|-----------|-----------|--------|---------|
| **Free** | $5.00 | $2.00 | Daily | 80% |
| **Pro** | $100.00 | $20.00 | Daily | 80% |
| **Enterprise** | $100,000.00 | $50,000.00 | Monthly | 90% |

---

## Final Verification

Before marking onboarding as complete, verify ALL of the following:

- [ ] ✅ Tenant ID documented
- [ ] ✅ Tier documented and matches contract
- [ ] ✅ **2 quota records exist** (LLM + E2B)
- [ ] ✅ Quota limits match tier
- [ ] ✅ Admin user can log in
- [ ] ✅ Basic functionality tested
- [ ] ✅ Welcome email sent
- [ ] ✅ Added to monitoring dashboards

**Onboarding completed by**: ____________________
**Date**: ____________________
**Tenant ID**: ____________________
**Tier**: ____________________

---

**REMEMBER: Missing quota configuration = unlimited access!**
**Always verify quotas before activating a tenant.**
