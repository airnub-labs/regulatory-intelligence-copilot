# Phase 2: Package Restructuring Plan

> **Goal:** Align monorepo with v0.4 naming conventions and create focused, reusable packages.

## Overview

Restructure the monorepo from:
```
packages/
  compliance-core/        (everything in one package)
```

To:
```
packages/
  reg-intel-core/         (orchestration, agents, compliance engine)
  reg-intel-graph/        (GraphClient, GraphWriteService, Ingress Guard)
  reg-intel-llm/          (LlmRouter, Providers, Egress Guard)
  reg-intel-prompts/      (Base prompts, Prompt aspects)
  reg-intel-next-adapter/ (Next.js integration helpers)
```

## Strategy

**Incremental, Non-Breaking Approach:**
1. Create new packages alongside `compliance-core`
2. Extract code to new packages
3. Make `compliance-core` re-export from new packages (facade pattern)
4. Rename `compliance-core` to `reg-intel-core` as final step
5. Keep everything building at each step

## Package Breakdown

### 1. `reg-intel-graph`

**Purpose:** Graph schema, clients, and write services

**Contents:**
- `src/graphClient.ts` (legacy MCP-based)
- `src/boltGraphClient.ts` (direct Bolt)
- `src/graphWriteService.ts` (guarded writes)
- `src/graphIngressGuard.ts` (aspect pipeline)
- `src/graphChangeDetector.ts` (patch streaming)

**Dependencies:**
- `neo4j-driver`

**Exports:**
```ts
export {
  createGraphClient,
  BoltGraphClient,
  createBoltGraphClient,
  GraphWriteService,
  createGraphWriteService,
  GraphChangeDetector,
  createGraphChangeDetector,
  // ... types and DTOs
}
```

### 2. `reg-intel-llm`

**Purpose:** LLM routing, providers, and egress control

**Contents:**
- `src/llmRouter.ts` (provider-agnostic routing)
- `src/llmRouterFactory.ts` (default router setup)
- `src/aiSdkProviders.ts` (AI SDK v5 adapters)
- `src/llmClient.ts` (legacy MCP-based, to be deprecated)
- `src/egressGuard.ts` (from aspects/)

**Dependencies:**
- `ai` (Vercel AI SDK v5)
- `@ai-sdk/openai`
- `@ai-sdk/groq`

**Exports:**
```ts
export {
  LlmRouter,
  createLlmRouter,
  createDefaultLlmRouter,
  OpenAiResponsesClient,
  GroqLlmClient,
  LocalHttpLlmClient,
  AiSdkOpenAIProvider,
  AiSdkGroqProvider,
  sanitizeTextForEgress,
  // ... types
}
```

### 3. `reg-intel-prompts`

**Purpose:** Jurisdiction-neutral prompts and aspect system

**Contents:**
- `src/basePrompts.ts` (system prompts)
- `src/promptAspects.ts` (aspect pipeline)
- `src/promptBuilder.ts` (composition helpers)

**Dependencies:**
- None (pure logic)

**Exports:**
```ts
export {
  REGULATORY_COPILOT_SYSTEM_PROMPT,
  GLOBAL_SYSTEM_PROMPT,
  buildPromptWithAspects,
  createPromptBuilder,
  jurisdictionAspect,
  agentContextAspect,
  profileContextAspect,
  disclaimerAspect,
  // ... types
}
```

### 4. `reg-intel-core`

**Purpose:** Compliance engine, agents, orchestration

**Contents:**
- `src/orchestrator/complianceEngine.ts`
- `src/agents/` (all agents)
- `src/timeline/` (timeline engine)
- `src/e2bClient.ts`
- `src/mcpClient.ts`
- `src/sandboxManager.ts`
- `src/types.ts`
- `src/constants.ts`
- `src/errors.ts`

**Dependencies:**
- `@reg-copilot/reg-intel-graph`
- `@reg-copilot/reg-intel-llm`
- `@reg-copilot/reg-intel-prompts`
- `@e2b/code-interpreter`
- `@redactpii/node`

**Exports:**
```ts
export {
  ComplianceEngine,
  createComplianceEngine,
  GlobalRegulatoryComplianceAgent,
  SingleDirector_IE_SocialSafetyNet_Agent,
  createTimelineEngine,
  // ... re-exports from other packages for convenience
}
```

### 5. `reg-intel-next-adapter`

**Purpose:** Next.js integration helpers

**Contents:**
- `src/apiHelpers.ts` (route handlers)
- `src/sseStream.ts` (SSE streaming)
- `src/graphPatchStream.ts` (WebSocket/SSE for graph updates)
- `src/middleware.ts` (auth, rate limiting)

**Dependencies:**
- `next` (peer dependency)
- `@reg-copilot/reg-intel-core`

**Exports:**
```ts
export {
  createChatHandler,
  createGraphStreamHandler,
  sseStream,
  graphPatchStream,
  // ... middleware
}
```

## Migration Steps

### Step 1: Create `reg-intel-graph` ✅

```bash
mkdir -p packages/reg-intel-graph/src
# Copy graph-related files
# Create package.json
# Build and test
```

### Step 2: Create `reg-intel-llm` ✅

```bash
mkdir -p packages/reg-intel-llm/src
# Copy LLM-related files
# Create package.json
# Build and test
```

### Step 3: Create `reg-intel-prompts` ✅

```bash
mkdir -p packages/reg-intel-prompts/src
# Copy prompt-related files
# Create package.json
# Build and test
```

### Step 4: Update `compliance-core` to use new packages ✅

- Update `package.json` dependencies
- Update imports to use new packages
- Re-export from new packages for backward compat
- Build and test

### Step 5: Rename `compliance-core` to `reg-intel-core` ✅

```bash
mv packages/compliance-core packages/reg-intel-core
# Update package.json name
# Update workspace references
# Update imports in apps/demo-web
```

### Step 6: Create `reg-intel-next-adapter` ✅

```bash
mkdir -p packages/reg-intel-next-adapter/src
# Extract Next.js helpers from demo-web
# Create package.json
# Build and test
```

### Step 7: Update demo-web ✅

- Update imports to use `@reg-copilot/reg-intel-*`
- Test all routes still work
- Verify graph streaming works

## Validation Checklist

- [ ] All packages build successfully
- [ ] No circular dependencies
- [ ] `pnpm build` works at root
- [ ] `apps/demo-web` builds successfully
- [ ] All seed scripts still work
- [ ] TypeScript types resolve correctly
- [ ] No broken imports

## Rollback Plan

If issues arise:
1. Revert package structure changes
2. Keep `compliance-core` as single package
3. Mark Phase 2 as deferred

## Timeline

**Estimated:** 2-3 hours for careful, incremental refactoring

**Benefits:**
- Clean separation of concerns
- Reusable packages for other projects
- Easier to maintain and test
- Aligns with v0.4 architecture vision

---

**Status:** Ready to implement
**Risk:** Low (incremental, tested at each step)
