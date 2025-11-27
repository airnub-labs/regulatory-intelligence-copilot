# Architecture Diagrams - v0.5

This document contains detailed Mermaid diagrams showing the v0.5 architecture flow, including the new clean layered UI architecture, LLM provider integration, and graph streaming.

## Table of Contents

1. [UI Layer Architecture](#ui-layer-architecture) *(New in v0.5)*
2. [Complete Request Flow](#complete-request-flow)
3. [LLM Provider Architecture](#llm-provider-architecture)
4. [Graph Streaming Architecture](#graph-streaming-architecture)

---

## UI Layer Architecture

*New in v0.5*

This diagram illustrates the clean layered architecture of the frontend UI, showing how Tailwind CSS v4, Radix UI, shadcn/ui, and custom chat components work together.

### Clean Layered UI Architecture

```mermaid
graph TB
    subgraph "Application Layer"
        Pages[Application Pages<br/>src/app/page.tsx, layout.tsx]
        Routes[API Routes<br/>src/app/api/*/route.ts]
    end

    subgraph "Feature Components Layer"
        ChatUI[Chat Components<br/>src/components/chat/]
        Message[Message<br/>Role-based bubbles, avatars]
        MessageLoading[MessageLoading<br/>Animated dots]
        ChatContainer[ChatContainer<br/>ScrollArea wrapper]
        PromptInput[PromptInput<br/>Input + submit button]

        ChatUI --> Message
        ChatUI --> MessageLoading
        ChatUI --> ChatContainer
        ChatUI --> PromptInput
    end

    subgraph "UI Components Layer"
        ShadcnUI[shadcn/ui Components<br/>src/components/ui/]
        Button[Button<br/>Variants: default, outline, ghost]
        Input[Input<br/>Text input with focus]
        Card[Card, CardHeader, CardContent]
        Badge[Badge<br/>Labels and tags]
        ScrollArea[ScrollArea<br/>Custom scrollbars]
        Avatar[Avatar, AvatarFallback]
        Separator[Separator<br/>Dividers]

        ShadcnUI --> Button
        ShadcnUI --> Input
        ShadcnUI --> Card
        ShadcnUI --> Badge
        ShadcnUI --> ScrollArea
        ShadcnUI --> Avatar
        ShadcnUI --> Separator
    end

    subgraph "Primitives Layer"
        RadixUI[Radix UI Primitives<br/>radix-ui/*]

        RadixSlot[radix-ui/react-slot<br/>Slot primitive]
        RadixScroll[radix-ui/react-scroll-area<br/>Scroll primitive]
        RadixAvatar[radix-ui/react-avatar<br/>Avatar primitive]
        RadixSeparator[radix-ui/react-separator<br/>Separator primitive]
        RadixLabel[radix-ui/react-label<br/>Label primitive]

        RadixUI --> RadixSlot
        RadixUI --> RadixScroll
        RadixUI --> RadixAvatar
        RadixUI --> RadixSeparator
        RadixUI --> RadixLabel
    end

    subgraph "Design System Layer"
        Tailwind[Tailwind CSS v4<br/>src/app/globals.css]

        Theme[theme blocks<br/>CSS variables]
        DarkMode[Dark mode<br/>.dark, media queries]
        Utilities[Utility classes<br/>bg-, text-, flex-]

        Tailwind --> Theme
        Tailwind --> DarkMode
        Tailwind --> Utilities
    end

    subgraph "Utilities"
        CN[cn() function<br/>src/lib/utils.ts]
        CVA[class-variance-authority<br/>Component variants]
        CLSX[clsx + tailwind-merge<br/>Class merging]

        CN --> CVA
        CN --> CLSX
    end

    %% Dependencies
    Pages -->|Composes| ChatUI
    Pages -->|Uses| ShadcnUI

    ChatUI -->|Built with| ShadcnUI
    Message -->|Uses| Avatar
    Message -->|Uses| Badge
    ChatContainer -->|Uses| ScrollArea
    PromptInput -->|Uses| Input
    PromptInput -->|Uses| Button

    ShadcnUI -->|Built on| RadixUI
    ShadcnUI -->|Styled with| Tailwind
    ShadcnUI -->|Uses| CN

    Button -->|Uses| RadixSlot
    ScrollArea -->|Uses| RadixScroll
    Avatar -->|Uses| RadixAvatar
    Separator -->|Uses| RadixSeparator

    RadixUI -->|Styled with| Tailwind

    Theme -.->|Provides tokens| ShadcnUI
    Theme -.->|Provides tokens| ChatUI

    style Pages fill:#DDA0DD
    style ChatUI fill:#87CEEB
    style ShadcnUI fill:#90EE90
    style RadixUI fill:#FFE4B5
    style Tailwind fill:#FFB6C1
    style CN fill:#F0E68C
```

### Component Hierarchy Example

```mermaid
graph TB
    subgraph "Chat Page (page.tsx)"
        Page[Main Component<br/>State: messages, input, isLoading]
    end

    subgraph "Layout Structure"
        Header[Header<br/>Title + navigation]
        ProfileBar[Profile Selector<br/>Persona + jurisdictions]
        MetadataBar[Metadata Display<br/>Agent info, uncertainty]
        Messages[Messages Area]
        InputArea[Input Area<br/>PromptInput + disclaimer]
    end

    subgraph "Messages Rendering"
        Container[ChatContainer<br/>ScrollArea wrapper]

        WelcomeState{messages.length === 0?}
        WelcomeCards[ChatWelcome<br/>Feature cards]
        MessageList[Message List<br/>map over messages]

        Container --> WelcomeState
        WelcomeState -->|Yes| WelcomeCards
        WelcomeState -->|No| MessageList
    end

    subgraph "Message Components"
        UserMsg[Message<br/>role: user]
        AIMsg[Message<br/>role: assistant]
        Loading[MessageLoading<br/>Animated dots]

        MessageList --> UserMsg
        MessageList --> AIMsg
        MessageList --> Loading
    end

    subgraph "Message Internals"
        UserMsg --> Avatar1[Avatar<br/>Fallback: U]
        UserMsg --> Bubble1[Message Bubble<br/>bg-primary]

        AIMsg --> Avatar2[Avatar<br/>Fallback: AI]
        AIMsg --> Bubble2[Message Bubble<br/>bg-muted]
    end

    subgraph "Input Component"
        Prompt[PromptInput]
        Prompt --> InputField[Input<br/>onChange handler]
        Prompt --> Submit[Button<br/>onClick handler]
    end

    Page --> Header
    Page --> ProfileBar
    Page --> MetadataBar
    Page --> Messages
    Page --> InputArea

    Messages --> Container
    InputArea --> Prompt

    Header -.->|Uses| Button
    ProfileBar -.->|Uses| Badge
    ProfileBar -.->|Uses| Separator
    MetadataBar -.->|Uses| Badge
    MetadataBar -.->|Uses| Separator
    WelcomeCards -.->|Uses| Card

    style Page fill:#DDA0DD
    style Container fill:#87CEEB
    style UserMsg fill:#90EE90
    style AIMsg fill:#90EE90
    style Prompt fill:#FFE4B5
```

### Tailwind v4 Theme System

```mermaid
graph LR
    subgraph "globals.css"
        Import[import tailwindcss]
    end

    subgraph "Light Mode Theme"
        LightTheme[theme block]

        LBG[--color-background: 0 0% 100%]
        LFG[--color-foreground: 240 10% 3.9%]
        LPrimary[--color-primary: 240 5.9% 10%]
        LRadius[--radius: 0.5rem]

        LightTheme --> LBG
        LightTheme --> LFG
        LightTheme --> LPrimary
        LightTheme --> LRadius
    end

    subgraph "Dark Mode Theme"
        DarkClass[.dark, data-theme='dark']
        DarkTheme[theme block]

        DBG[--color-background: 240 10% 3.9%]
        DFG[--color-foreground: 0 0% 98%]
        DPrimary[--color-primary: 0 0% 98%]

        DarkClass --> DarkTheme
        DarkTheme --> DBG
        DarkTheme --> DFG
        DarkTheme --> DPrimary
    end

    subgraph "Auto Dark Mode"
        MediaQuery[media prefers-color-scheme: dark]
        AutoDark[:root:not(.light)]
        AutoTheme[theme block]

        MediaQuery --> AutoDark
        AutoDark --> AutoTheme
        AutoTheme -.->|Same as| DarkTheme
    end

    subgraph "Usage in Components"
        ClassNames[className='bg-background<br/>text-foreground<br/>rounded-radius']
    end

    Import --> LightTheme
    Import --> DarkClass
    Import --> MediaQuery

    LightTheme -.->|Provides| ClassNames
    DarkTheme -.->|Overrides| ClassNames
    AutoTheme -.->|Overrides| ClassNames

    style Import fill:#FFB6C1
    style LightTheme fill:#F0E68C
    style DarkTheme fill:#4B0082,color:#fff
    style AutoTheme fill:#4B0082,color:#fff
    style ClassNames fill:#87CEEB
```

### Data Flow: User Input to UI Update

```mermaid
sequenceDiagram
    participant User
    participant Input as PromptInput<br/>Component
    participant Page as page.tsx<br/>State
    participant API as POST /api/chat<br/>SSE Stream
    participant Message as Message<br/>Components

    User->>Input: Type message + Enter

    Input->>Page: onSubmit()

    Note over Page: Create user message<br/>Create empty assistant message<br/>setMessages([...messages, user, assistant])

    Page->>Message: Render user message
    Message-->>User: Display user bubble

    Page->>Message: Render empty assistant message
    Message-->>User: Display empty bubble

    Page->>API: fetch('/api/chat', {<br/>  method: 'POST',<br/>  body: JSON.stringify({messages})<br/>})

    Note over Page: setIsLoading(true)
    Page->>Message: Render MessageLoading
    Message-->>User: Display animated dots

    API-->>Page: SSE: event: metadata
    Note over Page: setChatMetadata({<br/>  agent, jurisdictions, uncertainty<br/>})

    API-->>Page: SSE: event: message<br/>data: {text: 'Based'}
    Note over Page: Update assistant message:<br/>content += 'Based'
    Page->>Message: Re-render assistant message
    Message-->>User: Display 'Based'

    API-->>Page: SSE: event: message<br/>data: {text: ' on'}
    Note over Page: Update assistant message:<br/>content += ' on'
    Page->>Message: Re-render assistant message
    Message-->>User: Display 'Based on'

    Note over API,Page: ... more chunks ...

    API-->>Page: SSE: event: done
    Note over Page: setIsLoading(false)
    Page->>Message: Remove MessageLoading

    Note over Page: Auto-scroll to bottom<br/>via useEffect
```

### Accessibility Flow

```mermaid
graph TB
    subgraph "Keyboard Navigation"
        Tab[Tab key]
        Enter[Enter key]
        Escape[Escape key]

        Tab -->|Focus next| Focusable[Focusable Elements]
        Enter -->|Activate| Buttons[Buttons, Links]
        Escape -->|Close| Modals[Modals, Dropdowns]
    end

    subgraph "Focus Management"
        FocusRing[Focus Indicators<br/>focus:ring-*]
        FocusTrap[Focus Trap<br/>In modals]
        AutoFocus[Auto Focus<br/>On open]
    end

    subgraph "Screen Reader Support"
        ARIA[ARIA Attributes]

        ARIALabel[aria-label<br/>Icon buttons]
        ARIADescribed[aria-describedby<br/>Form errors]
        ARIALive[aria-live<br/>Status updates]
        Role[role attributes<br/>Custom widgets]

        ARIA --> ARIALabel
        ARIA --> ARIADescribed
        ARIA --> ARIALive
        ARIA --> Role
    end

    subgraph "Semantic HTML"
        Semantic[Semantic Elements]

        Header[header<br/>Page header]
        Nav[nav<br/>Navigation]
        Main[main<br/>Main content]
        Form[form<br/>Input areas]
        Button[button<br/>Actions]

        Semantic --> Header
        Semantic --> Nav
        Semantic --> Main
        Semantic --> Form
        Semantic --> Button
    end

    subgraph "Color Contrast"
        Contrast[WCAG AA Compliance]

        Normal[4.5:1 for normal text]
        Large[3:1 for large text]
        NonText[3:1 for UI components]

        Contrast --> Normal
        Contrast --> Large
        Contrast --> NonText
    end

    subgraph "Radix UI Primitives"
        RadixA11y[Built-in Accessibility]

        RadixA11y --> FocusManagement[Focus management]
        RadixA11y --> KeyboardNav[Keyboard navigation]
        RadixA11y --> ARIAPatterns[ARIA patterns]
        RadixA11y --> ScreenReader[Screen reader support]
    end

    Focusable -.->|Provided by| RadixA11y
    FocusRing -.->|Styled with| Tailwind
    ARIA -.->|Implemented by| RadixA11y
    Semantic -.->|Used in| Components[All Components]

    style Focusable fill:#90EE90
    style ARIA fill:#87CEEB
    style Semantic fill:#FFE4B5
    style Contrast fill:#FFB6C1
    style RadixA11y fill:#DDA0DD
```

### Key UI Architecture Points

1. **Layered Approach**: Each layer has clear responsibilities and boundaries
2. **Composition Over Inheritance**: Build complex UIs from simple primitives
3. **Accessibility First**: Radix UI ensures WCAG compliance out of the box
4. **Theme System**: CSS variables enable runtime theming without rebuilds
5. **Type Safety**: Full TypeScript support from primitives to pages
6. **Future-Proof**: Easy migration path to official Vercel AI Elements

---

## Complete Request Flow

This diagram shows the complete flow of a chat request through the v0.4 architecture, including ComplianceEngine routing, agent execution, graph queries, and streaming responses.

```mermaid
sequenceDiagram
    participant User
    participant NextJS as Next.js Route<br/>/api/chat
    participant Adapter as LlmRouterClientAdapter
    participant Engine as ComplianceEngine
    participant Agent as GlobalRegulatoryComplianceAgent
    participant Graph as GraphClient<br/>(Memgraph)
    participant Prompts as Prompt Aspects
    participant LLMRouter as LlmRouter
    participant Provider as AI SDK v5 Provider<br/>(OpenAI/Groq/etc)
    participant API as LLM API<br/>(Responses/Chat)

    User->>NextJS: POST /api/chat<br/>{messages, profile}

    Note over NextJS: Validate request<br/>Sanitize messages

    NextJS->>Engine: handleChatStream(request)

    Note over Engine: Build AgentInput<br/>Extract question

    Engine->>Agent: handleStream(input, context)

    Note over Agent: Try specialized agents<br/>None match → handle globally

    Agent->>Graph: getRulesForProfileAndJurisdiction()<br/>profileId, jurisdiction
    Graph-->>Agent: GraphContext<br/>{nodes, edges}

    Note over Agent: Found 15 rules<br/>5 relationships

    Agent->>Prompts: buildPromptWithAspects()<br/>jurisdictions, profile
    Prompts-->>Agent: Jurisdiction-aware<br/>system prompt

    Note over Agent: Build user prompt<br/>with graph context

    Agent->>Adapter: streamChat(request)
    Adapter->>LLMRouter: streamChat(messages, options)

    Note over LLMRouter: Route to provider<br/>based on tenant policy

    LLMRouter->>Provider: streamText(model, messages)
    Provider->>API: POST /v1/responses<br/>or /v1/chat/completions

    API-->>Provider: Stream: chunk 1
    Provider-->>LLMRouter: {type: 'text', delta: 'Based'}
    LLMRouter-->>Adapter: {type: 'text', delta: 'Based'}
    Adapter-->>Agent: {type: 'text', delta: 'Based'}

    Note over Agent: Return AgentStreamResult<br/>with metadata + stream

    Agent-->>Engine: AgentStreamResult {<br/>agentId, nodes, stream}

    Engine->>NextJS: yield {type: 'metadata',<br/>metadata: {...}}
    NextJS->>User: SSE: event: metadata<br/>data: {agent, nodes...}

    API-->>Provider: Stream: chunk 2
    Provider-->>LLMRouter: {type: 'text', delta: ' on'}
    LLMRouter-->>Adapter: {type: 'text', delta: ' on'}
    Adapter-->>Agent: Stream continues...

    Engine->>NextJS: yield {type: 'text',<br/>delta: 'Based on'}
    NextJS->>User: SSE: event: message<br/>data: {text: 'Based on'}

    Note over API,User: ... more chunks streamed ...

    API-->>Provider: Stream: done
    Provider-->>LLMRouter: {type: 'done'}
    LLMRouter-->>Adapter: {type: 'done'}
    Adapter-->>Agent: {type: 'done'}

    Engine->>NextJS: yield {type: 'done',<br/>followUps, disclaimer}
    NextJS->>User: SSE: event: done<br/>data: {status: 'ok'}
```

### Key Architectural Points

1. **No Bypass**: Request flows through ComplianceEngine → Agent → Graph → LLM
2. **Graph Context**: Agent queries Memgraph before calling LLM
3. **Metadata First**: Client receives agent info and graph nodes before text
4. **Streaming**: LLM response streamed in real-time through all layers
5. **Prompt Aspects**: Jurisdiction-aware prompts built dynamically

---

## LLM Provider Architecture

This diagram shows how the LlmRouter integrates with Vercel AI SDK v5 and various providers, including the OpenAI Responses API.

```mermaid
graph TB
    subgraph "Application Layer"
        ComplianceEngine[ComplianceEngine]
        Agent[GlobalRegulatoryComplianceAgent]
    end

    subgraph "Adapter Layer"
        LlmClient[LlmClient Interface]
        Adapter[LlmRouterClientAdapter]
    end

    subgraph "LLM Router Layer"
        LlmRouter[LlmRouter<br/>Provider-agnostic routing]
        PolicyStore[TenantLlmPolicy Store]

        LlmRouter -->|Check policy| PolicyStore
        PolicyStore -->|Task: main-chat<br/>Tenant: default<br/>→ Provider: openai| LlmRouter
    end

    subgraph "AI SDK v5 Integration"
        direction LR

        OpenAIProvider[OpenAI Provider<br/>@ai-sdk/openai]
        GroqProvider[Groq Provider<br/>@ai-sdk/groq]
        AnthropicProvider[Anthropic Provider<br/>@ai-sdk/anthropic]
        GoogleProvider[Google Provider<br/>@ai-sdk/google]
        LocalProvider[Local/OSS Provider<br/>OpenAI-compatible]

        LlmRouter -->|createOpenAI| OpenAIProvider
        LlmRouter -->|createGroq| GroqProvider
        LlmRouter -->|createAnthropic| AnthropicProvider
        LlmRouter -->|createGoogle| GoogleProvider
        LlmRouter -->|createOpenAI<br/>custom baseURL| LocalProvider
    end

    subgraph "AI SDK Core"
        StreamText[streamText<br/>AI SDK v5 Core]
        GenerateText[generateText<br/>AI SDK v5 Core]

        OpenAIProvider --> StreamText
        GroqProvider --> StreamText
        AnthropicProvider --> StreamText
        GoogleProvider --> StreamText
        LocalProvider --> StreamText
    end

    subgraph "OpenAI API Layer"
        ResponsesAPI[OpenAI Responses API<br/>/v1/responses]
        ChatAPI[OpenAI Chat Completions API<br/>/v1/chat/completions]

        StreamText -->|Auto-detect| ResponsesAPI
        StreamText -->|Fallback| ChatAPI
    end

    subgraph "Other Provider APIs"
        GroqAPI[Groq API<br/>/v1/chat/completions]
        AnthropicAPI[Anthropic API<br/>/v1/messages]
        GoogleAPI[Google Gemini API]
        LocalAPI[vLLM/Ollama/etc<br/>/v1/chat/completions]

        GroqProvider --> GroqAPI
        AnthropicProvider --> AnthropicAPI
        GoogleProvider --> GoogleAPI
        LocalProvider --> LocalAPI
    end

    ComplianceEngine -->|Uses| LlmClient
    Agent -->|Uses| LlmClient
    LlmClient -.->|Implements| Adapter
    Adapter -->|Wraps| LlmRouter

    style ResponsesAPI fill:#90EE90
    style ChatAPI fill:#FFE4B5
    style LlmRouter fill:#87CEEB
    style ComplianceEngine fill:#DDA0DD
```

### Provider Details

#### OpenAI Responses API vs Chat Completions

```mermaid
graph LR
    subgraph "OpenAI Provider Behavior"
        AISDKOpenAI[AI SDK OpenAI Provider]

        AISDKOpenAI -->|1. Check capabilities| DetectAPI{Supports<br/>Responses API?}

        DetectAPI -->|Yes| ResponsesAPI[POST /v1/responses<br/>✅ Modern API<br/>✅ Reasoning tokens<br/>✅ Structured outputs]
        DetectAPI -->|No| ChatAPI[POST /v1/chat/completions<br/>✅ Legacy compatible<br/>⚠️ No reasoning tokens]

        ResponsesAPI -->|Response| Stream1[Stream chunks<br/>text, reasoning]
        ChatAPI -->|Response| Stream2[Stream chunks<br/>text only]
    end

    style ResponsesAPI fill:#90EE90
    style ChatAPI fill:#FFE4B5
```

### Streaming Flow Through Layers

```mermaid
sequenceDiagram
    participant App as ComplianceEngine
    participant Adapter as LlmRouterClientAdapter
    participant Router as LlmRouter
    participant SDK as AI SDK v5
    participant OpenAI as OpenAI Responses API

    App->>Adapter: streamChat(request)
    Note over Adapter: Convert to LlmRouter format<br/>Set tenant, task, temp, maxTokens

    Adapter->>Router: streamChat(messages, options)
    Note over Router: Check TenantLlmPolicy<br/>Resolve provider + model

    Router->>SDK: streamText({<br/>  model: openai('gpt-4'),<br/>  messages: [...],<br/>  temperature: 0.3<br/>})

    Note over SDK: Detect Responses API support<br/>Choose endpoint automatically

    SDK->>OpenAI: POST /v1/responses<br/>{<br/>  model: 'gpt-4',<br/>  messages: [...],<br/>  stream: true<br/>}

    OpenAI-->>SDK: data: {type:'content',...}<br/>data: {type:'content',...}

    Note over SDK: Parse SSE stream<br/>Convert to AI SDK format

    SDK-->>Router: yield {delta: 'text'}
    Router-->>Adapter: yield {type:'text',<br/>delta:'text'}
    Adapter-->>App: yield {type:'text',<br/>delta:'text'}

    OpenAI-->>SDK: data: [DONE]
    SDK-->>Router: Stream complete
    Router-->>Adapter: yield {type:'done'}
    Adapter-->>App: yield {type:'done'}
```

### Multi-Provider Routing

```mermaid
graph TB
    subgraph "Tenant Policy Configuration"
        Policy[TenantLlmPolicy]

        Policy --> DefaultTask[Default Task<br/>Provider: openai<br/>Model: gpt-4o]
        Policy --> EgressTask[Egress Guard Task<br/>Provider: local<br/>Model: llama-3-70b]
        Policy --> PIITask[PII Sanitizer Task<br/>Provider: local<br/>Model: llama-guard]
    end

    subgraph "Runtime Routing"
        Request[Incoming Request]
        Request --> CheckTask{Task Type?}

        CheckTask -->|main-chat| UseOpenAI[Route to OpenAI<br/>gpt-4o via Responses API]
        CheckTask -->|egress-guard| UseLocal1[Route to Local vLLM<br/>llama-3-70b]
        CheckTask -->|pii-sanitizer| UseLocal2[Route to Local vLLM<br/>llama-guard]
    end

    subgraph "Egress Control"
        CheckEgress{allowRemoteEgress?}

        UseOpenAI --> CheckEgress
        CheckEgress -->|true| AllowRemote[✅ Allow OpenAI]
        CheckEgress -->|false| BlockRemote[❌ Block remote<br/>Force local only]

        BlockRemote --> UseLocal3[Route to Local vLLM]
    end

    style AllowRemote fill:#90EE90
    style BlockRemote fill:#FFB6C1
```

---

## Graph Streaming Architecture

This diagram shows the real-time graph streaming infrastructure for pushing incremental updates to clients.

```mermaid
graph TB
    subgraph "Memgraph Database"
        Memgraph[(Memgraph<br/>Knowledge Graph)]
    end

    subgraph "Change Detection Layer"
        Detector[GraphChangeDetector<br/>Singleton Instance]

        Detector -->|Poll every 5s| TimestampQuery[Timestamp Query<br/>SELECT * WHERE updated_at > last_check]
        TimestampQuery --> Memgraph

        Detector -->|Compute diff| DiffEngine[Diff Engine<br/>Compare snapshots]
        DiffEngine -->|Generate| Patch[GraphPatch<br/>nodes_added, edges_updated, etc]
    end

    subgraph "Subscription Management"
        SubscriptionMgr[Subscription Manager]

        Detector -->|Notify| SubscriptionMgr

        SubscriptionMgr -->|Filter by jurisdiction| Filter1[IE + self-employed]
        SubscriptionMgr -->|Filter by jurisdiction| Filter2[UK + investor]
        SubscriptionMgr -->|Filter by jurisdiction| Filter3[IE,UK + advisor]
    end

    subgraph "API Layer"
        SnapshotAPI[GET /api/graph<br/>Initial snapshot]
        StreamAPI[GET /api/graph/stream<br/>Incremental patches]

        Memgraph -->|Query| SnapshotAPI
        SubscriptionMgr --> StreamAPI
    end

    subgraph "Client Connections"
        SSE1[SSE Client 1<br/>IE + self-employed]
        SSE2[SSE Client 2<br/>UK + investor]
        WS1[WebSocket Client 3<br/>IE,UK + advisor]

        Filter1 -->|Send patch| SSE1
        Filter2 -->|Send patch| SSE2
        Filter3 -->|Send patch| WS1
    end

    subgraph "Throttling & Batching"
        Throttle[Throttle<br/>Min 750ms between patches]
        Batch[Batch Changes<br/>1000ms window]

        Patch --> Batch
        Batch --> Throttle
        Throttle --> SubscriptionMgr
    end

    style Memgraph fill:#FFE4B5
    style Detector fill:#87CEEB
    style SubscriptionMgr fill:#DDA0DD
```

### Graph Patch Format

```mermaid
graph LR
    subgraph "GraphPatch Structure"
        Patch[GraphPatch]

        Patch --> NodesAdded[nodes_added: Node array]
        Patch --> NodesUpdated[nodes_updated: Node array]
        Patch --> NodesRemoved[nodes_removed: string array]

        Patch --> EdgesAdded[edges_added: Edge array]
        Patch --> EdgesUpdated[edges_updated: Edge array]
        Patch --> EdgesRemoved[edges_removed: string array]

        Patch --> Meta[meta:<br/>timestamp,<br/>totalChanges,<br/>truncated]
    end

    subgraph "Size Limits"
        Limits[Patch Limits]

        Limits --> MaxNodes[Max 250 nodes]
        Limits --> MaxEdges[Max 500 edges]
        Limits --> MaxTotal[Max 700 total changes]

        MaxTotal -->|Exceeded?| Truncate[Truncate & set<br/>truncated: true]
    end
```

### Change Detection Flow

```mermaid
sequenceDiagram
    participant Timer as Poll Timer<br/>(5s interval)
    participant Detector as GraphChangeDetector
    participant Memgraph as Memgraph DB
    participant Sub as Subscription Manager
    participant Client as SSE Client

    Timer->>Detector: Tick (every 5s)

    Detector->>Memgraph: Timestamp Query<br/>WHERE updated_at > '2025-01-15T10:30:00Z'
    Memgraph-->>Detector: Updated nodes & edges

    Note over Detector: Compare with<br/>previous snapshot<br/>Compute diff

    Detector->>Detector: Generate GraphPatch<br/>{nodes_added: 3,<br/>edges_updated: 5}

    Detector->>Sub: Notify subscribers<br/>with patch

    Note over Sub: Filter by<br/>jurisdiction + profile

    Sub->>Sub: Check throttle<br/>(min 750ms)

    Sub->>Client: SSE: data: {<br/>  type: 'graph_patch',<br/>  nodes_added: [...],<br/>  edges_updated: [...]<br/>}

    Note over Client: Apply patch<br/>to local graph<br/>Update UI
```

---

## Technology Stack

### Core Dependencies

```mermaid
graph TB
    subgraph "Runtime"
        Node[Node.js 24 LTS]
        Next[Next.js 16]
        React[React 19]
    end

    subgraph "LLM Integration"
        AISDK[Vercel AI SDK v5<br/>@ai-sdk/*]
        Providers[Provider Packages<br/>openai, groq, anthropic, google]
    end

    subgraph "Graph Database"
        Memgraph[Memgraph 2.x]
        Bolt[Neo4j Bolt Protocol]
    end

    subgraph "TypeScript"
        TS[TypeScript 5.9+]
        TSConfig[Strict mode<br/>ESM modules]
    end

    subgraph "Build & Dev"
        PNPM[pnpm 8.x<br/>Workspace monorepo]
        Turbopack[Next.js 16 Turbopack]
    end

    Next --> Node
    React --> Next
    AISDK --> Next
    Providers --> AISDK
    Memgraph --> Bolt
    TS --> TSConfig
    PNPM --> Turbopack
```

---

## Summary

These diagrams illustrate:

1. **Complete Request Flow**: End-to-end journey from user request through ComplianceEngine, agents, graph queries, and streaming LLM responses

2. **LLM Provider Architecture**: Multi-provider support via AI SDK v5, with automatic OpenAI Responses API detection and fallback

3. **Graph Streaming**: Real-time change detection and incremental patch delivery to clients

### Key Architectural Principles

- ✅ **Provider Agnostic**: Swap LLM providers via configuration
- ✅ **Graph First**: Rules live in Memgraph, LLMs explain them
- ✅ **Streaming Native**: Real-time responses for better UX
- ✅ **Type Safe**: TypeScript strict mode throughout
- ✅ **Privacy Focused**: Egress guards and local model routing
- ✅ **Separation of Concerns**: Clear layer boundaries enforced by ESLint
