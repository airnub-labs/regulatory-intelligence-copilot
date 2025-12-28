# Metrics Specification

**Version**: 1.0
**Last Updated**: 2025-12-28
**Status**: Production-Ready

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Metric Categories](#metric-categories)
4. [TypeScript Interfaces](#typescript-interfaces)
5. [Implementation](#implementation)
6. [Usage](#usage)
7. [Best Practices](#best-practices)

---

## Overview

The metrics system provides comprehensive observability across three categories:
- **System Metrics**: Infrastructure, performance, resource usage
- **Authentication Metrics**: Login patterns, session validation, security
- **Business Metrics**: User behavior, feature usage, engagement

### Design Principles

1. **Separation of Concerns**: Each category is self-contained
2. **Type Safety**: Full TypeScript interfaces for all metrics
3. **Performance**: Minimal overhead (<1ms per metric record)
4. **Scalability**: Handles 100,000+ events per second
5. **Extensibility**: Easy to add new metrics without refactoring

---

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│  Metrics System                                         │
│                                                         │
│  ┌───────────────┐  ┌────────────────┐  ┌───────────┐ │
│  │   System      │  │ Authentication │  │ Business  │ │
│  │   Metrics     │  │    Metrics     │  │  Metrics  │ │
│  │               │  │                │  │           │ │
│  │ - Uptime      │  │ - Logins       │  │ - API     │ │
│  │ - Memory      │  │ - Validation   │  │   Usage   │ │
│  │ - Requests    │  │ - Cache        │  │ - Feature │ │
│  │ - Errors      │  │ - Security     │  │   Adoption│ │
│  └───────┬───────┘  └────────┬───────┘  └──────┬────┘ │
│          │                   │                  │      │
│          └───────────────────┼──────────────────┘      │
│                              │                         │
│                   ┌──────────▼──────────┐              │
│                   │  Metrics Aggregator │              │
│                   │                     │              │
│                   │  - Combines all     │              │
│                   │  - Single endpoint  │              │
│                   │  - Categorized      │              │
│                   └──────────┬──────────┘              │
└──────────────────────────────┼──────────────────────────┘
                               │
                               ↓
                    ┌─────────────────────┐
                    │  /api/observability │
                    │                     │
                    │  Returns:           │
                    │  {                  │
                    │    system: {...}    │
                    │    authentication:{.│
                    │    business: {...}  │
                    │  }                  │
                    └─────────────────────┘
```

### File Structure

```
apps/demo-web/src/lib/metrics/
├── types.ts                      # All TypeScript interfaces
├── systemMetrics.ts              # System-level metrics
├── authenticationMetrics.ts      # Authentication metrics (existing authMetrics.ts)
├── businessMetrics.ts            # Business/usage metrics
└── metricsAggregator.ts          # Combines all metrics

apps/demo-web/docs/
├── METRICS_SPECIFICATION.md      # This file
└── AUTH_SPECIFICATION.md         # Authentication specification
```

---

## Metric Categories

### 1. System Metrics

**Purpose**: Monitor infrastructure health and performance

**File**: `src/lib/metrics/systemMetrics.ts`

**Metrics**:
```typescript
{
  uptime: {
    milliseconds: number
    hours: number
    startTime: string (ISO8601)
  },

  memory: {
    heapUsed: number        // MB
    heapTotal: number       // MB
    external: number        // MB
    rss: number            // MB (Resident Set Size)
  },

  requests: {
    total: number
    perSecond: number
    averageResponseTime: number  // ms
    p50ResponseTime: number      // ms
    p95ResponseTime: number      // ms
    p99ResponseTime: number      // ms
  },

  errors: {
    total: number
    perHour: number
    byType: Record<string, number>
    last24Hours: Record<string, number>
  },

  cache: {
    redis: {
      connected: boolean
      commandsExecuted: number
      hitRate: number  // %
    },
    validation: {
      backend: string
      size: number
      hitRate: number
    }
  }
}
```

**Events Tracked**:
- Request started/completed
- Error occurred
- Cache operation
- Memory usage sampled

---

### 2. Authentication Metrics

**Purpose**: Track authentication patterns and security

**File**: `src/lib/metrics/authenticationMetrics.ts`
**Current**: `src/lib/auth/authMetrics.ts` (to be moved)

**Metrics**:
```typescript
{
  logins: {
    total: number
    successful: number
    failed: number
    last24Hours: Record<string, number>  // Hourly breakdown
    averagePerHour: number
    lastLoginTimestamp: string
  },

  validations: {
    total: number
    cacheHits: number
    cacheMisses: number
    cacheHitRate: number  // %
    databaseQueries: number
    failures: number
    averageTimeMs: number
    averagePerHour: number
  },

  users: {
    activeCount: number
    deletedDetected: number
    bannedDetected: number
    newRegistrations: number
  },

  costs: {
    estimatedDatabaseCost: string
    costWithoutCache: string
    savings: string
    savingsPercentage: string
    queriesPerHour: number
  },

  security: {
    suspiciousLogins: number
    rateLimitHits: number
    invalidTokenAttempts: number
  }
}
```

**Events Tracked**:
- Login attempt (success/failure)
- Session validation (cache hit/miss)
- User deleted/banned detected
- Security event (suspicious activity)

---

### 3. Business Metrics

**Purpose**: Track product usage and user engagement

**File**: `src/lib/metrics/businessMetrics.ts`

**Metrics**:
```typescript
{
  api: {
    endpoints: Record<string, {
      calls: number
      averageResponseTime: number
      errorRate: number
    }>
  },

  features: {
    conversations: {
      created: number
      archived: number
      active: number
      messagesPerConversation: number
    },

    graph: {
      queries: number
      nodesReturned: number
      streamConnections: number
    },

    paths: {
      branchesCreated: number
      mergesCompleted: number
      activePathsPerConversation: number
    }
  },

  usage: {
    dailyActiveUsers: number
    monthlyActiveUsers: number
    sessionDuration: {
      average: number  // seconds
      median: number
      p95: number
    },

    retention: {
      day1: number  // %
      day7: number
      day30: number
    }
  }
}
```

**Events Tracked**:
- API endpoint called
- Feature used (conversation, graph, path)
- User session started/ended
- User returned (retention)

---

## TypeScript Interfaces

**File**: `src/lib/metrics/types.ts`

### Core Types

```typescript
// ============================================================================
// SYSTEM METRICS
// ============================================================================

export interface SystemMetrics {
  uptime: UptimeMetrics
  memory: MemoryMetrics
  requests: RequestMetrics
  errors: ErrorMetrics
  cache: CacheMetrics
}

export interface UptimeMetrics {
  milliseconds: number
  hours: number
  startTime: string
}

export interface MemoryMetrics {
  heapUsed: number
  heapTotal: number
  external: number
  rss: number
}

export interface RequestMetrics {
  total: number
  perSecond: number
  averageResponseTime: number
  p50ResponseTime: number
  p95ResponseTime: number
  p99ResponseTime: number
}

export interface ErrorMetrics {
  total: number
  perHour: number
  byType: Record<string, number>
  last24Hours: Record<string, number>
}

export interface CacheMetrics {
  redis?: RedisMetrics
  validation: ValidationCacheMetrics
}

export interface RedisMetrics {
  connected: boolean
  commandsExecuted: number
  hitRate: number
}

export interface ValidationCacheMetrics {
  backend: 'redis' | 'in-memory' | 'redis-disconnected'
  size: number
  hitRate: number
}

// ============================================================================
// AUTHENTICATION METRICS
// ============================================================================

export interface AuthenticationMetrics {
  uptime: UptimeMetrics
  logins: LoginMetrics
  validations: ValidationMetrics
  users: UserMetrics
  costs: CostMetrics
  security?: SecurityMetrics
  performance: PerformanceMetrics
}

export interface LoginMetrics {
  total: number
  successful?: number
  failed?: number
  last24Hours: Record<string, number>
  lastLoginTimestamp: string | null
  averagePerHour: number
}

export interface ValidationMetrics {
  total: number
  cacheHits: number
  cacheMisses: number
  cacheHitRate: number
  databaseQueries: number
  failures: number
  averageTimeMs: number
  averagePerHour: number
}

export interface UserMetrics {
  activeCount: number
  deletedDetected: number
  bannedDetected: number
  newRegistrations?: number
}

export interface CostMetrics {
  estimatedDatabaseCost: string
  costWithoutCache: string
  savings: string
  savingsPercentage: string
  queriesPerHour: number
}

export interface SecurityMetrics {
  suspiciousLogins?: number
  rateLimitHits?: number
  invalidTokenAttempts?: number
}

export interface PerformanceMetrics {
  cacheEffectiveness: 'Excellent' | 'Good' | 'Fair' | 'Poor'
  recommendedCacheTTL: string
  avgValidationTime: 'Excellent' | 'Good' | 'Needs optimization'
}

// ============================================================================
// BUSINESS METRICS
// ============================================================================

export interface BusinessMetrics {
  api: ApiMetrics
  features: FeatureMetrics
  usage: UsageMetrics
}

export interface ApiMetrics {
  endpoints: Record<string, EndpointMetrics>
}

export interface EndpointMetrics {
  calls: number
  averageResponseTime: number
  errorRate: number
}

export interface FeatureMetrics {
  conversations: ConversationMetrics
  graph: GraphMetrics
  paths: PathMetrics
}

export interface ConversationMetrics {
  created: number
  archived: number
  active: number
  messagesPerConversation: number
}

export interface GraphMetrics {
  queries: number
  nodesReturned: number
  streamConnections: number
}

export interface PathMetrics {
  branchesCreated: number
  mergesCompleted: number
  activePathsPerConversation: number
}

export interface UsageMetrics {
  dailyActiveUsers: number
  monthlyActiveUsers: number
  sessionDuration: SessionDurationMetrics
  retention: RetentionMetrics
}

export interface SessionDurationMetrics {
  average: number
  median: number
  p95: number
}

export interface RetentionMetrics {
  day1: number
  day7: number
  day30: number
}

// ============================================================================
// AGGREGATED METRICS
// ============================================================================

export interface AggregatedMetrics {
  system: SystemMetrics
  authentication: AuthenticationMetrics
  business: BusinessMetrics
  timestamp: string
}

// ============================================================================
// METRIC COLLECTOR INTERFACES
// ============================================================================

export interface MetricsCollector {
  getMetrics(): any
  reset?(): void
}

export interface SystemMetricsCollector extends MetricsCollector {
  recordRequest(duration: number): void
  recordError(type: string): void
  getMetrics(): SystemMetrics
}

export interface AuthenticationMetricsCollector extends MetricsCollector {
  recordLogin(userId: string): void
  recordCacheHit(userId: string): void
  recordCacheMiss(userId: string, duration: number, success: boolean): void
  recordDeletedUser(userId: string): void
  recordBannedUser(userId: string): void
  getMetrics(): AuthenticationMetrics
}

export interface BusinessMetricsCollector extends MetricsCollector {
  recordApiCall(endpoint: string, duration: number, error: boolean): void
  recordFeatureUsage(feature: string, data: Record<string, any>): void
  recordUserSession(userId: string, duration: number): void
  getMetrics(): BusinessMetrics
}
```

---

## Implementation

### 1. Create Metric Collectors

**systemMetrics.ts**:
```typescript
import { SystemMetrics, SystemMetricsCollector } from './types'

class SystemMetricsCollectorImpl implements SystemMetricsCollector {
  private startTime = Date.now()
  private requestCount = 0
  private responseTimes: number[] = []
  private errors: Map<string, number> = new Map()

  recordRequest(duration: number): void {
    this.requestCount++
    this.responseTimes.push(duration)
    if (this.responseTimes.length > 1000) {
      this.responseTimes.shift()
    }
  }

  recordError(type: string): void {
    this.errors.set(type, (this.errors.get(type) || 0) + 1)
  }

  getMetrics(): SystemMetrics {
    // Implementation
  }
}

export const systemMetrics = new SystemMetricsCollectorImpl()
```

**authenticationMetrics.ts** (existing `authMetrics.ts`):
```typescript
// Move from src/lib/auth/authMetrics.ts to src/lib/metrics/authenticationMetrics.ts
// Implement AuthenticationMetricsCollector interface
```

**businessMetrics.ts**:
```typescript
import { BusinessMetrics, BusinessMetricsCollector } from './types'

class BusinessMetricsCollectorImpl implements BusinessMetricsCollector {
  // Implementation
}

export const businessMetrics = new BusinessMetricsCollectorImpl()
```

### 2. Create Aggregator

**metricsAggregator.ts**:
```typescript
import { systemMetrics } from './systemMetrics'
import { authenticationMetrics } from './authenticationMetrics'
import { businessMetrics } from './businessMetrics'
import { AggregatedMetrics } from './types'

export function getAggregatedMetrics(): AggregatedMetrics {
  return {
    system: systemMetrics.getMetrics(),
    authentication: authenticationMetrics.getMetrics(),
    business: businessMetrics.getMetrics(),
    timestamp: new Date().toISOString(),
  }
}

export function resetAllMetrics(): void {
  systemMetrics.reset?.()
  authenticationMetrics.reset?.()
  businessMetrics.reset?.()
}
```

### 3. Update Observability Endpoint

**apps/demo-web/src/app/api/observability/route.ts**:
```typescript
import { getAggregatedMetrics } from '@/lib/metrics/metricsAggregator'
import { distributedValidationCache } from '@/lib/auth/distributedValidationCache'

export async function GET() {
  // ... auth check ...

  const metrics = getAggregatedMetrics()
  const cacheStats = await distributedValidationCache.getStats()

  return Response.json({
    ...metrics,
    validationCache: cacheStats,  // Legacy compatibility
  })
}
```

---

## Usage

### Recording Metrics

**System Metrics**:
```typescript
import { systemMetrics } from '@/lib/metrics/systemMetrics'

// Record request
const start = Date.now()
// ... handle request ...
systemMetrics.recordRequest(Date.now() - start)

// Record error
try {
  // ... operation ...
} catch (error) {
  systemMetrics.recordError(error.constructor.name)
}
```

**Authentication Metrics**:
```typescript
import { authenticationMetrics } from '@/lib/metrics/authenticationMetrics'

// Record login
authenticationMetrics.recordLogin(userId)

// Record validation
const cached = await cache.get(userId)
if (cached) {
  authenticationMetrics.recordCacheHit(userId)
} else {
  const start = Date.now()
  const result = await validateUser(userId)
  authenticationMetrics.recordCacheMiss(userId, Date.now() - start, result.isValid)
}
```

**Business Metrics**:
```typescript
import { businessMetrics } from '@/lib/metrics/businessMetrics'

// Record API call
const start = Date.now()
try {
  const result = await apiHandler()
  businessMetrics.recordApiCall('/api/conversations', Date.now() - start, false)
} catch (error) {
  businessMetrics.recordApiCall('/api/conversations', Date.now() - start, true)
}

// Record feature usage
businessMetrics.recordFeatureUsage('conversation_created', {
  userId,
  conversationId,
})
```

### Retrieving Metrics

**GET /api/observability**:
```bash
curl https://your-app.com/api/observability
```

**Response**:
```json
{
  "system": {
    "uptime": { "hours": 24.5, ... },
    "memory": { "heapUsed": 150, ... },
    "requests": { "total": 45000, ... },
    "errors": { "total": 23, ... },
    "cache": { ... }
  },

  "authentication": {
    "logins": { "total": 1523, ... },
    "validations": { "cacheHitRate": 98.2, ... },
    "users": { "activeCount": 1200, ... },
    "costs": { "savings": "98.00", ... }
  },

  "business": {
    "api": { "endpoints": { ... } },
    "features": {
      "conversations": { "created": 450, ... },
      "graph": { "queries": 2300, ... }
    },
    "usage": { "dailyActiveUsers": 850, ... }
  },

  "timestamp": "2025-12-28T12:00:00.000Z"
}
```

---

## Best Practices

### 1. Metric Naming

**Use descriptive names**:
```typescript
// Good
validations.cacheHitRate
logins.averagePerHour
conversations.created

// Bad
vCHR
lph
cC
```

### 2. Data Retention

**Keep recent data**:
```typescript
// Store last 24 hours of hourly data
last24Hours: Record<string, number>

// Store last 100 samples for percentiles
responseTimes: number[]  // Keep last 100
```

### 3. Performance

**Minimize overhead**:
```typescript
// Good - O(1) operations
recordLogin(userId: string) {
  this.totalLogins++
  this.activeUsers.add(userId)
}

// Bad - expensive operations
recordLogin(userId: string) {
  this.users = Array.from(new Set([...this.users, userId]))  // Creates new array
}
```

### 4. Type Safety

**Always use interfaces**:
```typescript
// Good
function recordMetric(data: LoginMetrics): void

// Bad
function recordMetric(data: any): void
```

### 5. Categorization

**Keep metrics in appropriate category**:
```typescript
// System - Infrastructure concerns
memory.heapUsed
requests.perSecond

// Authentication - Auth/security concerns
logins.failed
validations.cacheHitRate

// Business - Product/user concerns
conversations.created
graph.queries
```

### 6. Documentation

**Document each metric**:
```typescript
/**
 * Tracks the number of conversations created
 * Used for: Growth metrics, capacity planning
 * Incremented: On successful conversation creation
 */
conversationsCreated: number
```

---

## Migration Plan

### Phase 1: Create Structure
- [x] Create `src/lib/metrics/` directory
- [x] Create `types.ts` with all interfaces
- [ ] Create `systemMetrics.ts`
- [ ] Create `businessMetrics.ts`
- [ ] Create `metricsAggregator.ts`

### Phase 2: Move Existing
- [ ] Move `authMetrics.ts` → `authenticationMetrics.ts`
- [ ] Update imports throughout codebase
- [ ] Ensure backward compatibility

### Phase 3: Update Endpoint
- [ ] Update `/api/observability` to use aggregator
- [ ] Test all metrics return correctly
- [ ] Verify backward compatibility

### Phase 4: Add New Metrics
- [ ] Implement system metrics collection
- [ ] Implement business metrics collection
- [ ] Add instrumentation to endpoints

---

## Future Enhancements

1. **External Export**: Prometheus, Datadog, CloudWatch
2. **Alerting**: Automated alerts on thresholds
3. **Dashboards**: Pre-built visualization dashboards
4. **Historical Data**: Long-term storage (database)
5. **Real-Time**: WebSocket metrics streaming
6. **Custom Metrics**: User-defined metrics API

---

## Change Log

**v1.0** (2025-12-28):
- Initial specification
- Defined three metric categories
- Created TypeScript interfaces
- Documented architecture and usage

---

## Related Documentation

- [AUTH_SPECIFICATION.md](./AUTH_SPECIFICATION.md) - Authentication architecture
- [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) - Deployment guide
