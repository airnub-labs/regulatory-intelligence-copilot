# Egress Guard – v0_2 (Aspect-Based, Symmetric with Graph Ingress)

> **Status:** Proposed update (supersedes earlier informal egress guard description once adopted).
>
> Goal: Make the egress guard for MCP + LLM calls use the **same aspect pattern** as the Graph Ingress Guard, so both sides feel familiar and can even host AI policy agents.

This document describes:

- A unified **EgressGuardContext** and **EgressAspect** interface.
- Baseline vs custom aspects (same pattern as Graph Ingress Guard).
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

  // Mutable fields for aspects to adjust
  sanitizedRequest?: unknown; // transformed version for outbound call

  // Classification / routing meta
  tenantId?: string;       // for logging/audit only, never sent out
  userId?: string;         // for logging/audit only, never sent out
  jurisdictions?: string[]; // e.g. ['IE', 'UK'] for policy decisions
  purpose?: string;        // e.g. 'regulatory-research', 'egress-guard', 'pii-scan'

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
     `request`, populating `sanitizedRequest`.
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

- `docs/architecture/data_privacy_and_architecture_boundaries_v_0_1.md`
- `docs/architecture/versions/architecture_v_0_3.md`
- `docs/governance/decisions/versions/decisions_v_0_3.md`

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

