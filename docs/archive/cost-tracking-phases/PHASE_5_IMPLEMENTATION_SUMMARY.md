# Phase 5: Cost Anomaly Detection & Forecasting - Implementation Summary

**Date**: 2026-01-04
**Status**: ✅ **COMPLETE**

---

## Executive Summary

Phase 5 implements intelligent cost analysis through statistical anomaly detection and forecasting. The system now automatically detects unusual spending patterns, predicts future costs, generates optimization recommendations, and sends automated alerts to prevent quota breaches.

**Key Deliverables:**
- ✅ Statistical baseline calculation for normal spending patterns
- ✅ Cost anomaly detection using standard deviation analysis
- ✅ Cost forecasting with trend analysis and quota breach prediction
- ✅ Automated cost optimization recommendations
- ✅ Integrated alerting for anomalies and forecast warnings
- ✅ Scheduled cost analysis script

---

## What Was Implemented

### 1. Cost Baseline Calculation

**Location**: `packages/reg-intel-observability/src/costTracking/costAnomalyDetection.ts:87-187`

**Purpose**: Establish normal spending patterns for anomaly detection

**Method**:
- Analyzes last 30 days of cost data (configurable)
- Calculates statistical measures: mean, std dev, min, max, median
- Identifies spending trends (increasing/decreasing/stable)
- Tracks trend percentage (week-over-week change)

**SQL Implementation**:
```sql
WITH daily_costs AS (
  -- Aggregate LLM + E2B costs by day
  SELECT DATE(recorded_at) as date, SUM(total_cost_usd) as daily_cost
  FROM (SELECT * FROM llm_cost_records UNION ALL SELECT * FROM e2b_cost_records)
  WHERE tenant_id = $1 AND recorded_at >= NOW() - INTERVAL '30 days'
  GROUP BY DATE(recorded_at)
),
stats AS (
  SELECT
    AVG(daily_cost) as mean,
    STDDEV(daily_cost) as std_dev,
    MIN(daily_cost) as min,
    MAX(daily_cost) as max,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY daily_cost) as median
  FROM daily_costs
)
SELECT * FROM stats;
```

**Baseline Data Structure**:
```typescript
interface CostBaseline {
  tenantId: string;
  resourceType: 'llm' | 'e2b' | 'all';
  mean: number;              // $45.32/day
  stdDev: number;            // $8.12/day
  min: number;               // $22.15/day
  max: number;               // $67.89/day
  median: number;            // $43.50/day
  trend: 'increasing' | 'decreasing' | 'stable';
  trendPercentage: number;   // +15.2% (increasing)
  sampleSize: number;        // 30 days
}
```

### 2. Cost Anomaly Detection

**Location**: `costAnomalyDetection.ts:189-301`

**Purpose**: Detect unusual spending patterns using statistical analysis

**Algorithm**:
1. Calculate baseline (30-day mean and std dev)
2. Get today's cost
3. Calculate deviation: `(actual - mean) / stdDev`
4. Flag as anomaly if `|deviation| >= threshold` (default: 2.0σ)

**Severity Levels**:
| Deviation | Severity | Description |
|-----------|----------|-------------|
| ≥ 4.0σ | Critical | Extreme cost spike |
| ≥ 3.0σ | High | Significant anomaly |
| ≥ 2.5σ | Medium | Notable deviation |
| ≥ 2.0σ | Low | Unusual but minor |

**Example Anomaly**:
```typescript
{
  tenantId: "acme-corp",
  resourceType: "llm",
  detectedAt: "2026-01-04T14:30:00Z",
  actualCost: 125.50,        // Today's cost
  expectedCost: 45.32,       // Baseline mean
  deviation: 9.87,           // Standard deviations
  severity: "critical",
  description: "Cost is 9.9σ above baseline ($125.50 vs expected $45.32)",
  recommendation: "Review recent usage for unexpected spikes. Check for runaway processes or quota breaches."
}
```

### 3. Cost Forecasting

**Location**: `costAnomalyDetection.ts:303-410`

**Purpose**: Predict future spending and quota breach risk

**Method**:
1. Calculate baseline with trend analysis
2. Forecast = baseline × period multiplier (day=1, week=7, month=30)
3. Adjust for trend: increase forecast if trending up
4. Compare against quota to determine breach risk

**Forecast Formula**:
```typescript
// Base forecast
forecastedCost = baseline.mean * periodMultiplier;

// Trend adjustment
if (baseline.trend === 'increasing') {
  forecastedCost *= (1 + Math.abs(baseline.trendPercentage) / 100);
} else if (baseline.trend === 'decreasing') {
  forecastedCost *= (1 - Math.abs(baseline.trendPercentage) / 100);
}
```

**Quota Breach Risk Assessment**:
```typescript
quotaUtilization = (forecastedCost / quota) * 100;

if (quotaUtilization >= 100) return 'high';       // Will exceed
if (quotaUtilization >= 90)  return 'medium';     // Likely to exceed
if (quotaUtilization >= 80)  return 'low';        // Approaching limit
return 'none';                                     // Safe
```

**Example Forecast**:
```typescript
{
  tenantId: "acme-corp",
  resourceType: "llm",
  forecastPeriod: "month",
  forecastedCost: 1580.50,      // Predicted monthly cost
  confidence: 87,                // 87% confidence
  currentQuota: 1500.00,         // Monthly quota
  quotaUtilizationForecast: 105.4,  // 105% of quota
  quotaBreachRisk: "high",       // Will likely exceed
  trend: "increasing",
  trendDescription: "Based on the last 30 days, costs are increasing by 15.2%. Forecasted monthly cost: $1,580.50"
}
```

### 4. Cost Optimization Recommendations

**Location**: `costAnomalyDetection.ts:412-522`

**Purpose**: Generate actionable cost-saving suggestions

**Recommendation Types**:

| Type | When Generated | Example |
|------|----------------|---------|
| `review_usage` | Quota utilization >80% | "High LLM Cost Forecast - Review usage patterns" |
| `optimize_usage` | Increasing trend >20% | "LLM Costs Increasing - Optimize usage" |
| `reduce_ttl` | E2B trending up | "E2B Costs Increasing - Consider TTL reduction" |
| `reduce_quota` | Utilization <30% | "LLM Quota Underutilized - Consider reducing" |
| `increase_quota` | Forecast exceeds quota | "Increase quota to accommodate growth" |

**Example Recommendations**:
```typescript
[
  {
    tenantId: "acme-corp",
    type: "review_usage",
    priority: "high",
    title: "High LLM Cost Forecast",
    description: "Your forecasted LLM costs are 105% of your quota. Consider reviewing usage patterns or increasing quota.",
    effort: "low",
    createdAt: "2026-01-04T14:30:00Z"
  },
  {
    tenantId: "acme-corp",
    type: "reduce_ttl",
    priority: "medium",
    title: "E2B Costs Increasing - Consider TTL Reduction",
    description: "Your E2B costs are increasing by 22.3% week-over-week. Reducing sandbox TTL could help manage costs.",
    potentialSavings: 125.50,   // USD/month
    effort: "low",
    createdAt: "2026-01-04T14:30:00Z"
  }
]
```

### 5. Automated Cost Analysis Script

**Location**: `scripts/run-cost-analysis.ts`

**Purpose**: Periodic cost analysis and alerting

**Features**:
- Analyzes all active tenants
- Detects anomalies and sends alerts
- Forecasts costs and warns of quota breaches
- Generates optimization recommendations
- Sends alerts via Slack/Email/PagerDuty

**Execution**:
```bash
# Manual execution
npm run cost:analyze

# Scheduled execution (cron)
0 */6 * * * cd /app && npm run cost:analyze  # Every 6 hours
```

**Alert Flow**:
```
1. Get all active tenants from cost_quotas table
2. For each tenant:
   a. Detect anomalies → Send alerts for critical/high severity
   b. Generate forecasts → Alert if quota breach risk is high/medium
   c. Generate recommendations → Send high-priority recommendations
3. Log all results for audit trail
```

---

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Historical Cost Data (30 days)                              │
│  - LLM cost records                                         │
│  - E2B cost records                                         │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Baseline Calculation                                        │
│  - Mean, StdDev, Min, Max, Median                          │
│  - Trend analysis (7-day comparison)                       │
└────────────────┬────────────────────────────────────────────┘
                 │
         ┌───────┴──────┬──────────┬────────────┐
         │              │          │            │
         ▼              ▼          ▼            ▼
┌──────────────┐ ┌──────────┐ ┌─────────┐ ┌──────────────┐
│   Anomaly    │ │Forecast  │ │Recommend│ │   Alerting   │
│  Detection   │ │ (Linear  │ │ -ations │ │ (Slack/Email │
│(Std Dev Test)│ │Regression)│ │Generator│ │  /PagerDuty) │
└──────────────┘ └──────────┘ └─────────┘ └──────────────┘
```

### Integration Points

1. **Cost Storage** → Baseline calculation reads from `llm_cost_records` and `e2b_cost_records`
2. **Quota System** → Forecasts compare against `cost_quotas` to assess breach risk
3. **Notification System** → Alerts sent via existing notification service (Phase 2)
4. **Scheduled Jobs** → Cron runs `npm run cost:analyze` every 6 hours

---

## Files Created/Modified

### Created Files

1. `packages/reg-intel-observability/src/costTracking/costAnomalyDetection.ts` - Core service (520 lines)
2. `scripts/run-cost-analysis.ts` - Automated analysis script (220 lines)
3. `PHASE_5_IMPLEMENTATION_SUMMARY.md` - This file

### Modified Files

1. `packages/reg-intel-observability/src/costTracking/index.ts`
   - Added exports for `CostAnomalyDetectionService` and types

2. `package.json`
   - Added `"cost:analyze"` script

---

## Usage Examples

### Calculate Baseline

```typescript
import { CostAnomalyDetectionService } from '@reg-copilot/reg-intel-observability';

const service = new CostAnomalyDetectionService(supabaseClient);

const baseline = await service.calculateBaseline('tenant-123', 'llm', 30);
console.log(`Mean daily cost: $${baseline.mean.toFixed(2)}`);
console.log(`Trend: ${baseline.trend} (${baseline.trendPercentage.toFixed(1)}%)`);
```

### Detect Anomalies

```typescript
const anomalies = await service.detectAnomalies('tenant-123', 'all', 2.0);

for (const anomaly of anomalies) {
  console.log(`${anomaly.severity} anomaly: ${anomaly.description}`);
  if (anomaly.recommendation) {
    console.log(`→ ${anomaly.recommendation}`);
  }
}
```

### Generate Forecast

```typescript
const forecast = await service.forecastCosts('tenant-123', 'llm', 'month');

console.log(`Forecasted monthly cost: $${forecast.forecastedCost.toFixed(2)}`);
console.log(`Quota breach risk: ${forecast.quotaBreachRisk}`);
console.log(`Trend: ${forecast.trendDescription}`);
```

### Generate Recommendations

```typescript
const recommendations = await service.generateRecommendations('tenant-123');

for (const rec of recommendations) {
  console.log(`[${rec.priority}] ${rec.title}`);
  console.log(`  ${rec.description}`);
  if (rec.potentialSavings) {
    console.log(`  Potential savings: $${rec.potentialSavings.toFixed(2)}/month`);
  }
}
```

---

## Testing

### Manual Testing

```bash
# 1. Calculate baseline for a tenant
psql "..." -c "SELECT * FROM copilot_internal.llm_cost_records WHERE tenant_id = 'test-tenant' ORDER BY recorded_at DESC LIMIT 30;"

# 2. Run cost analysis script
npm run cost:analyze

# 3. Check logs for anomalies and forecasts
grep "anomaly detected\|forecast" logs/cost-analysis.log

# 4. Verify alerts sent (check Slack/Email)
```

### Expected Behavior

**Scenario 1: Normal Spending**
- No anomalies detected
- Forecast within quota
- No alerts sent
- Maybe low-priority recommendations

**Scenario 2: Cost Spike**
- Anomaly detected (deviation >2σ)
- Alert sent with severity based on deviation
- Recommendation to review usage

**Scenario 3: Trending Up**
- No immediate anomaly
- Forecast shows quota breach risk
- Alert sent warning of future breach
- Recommendations to optimize or increase quota

---

## Production Deployment

### Prerequisites

- [ ] Phase 4 deployed (cost optimization & observability)
- [ ] Notification channels configured (Slack/Email/PagerDuty)
- [ ] Supabase connection available
- [ ] Sufficient historical data (minimum 7 days, recommended 30 days)

### Deployment Steps

1. **Deploy Code**
   ```bash
   git pull origin claude/e2b-cost-tracking-phase1-eCBM3
   npm install
   npm run build
   ```

2. **Configure Cron Job**
   ```bash
   # Add to crontab
   0 */6 * * * cd /app && npm run cost:analyze >> /var/log/cost-analysis.log 2>&1
   ```

3. **Test Manually**
   ```bash
   npm run cost:analyze
   ```

4. **Monitor Logs**
   ```bash
   tail -f /var/log/cost-analysis.log
   ```

5. **Verify Alerts**
   - Check Slack #cost-alerts channel
   - Check email inbox
   - Check PagerDuty incidents

---

## Acceptance Criteria

All Phase 5 requirements met:

- ✅ **Statistical baseline calculation**
  - 30-day rolling analysis
  - Mean, std dev, min, max, median
  - Trend detection and percentage

- ✅ **Anomaly detection**
  - Standard deviation-based detection
  - Configurable threshold (default 2.0σ)
  - Severity levels (low/medium/high/critical)
  - Automated alerts

- ✅ **Cost forecasting**
  - Linear projection with trend adjustment
  - Daily/weekly/monthly forecasts
  - Quota breach risk assessment
  - Confidence scoring

- ✅ **Optimization recommendations**
  - 5 recommendation types
  - Priority levels
  - Potential savings estimates
  - Effort estimates

- ✅ **Automated alerting**
  - Integration with notification service
  - Slack/Email/PagerDuty support
  - Scheduled execution via cron
  - Comprehensive logging

---

## Monitoring Queries

### Check Baselines

```sql
-- Manual baseline calculation for verification
SELECT
  tenant_id,
  AVG(daily_cost) as mean,
  STDDEV(daily_cost) as std_dev,
  MIN(daily_cost) as min,
  MAX(daily_cost) as max
FROM (
  SELECT
    tenant_id,
    DATE(recorded_at) as date,
    SUM(total_cost_usd) as daily_cost
  FROM copilot_internal.llm_cost_records
  WHERE recorded_at >= CURRENT_DATE - 30
  GROUP BY tenant_id, DATE(recorded_at)
) daily_costs
GROUP BY tenant_id;
```

### Find Anomalous Days

```sql
-- Days with costs >2σ above baseline
WITH baselines AS (
  SELECT tenant_id, AVG(daily_cost) as mean, STDDEV(daily_cost) as std_dev
  FROM (
    SELECT tenant_id, DATE(recorded_at) as date, SUM(total_cost_usd) as daily_cost
    FROM copilot_internal.llm_cost_records
    WHERE recorded_at >= CURRENT_DATE - 30
    GROUP BY tenant_id, DATE(recorded_at)
  ) daily GROUP BY tenant_id
)
SELECT
  d.tenant_id,
  d.date,
  d.daily_cost,
  b.mean,
  ROUND(((d.daily_cost - b.mean) / b.std_dev)::numeric, 2) as deviation_sigma
FROM daily_costs d
JOIN baselines b ON d.tenant_id = b.tenant_id
WHERE (d.daily_cost - b.mean) / b.std_dev >= 2.0
ORDER BY deviation_sigma DESC;
```

---

## Troubleshooting

### Issue: No anomalies detected when costs are clearly high

**Cause**: Insufficient baseline data or high variance

**Solution**:
1. Check sample size: Need at least 14 days of data
2. Adjust threshold: Lower from 2.0σ to 1.5σ for more sensitivity
3. Check baseline calculation:
   ```typescript
   const baseline = await service.calculateBaseline('tenant-id', 'llm');
   console.log(baseline);  // Verify mean and stdDev are reasonable
   ```

### Issue: Forecast inaccurate

**Cause**: Trend extrapolation assumes linear growth

**Solution**:
- Forecasts are estimates, not guarantees
- Use confidence score to assess reliability
- For volatile tenants, focus on anomaly detection instead

### Issue: Too many alerts

**Cause**: Threshold too sensitive or normal variance

**Solution**:
1. Increase threshold from 2.0σ to 2.5σ or 3.0σ
2. Add cooldown period (don't alert same tenant twice in 24h)
3. Adjust notification severity thresholds

---

## Next Steps

Phase 5 completes the cost tracking implementation! System now has:
1. ✅ Database setup & migration (Phase 1)
2. ✅ Pricing configuration & quota enforcement (Phase 2)
3. ✅ Pre-request quota gates & integration (Phase 3)
4. ✅ Cost optimization & observability (Phase 4)
5. ✅ Cost anomaly detection & forecasting (Phase 5)

### Future Enhancements

1. **Machine Learning Models**
   - Replace linear forecasting with ARIMA or Prophet
   - Seasonal adjustment for weekly/monthly patterns
   - Anomaly detection using Isolation Forest

2. **Advanced Recommendations**
   - Model-specific optimization (switch to cheaper models)
   - Caching recommendations (identify repeated queries)
   - Batch processing suggestions

3. **Cost Attribution**
   - Per-feature cost analysis
   - Per-user cost ranking
   - ROI analysis by use case

4. **Automated Actions**
   - Auto-adjust quotas based on trends
   - Auto-reduce TTL for high-cost tenants
   - Auto-throttle when approaching limits

---

## References

- **Phase 1-4 Summaries**: Previous implementation documents
- **E2B Cost Tracking Guide**: `E2B_COST_TRACKING_IMPLEMENTATION_GUIDE.md`
- **Monitoring Queries**: `PHASE_4_MONITORING_QUERIES.md`
- **Anomaly Detection Service**: `packages/reg-intel-observability/src/costTracking/anomalyDetection.ts` (existing)
- **Cost Forecasting Service**: `packages/reg-intel-observability/src/costTracking/costAnomalyDetection.ts` (new)

---

**End of Phase 5 Implementation Summary**
