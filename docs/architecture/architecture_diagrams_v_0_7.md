# Architecture Diagrams - v0.7

This document contains detailed Mermaid diagrams showing the **v0.7 architecture flow**, including:

- All v0.6 diagrams (UI architecture, request flow, LLM provider architecture, graph streaming).
- **New in v0.7**: E2B Execution Context architecture and per-path sandbox management.
- LLM tool calling flow with `run_code` and `run_analysis`.
- Execution context lifecycle management.

---

## Table of Contents

1. [E2B Execution Context Architecture (v0.7)](#e2b-execution-context-architecture-v07)
2. [Complete Request Flow with Code Execution](#complete-request-flow-with-code-execution)
3. [Execution Context Lifecycle](#execution-context-lifecycle)
4. [Path Branching and Execution Contexts](#path-branching-and-execution-contexts)
5. [UI Layer Architecture](#ui-layer-architecture)
6. [LLM Provider Architecture](#llm-provider-architecture)
7. [Graph Streaming Architecture](#graph-streaming-architecture)

---

## E2B Execution Context Architecture (v0.7)

This diagram shows how execution contexts are managed per conversation path.

### Per-Path Execution Context Model

```mermaid
graph TB
    subgraph "Tenant Storage (Supabase)"
        Conversations[(conversations)]
        Paths[(conversation_paths)]
        Messages[(conversation_messages)]
        Contexts[(conversation_contexts)]
        ExecContexts[(execution_contexts)]

        Conversations --> Paths
        Paths --> Messages
        Conversations --> Contexts
        Paths --> ExecContexts
    end

    subgraph "Conversation Structure"
        Conv[Conversation<br/>tenantId: T1<br/>conversationId: C1]

        MainPath[Primary Path<br/>pathId: main<br/>isPrimary: true]
        BranchPath1[Branch Path<br/>pathId: branch_001<br/>parentPathId: main]
        BranchPath2[Branch Path<br/>pathId: branch_002<br/>parentPathId: main]

        Conv --> MainPath
        Conv --> BranchPath1
        Conv --> BranchPath2
    end

    subgraph "Execution Contexts"
        ExecMain[ExecutionContext<br/>pathId: main<br/>sandboxId: sbx_001<br/>status: active]
        ExecBranch1[ExecutionContext<br/>pathId: branch_001<br/>sandboxId: sbx_002<br/>status: active]
        ExecBranch2[ExecutionContext<br/>pathId: branch_002<br/>sandboxId: null<br/>status: none]

        MainPath --> ExecMain
        BranchPath1 --> ExecBranch1
        BranchPath2 -.->|No sandbox yet| ExecBranch2
    end

    subgraph "E2B Sandboxes"
        Sandbox1[E2B Sandbox sbx_001<br/>MCP Gateway<br/>Python/JS Runtime]
        Sandbox2[E2B Sandbox sbx_002<br/>MCP Gateway<br/>Python/JS Runtime]

        ExecMain --> Sandbox1
        ExecBranch1 --> Sandbox2
    end

    style ExecContexts fill:#90EE90
    style Sandbox1 fill:#87CEEB
    style Sandbox2 fill:#87CEEB
```

### Execution Context Manager Flow

```mermaid
sequenceDiagram
    participant Agent as ComplianceEngine
    participant ECM as ExecutionContextManager
    participant Store as ExecutionContextStore
    participant E2B as E2B API
    participant Sandbox as E2B Sandbox
    participant EG as EgressGuard

    Note over Agent: LLM calls run_code tool

    Agent->>ECM: executeCode(identity, code, language)

    ECM->>Store: load(tenantId, conversationId, pathId)

    alt Context exists and active
        Store-->>ECM: ExecutionContext {sandboxId, mcpUrl, ...}
        Note over ECM: Reuse existing sandbox
    else Context missing or expired
        Store-->>ECM: null or expired
        ECM->>E2B: Sandbox.create({timeoutMs, envs, mcp})
        E2B-->>ECM: Sandbox {sandboxId, getMcpUrl(), ...}
        ECM->>Store: save(identity, newContext)
    end

    ECM->>EG: checkEgressPolicy(identity, 'sandbox-execution')
    EG-->>ECM: effectiveMode: 'enforce'

    ECM->>Sandbox: runCode(code)
    Sandbox-->>ECM: ExecutionResult {output, error, timing}

    ECM->>Store: recordExecution(identity, executionTimeMs)

    ECM-->>Agent: ExecutionResult

    Note over Agent: Feed result back to LLM
```

---

## Complete Request Flow with Code Execution

This diagram shows the complete flow when the LLM decides to execute code.

```mermaid
sequenceDiagram
    participant User
    participant NextJS as Next.js Route<br/>/api/chat
    participant Engine as ComplianceEngine
    participant Agent as GlobalRegulatoryAgent
    participant Router as LlmRouter
    participant API as LLM API
    participant ECM as ExecutionContextManager
    participant Sandbox as E2B Sandbox

    User->>NextJS: POST /api/chat<br/>{messages, profile, conversationId, pathId}

    NextJS->>Engine: handleChatStream(request)

    Note over Engine: Load ConversationContext<br/>Load ExecutionContext identity

    Engine->>Agent: handleStream(input, context)

    Agent->>Router: streamChat(messages, {tools: [run_code, run_analysis, capture_concepts]})

    Router->>API: POST /v1/responses<br/>{messages, tools, stream: true}

    API-->>Router: Stream: text chunks...
    Router-->>Agent: {type: 'text', delta: 'Let me calculate...'}
    Agent-->>Engine: {type: 'text', delta: 'Let me calculate...'}
    Engine-->>NextJS: SSE: event: message
    NextJS-->>User: "Let me calculate..."

    API-->>Router: Stream: tool_call: run_code
    Router-->>Agent: {type: 'tool', name: 'run_code', argsJson: {...}}
    Agent-->>Engine: {type: 'tool', name: 'run_code', argsJson: {...}}

    Note over Engine: Handle run_code tool

    Engine->>ECM: executeCode(identity, code, 'python')
    ECM->>Sandbox: runCode(code)
    Sandbox-->>ECM: {output: '42000', success: true}
    ECM-->>Engine: ExecutionResult

    Engine->>Router: sendToolResult('run_code', result)
    Router->>API: tool_result: {output: '42000'}

    API-->>Router: Stream: text chunks...
    Router-->>Agent: {type: 'text', delta: 'The calculation shows €42,000...'}
    Agent-->>Engine: text chunk
    Engine-->>NextJS: SSE: event: message
    NextJS-->>User: "The calculation shows €42,000..."

    API-->>Router: Stream: done
    Router-->>Engine: {type: 'done'}

    Engine-->>NextJS: SSE: event: done<br/>{referencedNodes, disclaimer}
    NextJS-->>User: Response complete
```

### Tool Call Decision Flow

```mermaid
flowchart TB
    subgraph "LLM Decision"
        UserQuestion[User asks:<br/>"What's the VAT on €200k turnover?"]

        LLMThinks{LLM Decides}

        JustAnswer[Answer directly<br/>from knowledge]
        UseCapture[Call capture_concepts<br/>for graph enrichment]
        UseCode[Call run_code<br/>for calculation]
        UseAnalysis[Call run_analysis<br/>for structured comparison]

        UserQuestion --> LLMThinks

        LLMThinks -->|Simple factual| JustAnswer
        LLMThinks -->|References concepts| UseCapture
        LLMThinks -->|Needs calculation| UseCode
        LLMThinks -->|Multiple scenarios| UseAnalysis
    end

    subgraph "Tool Handling"
        CaptureHandler[handleConceptChunk<br/>→ GraphWriteService]
        CodeHandler[handleRunCodeChunk<br/>→ ExecutionContextManager]
        AnalysisHandler[handleRunAnalysisChunk<br/>→ ScenarioEngine + ECM]

        UseCapture --> CaptureHandler
        UseCode --> CodeHandler
        UseAnalysis --> AnalysisHandler
    end

    subgraph "Results"
        TextStream[Text → UI Stream]
        GraphUpdate[Graph → Self-populate]
        ExecResult[Execution → Feed back to LLM]

        JustAnswer --> TextStream
        CaptureHandler --> GraphUpdate
        CodeHandler --> ExecResult
        AnalysisHandler --> ExecResult
    end

    style UseCode fill:#90EE90
    style UseAnalysis fill:#90EE90
    style CodeHandler fill:#87CEEB
    style AnalysisHandler fill:#87CEEB
```

---

## Execution Context Lifecycle

### State Diagram

```mermaid
stateDiagram-v2
    [*] --> None: Path created

    None --> Creating: First run_code call
    Creating --> Active: Sandbox created
    Creating --> Error: Creation failed

    Active --> Active: Tool call executed
    Active --> Expired: TTL exceeded
    Active --> Terminated: Manual termination
    Active --> Error: Execution error

    Error --> Creating: Retry with new sandbox
    Error --> Terminated: Give up

    Expired --> Creating: New tool call
    Expired --> Terminated: Cleanup job

    Terminated --> [*]

    note right of Active
        Reused for subsequent
        tool calls on same path
    end note

    note right of Expired
        TTL default: 30 min
        from last use
    end note
```

### Cleanup Flow

```mermaid
sequenceDiagram
    participant Cron as Background Job<br/>(every 5 min)
    participant ECM as ExecutionContextManager
    participant Store as ExecutionContextStore
    participant E2B as E2B API

    Cron->>ECM: cleanupExpiredContexts()

    ECM->>Store: listExpired(cutoffTime)
    Store-->>ECM: [identity1, identity2, ...]

    loop For each expired context
        ECM->>Store: load(identity)
        Store-->>ECM: ExecutionContext

        ECM->>E2B: sandbox.kill()
        E2B-->>ECM: ok

        ECM->>Store: terminate(identity, 'expired')
    end

    ECM-->>Cron: cleanedCount: 5
```

---

## Path Branching and Execution Contexts

### What Gets Inherited on Branch

When a user branches a conversation, it's important to understand what IS and IS NOT inherited:

| Context Type | Inherited? | Details |
|--------------|------------|---------|
| **Message History** (up to branch point) | ✅ YES | Branch sees M1, M2, M3 |
| **ConversationContext** (`activeNodeIds`) | ✅ YES | Copied at branch point |
| **ExecutionContext** (E2B sandbox) | ❌ NO | Branch gets fresh sandbox on first `run_code` |

**The branch continues the conversation as if it never branched** — same concepts, same history. Only the sandbox runtime state is isolated.

### Branch Creation Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as Chat UI
    participant API as /api/conversations/{id}/paths
    participant PathStore as ConversationPathStore
    participant CtxStore as ConversationContextStore

    User->>UI: Click "Branch from here"<br/>on message M3

    UI->>API: POST /paths<br/>{sourceMessageId: M3, name: "What-if"}

    API->>PathStore: branchFromMessage({<br/>  conversationId,<br/>  sourceMessageId: M3<br/>})

    Note over PathStore: Create new path<br/>parentPathId: main<br/>branchPointMessageId: M3

    PathStore-->>API: {pathId: 'branch_001'}

    Note over API: ✅ Messages M1,M2,M3 inherited via path resolution<br/>✅ ConversationContext copied at branch point<br/>❌ No ExecutionContext (lazy on first run_code)

    API->>CtxStore: Copy activeNodeIds to branch path

    API-->>UI: {path: {...}, branchPointMessage: {...}}

    UI-->>User: Switch to new branch view<br/>(sees same concepts, same history)

    Note over User: User asks question in branch

    User->>UI: "What if I incorporate?"

    Note over UI: Chat continues in branch_001<br/>with inherited context<br/>New sandbox created only on run_code
```

### Message Edit Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as Chat UI
    participant API as /api/chat
    participant Store as ConversationStore
    participant ExecStore as ExecutionContextStore
    participant ECM as ExecutionContextManager

    Note over User: Previous messages: [M1, M2, M3, M4, M5]<br/>User wants to edit M3

    User->>UI: Edit message M3

    UI->>Store: softDeleteMessage(M4)
    UI->>Store: softDeleteMessage(M5)

    Note over Store: M4, M5 marked with<br/>deletedAt, supersededBy

    UI->>API: POST /chat<br/>{conversationId, pathId: main,<br/> messages: [M1, M2, M3_edited]}

    API->>ECM: Check existing context for pathId: main

    alt Context exists and active
        Note over ECM: Reuse sandbox sbx_001<br/>(state preserved from M1-M5)
    else Context expired
        ECM->>ECM: Create new sandbox
    end

    Note over API: Process chat with<br/>same path's execution context

    API-->>UI: New response M4'

    UI-->>User: Updated conversation view
```

### Path Merge Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as Chat UI
    participant API as /api/paths/{id}/merge
    participant PathStore as ConversationPathStore
    participant ExecStore as ExecutionContextStore
    participant E2B as E2B API

    User->>UI: Click "Merge branch_001 to main"

    UI->>API: POST /paths/branch_001/merge<br/>{targetPathId: main, mode: 'summary'}

    API->>PathStore: mergePath({<br/>  sourcePathId: branch_001,<br/>  targetPathId: main<br/>})

    Note over PathStore: Copy/summarize messages<br/>Archive source path

    PathStore-->>API: MergeResult

    API->>ExecStore: load(branch_001)
    ExecStore-->>API: ExecutionContext {sandboxId: sbx_002}

    API->>E2B: sandbox.kill(sbx_002)
    E2B-->>API: ok

    API->>ExecStore: terminate(branch_001, 'merged')

    Note over API: Target path (main) keeps<br/>its own execution context

    API-->>UI: {success: true, ...}

    UI-->>User: Branch merged, view main path
```

---

## UI Layer Architecture

(Unchanged from v0.6 - included for completeness)

```mermaid
graph TB
    subgraph "Application Layer"
        Pages[Application Pages<br/>src/app/page.tsx, layout.tsx]
        Routes[API Routes<br/>src/app/api/*/route.ts]
    end

    subgraph "Feature Components Layer"
        ChatUI[Chat Components<br/>src/components/chat/]
        Message[Message<br/>Role-based bubbles]
        MessageLoading[MessageLoading<br/>Animated dots]
        ChatContainer[ChatContainer<br/>ScrollArea wrapper]
        PromptInput[PromptInput<br/>Input + submit]
        PathSelector[PathSelector<br/>Branch/Path UI]
    end

    subgraph "UI Components Layer"
        ShadcnUI[shadcn/ui Components]
        Button[Button]
        Input[Input]
        Card[Card]
        Badge[Badge]
    end

    subgraph "Primitives Layer"
        RadixUI[Radix UI Primitives]
    end

    subgraph "Design System Layer"
        Tailwind[Tailwind CSS v4]
    end

    Pages -->|Composes| ChatUI
    ChatUI --> Message
    ChatUI --> PathSelector
    ChatUI -->|Built with| ShadcnUI
    ShadcnUI -->|Built on| RadixUI
    ShadcnUI -->|Styled with| Tailwind
```

---

## LLM Provider Architecture

(Extended from v0.6 with tool handling)

```mermaid
graph TB
    subgraph "Application Layer"
        ComplianceEngine[ComplianceEngine]
        Agent[GlobalRegulatoryAgent]
    end

    subgraph "Tool Registry"
        Tools[Registered Tools]
        CaptureConceptsTool[capture_concepts]
        RunCodeTool[run_code]
        RunAnalysisTool[run_analysis]

        Tools --> CaptureConceptsTool
        Tools --> RunCodeTool
        Tools --> RunAnalysisTool
    end

    subgraph "LLM Router Layer"
        LlmRouter[LlmRouter<br/>Provider-agnostic routing]
        PolicyStore[TenantLlmPolicy Store]
    end

    subgraph "Egress Guard Layer"
        EgressGuard[EgressGuard<br/>LLM + HTTP + Sandbox egress]
    end

    subgraph "AI SDK v5 Integration"
        OpenAIProvider[OpenAI Provider]
        GroqProvider[Groq Provider]
        LocalProvider[Local Provider]
    end

    subgraph "Execution Context"
        ECM[ExecutionContextManager]
        E2BSandbox[E2B Sandboxes]

        ECM --> E2BSandbox
    end

    ComplianceEngine --> Tools
    ComplianceEngine --> LlmRouter
    Agent --> LlmRouter
    LlmRouter --> PolicyStore
    LlmRouter --> EgressGuard
    EgressGuard --> OpenAIProvider
    EgressGuard --> GroqProvider
    EgressGuard --> LocalProvider

    RunCodeTool --> ECM
    RunAnalysisTool --> ECM
    ECM --> EgressGuard

    style RunCodeTool fill:#90EE90
    style RunAnalysisTool fill:#90EE90
    style ECM fill:#87CEEB
    style E2BSandbox fill:#87CEEB
```

---

## Graph Streaming Architecture

(Unchanged from v0.6 - included for completeness)

```mermaid
graph TB
    subgraph "Memgraph Database"
        Memgraph[(Memgraph<br/>Rules Graph)]
    end

    subgraph "Change Detection Layer"
        Detector[GraphChangeDetector]
        Detector -->|Poll| Memgraph
        Detector -->|Generate| Patch[GraphPatch]
    end

    subgraph "Subscription Management"
        SubscriptionMgr[Subscription Manager]
        Detector --> SubscriptionMgr
    end

    subgraph "API Layer"
        SnapshotAPI[GET /api/graph]
        StreamAPI[GET /api/graph/stream]

        Memgraph --> SnapshotAPI
        SubscriptionMgr --> StreamAPI
    end

    subgraph "Client Connections"
        SSE1[SSE Client 1]
        SSE2[SSE Client 2]

        StreamAPI --> SSE1
        StreamAPI --> SSE2
    end
```

---

## Technology Stack (v0.7)

```mermaid
graph TB
    subgraph "Runtime"
        Node[Node.js 24 LTS]
        Next[Next.js 16]
        React[React 19]
    end

    subgraph "LLM Integration"
        AISDK[Vercel AI SDK v5]
        Providers[Provider Packages<br/>openai, groq, anthropic]
    end

    subgraph "Graph Database"
        Memgraph[Memgraph 2.x]
        Bolt[Neo4j Bolt Protocol]
    end

    subgraph "Tenant Storage"
        Supabase[Supabase / Postgres]
        ConvStore[Conversations + Paths]
        ExecStore[Execution Contexts]

        Supabase --> ConvStore
        Supabase --> ExecStore
    end

    subgraph "Sandboxing (v0.7)"
        E2B[E2B Code Interpreter]
        MCP[MCP Gateway]

        E2B --> MCP
    end

    subgraph "Build & Dev"
        PNPM[pnpm 8.x]
        Turbopack[Turbopack]
    end

    Next --> Node
    AISDK --> Next
    E2B --> Next

    style E2B fill:#90EE90
    style ExecStore fill:#90EE90
```

---

## Summary

These diagrams illustrate:

1. **E2B Execution Context Architecture**: Per-path sandbox management with lazy creation and reuse.
2. **Complete Request Flow**: End-to-end journey including code execution tool calls.
3. **Execution Context Lifecycle**: State management from creation through expiry/termination.
4. **Path Integration**: How branching, editing, and merging interact with execution contexts.
5. **Tool Calling Flow**: How the LLM decides to use tools and how results are fed back.

### Key Architectural Principles (v0.7)

- ✅ **Per-Path Isolation**: Each conversation path gets its own sandbox when needed.
- ✅ **Lazy Creation**: Sandboxes only created when LLM calls execution tools.
- ✅ **Sandbox Reuse**: Subsequent tool calls on same path reuse the sandbox.
- ✅ **TTL-Based Cleanup**: Sandboxes expire after inactivity period.
- ✅ **Egress Guard Integration**: All sandbox egress flows through EgressGuard.
- ✅ **Branch Isolation**: Branches don't inherit parent path's sandbox.
- ✅ **Edit Continuity**: Message edits reuse same path's sandbox.
- ✅ **UI Agnostic**: Frontend unaware of sandbox execution details.
