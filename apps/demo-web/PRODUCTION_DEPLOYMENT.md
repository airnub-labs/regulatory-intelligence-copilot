# Production Deployment Guide - Multi-Instance Setup

## Overview

This guide covers deploying the Regulatory Intelligence Copilot in production with multiple instances for high availability and scalability.

**Key Features**:
- ✅ Multi-instance deployment (horizontal scaling)
- ✅ Distributed caching with Redis
- ✅ Comprehensive authentication metrics
- ✅ Cost optimization insights
- ✅ Performance monitoring

---

## Critical: Multi-Instance Caching

### The Problem

**In-memory caching does NOT work across multiple instances**:

```
Instance 1: User login → Cache in memory → Next request → Cache HIT ✅
Instance 2: Same user → No cache → Database query (cache in different memory) ❌
```

**Result**: Inconsistent cache, duplicate queries, degraded performance

### The Solution: Redis

**Distributed cache shared across all instances**:

```
Instance 1: User login → Cache in Redis → ✅
Instance 2: Same user → Check Redis → Cache HIT ✅
Instance 3: Same user → Check Redis → Cache HIT ✅
```

**Result**: Consistent cache, minimal queries, optimal performance

---

## Environment Variables

### Required for All Deployments

```bash
# NextAuth (Required)
NEXTAUTH_SECRET=<generate-with-openssl-rand-base64-32>
NEXTAUTH_URL=https://your-production-domain.com

# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
SUPABASE_DEMO_TENANT_ID=default
```

### Required for Multi-Instance Deployments

```bash
# Redis (CRITICAL for multiple instances)
REDIS_URL=redis://your-redis-host:6379
# OR for Redis with password:
REDIS_URL=redis://:<password>@your-redis-host:6379
# OR for Redis TLS:
REDIS_URL=rediss://:<password>@your-redis-host:6379
```

**⚠️ WARNING**: If `REDIS_URL` is not set:
- Application falls back to in-memory cache
- **ONLY suitable for single-instance deployments**
- Multiple instances will have inconsistent cache

---

## Deployment Scenarios

### Scenario 1: Single Instance (Development/Small Scale)

**Configuration**:
- No Redis required
- In-memory cache works fine
- Lower cost

**Environment**:
```bash
# Redis NOT required
# In-memory cache will be used automatically
```

**Suitable For**:
- Development
- Staging
- Small production (<100 concurrent users)
- Single server/container

**Limitations**:
- Cannot scale horizontally
- Cache lost on restart
- Not suitable for high availability

---

### Scenario 2: Multi-Instance (Production/Scale)

**Configuration**:
- Redis REQUIRED
- Distributed cache across instances
- Horizontal scaling enabled

**Environment**:
```bash
# Redis REQUIRED
REDIS_URL=redis://your-redis-host:6379
```

**Suitable For**:
- Production
- High availability
- Horizontal scaling
- Multiple containers/servers
- Serverless (with Redis)

**Benefits**:
- Cache shared across all instances
- Consistent performance
- Zero-downtime deployments
- Auto-scaling support

---

## Redis Setup Options

### Option 1: Managed Redis (Recommended)

**Upstash** (Serverless-friendly):
```bash
# 1. Create account at upstash.com
# 2. Create Redis database
# 3. Copy connection string:
REDIS_URL=rediss://default:<password>@<region>.upstash.io:6379
```

**AWS ElastiCache**:
```bash
REDIS_URL=redis://your-cluster.cache.amazonaws.com:6379
```

**Google Cloud Memorystore**:
```bash
REDIS_URL=redis://10.0.0.3:6379
```

**Azure Cache for Redis**:
```bash
REDIS_URL=rediss://:<password>@your-cache.redis.cache.windows.net:6380
```

### Option 2: Self-Hosted Redis

**Docker Compose**:
```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

volumes:
  redis-data:
```

```bash
REDIS_URL=redis://localhost:6379
```

---

## Authentication Metrics

### Available Metrics

The `/api/observability` endpoint now provides comprehensive authentication insights:

```json
{
  "authentication": {
    "uptime": {
      "milliseconds": 3600000,
      "hours": 1.0,
      "startTime": "2025-12-28T12:00:00.000Z"
    },
    "logins": {
      "total": 1523,
      "last24Hours": {
        "2025-12-28T12": 234,
        "2025-12-28T11": 456,
        // ... hourly breakdown
      },
      "lastLoginTimestamp": "2025-12-28T12:59:30.000Z",
      "averagePerHour": 1523.0
    },
    "validations": {
      "total": 45000,
      "cacheHits": 44100,
      "cacheMisses": 900,
      "cacheHitRate": 98.0,
      "databaseQueries": 900,
      "failures": 5,
      "averageTimeMs": 3,
      "averagePerHour": 45000.0
    },
    "users": {
      "activeCount": 1200,
      "deletedDetected": 3,
      "bannedDetected": 1
    },
    "costs": {
      "estimatedDatabaseCost": "0.0090",
      "costWithoutCache": "0.4500",
      "savings": "0.4410",
      "savingsPercentage": "98.00",
      "queriesPerHour": 900
    },
    "performance": {
      "cacheEffectiveness": "Excellent",
      "recommendedCacheTTL": "Current TTL is optimal",
      "avgValidationTime": "Excellent"
    }
  },
  "validationCache": {
    "size": 1200,
    "maxSize": 10000,
    "ttlMs": 300000,
    "backend": "redis"  // or "in-memory" if Redis not configured
  }
}
```

### How to Use Metrics for Cost Optimization

#### 1. Monitor Cache Hit Rate

```bash
# Target: >95% cache hit rate
curl https://your-app.com/api/observability | jq '.authentication.validations.cacheHitRate'
# Output: 98.0
```

**If <95%**:
- Increase cache TTL (currently 5 min)
- Check for cache eviction (too many users for cache size)

#### 2. Estimate Database Costs

```bash
# Check estimated costs
curl https://your-app.com/api/observability | jq '.authentication.costs'
```

**Example**:
```json
{
  "estimatedDatabaseCost": "0.0090",    // Actual cost with cache
  "costWithoutCache": "0.4500",         // Cost without cache
  "savings": "0.4410",                  // Money saved
  "savingsPercentage": "98.00",         // % saved
  "queriesPerHour": 900                 // DB queries/hour
}
```

**Action**:
- If `queriesPerHour` > 500 → Consider increasing cache TTL
- Monitor `savings` to justify Redis cost

#### 3. Identify Login Patterns

```bash
# Get login patterns by hour
curl https://your-app.com/api/observability | jq '.authentication.logins.last24Hours'
```

**Use cases**:
- Scale up instances during peak hours
- Optimize cache size based on active users
- Identify unusual login spikes (security)

#### 4. Monitor Active Users

```bash
# Check active user count
curl https://your-app.com/api/observability | jq '.authentication.users.activeCount'
# Output: 1200
```

**Insights**:
- If `activeCount` > 8000 → Increase cache size (MAX_CACHE_SIZE)
- Monitor `deletedDetected` and `bannedDetected` for security

---

## Performance Tuning

### Cache TTL Adjustment

**Current**: 5 minutes (as requested)

**To change** (`apps/demo-web/src/lib/auth/distributedValidationCache.ts`):
```typescript
const CACHE_TTL_MS = 5 * 60 * 1000  // 5 minutes
const CACHE_TTL_SECONDS = 300        // For Redis
```

**Recommendations**:
- **Higher security** (faster deleted user lockout): 2-3 minutes
- **Higher performance** (fewer DB queries): 10 minutes
- **Balanced** (current): 5 minutes

**Trade-offs**:
- Longer TTL = Better performance, longer exposure for deleted users
- Shorter TTL = More DB queries, faster security lockout

### Cache Size Adjustment

**Current**: 10,000 users (in-memory fallback only)

**With Redis**: No hard limit (memory-bound)

**To change** (`apps/demo-web/src/lib/auth/distributedValidationCache.ts`):
```typescript
const MAX_CACHE_SIZE = 10000  // Only affects in-memory fallback
```

### Validation Interval

**Current**: 5 minutes (aligned with cache TTL)

**To change** (`apps/demo-web/src/lib/auth/options.ts`):
```typescript
const SESSION_VALIDATION_INTERVAL_MS = 5 * 60 * 1000
```

**Best practice**: Keep equal to cache TTL for optimal performance

---

## Monitoring & Alerts

### Metrics to Monitor

| Metric | Target | Alert If |
|--------|--------|----------|
| Cache Hit Rate | >95% | <90% |
| Database Queries/Hour | <500 (1000 users) | >1000 |
| Average Validation Time | <10ms | >50ms |
| Cache Backend | `redis` | `in-memory` in prod |
| Active Users | - | Sudden spike |
| Deleted Users Detected | - | >10/hour |

### Sample Monitoring Script

```bash
#!/bin/bash
# monitor-auth.sh

ENDPOINT="https://your-app.com/api/observability"
ALERT_THRESHOLD=90

CACHE_HIT_RATE=$(curl -s $ENDPOINT | jq '.authentication.validations.cacheHitRate')

if (( $(echo "$CACHE_HIT_RATE < $ALERT_THRESHOLD" | bc -l) )); then
  echo "ALERT: Cache hit rate is $CACHE_HIT_RATE% (threshold: $ALERT_THRESHOLD%)"
  # Send alert to Slack/PagerDuty/etc
fi

# Check cache backend
BACKEND=$(curl -s $ENDPOINT | jq -r '.validationCache.backend')
if [ "$BACKEND" != "redis" ]; then
  echo "WARNING: Using in-memory cache ($BACKEND) - not suitable for production"
fi
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] Set all required environment variables
- [ ] Set `REDIS_URL` for multi-instance deployments
- [ ] Set `SUPABASE_SERVICE_ROLE_KEY` for full validation
- [ ] Test Redis connection locally
- [ ] Review cache TTL settings
- [ ] Set up monitoring for `/api/observability`

### Deployment

- [ ] Deploy application with Redis configured
- [ ] Verify cache backend is `redis` (check `/api/observability`)
- [ ] Monitor cache hit rate (should be >95% within 1 hour)
- [ ] Check database query rate
- [ ] Verify multi-instance consistency (test same user on different instances)

### Post-Deployment

- [ ] Monitor authentication metrics for 24 hours
- [ ] Verify cost savings match expectations
- [ ] Set up alerts for cache hit rate <90%
- [ ] Document any custom configuration changes

---

## Troubleshooting

### Issue: Cache backend shows "in-memory" in production

**Cause**: `REDIS_URL` not set or Redis connection failed

**Solution**:
1. Check environment variables: `echo $REDIS_URL`
2. Test Redis connection: `redis-cli -u $REDIS_URL ping`
3. Check application logs for Redis connection errors
4. Verify Redis URL format is correct

### Issue: Low cache hit rate (<90%)

**Possible Causes**:
1. Cache TTL too short
2. Too many unique users (cache eviction)
3. Redis connection unstable

**Solutions**:
1. Increase cache TTL to 10 minutes
2. Check `validationCache.size` vs active users
3. Monitor Redis connection stability

### Issue: High database query rate

**Cause**: Cache not working effectively

**Solutions**:
1. Check cache backend (should be `redis`)
2. Verify cache hit rate
3. Increase cache TTL
4. Check for cache eviction (size vs active users)

### Issue: Inconsistent behavior across instances

**Cause**: Using in-memory cache with multiple instances

**Solution**:
1. **Must** configure Redis for multi-instance deployments
2. Set `REDIS_URL` environment variable
3. Restart all instances
4. Verify cache backend is `redis`

---

## Cost Analysis

### With Proper Caching (Redis + 5min TTL)

| Users | Validations/Hour | DB Queries (No Cache) | DB Queries (With Cache) | Savings |
|-------|------------------|----------------------|------------------------|---------|
| 100 | 1,200 | 1,200 | 20 | 98.3% |
| 1,000 | 12,000 | 12,000 | 200 | 98.3% |
| 10,000 | 120,000 | 120,000 | 2,000 | 98.3% |
| 100,000 | 1,200,000 | 1,200,000 | 20,000 | 98.3% |

### Redis Costs vs Savings

**Redis Costs** (Upstash):
- Free tier: 10,000 commands/day = **FREE**
- Pay-as-you-go: $0.20 per 100,000 commands

**Database Savings** (Supabase):
- Pro plan: 500,000 API calls/day included
- Without cache: 1,000 users = 288,000 queries/day (57% of quota)
- With cache: 1,000 users = 4,800 queries/day (1% of quota)

**ROI**: Redis cost is offset by database savings at ~5,000+ users

---

## Security Considerations

### Multi-Instance Security

1. **Redis Security**:
   - Use TLS (`rediss://`) in production
   - Set Redis password
   - Enable Redis AUTH
   - Restrict Redis network access

2. **Session Validation**:
   - Deleted users locked out within 5 minutes
   - Validation cache shared across instances
   - Metrics track deleted/banned users

3. **Monitoring**:
   - Alert on unusual login patterns
   - Track deleted user detections
   - Monitor cache hit rate for anomalies

---

## Migration from Single to Multi-Instance

### Step-by-Step

1. **Set up Redis**:
   ```bash
   # Provision Redis (Upstash recommended)
   # Get connection string
   ```

2. **Update Environment**:
   ```bash
   REDIS_URL=redis://your-redis-host:6379
   ```

3. **Deploy First Instance**:
   ```bash
   # Deploy with Redis configured
   # Verify cache backend is "redis"
   ```

4. **Scale Horizontally**:
   ```bash
   # Deploy additional instances
   # All instances share same Redis cache
   ```

5. **Verify**:
   ```bash
   # Check /api/observability on each instance
   # Verify cache size is consistent
   # Test same user across instances
   ```

---

## Support

For issues or questions:
- Check `/api/observability` for diagnostics
- Review application logs
- Monitor authentication metrics
- Check Redis connection status

**Common Log Messages**:
- `"Redis cache connected successfully"` - Redis working ✅
- `"REDIS_URL not configured - using in-memory cache"` - Redis missing ⚠️
- `"Using cached validation result"` - Cache hit ✅
- `"Cache miss - validating user against database"` - DB query ℹ️
