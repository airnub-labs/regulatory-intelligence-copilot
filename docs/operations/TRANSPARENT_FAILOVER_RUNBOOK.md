# Transparent Failover - Operations Runbook

**Status:** Production
**Version:** 1.0.0
**Last Updated:** January 3, 2026
**On-Call Team:** Platform Engineering

---

## Quick Reference

### Emergency Contacts

| Role | Contact | Escalation |
|------|---------|------------|
| Primary On-Call | Platform Team | PagerDuty |
| Secondary On-Call | Infrastructure Team | PagerDuty |
| Subject Matter Expert | Cache/Redis SME | Slack @cache-team |

### Critical Links

- **Metrics Dashboard:** `<your-grafana-url>/transparent-failover`
- **Logs:** `<your-log-aggregator>/app:regulatory-intelligence`
- **Alerts:** `<your-pagerduty>/transparent-failover`
- **Status Page:** `<your-status-page>`

---

## System Overview

### What is Transparent Failover?

**Transparent failover** ensures Redis failures don't impact application functionality:

- **Cache failures** → Application hits database (slower but functional)
- **Rate limiter failures** → All requests allowed (fail-open for availability)
- **Application code** → Unaware of infrastructure state

###Components

| Component | Purpose | Failover Behavior |
|-----------|---------|-------------------|
| **TransparentCache** | Session validation caching | Cache miss → Database query |
| **TransparentRateLimiter** | API rate limiting | Fail-open → Allow all requests |
| **DistributedValidationCache** | Auth validation cache | Graceful degradation |
| **PassThroughCache** | No-op cache (failover mode) | Always miss |
| **AllowAllRateLimiter** | No-op rate limiter (failover mode) | Always allow |

---

## Common Alerts

### 🔴 CRITICAL: HighCacheErrorRate

**What it means:**
Cache operations failing at > 10 errors/minute. Redis may be experiencing issues.

**Impact:**
- Increased database load
- Slower response times (cache misses)
- No user-facing errors (transparent)

**Immediate Actions:**

```bash
# 1. Check Redis health
redis-cli -h <redis-host> ping
# Expected: PONG

# 2. Check Redis connectivity from app servers
curl http://<app-server>:8080/health/redis
# Expected: {"status":"healthy"}

# 3. Check cache error rate in last 5 minutes
# OpenTelemetry query:
sum(rate(cache_errors_total[5m]))

# 4. Check recent cache errors in logs
grep "Cache.*failed" /var/log/app.log | tail -50
```

**Resolution Steps:**

1. **If Redis is DOWN:**
   - Check Redis service status
   - Restart Redis if needed
   - Application continues working (transparent failover)
   - Alert database team of increased load

2. **If Redis is UP but erroring:**
   - Check Redis memory (may be full)
   - Check Redis connections (may be at limit)
   - Check network latency Redis ↔ App
   - Consider scaling Redis if needed

3. **If errors persist:**
   - Check application logs for error patterns
   - Escalate to Platform SME
   - Monitor database load

**Monitoring After Resolution:**
- Cache hit rate should return to > 90% within 5 minutes
- Error rate should drop to < 1/minute
- Database load should return to baseline

---

### ⚠️ WARNING: RedisUnavailable

**What it means:**
Transparent failover is active. Application using PassThroughCache or AllowAllRateLimiter.

**Impact:**
- No cache hits (all database queries)
- No rate limiting (all requests allowed)
- Higher database load
- Slower responses
- **No user-facing errors**

**Immediate Actions:**

```bash
# 1. Verify transparent failover is active
grep "PassThroughCache active\|AllowAllRateLimiter active" /var/log/app.log | tail -10

# 2. Check Redis status
redis-cli -h <redis-host> ping

# 3. Check backend metrics
# OpenTelemetry query:
sum by (backend) (rate(cache_operations_total[5m]))
# Expected during failover: backend="passthrough"

sum by (backend) (rate(ratelimiter_checks_total[5m]))
# Expected during failover: backend="allowall"
```

**Resolution Steps:**

1. **Identify Redis issue:**
   - Service down?
   - Network partition?
   - Configuration issue?
   - Environment variables missing?

2. **Fix Redis:**
   - Restart Redis service
   - Fix network connectivity
   - Verify environment variables (REDIS_URL, etc.)

3. **Verify recovery:**
   ```bash
   # Check backend switches back to redis
   grep "Creating RedisBackedCache\|Creating RedisBackedRateLimiter" /var/log/app.log

   # Verify cache hits returning
   sum(rate(cache_operations_total{result="hit"}[5m]))
   # Should be > 0 within 2 minutes
   ```

**No Immediate Action Required If:**
- Redis maintenance is planned
- Application is functioning normally
- Database can handle the load
- Alert is expected and documented

---

### ⚠️ WARNING: CachePerformanceDegradation

**What it means:**
Cache operations taking > 100ms at P95. Significantly slower than expected.

**Impact:**
- Slower response times
- Degraded user experience
- Increased infrastructure costs

**Immediate Actions:**

```bash
# 1. Check cache operation duration
# OpenTelemetry query:
histogram_quantile(0.95, cache_operation_duration_bucket{operation="get"})
# Expected: < 10ms normally, alert if > 100ms

# 2. Check Redis latency
redis-cli --latency -h <redis-host>
# Expected: < 5ms

# 3. Check network latency App → Redis
ping <redis-host>
# Expected: < 10ms

# 4. Check Redis slow log
redis-cli -h <redis-host> SLOWLOG GET 10
```

**Resolution Steps:**

1. **High Redis latency:**
   - Check Redis CPU/memory usage
   - Look for slow commands in SLOWLOG
   - Consider Redis cluster/scaling

2. **High network latency:**
   - Check network path
   - Check for network saturation
   - Verify app and Redis in same region/AZ

3. **Application issue:**
   - Check for large cache values
   - Review serialization performance
   - Check for connection pool exhaustion

---

## Operational Procedures

### Planned Redis Maintenance

**Before maintenance:**

1. **Notify team:**
   ```
   Subject: Planned Redis Maintenance - Transparent Failover Active

   Redis maintenance scheduled for: <datetime>
   Duration: <duration>

   Impact:
   - Transparent failover will activate
   - No user-facing errors expected
   - Database load will increase temporarily
   - Rate limiting disabled (fail-open)

   Monitoring:
   - Database performance dashboard: <link>
   - Application metrics: <link>
   ```

2. **Pre-maintenance checks:**
   ```bash
   # Verify database can handle additional load
   # Check database connection pool capacity
   # Verify transparent failover working in staging
   ```

3. **During maintenance:**
   ```bash
   # Monitor logs for failover activation
   tail -f /var/log/app.log | grep "PassThroughCache\|AllowAllRateLimiter"

   # Monitor database load
   # Check your database monitoring dashboard

   # Monitor error rate
   # Should remain at baseline (no increase)
   ```

4. **After maintenance:**
   ```bash
   # Verify Redis recovered
   redis-cli ping

   # Verify cache backend switched back
   grep "Creating RedisBackedCache" /var/log/app.log

   # Verify cache hits returning
   sum(rate(cache_operations_total{result="hit"}[5m]))
   ```

### Emergency Redis Shutdown

**If you need to emergency shutdown Redis:**

```bash
# 1. Alert team (transparent failover will activate)
# Send alert to team channel

# 2. Gracefully shutdown Redis
redis-cli SHUTDOWN SAVE

# 3. Verify transparent failover activated
tail -f /var/log/app.log | grep "PassThroughCache active"

# 4. Monitor application health
# Check error rate (should be unchanged)
# Check response time (will increase but no errors)

# 5. Monitor database load
# Database queries will increase
# Verify database can handle load
```

**Application will continue functioning:**
- All cache operations become database queries
- All rate limiting disabled (fail-open)
- No user-facing errors
- Degraded performance but available

### Recovering from Transparent Failover

**After Redis is restored:**

```bash
# 1. Verify Redis is healthy
redis-cli ping
redis-cli INFO stats

# 2. Application auto-recovery (no restart needed!)
# TransparentCache and TransparentRateLimiter check on each operation
# Will automatically start using Redis again

# 3. Verify recovery in logs
tail -f /var/log/app.log | grep "Creating RedisBackedCache"
# Should see backend switching from passthrough → redis

# 4. Verify metrics
# Cache hit rate should return to > 90% within 5 minutes
sum(rate(cache_operations_total{result="hit"}[5m]))
  /
sum(rate(cache_operations_total{operation="get"}[5m]))

# 5. Verify rate limiting active
sum(rate(ratelimiter_checks_total{result="denied"}[5m]))
# Should be > 0 if traffic exceeds limits
```

**No application restart required!** Transparent failover auto-recovers.

---

## Metrics & Monitoring

### Key Metrics

**Cache Metrics:**

```promql
# Cache Hit Rate (Target: > 90%)
sum(rate(cache_operations_total{result="hit"}[5m]))
  /
sum(rate(cache_operations_total{operation="get"}[5m]))

# Cache Backend Distribution
sum by (backend) (rate(cache_operations_total[5m]))
# Expected: backend="redis" or backend="upstash"
# Alert if: backend="passthrough"

# Cache Operation Latency P95 (Target: < 10ms)
histogram_quantile(0.95,
  sum by (le) (rate(cache_operation_duration_bucket[5m]))
)

# Cache Error Rate (Target: < 1/min)
sum(rate(cache_errors_total[5m]))
```

**Rate Limiter Metrics:**

```promql
# Rate Limiter Denial Rate
sum(rate(ratelimiter_checks_total{result="denied"}[5m]))

# Rate Limiter Backend Distribution
sum by (backend) (rate(ratelimiter_checks_total[5m]))
# Expected: backend="redis" or backend="upstash"
# Alert if: backend="allowall"

# Rate Limiter Check Latency P95 (Target: < 10ms)
histogram_quantile(0.95,
  sum by (le) (rate(ratelimiter_check_duration_bucket[5m]))
)

# Rate Limiter Error Rate (Target: < 1/min)
sum(rate(ratelimiter_errors_total[5m]))
```

### Health Checks

**Manual Health Check:**

```bash
# 1. Check Redis connectivity
redis-cli -h <redis-host> ping
# Expected: PONG

# 2. Check cache backend
curl -s http://<app>:8080/api/observability | jq '.cache.backend'
# Expected: "redis" or "upstash"
# Warning if: "passthrough"

# 3. Check cache hit rate
curl -s http://<app>:8080/api/observability | jq '.cache.hitRate'
# Expected: > 0.90 (90%)

# 4. Check rate limiter backend
curl -s http://<app>:8080/api/observability | jq '.rateLimiter.backend'
# Expected: "redis" or "upstash"
# Warning if: "allowall"
```

---

## Troubleshooting Decision Tree

```
Is the application returning errors to users?
│
├─ YES → This is NOT transparent failover issue
│         Check application logs, database, etc.
│
└─ NO → Is Redis unavailable?
         │
         ├─ YES → Expected behavior (transparent failover)
         │        │
         │        ├─ Is database handling the load?
         │        │  ├─ YES → Monitor and fix Redis when possible
         │        │  └─ NO → Scale database or fix Redis urgently
         │        │
         │        └─ Are cache operations failing?
         │           ├─ Check logs for "PassThroughCache active"
         │           ├─ Verify database queries succeeding
         │           └─ Monitor database load
         │
         └─ NO → Is cache hit rate low?
                 │
                 ├─ YES → Possible issues:
                 │        ├─ Cache TTL too short
                 │        ├─ Cache eviction too aggressive
                 │        ├─ High cache churn
                 │        └─ Check Redis memory usage
                 │
                 └─ NO → System healthy ✅
```

---

## FAQ

### Q: Users are seeing errors - is this transparent failover?

**A:** No. Transparent failover means NO user-facing errors. If users see errors, investigate:
- Application code bugs
- Database issues
- Network issues
- Other infrastructure problems

Transparent failover ensures Redis failures don't cause user-facing errors.

### Q: How do I know if transparent failover is active?

**A:** Check logs or metrics:

```bash
# Logs
grep "PassThroughCache active\|AllowAllRateLimiter active" /var/log/app.log

# Metrics
sum by (backend) (cache_operations_total)
# If backend="passthrough", failover is active

sum by (backend) (ratelimiter_checks_total)
# If backend="allowall", failover is active
```

### Q: Do I need to restart the application when Redis comes back?

**A:** No! Transparent failover auto-recovers. The application will automatically start using Redis again when it's available.

### Q: What's the performance impact of transparent failover?

**A:** During failover (Redis unavailable):
- Cache operations → Database queries (slower, but work)
- Rate limiting → Disabled (fail-open)
- Response times increase but no errors

Normal operation (Redis available):
- < 0.2% overhead from metrics tracking
- Negligible performance impact

### Q: Can I disable transparent failover?

**A:** Yes, but **NOT recommended**. If you disable failover:
- Redis failures will cause application errors
- Need null checks throughout application code
- Breaks industry-standard pattern

To disable (not recommended):
```bash
ENABLE_AUTH_VALIDATION_CACHE=false
ENABLE_RATE_LIMITER_REDIS=false
```

### Q: How do I test transparent failover in staging?

**A:**

```bash
# 1. Deploy to staging
# 2. Verify normal operation with Redis

# 3. Temporarily block Redis
# Option A: Set invalid REDIS_URL
export REDIS_URL="redis://invalid:6379"

# Option B: Block Redis in security group
# (Preferred - more realistic)

# 4. Make requests to application
curl https://staging.your-app.com/api/auth/session

# 5. Verify in logs
grep "PassThroughCache active" /var/log/app.log

# 6. Verify no errors returned to user

# 7. Restore Redis access

# 8. Verify auto-recovery
grep "Creating RedisBackedCache" /var/log/app.log
```

---

## Escalation Procedures

### Level 1: Platform On-Call

**Handles:**
- RedisUnavailable alerts
- CachePerformanceDegradation
- Routine Redis issues

**Actions:**
- Check Redis health
- Verify transparent failover
- Monitor database load
- Follow runbook procedures

**Escalate if:**
- Database overloaded
- Redis issues > 1 hour
- Unclear root cause

### Level 2: Infrastructure Team

**Handles:**
- Database scaling issues
- Network connectivity problems
- Redis cluster management
- Resource exhaustion

**Actions:**
- Scale database if needed
- Investigate network issues
- Manage Redis infrastructure
- Coordinate with cloud provider

**Escalate if:**
- Major infrastructure failure
- Multi-region outage
- Requires architectural changes

### Level 3: Engineering Leadership

**Handles:**
- Major incidents
- Architecture decisions
- Customer communication
- Post-incident review

---

## Post-Incident Checklist

After a transparent failover incident:

- [ ] Document incident timeline
- [ ] Verify transparent failover worked as expected
- [ ] Check if any user-facing errors occurred
- [ ] Review database load during incident
- [ ] Analyze metrics and logs
- [ ] Identify root cause
- [ ] Update runbook if needed
- [ ] Schedule post-mortem (if major incident)
- [ ] Document lessons learned

---

## Related Documentation

- [Deployment Guide](../development/TRANSPARENT_FAILOVER_DEPLOYMENT_GUIDE.md)
- [Implementation Plan](../development/INDUSTRY_STANDARD_CACHE_IMPLEMENTATION_PLAN.md)
- [Architecture](../development/FAULT_TOLERANT_ARCHITECTURE.md)
- [Test Coverage](../../packages/reg-intel-cache/src/__tests__/)

---

**Document Version:** 1.0.0
**Last Updated:** January 3, 2026
**Next Review:** After first major incident or 90 days
