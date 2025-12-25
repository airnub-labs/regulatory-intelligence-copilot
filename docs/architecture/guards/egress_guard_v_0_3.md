# Egress Guard – v0_3 (Aspect-Based, Symmetric with Graph Ingress)

> **Status:** Accepted and Implemented (supersedes v0_2).
>
> **Implementation Status:** ✅ Fully Complete (2025-12-24)
>
> Goal: Make the egress guard for MCP + LLM calls use the **same aspect pattern** as the Graph Ingress Guard, so both sides feel familiar and can even host AI policy agents while supporting staged rollout modes.

This document describes:

- A unified **EgressGuardContext** and **EgressAspect** interface.
- Baseline vs custom aspects (same pattern as Graph Ingress Guard).
- **Egress modes** for staged rollout (`enforce`, `report-only`, `off`).
- Safe sanitisation semantics (execution uses the sanitised payload; original can be preserved explicitly).
- How AI agents can be used as egress aspects.
- How this integrates with the E2B MCP Gateway and your existing privacy boundary specs.

---

## 1. Purpose & Context

The platform already:

- Routes external tool and LLM calls via an **E2B MCP Gateway**.
- Applies some form of **egress guard** to scrub PII and sensitive context before it leaves the system.

This spec brings that into the same formal, composable pattern as the
`graph_ingress_guard_v_0_1.md` spec, so that:

- Ingress and egress guards look and feel the same to engineers.
- Both can be extended with **AI policy agents** via aspects, without
  weakening baseline guarantees.
- Code reuse and mental models are shared across both boundaries.

---

## 2. Core Types: EgressGuardContext & EgressAspect

We define a context and aspect interface symmetrical to the graph ingress
pattern.

```ts
export type EgressTarget =
  | 'mcp'        // Docker MCP / E2B MCP Gateway
  | 'llm'        // LLM providers (OpenAI, Groq, local GPT-OSS, etc.)
  | 'http';      // (optional) generic HTTP integrations

export interface EgressGuardContext {
  target: EgressTarget;

  // Logical destination info (no secrets)
  providerId: string;      // e.g. 'openai', 'groq', 'local-gpt-oss', 'docker-mcp-perplexity'
  endpointId?: string;     // e.g. 'responses', 'tool.call', 'my-mcp-tool'

  // Payloads BEFORE any transformation
  request: unknown;        // model/tool-specific request payload

  // Optional preserved original payload for debugging/telemetry
  originalRequest?: unknown;

  // Mutable fields for aspects to adjust
  sanitizedRequest?: unknown; // transformed version for outbound call

  // Classification / routing meta
  tenantId?: string;       // for logging/audit only, never sent out
  userId?: string;         // for logging/audit only, never sent out
  jurisdictions?: string[]; // e.g. ['IE', 'UK'] for policy decisions
  purpose?: string;        // e.g. 'regulatory-research', 'egress-guard', 'pii-scan'

  // Requested vs effective mode for auditability
  mode?: 'enforce' | 'report-only' | 'off';
  effectiveMode?: 'enforce' | 'report-only' | 'off';

  metadata?: Record<string, unknown>;
}

export type EgressAspect = (
  ctx: EgressGuardContext,
  next: (ctx: EgressGuardContext) => Promise<EgressGuardContext>
) => Promise<EgressGuardContext>;
```

`EgressGuardContext` is intentionally generic and transport-agnostic. Specific
adapters (OpenAI, Groq, MCP client) are responsible for mapping between their
native request types and this context.

### 2.1 Egress modes and sanitisation semantics

- **Modes**
-  - `enforce` (default): apply provider allowlisting, sanitisation, and blocking behaviour. Violations throw/block. The **sanitised payload** is executed.
-  - `report-only`: run sanitisation and record deltas in `metadata`, but still execute the **original payload**. This keeps observability while matching the caller’s raw intent.
-  - `off`: skip sanitisation but still run provider allowlisting (throws on disallowed providers). Reserved for explicit test harness wiring, never production.
- **Execution payload**
-  - `enforce` executes the sanitised request (`ctx.request` is overwritten).
-  - `report-only` executes the original request while exposing `sanitizedRequest` + `metadata.redactionApplied/redactionReportOnly` for logging/telemetry.
-  - Provider allowlisting executes and enforces in all modes, including `off`.
- **Original payloads**
-  - `originalRequest` may be preserved (opt-in) for debugging/telemetry in non-production environments. It is not required for normal operation because report-only already keeps `ctx.request` untouched.
- **Usage expectation**
  - Application code (ComplianceEngine, agents, API routes) must route outbound calls via `EgressClient` / `LlmRouter` rather than direct provider clients, so the mode and sanitisation guarantees apply uniformly.
  - `mode: 'off'` must be treated as a deliberate, test-only override.

The implementation mirrors this table:

- `effectiveMode` is always set on the context (defaulting to the client’s base mode when none is provided) and governs how aspects mutate `ctx.request`.
- In `enforce`, aspects overwrite `ctx.request` with `sanitizedRequest` before execution so downstream callers only ever see the scrubbed payload.
- In `report-only`, aspects populate `sanitizedRequest` and metadata but leave `ctx.request` untouched so providers execute the original payload.
- In `off`, sanitisation aspects short-circuit but the provider allowlist still throws for disallowed providers.

### 2.2 Effective mode resolution

- Each `EgressGuardContext` carries both an optional **requested** mode and the resolved `effectiveMode` plus tenant/user identifiers so that per-call decisions can be made without changing the egress pipeline.
- `EgressClient` uses `effectiveMode` when provided, falling back to its configured default (usually `enforce`).
- `LlmRouter` resolves modes in the **exact order**: **global/base default → tenant policy → user policy → per-call override**. Every step runs its own `allowOff` check; if an `off` candidate is disallowed at that scope, the resolver keeps the last permitted mode instead of silently skipping back to a later candidate.
- Global/base default is always the starting `requestedMode` and `effectiveMode` fallback. Tenant policy can replace it and can optionally disallow `off` for everyone. User policy runs after the tenant and can tighten or loosen `allowOff` for that user; per-call overrides are applied last and only take effect if allowed by the user+tenant `allowOff` combination.
- Mode resolution only affects whether sanitisation mutates the execution payload. `enforce` executes the sanitised payload, `report-only` executes the original payload with sanitisation metadata attached, and `off` skips sanitisation entirely while still enforcing provider allowlisting.
- The router populates `tenantId`, `userId`, the requested mode, and the resolved `effectiveMode` into `EgressGuardContext` for observability and downstream auditing.

---

## 3. Aspect Composition & EgressClient

Analogous to `composeIngressAspects`:

```ts
export function composeEgressAspects(
  aspects: EgressAspect[],
  terminal: (ctx: EgressGuardContext) => Promise<EgressGuardContext>
): (ctx: EgressGuardContext) => Promise<EgressGuardContext> {
  return aspects.reduceRight(
    (next, aspect) => (ctx) => aspect(ctx, next),
    terminal,
  );
}
```

The **terminal** function is the only place that:

- Translates `sanitizedRequest` (or `request` if unchanged) into the concrete
  client call (e.g. OpenAI `responses.create`, MCP Docker client call).
- Executes the outbound request.

The Egress Guard sits inside a reusable **EgressClient**, which exposes domain
methods:

```ts
class EgressClient {
  constructor(private readonly runPipeline: (ctx: EgressGuardContext) => Promise<EgressGuardContext>) {}

  async callLlm(providerId: string, request: OpenAIRequest, meta: EgressMeta) {
    const ctx: EgressGuardContext = {
      target: 'llm',
      providerId,
      endpointId: 'responses',
      request,
      ...meta,
    };

    const finalCtx = await this.runPipeline(ctx);
    return finalCtx.metadata?.rawResponse ?? null; // or more specific
  }

  async callMcp(providerId: string, toolId: string, request: McpRequest, meta: EgressMeta) {
    const ctx: EgressGuardContext = {
      target: 'mcp',
      providerId,
      endpointId: toolId,
      request,
      ...meta,
    };

    const finalCtx = await this.runPipeline(ctx);
    return finalCtx.metadata?.rawResponse ?? null;
  }
}
```

Callers (agents, services) only see `callLlm` / `callMcp`, **not** the aspect
plumbing.

---

## 4. Baseline vs Custom Egress Aspects

As with the Graph Ingress Guard, we distinguish:

1. **Baseline (non-removable)** aspects – encode the non-negotiable privacy
   and security guarantees.
2. **Custom (configurable)** aspects – can be added/removed/reordered via
   configuration; may be AI agents; must not weaken baselines.

### 4.1 Baseline Egress Aspects

Baseline aspects include:

1. **TargetWhitelistingAspect**
   - Only allow configured `providerId` + `endpointId` pairs.
   - Enforces that all MCP calls go via the **E2B MCP Gateway** or approved
     Docker MCP services.

2. **PiiScrubbingAspect**
   - Applies deterministic PII stripping / redaction to the outbound
     `request`, populating `sanitizedRequest` and overwriting the execution
     payload in `enforce` mode. In `report-only`, the sanitised payload is
     recorded for telemetry but the **original request executes**.
   - Sets `metadata.redactionApplied` / `metadata.redactionReportOnly` to
     signal when changes occurred and whether the run was non-blocking.
   - Uses the same policies as
     `data_privacy_and_architecture_boundaries_v_0_1.md`.

3. **JurisdictionalRoutingAspect**
   - Ensures outbound calls honour jurisdiction constraints (e.g. EU data for
     EU-only models/providers where required).

4. **LoggingAndAuditAspect (baseline variant)**
   - Emits structured logs/audit events **without** leaking content.
   - E.g. logs providerId, endpointId, payload size, hashed IDs.

These baseline aspects are **always applied** and cannot be disabled via
configuration.

### 4.2 Custom Egress Aspects

Custom aspects can be configured per environment or per deployment, similar to
custom graph ingress aspects. Example:

- `PromptShapingAspect` – add disclaimers, jurisdiction context,
  persona-specific instructions.
- `RegulatoryContextAspect` – injects local citations or spec references into
  prompts.
- `EgressAiPolicyAspect` – asks a local AI policy agent whether this outbound
  call is acceptable.

Configuration example:

```yaml
egressGuard:
  customAspects:
    - regulatory-context
    - prompt-shaping
    # - egress-ai-policy   # opt-in
```

Resolution via a registry:

```ts
const EGRESS_REGISTRY: Record<string, EgressAspect> = {
  'regulatory-context': regulatoryContextAspect,
  'prompt-shaping': promptShapingAspect,
  'egress-ai-policy': egressAiPolicyAspect,
};

export function resolveEgressAspectsFromConfig(ids: string[]): EgressAspect[] {
  return ids.map((id) => {
    const aspect = EGRESS_REGISTRY[id];
    if (!aspect) throw new Error(`Unknown egress aspect: ${id}`);
    return aspect;
  });
}
```

---

## 5. AI Agent as Egress Aspect

### 5.1 Concept

An **Egress AI Policy Agent Aspect** is a custom aspect that:

- Receives a **sanitised view** of the outbound request.
- Optionally consults a local LLM / rule engine / policy microservice.
- Decides whether to:
  - Allow the call (possibly with further prompt shaping), or
  - Block it (e.g. if content appears too sensitive for the chosen provider).

### 5.2 Constraints

- Must run **after** baseline PII scrubbing, never before.
- Must not reintroduce removed/sensitive content.
- Should favour **local or GPT-OSS** models; if external, must call via a
  separate, strictly-configured egress path with its own minimal context.
- Should be time-bounded and failure-aware (e.g. fail closed, or fall back to
  baseline behaviour depending on configuration).

### 5.3 Example Shape (Illustrative)

```ts
export const egressAiPolicyAspect: EgressAspect = async (ctx, next) => {
  const minimalSummary = buildMinimalOutboundSummary(ctx);

  const decision = await egressPolicyAgent.decide({
    target: ctx.target,
    providerId: ctx.providerId,
    endpointId: ctx.endpointId,
    summary: minimalSummary,
  });

  if (decision.action === 'block') {
    await auditLog.write({
      type: 'EGRESS_POLICY_AGENT_BLOCKED',
      providerId: ctx.providerId,
      endpointId: ctx.endpointId,
      reason: decision.reason,
    });
    throw new Error('Egress blocked by AI policy agent');
  }

  if (decision.patch) {
    ctx.sanitizedRequest = applyPatch(ctx.sanitizedRequest ?? ctx.request, decision.patch);
  }

  return next(ctx);
};
```

---

## 6. Symmetry with Graph Ingress Guard

| Concern                 | Ingress (Memgraph)                                  | Egress (MCP/LLM/HTTP)                                   |
|-------------------------|-----------------------------------------------------|---------------------------------------------------------|
| Core context type       | `GraphWriteContext`                                 | `EgressGuardContext`                                    |
| Aspect type             | `GraphIngressAspect`                                | `EgressAspect`                                          |
| Baseline checks         | Schema, whitelist, PII/tenant checks                | Target whitelist, PII scrub, jurisdictional routing     |
| Custom logic            | Audit, source tags, AI policy agent                 | Prompt shaping, regulatory context, AI policy agent     |
| Single choke-point      | `GraphWriteService` terminal Cypher call            | `EgressClient` terminal outbound call                   |
| AI involvement          | Optional local AI classifier/policy agent           | Optional local AI classifier/policy agent               |
| Non-goal                | Legal correctness of content                        | Full content correctness (that’s the LLM’s job)         |

This symmetry should make it easy for engineers and coding agents to reason
about both boundaries in the same way.

---

## 7. Integration with Existing Specs

This spec should be referenced from:

- `docs/specs/data_privacy_and_architecture_boundaries_v_0_1.md`
- `docs/architecture_v_0_3.md`
- `docs/governance/decisions/decisions_v_0_3.md`

with a short note that:

- All outbound calls to LLMs and external tools **must** go through the
  EgressClient + Egress Aspect chain.
- Baseline aspects encode the non-negotiable privacy & routing guarantees.
- Custom aspects (including AI policy agents) are layered on top via config.

---

## 8. Testing & Code Review Guidelines

- **No direct external calls**
  - Code review should reject direct use of OpenAI/Groq/MCP clients outside
    the EgressClient.

- **Unit tests**
  - Cover that PII scrub is applied consistently.
  - Cover allow/block decisions for the AI policy agent aspect.

- **Integration tests**
  - Ensure existing flows (chat, MCP calls) still function when aspects are
    enabled.

- **Observability**
  - Metrics for blocked egress calls, per provider/endpoint.
  - Logs for policy decisions (with redacted content).

This brings the egress side up to the same level of customisability and
robustness as the graph ingress side, while keeping both aligned in design and
mental model.

---

## 9. Implementation Status (2025-12-24)

The EgressGuard system is **fully implemented** with end-to-end PII protection at all egress points.

### 9.1 Core Implementation Files

| Component | Location | Status |
|-----------|----------|--------|
| `sanitizeTextForEgress()` | `packages/reg-intel-llm/src/egressGuard.ts` | ✅ Implemented |
| `sanitizeObjectForEgress()` | `packages/reg-intel-llm/src/egressGuard.ts` | ✅ Implemented |
| `EgressClient` | `packages/reg-intel-llm/src/egressClient.ts` | ✅ Implemented |
| Mode resolver | `packages/reg-intel-llm/src/egressModeResolver.ts` | ✅ Implemented |

### 9.2 PII Detection Capabilities

The implementation includes both regex-based and ML-powered detection:

**Regex Patterns** (custom patterns):
- Irish PPSN (Personal Public Service Number)
- API keys (sk_live_, sk_test_, api_key_, etc.)
- JWT tokens
- AWS access keys (AKIA*)
- Database connection URLs
- IP addresses (IPv4)
- Credit card numbers
- IBANs
- Basic email and phone patterns

**ML-Powered Detection** (via @redactpii/node):
- EMAIL_ADDRESS
- PHONE_NUMBER
- US_SOCIAL_SECURITY_NUMBER
- CREDIT_CARD_NUMBER
- PERSON_NAME
- LOCATION
- And other entity types

### 9.3 Egress Points Protected

| Egress Point | Protection | Files |
|--------------|------------|-------|
| **Outbound LLM requests** | User messages sanitized before sending | `llmRouter.ts` |
| **LLM responses** | Text sanitized before reaching client | `llmRouter.ts:chat()`, `streamChat()` |
| **Sandbox stdout** | Sanitized before returning to caller | `codeExecutionTools.ts:executeCode()` |
| **Sandbox stderr** | Sanitized before returning to caller | `codeExecutionTools.ts:executeCode()` |
| **Sandbox error messages** | Sanitized before returning to caller | `codeExecutionTools.ts:executeCode()` |
| **Analysis results** | Parsed JSON and results sanitized | `codeExecutionTools.ts:executeAnalysis()` |
| **Agent outputs** | Defense-in-depth layer | `complianceEngine.ts:handleChat()` |
| **Streaming responses** | Per-chunk sanitization | `complianceEngine.ts:handleChatStream()` |

### 9.4 Mode Support

All three modes are fully implemented:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `enforce` | Sanitize and execute sanitized payload | Production default |
| `report-only` | Sanitize but execute original payload; log differences | Gradual rollout, debugging |
| `off` | Skip sanitization (provider allowlist still enforced) | Testing only |

### 9.5 Test Coverage

- ✅ `egressGuard.test.ts` - Core sanitization unit tests
- ✅ `egressClient.test.ts` - Client guard and execute tests
- ✅ `egressClient.spec.ts` - Integration tests
- ✅ `egressModeResolver.test.ts` - Mode resolution tests
- ✅ `egressGuardIntegration.test.ts` - 22 end-to-end integration tests

### 9.6 Defense-in-Depth Architecture

The system implements multiple layers of protection:

```
User Input → [EgressGuard: User Message Sanitization]
           ↓
     LLM Provider → [Response Received]
           ↓
     [EgressGuard: LLM Response Sanitization] → [BasicEgressGuard: Agent Layer]
           ↓
     SSE Stream → Client

Sandbox Code Execution:
     Code → E2B Sandbox → [EgressGuard: stdout/stderr/results] → Response
```

This ensures that PII is caught at multiple points, providing resilience even if one layer is bypassed.

### 9.7 Context-Aware Sanitization (2025-12-25)

To prevent false positives on regulatory data, version numbers, and calculation results, the EgressGuard now supports **context-aware sanitization**:

| Context | Description | ML Detection | Pattern Set | Use Case |
|---------|-------------|--------------|-------------|----------|
| `chat` | Full sanitization | ✅ Enabled | All patterns | User-facing LLM responses (default) |
| `calculation` | Conservative | ❌ Disabled | High-confidence only | E2B sandbox output (default) |
| `strict` | Aggressive | ✅ Enabled | All + broad patterns | High-security scenarios |
| `off` | None | ❌ Disabled | None | Trusted internal use |

**Pattern Categories:**

| Category | Patterns | Applies To |
|----------|----------|------------|
| High-confidence | Email, SSN, Credit Card, API Keys, JWT, AWS Keys, DB URLs | All contexts |
| Medium-confidence | Phone, PPSN, IBAN, IP Address (valid ranges) | chat, strict |
| Aggressive | Broad IBAN, Any IP-like pattern | strict only |

**Sandbox Configuration:**

```typescript
// Default: calculation context (conservative, avoids false positives)
const result = await executeCode(input, sandbox);

// Disable sanitization for trusted sandbox output
const result = await executeCode(input, sandbox, logger, { sanitization: 'off' });

// Use full chat-level sanitization for sandbox
const result = await executeCode(input, sandbox, logger, { sanitization: 'chat' });
```

**LLM Response Configuration:**

```typescript
// Default: chat context
const response = await llmRouter.chat(messages);

// Use conservative sanitization for calculation responses
const response = await llmRouter.chat(messages, {
  responseSanitization: 'calculation',
});

// Disable response sanitization
const response = await llmRouter.chat(messages, {
  responseSanitization: 'off',
});
```

**Pre-configured Sanitizers:**

```typescript
import { Sanitizers } from '@reg-intel/llm';

// Use pre-configured sanitizers
const safe = Sanitizers.chat.sanitizeText(content);
const calcSafe = Sanitizers.calculation.sanitizeText(content);
const raw = Sanitizers.off.sanitizeText(content);
```

**Audit Trail:**

```typescript
import { sanitizeTextWithAudit } from '@reg-intel/llm';

const result = sanitizeTextWithAudit(content, { context: 'chat' });
// result.redacted: boolean
// result.redactionTypes: string[] (e.g., ['[EMAIL]', '[SSN]'])
// result.originalLength: number
// result.sanitizedLength: number
```

### 9.8 False Positive Prevention

The calculation context specifically preserves:

- ✅ Version numbers (e.g., `1.2.3.4`)
- ✅ Regulatory reference codes (e.g., `EU2020/1234`, `UK22ABC456`)
- ✅ Legal document identifiers (e.g., `S.I. No. 123/2024`)
- ✅ Financial figures with phone-like patterns (e.g., `555,123,4567 EUR`)
- ✅ PPSN-like reference codes when not actual PPSNs
- ✅ All numeric primitive values (never sanitized)

While still sanitizing:

- ❌ Email addresses
- ❌ US Social Security Numbers (XXX-XX-XXXX format)
- ❌ Credit card numbers
- ❌ API keys (sk_live_*, sk_test_*)
- ❌ JWT tokens
- ❌ AWS access keys
- ❌ Database connection URLs with credentials

