# PaaS/SaaS Architecture Review & Recommendations

> **Version:** 1.0
> **Date:** 2025-12-31
> **Status:** Architectural Review for Scalable Multi-Tenant Platform

---

## Executive Summary

This document reviews the Regulatory Intelligence Copilot architecture against its **original mission** of providing a regulatory compliance graph for any industry, evaluating its readiness for a **scalable PaaS/SaaS** launch with **tenant-customizable domain packs**.

### Key Findings

| Aspect | Score | Status |
|--------|-------|--------|
| Mission Alignment | 9/10 | ✅ Strong |
| Core Architecture Soundness | 8.5/10 | ✅ Strong |
| Multi-Tenancy Foundation | 8/10 | ✅ Implemented |
| Graph Extensibility | 8/10 | ✅ Strong Foundation |
| Domain Pack System | 4/10 | 🟡 Framework Only |
| Subscription/Licensing Model | 3/10 | 🔴 Not Implemented |
| Launch Readiness (MVP) | 7/10 | 🟡 Phase 5 Needed |

### Verdict

The architecture is **fundamentally sound** and **well-designed for multi-industry expansion**. However, it currently lacks explicit **domain pack** and **subscription tier** implementations. This review proposes an optimal approach for adding these capabilities.

---

## 1. Mission Alignment Assessment

### 1.1 Original Mission

> A **chat-first, graph-backed regulatory research platform** designed to help users understand complex tax, welfare, pensions, and cross-border rules without providing formal legal/tax advice.

### 1.2 Alignment Analysis

| Goal | Current Status | Assessment |
|------|----------------|------------|
| **Generic regulatory graph for any industry** | ✅ Domain-agnostic node types (`:Obligation`, `:Threshold`, `:Rate`, `:Timeline`) | Fully aligned |
| **Privacy-first architecture** | ✅ Strict separation: Memgraph (public rules) vs Supabase (tenant data) | Fully aligned |
| **Self-populating knowledge base** | ✅ SKOS concept capture from conversations | Fully aligned |
| **Extensible across jurisdictions** | ✅ `:Jurisdiction`, `:Region`, `:Agreement` hierarchy | Fully aligned |
| **Multi-tenant SaaS ready** | 🟡 Tenant isolation works, but subscription logic missing | Partially aligned |
| **Embeddable engine** | ✅ Separated packages (`reg-intel-core`, `reg-intel-graph`, etc.) | Fully aligned |

**Conclusion:** The architecture **strongly supports the original mission**. The core design is industry-agnostic; current IE tax/welfare focus is content, not architecture limitation.

---

## 2. Architecture Soundness for Launch

### 2.1 Strengths

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ARCHITECTURE LAYERS                          │
├─────────────────────────────────────────────────────────────────────┤
│  [Web Layer]  Next.js 16 + React 19 + Tailwind v4 + shadcn/ui      │
│       │                                                              │
│       ▼                                                              │
│  [API Layer]  Thin adapters → ComplianceEngine (no domain logic)    │
│       │                                                              │
│       ▼                                                              │
│  [Engine Layer]  Provider-agnostic LLM routing + Prompt aspects     │
│       │                                                              │
│       ├───────────────────────────────────────────┐                  │
│       ▼                                           ▼                  │
│  [Graph Layer]                          [Storage Layer]              │
│  Memgraph (shared rules)                Supabase (tenant data)       │
│  GraphWriteService +                    RLS isolation                │
│  Ingress Guard                          Authorization envelope       │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Architectural Wins:**

1. **Privacy Boundary Enforcement**
   - Graph Ingress Guard prevents PII from entering Memgraph
   - Egress Guard sanitizes outbound LLM calls
   - Tenant data never touches shared graph

2. **Provider Agnosticism**
   - `LlmRouter` abstracts OpenAI, Groq, local models
   - Per-tenant policy overrides without code changes
   - AI SDK v5 behind unified interface

3. **Prompt Composition**
   - Aspect-based prompts (jurisdiction, persona, disclaimers)
   - Easy to add new aspects for domain packs
   - No hardcoded domain logic

4. **Temporal Modeling**
   - Timeline Engine handles lookbacks, lock-ins, deadlines
   - Works for any regulatory domain

5. **Authorization Envelope**
   - `share_audience` + `tenant_access` + `authorization_model`
   - OpenFGA-ready for complex ReBAC scenarios

### 2.2 Areas Needing Hardening for Production

| Area | Current State | Production Need |
|------|---------------|-----------------|
| SSE Event Hub | In-memory (single instance) | Redis pub-sub for horizontal scaling |
| OpenFGA Integration | Schema ready, not wired | Complete integration or remove |
| E2B Sandboxes | Architecture exists, minimal execution | Production-grade sandbox management |
| Graph Ingestion | Concept capture works; MCP extraction minimal | Full ingestion pipeline |
| Rate Limiting | Not implemented | Per-tenant API rate limits |
| Billing Integration | Not implemented | Stripe/payment gateway |

---

## 3. Multi-Tenancy Evaluation

### 3.1 Current Implementation

```
Tenant Isolation Model
──────────────────────

┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│   Tenant A     │     │   Tenant B     │     │   Tenant C     │
│  ────────────  │     │  ────────────  │     │  ────────────  │
│  Conversations │     │  Conversations │     │  Conversations │
│  Contexts      │     │  Contexts      │     │  Contexts      │
│  LLM Policies  │     │  LLM Policies  │     │  LLM Policies  │
│  User Prefs    │     │  User Prefs    │     │  User Prefs    │
└───────┬────────┘     └───────┬────────┘     └───────┬────────┘
        │                      │                      │
        └──────────────────────┼──────────────────────┘
                               │
                               ▼
              ┌────────────────────────────────┐
              │      SHARED RULES GRAPH        │
              │         (Memgraph)             │
              │  ──────────────────────────    │
              │  • Jurisdictions               │
              │  • Rules, Benefits, Reliefs    │
              │  • Timelines, Concepts         │
              │  • NO tenant-specific data     │
              └────────────────────────────────┘
```

**What's Working:**

- ✅ Tenant ID extracted from JWT and propagated everywhere
- ✅ Supabase RLS enforces data isolation
- ✅ Per-tenant LLM policies (model, provider, egress mode)
- ✅ Hierarchical config: global → tenant → user
- ✅ Authorization envelope for fine-grained sharing

### 3.2 What's Missing for Full SaaS

| Capability | Status | Priority |
|------------|--------|----------|
| Subscription/billing integration | ❌ Not implemented | HIGH |
| Feature gate enforcement | ❌ Not implemented | HIGH |
| Usage metering/quotas | ❌ Not implemented | HIGH |
| Domain pack entitlements | ❌ Not implemented | HIGH |
| Tenant onboarding flow | ❌ Not implemented | MEDIUM |
| Admin dashboard | ❌ Not implemented | MEDIUM |
| Multi-region deployment | ❌ Not implemented | LOW (for MVP) |

---

## 4. Extensibility Approaches Evaluated

### 4.1 Current Approach: Graph-Based Extension

**How it works now:**

```
New Domain Addition (Current):
1. Seed new nodes/edges in Memgraph (Cypher files)
2. Update ingress guard whitelist (labels, relationships, properties)
3. Register specialist agent (optional)
4. Add prompt aspects (optional)
5. Conversations auto-enrich via concept capture
```

**Pros:**
- ✅ Configuration-driven, not code-driven
- ✅ No "domain pack DLC" code to maintain
- ✅ Self-populating through usage
- ✅ Clean separation of concerns

**Cons:**
- ❌ No tenant-level customization
- ❌ All tenants see all domains
- ❌ No subscription gates
- ❌ Can't enable/disable domains per tenant

### 4.2 Alternative Approaches Evaluated

#### Approach A: Domain Pack as Feature Flags

```typescript
interface TenantSubscription {
  tenantId: string;
  tier: 'free' | 'starter' | 'professional' | 'enterprise';
  enabledDomains: string[];  // ['tax:ie', 'welfare:ie', 'pensions:uk']
  enabledFeatures: string[]; // ['scenario_engine', 'what_if', 'bulk_export']
  quotas: {
    monthlyQueries: number;
    monthlyTokens: number;
    maxConversations: number;
  };
}
```

**Evaluation:**
- ✅ Simple to implement
- ✅ Works with existing config system
- ❌ Binary on/off - no partial domain access
- ❌ Doesn't scale well with many domains

#### Approach B: Domain Pack as Plugins

```typescript
interface DomainPack {
  id: string;  // 'ie-tax-complete', 'uk-pension-starter'
  name: string;
  jurisdictions: string[];
  nodeTypes: string[];
  agents: AgentConfig[];
  promptAspects: PromptAspect[];
  ingressRules: IngressAspect[];

  // Activation
  activateForTenant(tenantId: string): Promise<void>;
  deactivateForTenant(tenantId: string): Promise<void>;
}
```

**Evaluation:**
- ✅ Self-contained, modular
- ✅ Easy to test and deploy independently
- ✅ Clear licensing per pack
- ❌ More complex to implement
- ❌ May duplicate shared infrastructure

#### Approach C: Tiered Graph Views (Recommended Hybrid)

```typescript
interface TenantGraphScope {
  tenantId: string;

  // What this tenant can query from shared graph
  allowedJurisdictions: string[];  // ['IE', 'UK', 'EU']
  allowedDomains: string[];        // ['TAX', 'WELFARE', 'PENSIONS']
  allowedNodeLabels: string[];     // Derived from domains

  // Per-tenant custom nodes (stored separately)
  tenantNodes?: TenantNodeConfig;  // Optional tenant-specific rules

  // Feature entitlements
  features: {
    scenarioEngine: boolean;
    whatIfComparison: boolean;
    advancedAlgorithms: boolean;
    bulkExport: boolean;
    apiAccess: boolean;
  };

  // Usage quotas
  quotas: UsageQuotas;
}
```

**Evaluation:**
- ✅ Leverages existing shared graph (no duplication)
- ✅ Tenant customization via scoping, not copying
- ✅ Feature flags for premium capabilities
- ✅ Supports per-tenant custom rules if needed
- ✅ Works with existing architecture
- ⚠️ Requires query-time filtering

---

## 5. Recommended Architecture: Tiered Graph Scoping

### 5.1 Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SUBSCRIPTION & DOMAIN LAYER                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                  TENANT SUBSCRIPTION                         │   │
│   │  ──────────────────────────────────────────────────────────  │   │
│   │  tier: 'professional'                                        │   │
│   │  domains: ['TAX', 'WELFARE']                                 │   │
│   │  jurisdictions: ['IE', 'UK', 'EU']                           │   │
│   │  features: { scenarioEngine: true, whatIf: true }            │   │
│   │  quotas: { monthlyQueries: 10000, tokens: 1M }               │   │
│   └───────────────────────────┬─────────────────────────────────┘   │
│                               │                                      │
│   ┌───────────────────────────┼─────────────────────────────────┐   │
│   │                    DOMAIN PACKS                              │   │
│   │  ─────────────────────────────────────────────────────────── │   │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │   │
│   │  │  IE Tax      │  │  IE Welfare  │  │  UK Pension  │       │   │
│   │  │  Pack        │  │  Pack        │  │  Pack        │       │   │
│   │  ├──────────────┤  ├──────────────┤  ├──────────────┤       │   │
│   │  │ Nodes: 150+  │  │ Nodes: 80+   │  │ Nodes: 120+  │       │   │
│   │  │ Agents: 3    │  │ Agents: 2    │  │ Agents: 2    │       │   │
│   │  │ Aspects: 5   │  │ Aspects: 4   │  │ Aspects: 4   │       │   │
│   │  └──────────────┘  └──────────────┘  └──────────────┘       │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Database Schema Additions

```sql
-- Subscription tiers
CREATE TABLE copilot_internal.subscription_tiers (
  id TEXT PRIMARY KEY,          -- 'free', 'starter', 'professional', 'enterprise'
  name TEXT NOT NULL,
  description TEXT,
  price_monthly_usd DECIMAL(10,2),
  price_yearly_usd DECIMAL(10,2),

  -- Defaults for this tier
  default_domains TEXT[] NOT NULL DEFAULT '{}',
  default_jurisdictions TEXT[] NOT NULL DEFAULT '{}',
  default_features JSONB NOT NULL DEFAULT '{}',
  default_quotas JSONB NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Domain packs catalog
CREATE TABLE copilot_internal.domain_packs (
  id TEXT PRIMARY KEY,          -- 'ie-tax-complete', 'uk-welfare-basic'
  name TEXT NOT NULL,
  description TEXT,

  -- What this pack enables
  domains TEXT[] NOT NULL,       -- ['TAX']
  jurisdictions TEXT[] NOT NULL, -- ['IE']
  node_labels TEXT[] NOT NULL,   -- Allowed node types
  relationship_types TEXT[] NOT NULL,

  -- Agent and prompt configurations
  agent_configs JSONB DEFAULT '[]',
  prompt_aspects JSONB DEFAULT '[]',

  -- Pricing (can be included in tier or add-on)
  price_monthly_usd DECIMAL(10,2),
  included_in_tiers TEXT[] DEFAULT '{}',

  -- Metadata
  version TEXT NOT NULL DEFAULT '1.0',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tenant subscriptions
CREATE TABLE copilot_internal.tenant_subscriptions (
  tenant_id UUID PRIMARY KEY REFERENCES auth.users(id),
  tier_id TEXT REFERENCES copilot_internal.subscription_tiers(id),

  -- Status
  status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'trialing', 'past_due', 'canceled'
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,

  -- Enabled domain packs (overrides tier defaults)
  enabled_domain_packs TEXT[] NOT NULL DEFAULT '{}',

  -- Feature overrides (extends tier defaults)
  feature_overrides JSONB DEFAULT '{}',

  -- Quota overrides
  quota_overrides JSONB DEFAULT '{}',

  -- Billing
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Usage tracking
CREATE TABLE copilot_internal.usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,

  -- Usage period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Metrics
  query_count INTEGER DEFAULT 0,
  token_count BIGINT DEFAULT 0,
  conversation_count INTEGER DEFAULT 0,
  graph_node_reads BIGINT DEFAULT 0,

  -- By domain pack (for granular billing)
  usage_by_domain JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(tenant_id, period_start)
);

-- Create RLS policies
ALTER TABLE copilot_internal.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_subscription_read ON copilot_internal.tenant_subscriptions
  FOR SELECT USING (tenant_id = public.current_tenant_id());
```

### 5.3 TypeScript Implementation

```typescript
// packages/reg-intel-subscriptions/src/types.ts

export interface SubscriptionTier {
  id: 'free' | 'starter' | 'professional' | 'enterprise';
  name: string;
  defaultDomains: string[];
  defaultJurisdictions: string[];
  defaultFeatures: FeatureFlags;
  defaultQuotas: UsageQuotas;
}

export interface DomainPack {
  id: string;
  name: string;
  domains: string[];
  jurisdictions: string[];
  nodeLabels: string[];
  relationshipTypes: string[];
  agentConfigs: AgentConfig[];
  promptAspects: PromptAspectConfig[];
  includedInTiers: string[];
}

export interface TenantSubscription {
  tenantId: string;
  tierId: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled';
  enabledDomainPacks: string[];
  featureOverrides: Partial<FeatureFlags>;
  quotaOverrides: Partial<UsageQuotas>;
}

export interface EffectiveTenantScope {
  // Computed from tier + domain packs + overrides
  allowedDomains: string[];
  allowedJurisdictions: string[];
  allowedNodeLabels: string[];
  allowedRelationshipTypes: string[];
  features: FeatureFlags;
  quotas: UsageQuotas;
  agents: AgentConfig[];
  promptAspects: PromptAspectConfig[];
}

export interface FeatureFlags {
  scenarioEngine: boolean;
  whatIfComparison: boolean;
  advancedAlgorithms: boolean;
  bulkExport: boolean;
  apiAccess: boolean;
  customAgents: boolean;
  webhooks: boolean;
}

export interface UsageQuotas {
  monthlyQueries: number;
  monthlyTokens: number;
  maxConversations: number;
  maxConversationDepth: number;
  maxDomainPacks: number;
}
```

```typescript
// packages/reg-intel-subscriptions/src/subscriptionService.ts

export class SubscriptionService {
  constructor(
    private store: SubscriptionStore,
    private domainPackStore: DomainPackStore,
    private cache: CacheClient
  ) {}

  /**
   * Get the effective scope for a tenant (cached)
   */
  async getEffectiveScope(tenantId: string): Promise<EffectiveTenantScope> {
    const cacheKey = `scope:${tenantId}`;
    const cached = await this.cache.get<EffectiveTenantScope>(cacheKey);
    if (cached) return cached;

    const subscription = await this.store.getSubscription(tenantId);
    const tier = await this.store.getTier(subscription.tierId);
    const domainPacks = await this.domainPackStore.getByIds(
      subscription.enabledDomainPacks
    );

    const scope = this.computeEffectiveScope(tier, domainPacks, subscription);

    await this.cache.set(cacheKey, scope, { ttl: 300 }); // 5 min cache
    return scope;
  }

  private computeEffectiveScope(
    tier: SubscriptionTier,
    packs: DomainPack[],
    subscription: TenantSubscription
  ): EffectiveTenantScope {
    // Merge tier defaults with domain pack additions
    const domains = new Set([
      ...tier.defaultDomains,
      ...packs.flatMap(p => p.domains)
    ]);

    const jurisdictions = new Set([
      ...tier.defaultJurisdictions,
      ...packs.flatMap(p => p.jurisdictions)
    ]);

    const nodeLabels = new Set([
      ...packs.flatMap(p => p.nodeLabels)
    ]);

    return {
      allowedDomains: [...domains],
      allowedJurisdictions: [...jurisdictions],
      allowedNodeLabels: [...nodeLabels],
      allowedRelationshipTypes: [...new Set(packs.flatMap(p => p.relationshipTypes))],
      features: { ...tier.defaultFeatures, ...subscription.featureOverrides },
      quotas: { ...tier.defaultQuotas, ...subscription.quotaOverrides },
      agents: packs.flatMap(p => p.agentConfigs),
      promptAspects: packs.flatMap(p => p.promptAspects),
    };
  }

  /**
   * Check if tenant can access a specific domain/jurisdiction
   */
  async canAccess(
    tenantId: string,
    domain: string,
    jurisdiction: string
  ): Promise<boolean> {
    const scope = await this.getEffectiveScope(tenantId);
    return (
      scope.allowedDomains.includes(domain) &&
      scope.allowedJurisdictions.includes(jurisdiction)
    );
  }

  /**
   * Check if tenant has a specific feature
   */
  async hasFeature(tenantId: string, feature: keyof FeatureFlags): Promise<boolean> {
    const scope = await this.getEffectiveScope(tenantId);
    return scope.features[feature] === true;
  }

  /**
   * Check quota usage
   */
  async checkQuota(
    tenantId: string,
    metric: keyof UsageQuotas,
    increment: number = 1
  ): Promise<{ allowed: boolean; remaining: number }> {
    const scope = await this.getEffectiveScope(tenantId);
    const usage = await this.store.getCurrentUsage(tenantId);

    const limit = scope.quotas[metric];
    const current = usage[metric] ?? 0;
    const remaining = limit - current;

    return {
      allowed: remaining >= increment,
      remaining: Math.max(0, remaining - increment)
    };
  }
}
```

### 5.4 Integration with GraphClient

```typescript
// packages/reg-intel-graph/src/scopedGraphClient.ts

export class ScopedGraphClient implements GraphClient {
  constructor(
    private baseClient: GraphClient,
    private subscriptionService: SubscriptionService,
    private tenantId: string
  ) {}

  /**
   * Wrap all graph queries with tenant scope filtering
   */
  async getRulesForProfileAndJurisdiction(
    profileId: string,
    jurisdictionId: string,
    keyword?: string
  ): Promise<GraphContext> {
    // Check tenant can access this jurisdiction
    const scope = await this.subscriptionService.getEffectiveScope(this.tenantId);

    if (!scope.allowedJurisdictions.includes(jurisdictionId)) {
      throw new SubscriptionError(
        `Jurisdiction ${jurisdictionId} not included in your subscription`,
        'JURISDICTION_NOT_ALLOWED'
      );
    }

    // Filter results to only allowed node types
    const result = await this.baseClient.getRulesForProfileAndJurisdiction(
      profileId,
      jurisdictionId,
      keyword
    );

    return this.filterByScope(result, scope);
  }

  private filterByScope(
    context: GraphContext,
    scope: EffectiveTenantScope
  ): GraphContext {
    return {
      ...context,
      nodes: context.nodes.filter(node =>
        scope.allowedNodeLabels.includes(node.type) &&
        this.nodeInAllowedDomain(node, scope.allowedDomains)
      ),
      edges: context.edges.filter(edge =>
        scope.allowedRelationshipTypes.includes(edge.type)
      )
    };
  }

  private nodeInAllowedDomain(node: GraphNode, allowedDomains: string[]): boolean {
    // Check node's domain property against allowed domains
    const nodeDomain = node.properties?.domain as string;
    if (!nodeDomain) return true; // Domain-agnostic nodes are always allowed
    return allowedDomains.includes(nodeDomain);
  }
}
```

### 5.5 Integration with ComplianceEngine

```typescript
// packages/reg-intel-core/src/complianceEngine.ts

export class ComplianceEngine {
  constructor(
    private graphClient: GraphClient,
    private llmRouter: LlmRouter,
    private subscriptionService: SubscriptionService,
    private promptBuilder: PromptBuilder,
    // ... other deps
  ) {}

  async handleChat(request: ChatRequest): Promise<ChatResponse> {
    const { tenantId, conversationId, message } = request;

    // 1. Get tenant scope
    const scope = await this.subscriptionService.getEffectiveScope(tenantId);

    // 2. Check quota
    const quotaCheck = await this.subscriptionService.checkQuota(
      tenantId,
      'monthlyQueries'
    );
    if (!quotaCheck.allowed) {
      throw new QuotaExceededError('Monthly query limit reached');
    }

    // 3. Create scoped graph client
    const scopedGraph = new ScopedGraphClient(
      this.graphClient,
      this.subscriptionService,
      tenantId
    );

    // 4. Build prompt with tenant-specific aspects
    const prompt = await this.buildTenantPrompt(message, scope);

    // 5. Route to allowed agents only
    const agents = this.filterAgentsByScope(this.agents, scope);

    // 6. Execute with scoped resources
    const response = await this.executeWithScope({
      message,
      prompt,
      scopedGraph,
      agents,
      scope
    });

    // 7. Record usage
    await this.recordUsage(tenantId, response);

    return response;
  }

  private async buildTenantPrompt(
    message: string,
    scope: EffectiveTenantScope
  ): Promise<string> {
    // Only include aspects from enabled domain packs
    const aspects = this.promptBuilder.getAspectsForScope(scope);
    return this.promptBuilder.build(message, aspects);
  }

  private filterAgentsByScope(
    agents: Agent[],
    scope: EffectiveTenantScope
  ): Agent[] {
    const allowedAgentIds = new Set(scope.agents.map(a => a.id));
    return agents.filter(a => allowedAgentIds.has(a.id));
  }
}
```

---

## 6. Subscription Tiers Recommendation

### 6.1 Proposed Tier Structure

| Tier | Monthly Price | Jurisdictions | Domains | Features | Quotas |
|------|---------------|---------------|---------|----------|--------|
| **Free** | $0 | 1 (IE or UK) | Tax basics only | Chat only | 50 queries/mo |
| **Starter** | $29 | 2 (IE + UK) | Tax, Welfare basics | Chat + Graph view | 500 queries/mo |
| **Professional** | $99 | 4 (IE, UK, NI, EU) | Full Tax, Welfare, Pensions | + Scenario Engine, What-If | 5,000 queries/mo |
| **Enterprise** | Custom | Unlimited | All + Custom | + API, Bulk export, SSO | Unlimited |

### 6.2 Domain Pack Catalog (Initial)

| Pack ID | Name | Domains | Jurisdictions | Included In |
|---------|------|---------|---------------|-------------|
| `ie-tax-basic` | IE Tax Basics | TAX | IE | Free, Starter, Pro, Ent |
| `ie-tax-complete` | IE Tax Complete | TAX | IE | Pro, Ent |
| `ie-welfare` | IE Social Welfare | WELFARE | IE | Starter, Pro, Ent |
| `ie-pensions` | IE Pensions | PENSIONS | IE | Pro, Ent |
| `uk-tax-basic` | UK Tax Basics | TAX | UK | Starter, Pro, Ent |
| `uk-welfare` | UK Welfare | WELFARE | UK | Pro, Ent |
| `uk-pensions` | UK Pensions | PENSIONS | UK | Pro, Ent |
| `eu-coordination` | EU Cross-Border | COORDINATION | EU | Pro, Ent |
| `ni-special` | NI Special Regime | TAX, GOODS | NI | Pro, Ent |

### 6.3 Add-On Packs (Optional Purchases)

| Pack ID | Name | Monthly Price | Description |
|---------|------|---------------|-------------|
| `healthcare-ie` | IE Healthcare | $19/mo | Medical licensing, patient rights |
| `environment-eu` | EU Environmental | $29/mo | ESG, carbon reporting |
| `financial-uk` | UK Financial Services | $49/mo | FCA compliance, AML |
| `construction-ie` | IE Construction | $29/mo | Building regs, CIS |

---

## 7. Implementation Roadmap

### Phase A: Subscription Foundation (2-3 weeks)

```
Week 1-2:
├── Create subscription_tiers table + seed data
├── Create domain_packs table + seed IE/UK packs
├── Create tenant_subscriptions table
├── Implement SubscriptionService
├── Add subscription middleware to API routes
└── Wire ComplianceEngine to respect scopes

Week 3:
├── Add usage tracking (usage_records table)
├── Implement quota checking
├── Add subscription checks to GraphClient
└── Add Stripe integration skeleton
```

### Phase B: Billing Integration (2-3 weeks)

```
Week 4-5:
├── Complete Stripe customer/subscription lifecycle
├── Implement webhook handlers (payment success/fail)
├── Add billing portal link
├── Implement trial → paid conversion flow
└── Add invoice/receipt generation

Week 6:
├── Add admin dashboard for subscription management
├── Implement usage analytics
├── Add quota warning emails
└── Test billing edge cases
```

### Phase C: Domain Pack Enhancement (2-3 weeks)

```
Week 7-8:
├── Implement domain pack self-serve activation
├── Add per-pack usage tracking
├── Implement agent registry filtering
├── Add pack-specific prompt aspects
└── Create pack marketplace UI

Week 9:
├── Add custom tenant nodes (enterprise feature)
├── Implement pack versioning/updates
├── Add pack recommendations based on usage
└── Documentation and guides
```

---

## 8. Alternative Approaches Considered

### 8.1 Separate Graph Per Tenant

**Description:** Each tenant gets their own Memgraph instance or database.

**Verdict:** ❌ REJECTED

- Extremely expensive at scale (10x+ infrastructure cost)
- Data duplication (same rules in every graph)
- Complex sync when rules update
- Overkill for read-heavy workload

### 8.2 Graph Partitioning by Tenant

**Description:** Single Memgraph with tenant_id on every node.

**Verdict:** ❌ REJECTED

- Violates privacy boundary design (Memgraph = shared public rules)
- Query complexity (every query needs tenant filter)
- No benefit over current scoping approach
- Would require major rearchitecture

### 8.3 Plugin Architecture (Runtime Loading)

**Description:** Domain packs as dynamically loadable modules.

**Verdict:** ⚠️ DEFERRED

- Higher complexity for MVP
- Security concerns with dynamic code
- Consider for Phase 8+ if needed
- Current static registration is sufficient

### 8.4 Recommended: Tiered Graph Scoping

**Verdict:** ✅ SELECTED

- Minimal infrastructure change
- Works with existing shared graph
- Clear subscription/quota model
- Easy to understand and debug
- Scales to enterprise

---

## 9. Gap Analysis Summary

| Category | Gap | Severity | Effort |
|----------|-----|----------|--------|
| **Subscription** | No tier definitions | HIGH | 1 week |
| **Subscription** | No billing integration | HIGH | 2 weeks |
| **Subscription** | No usage tracking | HIGH | 1 week |
| **Domain Packs** | No pack definitions | HIGH | 1 week |
| **Domain Packs** | No pack activation flow | MEDIUM | 1 week |
| **Authorization** | OpenFGA not wired | MEDIUM | 2 weeks |
| **Scale** | SSE not distributed | MEDIUM | 1 week |
| **Scale** | No rate limiting | MEDIUM | 1 week |
| **Admin** | No tenant admin UI | MEDIUM | 2 weeks |
| **Onboarding** | No self-serve signup | MEDIUM | 1 week |

**Total Estimated Effort to Production-Ready:** 12-14 weeks

---

## 10. Recommendations

### 10.1 Immediate Actions (Before Launch)

1. **Implement subscription tier system** (Phase A above)
2. **Define initial domain packs** for IE and UK
3. **Add basic usage tracking**
4. **Wire ScopedGraphClient** to ComplianceEngine
5. **Add Stripe integration** for billing

### 10.2 Post-Launch Priorities

1. Complete OpenFGA integration for enterprise sharing
2. Implement pack marketplace UI
3. Add SSE distribution via Redis
4. Build admin dashboard
5. Implement custom tenant rules (enterprise)

### 10.3 Architecture Principles to Maintain

1. **Shared graph stays PII-free** - Never tenant data in Memgraph
2. **Scoping, not copying** - Filter at query time, don't duplicate
3. **Config-driven extensibility** - New domains via data, not code
4. **Graceful degradation** - Feature gates should fail safely
5. **Usage transparency** - Clear quotas and warnings

---

## 11. Conclusion

The Regulatory Intelligence Copilot has a **strong architectural foundation** that fully supports the original mission of a multi-industry regulatory compliance platform. The privacy-first design, provider-agnostic engine, and domain-agnostic graph schema are **production-ready**.

The primary gap is the **subscription and domain pack layer**, which needs to be built to enable commercial PaaS/SaaS launch. The recommended **Tiered Graph Scoping** approach provides the optimal balance of:

- Minimal infrastructure change
- Clear monetization path
- Per-tenant customization
- Enterprise extensibility

With an estimated 12-14 weeks of focused effort, the platform can be transformed from a well-architected prototype into a **production-ready, multi-tenant SaaS platform** with full subscription management and domain pack extensibility.

---

## Appendix A: File References

| Document | Path |
|----------|------|
| Architecture v0.6 | `docs/architecture/architecture_v_0_6.md` |
| Data Privacy Boundaries | `docs/architecture/data_privacy_and_architecture_boundaries_v_0_1.md` |
| Graph Schema v0.6 | `docs/architecture/graph/schema_v_0_6.md` |
| Roadmap v0.6 | `docs/governance/roadmap/roadmap_v_0_6.md` |
| Graph Ingress Guard | `packages/reg-intel-graph/src/graphIngressGuard.ts` |
| Tenant LLM Policies | `packages/reg-intel-llm/src/policyStores.ts` |
| Conversation Config | `packages/reg-intel-conversations/src/conversationConfig.ts` |

---

## Appendix B: Example Domain Pack Definition

```typescript
// Example: IE Tax Complete Pack
const ieTaxCompletePack: DomainPack = {
  id: 'ie-tax-complete',
  name: 'Ireland Tax Complete',
  description: 'Comprehensive Irish tax compliance including income tax, CGT, VAT, VRT, and corporate tax.',

  domains: ['TAX'],
  jurisdictions: ['IE'],

  nodeLabels: [
    'Statute', 'Section', 'Relief', 'Rate', 'Threshold',
    'TaxCredit', 'Obligation', 'Form', 'Penalty', 'Timeline'
  ],

  relationshipTypes: [
    'IN_JURISDICTION', 'REQUIRES', 'HAS_RATE', 'HAS_THRESHOLD',
    'FILING_DEADLINE', 'HAS_PENALTY', 'LIMITED_BY'
  ],

  agentConfigs: [
    {
      id: 'ie-income-tax-agent',
      name: 'IE Income Tax Specialist',
      systemPrompt: 'specialist_ie_income_tax_v1'
    },
    {
      id: 'ie-cgt-agent',
      name: 'IE Capital Gains Tax Specialist',
      systemPrompt: 'specialist_ie_cgt_v1'
    },
    {
      id: 'ie-vat-agent',
      name: 'IE VAT Specialist',
      systemPrompt: 'specialist_ie_vat_v1'
    }
  ],

  promptAspects: [
    { type: 'jurisdiction', config: { code: 'IE', name: 'Ireland' } },
    { type: 'domain', config: { id: 'TAX', disclaimerKey: 'tax_not_advice' } }
  ],

  includedInTiers: ['professional', 'enterprise'],
  priceMonthlyUsd: null // Included in tier, not sold separately
};
```
