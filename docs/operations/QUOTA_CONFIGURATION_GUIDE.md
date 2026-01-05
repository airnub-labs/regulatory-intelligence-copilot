# Cost Quota Configuration - Operational Guide

**Audience**: DevOps, Support, Platform Engineering
**Date**: 2026-01-04
**Status**: 🔴 **CRITICAL - READ BEFORE ONBOARDING TENANTS/USERS**

---

## ⚠️ CRITICAL WARNING

**NO QUOTA RECORD = UNLIMITED ACCESS**

The cost tracking system has a **critical default behavior**:

- ✅ **If a quota record EXISTS** → Quota is enforced (tenant/user has a limit)
- 🔴 **If NO quota record exists** → **UNLIMITED ACCESS** (no limit!)

**This means if you forget to create a quota during tenant onboarding, they get unlimited LLM and E2B access by default!**

---

## Why This Design?

This "no quota = unlimited" behavior is intentional:

1. **Allows flexible tiering**: Enterprise/VIP tenants can have unlimited access without special configuration
2. **Prevents false positives**: Platform-level quotas can exist without requiring per-tenant quotas
3. **Simplifies testing**: Test tenants don't need quota setup

**However, this also means onboarding MUST include quota configuration for tenants who should have limits!**

---

## Quota Onboarding Checklist

### For New Tenants

**Before activating a new tenant**, verify quota configuration:

```sql
-- 1. Check if tenant has quotas configured
SELECT scope, resource_type, limit_usd, period
FROM copilot_internal.cost_quotas
WHERE scope = 'tenant'
  AND scope_id = '<TENANT_ID>';

-- Expected result: At least 2 rows (LLM and E2B quotas)
-- If 0 rows: ⚠️ TENANT HAS UNLIMITED ACCESS!
```

### Required Quotas Per Tenant

**Minimum configuration** for a standard tenant:

```sql
-- 1. LLM quota
INSERT INTO copilot_internal.cost_quotas (
  scope, scope_id, resource_type, limit_usd, period, period_start, period_end, current_spend_usd, warning_threshold
) VALUES (
  'tenant',
  '<TENANT_ID>',
  'llm',
  50.00,  -- $50/day (adjust based on tier)
  'day',
  date_trunc('day', NOW()),
  date_trunc('day', NOW() + INTERVAL '1 day'),
  0.00,
  0.80  -- Warn at 80%
);

-- 2. E2B quota
INSERT INTO copilot_internal.cost_quotas (
  scope, scope_id, resource_type, limit_usd, period, period_start, period_end, current_spend_usd, warning_threshold
) VALUES (
  'tenant',
  '<TENANT_ID>',
  'e2b',
  10.00,  -- $10/day (adjust based on tier)
  'day',
  date_trunc('day', NOW()),
  date_trunc('day', NOW() + INTERVAL '1 day'),
  0.00,
  0.80  -- Warn at 80%
);
```

---

## Subscription Tier Templates

### Free Tier
```sql
-- LLM: $5/day
INSERT INTO copilot_internal.cost_quotas (scope, scope_id, resource_type, limit_usd, period, ...)
VALUES ('tenant', '<TENANT_ID>', 'llm', 5.00, 'day', ...);

-- E2B: $2/day
INSERT INTO copilot_internal.cost_quotas (scope, scope_id, resource_type, limit_usd, period, ...)
VALUES ('tenant', '<TENANT_ID>', 'e2b', 2.00, 'day', ...);
```

### Pro Tier
```sql
-- LLM: $100/day
INSERT INTO copilot_internal.cost_quotas (scope, scope_id, resource_type, limit_usd, period, ...)
VALUES ('tenant', '<TENANT_ID>', 'llm', 100.00, 'day', ...);

-- E2B: $20/day
INSERT INTO copilot_internal.cost_quotas (scope, scope_id, resource_type, limit_usd, period, ...)
VALUES ('tenant', '<TENANT_ID>', 'e2b', 20.00, 'day', ...);
```

### Enterprise Tier
```sql
-- Option 1: Very high limits (effectively unlimited but tracked)
INSERT INTO copilot_internal.cost_quotas (scope, scope_id, resource_type, limit_usd, period, ...)
VALUES ('tenant', '<TENANT_ID>', 'llm', 100000.00, 'month', ...);

INSERT INTO copilot_internal.cost_quotas (scope, scope_id, resource_type, limit_usd, period, ...)
VALUES ('tenant', '<TENANT_ID>', 'e2b', 50000.00, 'month', ...);

-- Option 2: No quota records (truly unlimited, not recommended)
-- Just don't create any quota records for this tenant
-- ⚠️ WARNING: No cost tracking or warnings!
```

---

## Tenant Onboarding Procedure

### Step 1: Create Tenant in Auth System
```bash
# Your tenant creation process
# ...
TENANT_ID="<generated-uuid>"
```

### Step 2: Set Quotas (MANDATORY for non-enterprise)
```bash
# Run quota setup script
psql "$DATABASE_URL" <<SQL
-- LLM quota (adjust limit_usd based on tier)
INSERT INTO copilot_internal.cost_quotas (
  scope, scope_id, resource_type, limit_usd, period, period_start, period_end, current_spend_usd, warning_threshold
) VALUES (
  'tenant', '$TENANT_ID', 'llm', 50.00, 'day',
  date_trunc('day', NOW()), date_trunc('day', NOW() + INTERVAL '1 day'),
  0.00, 0.80
);

-- E2B quota
INSERT INTO copilot_internal.cost_quotas (
  scope, scope_id, resource_type, limit_usd, period, period_start, period_end, current_spend_usd, warning_threshold
) VALUES (
  'tenant', '$TENANT_ID', 'e2b', 10.00, 'day',
  date_trunc('day', NOW()), date_trunc('day', NOW() + INTERVAL '1 day'),
  0.00, 0.80
);
SQL
```

### Step 3: Verify Configuration
```bash
# Verify quotas created
psql "$DATABASE_URL" -c "
  SELECT scope, resource_type, limit_usd, period
  FROM copilot_internal.cost_quotas
  WHERE scope = 'tenant' AND scope_id = '$TENANT_ID';
"

# Expected output: 2 rows (llm and e2b)
# If 0 rows: ⚠️ FIX IMMEDIATELY - tenant has unlimited access!
```

### Step 4: Activate Tenant
```bash
# Now safe to activate tenant
# Your activation process...
```

---

## User Onboarding (Per-User Quotas)

**Per-user quotas are OPTIONAL** - most deployments only use tenant-level quotas.

If you need per-user limits:

```sql
-- Example: Limit a specific user to $5/day LLM
INSERT INTO copilot_internal.cost_quotas (
  scope, scope_id, resource_type, limit_usd, period, period_start, period_end, current_spend_usd, warning_threshold
) VALUES (
  'user', '<USER_ID>', 'llm', 5.00, 'day',
  date_trunc('day', NOW()), date_trunc('day', NOW() + INTERVAL '1 day'),
  0.00, 0.80
);
```

**Note**: User quotas are checked IN ADDITION TO tenant quotas (user must be within both limits).

---

## Common Operations

### Check Tenant Quota Status
```sql
SELECT
  scope,
  scope_id,
  resource_type,
  limit_usd,
  current_spend_usd,
  ROUND((current_spend_usd / limit_usd * 100)::numeric, 2) as utilization_percent,
  period,
  period_end
FROM copilot_internal.cost_quotas
WHERE scope = 'tenant' AND scope_id = '<TENANT_ID>';
```

### Find Tenants Without Quotas (AUDIT)
```sql
-- ⚠️ WARNING: These tenants have UNLIMITED access!
SELECT DISTINCT tenant_id
FROM copilot_internal.llm_cost_records
WHERE tenant_id NOT IN (
  SELECT scope_id
  FROM copilot_internal.cost_quotas
  WHERE scope = 'tenant' AND resource_type = 'llm'
)
ORDER BY tenant_id;
```

### Reset Quota for New Period
```sql
-- Quotas auto-reset at period boundaries, but you can manually reset:
UPDATE copilot_internal.cost_quotas
SET
  current_spend_usd = 0.00,
  period_start = date_trunc('day', NOW()),
  period_end = date_trunc('day', NOW() + INTERVAL '1 day'),
  updated_at = NOW()
WHERE scope = 'tenant'
  AND scope_id = '<TENANT_ID>'
  AND resource_type = 'llm';
```

### Increase Quota Temporarily
```sql
-- Increase limit for special event
UPDATE copilot_internal.cost_quotas
SET
  limit_usd = 200.00,  -- Temporarily increase from $50 to $200
  updated_at = NOW()
WHERE scope = 'tenant'
  AND scope_id = '<TENANT_ID>'
  AND resource_type = 'llm';

-- REMEMBER to reset afterwards!
```

### Disable Quota (Give Unlimited Access)
```sql
-- Method 1: Delete quota record (truly unlimited)
DELETE FROM copilot_internal.cost_quotas
WHERE scope = 'tenant'
  AND scope_id = '<TENANT_ID>'
  AND resource_type = 'llm';

-- Method 2: Set very high limit (tracked but effectively unlimited)
UPDATE copilot_internal.cost_quotas
SET
  limit_usd = 999999.99,
  updated_at = NOW()
WHERE scope = 'tenant'
  AND scope_id = '<TENANT_ID>'
  AND resource_type = 'llm';
```

---

## Monitoring & Alerts

### Daily Quota Audit
```sql
-- Run this daily to find potential issues
SELECT
  scope,
  scope_id,
  resource_type,
  limit_usd,
  current_spend_usd,
  ROUND((current_spend_usd / limit_usd * 100)::numeric, 1) as utilization,
  period_end,
  CASE
    WHEN current_spend_usd >= limit_usd THEN '🔴 EXCEEDED'
    WHEN current_spend_usd >= limit_usd * 0.8 THEN '🟡 WARNING'
    ELSE '🟢 OK'
  END as status
FROM copilot_internal.cost_quotas
WHERE scope = 'tenant'
ORDER BY utilization DESC;
```

### Cost Alerts
Configured in environment variables:
```bash
COST_ALERT_CHANNELS=slack,email
COST_ALERT_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
COST_ALERT_EMAIL_TO=ops@company.com,finance@company.com
```

Alerts trigger automatically when:
- 80% utilization (warning)
- 90% utilization (critical warning)
- 100% utilization (quota exceeded - requests blocked)

---

## Troubleshooting

### Issue: Tenant has unlimited access

**Symptom**: Tenant is consuming resources without any quota warnings

**Diagnosis**:
```sql
SELECT COUNT(*) FROM copilot_internal.cost_quotas
WHERE scope = 'tenant' AND scope_id = '<TENANT_ID>';
-- If 0: No quotas configured!
```

**Fix**:
```sql
-- Create missing quotas (see "Subscription Tier Templates" above)
```

### Issue: Quota not resetting daily

**Symptom**: Quota `current_spend_usd` doesn't reset to 0 at start of new day

**Diagnosis**:
```sql
SELECT period_end FROM copilot_internal.cost_quotas
WHERE scope = 'tenant' AND scope_id = '<TENANT_ID>';
-- Check if period_end is in the past
```

**Fix**:
Quotas auto-reset when checked. If stuck:
```sql
-- Manually trigger reset
UPDATE copilot_internal.cost_quotas
SET
  current_spend_usd = 0.00,
  period_start = date_trunc('day', NOW()),
  period_end = date_trunc('day', NOW() + INTERVAL '1 day'),
  updated_at = NOW()
WHERE scope = 'tenant' AND scope_id = '<TENANT_ID>';
```

### Issue: Quota exceeded but tenant still making requests

**Symptom**: `current_spend_usd > limit_usd` but requests not blocked

**Diagnosis**:
```bash
# Check if enforcement is enabled
echo $ENFORCE_COST_QUOTAS  # Should NOT be 'false'
echo $ENFORCE_E2B_QUOTAS   # Should NOT be 'false'

# Check logs
grep "enforcing: true" logs/app.log
```

**Fix**:
```bash
# Ensure enforcement is enabled (not set to 'false')
unset ENFORCE_COST_QUOTAS
unset ENFORCE_E2B_QUOTAS

# Restart application
```

---

## Security & Compliance

### Audit Trail
All quota changes are logged in `cost_quotas.updated_at`. For detailed audit trail:

```sql
-- View quota history (if using pg_stat_statements or audit triggers)
SELECT * FROM audit.cost_quota_changes
WHERE scope_id = '<TENANT_ID>'
ORDER BY changed_at DESC;
```

### Compliance Requirements
- **PCI/SOC2**: Quota limits ensure cost predictability for billing
- **GDPR**: Per-tenant quotas support data isolation
- **Financial controls**: Prevents runaway costs

---

## Quick Reference

| Action | SQL Command |
|--------|-------------|
| Check tenant quotas | `SELECT * FROM copilot_internal.cost_quotas WHERE scope = 'tenant' AND scope_id = '<ID>';` |
| Find unlimited tenants | See "Find Tenants Without Quotas" above |
| Create quota | See "Subscription Tier Templates" above |
| Delete quota (unlimited) | `DELETE FROM copilot_internal.cost_quotas WHERE scope = 'tenant' AND scope_id = '<ID>';` |
| Increase limit | `UPDATE copilot_internal.cost_quotas SET limit_usd = <NEW> WHERE ...;` |
| Reset spend | `UPDATE copilot_internal.cost_quotas SET current_spend_usd = 0 WHERE ...;` |

---

## Automated Onboarding Script

```bash
#!/bin/bash
# tenant-onboarding.sh
# Usage: ./tenant-onboarding.sh <tenant_id> <tier>

TENANT_ID=$1
TIER=$2

if [ -z "$TENANT_ID" ] || [ -z "$TIER" ]; then
  echo "Usage: $0 <tenant_id> <tier>"
  echo "Tiers: free, pro, enterprise"
  exit 1
fi

# Set limits based on tier
case $TIER in
  free)
    LLM_LIMIT=5.00
    E2B_LIMIT=2.00
    ;;
  pro)
    LLM_LIMIT=100.00
    E2B_LIMIT=20.00
    ;;
  enterprise)
    LLM_LIMIT=100000.00
    E2B_LIMIT=50000.00
    ;;
  *)
    echo "Invalid tier: $TIER"
    exit 1
    ;;
esac

# Create quotas
psql "$DATABASE_URL" <<SQL
-- LLM quota
INSERT INTO copilot_internal.cost_quotas (
  scope, scope_id, resource_type, limit_usd, period, period_start, period_end, current_spend_usd, warning_threshold
) VALUES (
  'tenant', '$TENANT_ID', 'llm', $LLM_LIMIT, 'day',
  date_trunc('day', NOW()), date_trunc('day', NOW() + INTERVAL '1 day'),
  0.00, 0.80
);

-- E2B quota
INSERT INTO copilot_internal.cost_quotas (
  scope, scope_id, resource_type, limit_usd, period, period_start, period_end, current_spend_usd, warning_threshold
) VALUES (
  'tenant', '$TENANT_ID', 'e2b', $E2B_LIMIT, 'day',
  date_trunc('day', NOW()), date_trunc('day', NOW() + INTERVAL '1 day'),
  0.00, 0.80
);
SQL

# Verify
echo "Verifying quotas for tenant: $TENANT_ID (tier: $TIER)"
psql "$DATABASE_URL" -c "
  SELECT scope, resource_type, limit_usd, period
  FROM copilot_internal.cost_quotas
  WHERE scope = 'tenant' AND scope_id = '$TENANT_ID';
"

echo "✅ Tenant onboarding complete!"
```

---

**END OF OPERATIONAL GUIDE**

**Remember: NO QUOTA = UNLIMITED ACCESS. Always verify quota configuration during onboarding!**
