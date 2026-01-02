# Redis for Distributed Rate Limiting

This document explains how Redis is used for distributed rate limiting in the Regulatory Intelligence Copilot application.

## Overview

The application uses Redis for distributed rate limiting on the client telemetry endpoint. This ensures that rate limits are enforced consistently across multiple Next.js instances in production deployments.

## Why Redis?

**Problem with In-Memory Rate Limiting:**
- Each Next.js instance has its own memory space
- Rate limit state is not shared between instances
- Clients can bypass limits by hitting different instances
- Ineffective in load-balanced deployments

**Solution with Redis:**
- ✅ Shared state across all instances
- ✅ Consistent rate limiting regardless of which instance handles the request
- ✅ Sliding window algorithm for smoother rate limiting
- ✅ Automatic expiration of rate limit entries

## Architecture

```
Client Request → Load Balancer → Next.js Instance 1 ─┐
                                 Next.js Instance 2 ─┼→ Redis ← Rate Limit State
                                 Next.js Instance 3 ─┘
```

All instances check the same Redis instance for rate limit state, ensuring consistent enforcement.

## Local Development Setup

### 1. Start Redis with Docker

```bash
cd docker
docker compose up -d redis
```

This starts Redis on port 6379 with:
- **Password**: `devpassword` (configurable via `REDIS_PASSWORD` env var)
- **Persistence**: Enabled with AOF (append-only file)
- **Volume**: `redis_data` for persistent storage

### 2. Configure Application

Add to your `.env.local`:

```bash
# For local Docker Redis
REDIS_URL=redis://localhost:6379
REDIS_TOKEN=devpassword

# Optional: Configure rate limits
CLIENT_TELEMETRY_RATE_LIMIT_MAX_REQUESTS=100
CLIENT_TELEMETRY_RATE_LIMIT_WINDOW_MS=60000  # 1 minute
```

### 3. Verify Redis is Running

```bash
# Check Redis container status
docker ps | grep redis

# Test Redis connection
docker exec reg-copilot-redis redis-cli -a devpassword ping
# Should output: PONG

# Monitor rate limit keys
docker exec reg-copilot-redis redis-cli -a devpassword KEYS "ratelimit:*"
```

## Production Setup

Point the application at your managed Redis deployment (self-hosted, cloud Redis, or Upstash REST):

1. Provision Redis (any provider)
   - For Upstash, create a database and grab the HTTPS endpoint and token.
2. Configure environment variables:

```bash
# Standard Redis deployment (default)
REDIS_URL=rediss://user:password@your-host:6379
REDIS_PASSWORD=your_password

# Optional: Upstash via shared cache abstraction
REDIS_URL=https://your-endpoint.upstash.io
REDIS_TOKEN=your_upstash_token

# Rate limit configuration
CLIENT_TELEMETRY_RATE_LIMIT_MAX_REQUESTS=1000
CLIENT_TELEMETRY_RATE_LIMIT_WINDOW_MS=60000
```

The shared `@reg-copilot/reg-intel-cache` package auto-selects the correct client for the provided `REDIS_URL` (Redis protocol vs. Upstash HTTPS) so no code changes are required.

## Fallback Behavior

The rate limiter gracefully falls back to in-memory rate limiting if Redis is not configured:

```
[RateLimiter] Redis credentials not provided. Using in-memory rate limiter.
This is not recommended for production deployments with multiple instances.
```

**When Fallback is Acceptable:**
- Local development with a single Next.js instance
- Testing environments
- Demo deployments

**When Redis is Required:**
- Production deployments with multiple instances
- Load-balanced setups
- Horizontal scaling scenarios

## Rate Limiting Algorithm

The implementation uses Upstash Ratelimit's **sliding window** algorithm:

```typescript
Ratelimit.slidingWindow(
  maxRequests,     // e.g., 100
  windowDuration   // e.g., "60 s"
)
```

**Benefits:**
- Smoother rate limiting compared to fixed windows
- Prevents burst traffic at window boundaries
- More accurate rate limiting over time

**Example:**
- Max: 100 requests per minute
- Client makes 50 requests at 0:30
- Client can make 50 more requests until 1:30
- Limit "slides" with time rather than resetting at fixed intervals

## Monitoring

### Check Rate Limit Status

```bash
# View all rate limit keys
docker exec reg-copilot-redis redis-cli -a devpassword KEYS "ratelimit:client-telemetry:*"

# Check specific client's rate limit
docker exec reg-copilot-redis redis-cli -a devpassword GET "ratelimit:client-telemetry:192.168.1.1"
```

### Monitor Redis Performance

```bash
# Redis stats
docker exec reg-copilot-redis redis-cli -a devpassword INFO stats

# Monitor commands in real-time
docker exec reg-copilot-redis redis-cli -a devpassword MONITOR

# Check memory usage
docker exec reg-copilot-redis redis-cli -a devpassword INFO memory
```

### Application Logs

The application logs rate limiter initialization:

```
[RateLimiter] Initialized redis rate limiter (100 requests per 60000ms)
```

And rate limit violations:

```json
{
  "level": "warn",
  "clientIp": "192.168.1.1",
  "rateLimiterType": "redis",
  "message": "Client telemetry rate limit exceeded"
}
```

## Configuration Reference

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `REDIS_URL` | Redis connection URL (`redis://`/`rediss://` or Upstash HTTPS endpoint) | - | No |
| `REDIS_PASSWORD`/`REDIS_TOKEN` | Redis password or Upstash token | - | No |
| `CLIENT_TELEMETRY_RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` | No |
| `CLIENT_TELEMETRY_RATE_LIMIT_WINDOW_MS` | Window duration in milliseconds | `60000` | No |

### Docker Compose Configuration

```yaml
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
  volumes:
    - redis_data:/data
  command: redis-server --appendonly yes --requirepass "${REDIS_PASSWORD:-devpassword}"
```

**Key Features:**
- **Image**: `redis:7-alpine` - Latest stable Redis with small footprint
- **Persistence**: AOF enabled for durability
- **Password**: Configurable via `REDIS_PASSWORD` environment variable
- **Volume**: Persistent storage for rate limit data

## Troubleshooting

### Redis Not Connecting

**Symptom:**
```
[RateLimiter] Redis credentials not provided. Using in-memory rate limiter.
```

**Solution:**
1. Verify Redis is running: `docker ps | grep redis`
2. Check environment variables are set correctly
3. Test connection: `docker exec reg-copilot-redis redis-cli -a devpassword ping`

### Rate Limits Not Working

**Symptom:** Clients can exceed rate limits

**Possible Causes:**
1. **Redis not configured** - Check logs for "in-memory rate limiter" message
2. **Multiple instances without Redis** - Each instance has separate limits
3. **Clock skew** - Ensure server clocks are synchronized

**Solution:**
- Configure Redis for distributed rate limiting
- Verify `rateLimiterType: "redis"` in rate limit exceeded logs

### Redis Memory Issues

**Symptom:** Redis running out of memory

**Solution:**
1. **Check memory usage:**
   ```bash
   docker exec reg-copilot-redis redis-cli -a devpassword INFO memory
   ```

2. **Configure max memory:**
   ```yaml
   command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
   ```

3. **Monitor key count:**
   ```bash
   docker exec reg-copilot-redis redis-cli -a devpassword DBSIZE
   ```

### High Latency

**Symptom:** Slow response times from telemetry endpoint

**Possible Causes:**
1. Redis network latency
2. Redis overloaded
3. Too many rate limit checks

**Solution:**
- Use Redis close to application (same region/data center)
- Consider increasing Redis resources
- Implement caching for repeated IP checks
- Use Upstash for globally distributed access

## Best Practices

### Security

1. **Always use passwords** in production
2. **Don't expose Redis port** directly to internet
3. **Use TLS/SSL** for Redis connections in production
4. **Rotate credentials** regularly

### Performance

1. **Use connection pooling** - Upstash handles this automatically
2. **Monitor Redis memory** - Set appropriate max memory limits
3. **Enable AOF persistence** - For durability without performance impact
4. **Use pipelining** - Upstash Ratelimit does this automatically

### Reliability

1. **Configure health checks** - Included in docker-compose
2. **Set up Redis replication** - For high availability in production
3. **Monitor error rates** - Track Redis connection failures
4. **Have fallback strategy** - Current implementation fails open on Redis errors

## Migration Guide

### From In-Memory to Redis

No code changes required! Simply configure Redis:

1. Start Redis: `docker compose up -d redis`
2. Set environment variables:
   ```bash
   REDIS_URL=redis://localhost:6379
   REDIS_TOKEN=devpassword
   ```
3. Restart application
4. Verify in logs: `Initialized redis rate limiter`

### From Redis to Upstash

1. Create an Upstash Redis database
2. Point `REDIS_URL` at the Upstash HTTPS endpoint and supply the token:
   ```bash
   export REDIS_URL=https://your-endpoint.upstash.io
   export REDIS_TOKEN=your_upstash_token
   ```
3. Deploy changes (the cache package will switch to the Upstash REST client automatically)
4. No data migration needed - rate limits reset

## Additional Resources

- [Upstash Redis Documentation](https://docs.upstash.com/redis)
- [Upstash Ratelimit](https://github.com/upstash/ratelimit)
- [Redis Documentation](https://redis.io/documentation)
- [Sliding Window Algorithm](https://en.wikipedia.org/wiki/Sliding_window_protocol)

## Support

For issues or questions:
1. Check this documentation
2. Review application logs
3. Test Redis connection
4. Open an issue in the project repository
