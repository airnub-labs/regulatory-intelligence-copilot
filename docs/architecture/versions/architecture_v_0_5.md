# Regulatory Intelligence Copilot – Architecture (v0.5)

> **Goal:** A chat‑first, graph‑backed regulatory research copilot that helps users and advisors explore how tax, social welfare, pensions, CGT and EU rules interact – without ever giving formal legal/tax advice or leaking sensitive data.
>
> **Scope of v0.5:** Extends v0.4 architecture with comprehensive UI layer documentation:
> - **Clean layered UI architecture** with Tailwind CSS v4, shadcn/ui, Radix UI, and Vercel AI SDK integration
> - **AI Elements-inspired chat components** for professional AI conversations
> - **Accessible component library** built on Radix UI primitives
> - **Design system** with CSS variables and semantic tokens
> - **Future-proof integration path** for official Vercel AI Elements components

---

## 0. Normative References

This architecture extends v0.4 and adds UI layer specifications. It sits on top of, and must remain consistent with:

### Core Architecture (from v0.4)

- `docs/architecture_v_0_4.md`
- `docs/graph/graph-schema/versions/graph_schema_v_0_4.md`
- `docs/graph/graph-schema/versions/graph_schema_changelog_v_0_4.md`
- `docs/graph/graph_algorithms_v_0_1.md`
- `docs/engines/timeline-engine/timeline_engine_v_0_2.md`
- `docs/graph/concept/versions/regulatory_graph_copilot_concept_v_0_4.md`
- `docs/graph/special_jurisdictions_modelling_v_0_1.md`
- `docs/safety/data_privacy_and_architecture_boundaries_v_0_1.md`
- `docs/safety/safety-guards/graph_ingress_guard_v_0_1.md`
- `docs/safety/safety-guards/egress_guard_v_0_2.md`

### Project-Level Docs

- `docs/governance/decisions/versions/decisions_v_0_4.md`
- `docs/roadmap_v_0_4.md`
- `docs/node_24_lts_rationale.md`

### UI Implementation Docs

- `apps/demo-web/UI_IMPLEMENTATION.md` (new in v0.5)

Where there is ambiguity, these specs take precedence over this document.

---

## 1. High‑Level Architecture

### 1.1 System Overview (Updated)

The system consists of:

1. **Web app** (`apps/demo-web`)
   - **Next.js 16** (App Router), **React 19**, **Tailwind CSS v4**, **shadcn/ui**
   - **Vercel AI SDK v5** for LLM integrations
   - **Primary UX**: Chat interface + live regulatory graph view
   - **New**: Clean layered UI architecture with AI Elements-inspired components

2. **Compliance Engine** (reusable packages)
   - Core logic in `reg-intel-core`, `reg-intel-graph`, `reg-intel-llm`, `reg-intel-prompts`
   - Implements regulatory copilot behavior
   - Designed to be imported into other Next.js/Supabase SaaS apps

3. **Shared Rules Graph (Memgraph)**
   - Memgraph Community + MAGE as single global regulatory knowledge graph
   - Stores public rules, relationships, timelines, jurisdictions – **never tenant/user PII**

4. **LLM + Tooling Layer**
   - `LlmRouter` with pluggable providers (OpenAI, Groq, local OSS models)
   - All outbound calls go through **EgressClient** and **Egress Guard**

5. **Graph Ingress & Ingestion**
   - `GraphClient` + `GraphWriteService` (with **Graph Ingress Guard**)
   - Mediate all writes to Memgraph

6. **Optional E2B + MCP Gateway**
   - Sandboxed execution and access to external MCP tools
   - All egress from sandboxes funneled through Egress Guard

7. **Storage Layer (Host App)**
   - Supabase (or similar) for multi‑tenant user/accounts/projects/storage
   - Holds user profiles, scenarios, uploaded documents
   - Separate from Memgraph

---

## 2. Platform & Runtime Baselines

Consistent with v0.4:

- **Node.js**: minimum **v24.x LTS**
- **TypeScript**: latest Node‑24 compatible (TS 5.9+)
- **Next.js**: minimum **v16**
- **React**: minimum **v19**
- **Tailwind CSS**: minimum **v4.0** (new in v0.5)

All new code and future upgrades should target these versions at a minimum.

---

## 3. Frontend Architecture – `apps/demo-web`

### 3.1 Clean Layered UI Architecture (New in v0.5)

The frontend follows a **clean layered architecture** that separates concerns and enables maintainability:

```
┌─────────────────────────────────────┐
│     Application Pages (page.tsx)    │  ← Route components, data fetching
├─────────────────────────────────────┤
│  Chat Components (AI Elements-like) │  ← Message, ChatContainer, PromptInput
├─────────────────────────────────────┤
│   shadcn/ui Components (Reusable)   │  ← Button, Card, Input, Badge, etc.
├─────────────────────────────────────┤
│   Radix UI Primitives (Accessible)  │  ← ScrollArea, Avatar, Separator, etc.
├─────────────────────────────────────┤
│      Tailwind v4 (CSS Variables)    │  ← Design tokens, theming, utilities
└─────────────────────────────────────┘
```

#### Layer Responsibilities

1. **Tailwind v4 Layer** (`src/app/globals.css`)
   - CSS-first configuration using `@import "tailwindcss"`
   - Design tokens via `@theme` blocks (colors, radii, spacing)
   - Dark mode support (class-based, data-attribute, auto)
   - HSL color space for semantic theming

2. **Radix UI Primitives Layer** (`@radix-ui/*` packages)
   - Unstyled, accessible component primitives
   - Keyboard navigation, ARIA support, focus management
   - No opinions on styling - purely functional
   - **Primitives installed**: Slot, Select, ScrollArea, Avatar, Separator, Label

3. **shadcn/ui Components Layer** (`src/components/ui/`)
   - Pre-styled components using Radix UI + Tailwind
   - Copy-to-codebase approach (not npm package)
   - Full customization without forking
   - **Components**: Button, Input, Card, Badge, ScrollArea, Avatar, Separator

4. **Chat Components Layer** (`src/components/chat/`)
   - AI Elements-inspired chat interface components
   - **Message**: Role-based message bubbles with avatars
   - **ChatContainer**: ScrollArea wrapper with proper layout
   - **PromptInput**: Input + submit button with keyboard handling
   - **MessageLoading**: Animated loading state

5. **Application Pages Layer** (`src/app/`)
   - Next.js App Router pages and layouts
   - Data fetching, state management
   - Compose components from lower layers
   - API route handlers

### 3.2 Design System (New in v0.5)

#### Color System

All colors use HSL format for easy theming:

```css
@theme {
  --color-background: 0 0% 100%;     /* hsl(0, 0%, 100%) = white */
  --color-foreground: 240 10% 3.9%;  /* dark gray */
  --color-primary: 240 5.9% 10%;     /* dark blue-gray */
  /* ... more semantic tokens */
}
```

Usage in components:
```tsx
<div className="bg-background text-foreground">
<Button className="bg-primary text-primary-foreground">
```

#### Dark Mode

Three methods supported:

1. **Manual**: `<html className="dark">`
2. **Data attribute**: `<html data-theme="dark">`
3. **Auto**: `@media (prefers-color-scheme: dark)`

All methods use the same color definitions via CSS cascading.

#### Border Radius Tokens

```css
@theme {
  --radius-sm: 0.375rem;   /* 6px - small elements */
  --radius: 0.5rem;         /* 8px - default */
  --radius-md: 0.75rem;     /* 12px - medium */
  --radius-lg: 1rem;        /* 16px - large */
  --radius-xl: 1.5rem;      /* 24px - extra large */
}
```

### 3.3 Chat UI Implementation

#### Message Flow

```
User Input → PromptInput
            ↓
    POST /api/chat (SSE streaming)
            ↓
    Message components rendered
            ↓
    ChatContainer (auto-scroll)
```

#### Component Hierarchy

```tsx
<ChatContainer>
  {messages.length === 0 ? (
    <ChatWelcome>
      {/* Welcome cards */}
    </ChatWelcome>
  ) : (
    <>
      {messages.map(msg => (
        <Message role={msg.role} content={msg.content} />
      ))}
      {isLoading && <MessageLoading />}
    </>
  )}
</ChatContainer>

<PromptInput
  value={input}
  onChange={setInput}
  onSubmit={handleSubmit}
  isLoading={isLoading}
/>
```

#### Accessibility Features

- **Keyboard navigation**: All interactive elements keyboard-accessible
- **ARIA labels**: Proper screen reader support
- **Focus management**: Visible focus indicators
- **Semantic HTML**: Proper heading hierarchy, landmarks
- **Color contrast**: WCAG AA compliant
- **Touch targets**: Minimum 44x44px

### 3.4 Vercel AI SDK Integration (New in v0.5)

#### Current State

- **AI SDK v5 installed**: `ai@5.0.101`, `@ai-sdk/react@2.0.104`
- **Custom SSE streaming**: Maintained for backward compatibility
- **AI Elements-inspired components**: Built to match official patterns

#### Future Integration Path

When Vercel AI Elements becomes available:

```bash
# Install official components
npx ai-elements@latest init
npx ai-elements@latest add message prompt-input conversation
```

Components will be installed to `src/components/ai-elements/` and can coexist with or replace custom chat components.

**Migration readiness**:
- ✅ Component structure matches AI Elements patterns
- ✅ Props and interfaces compatible with expected API
- ✅ Styling compatible with shadcn/ui
- ✅ No breaking changes to business logic required

### 3.5 Component Catalog

#### shadcn/ui Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Button | `src/components/ui/button.tsx` | Primary interaction element |
| Input | `src/components/ui/input.tsx` | Text input with focus states |
| Card | `src/components/ui/card.tsx` | Content containers |
| Badge | `src/components/ui/badge.tsx` | Labels and tags |
| ScrollArea | `src/components/ui/scroll-area.tsx` | Custom scrollbars |
| Avatar | `src/components/ui/avatar.tsx` | User/AI avatars |
| Separator | `src/components/ui/separator.tsx` | Visual dividers |

#### Chat Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Message | `src/components/chat/message.tsx` | Chat message bubble |
| MessageLoading | `src/components/chat/message.tsx` | Loading animation |
| ChatContainer | `src/components/chat/chat-container.tsx` | Message list wrapper |
| ChatWelcome | `src/components/chat/chat-container.tsx` | Empty state |
| PromptInput | `src/components/chat/prompt-input.tsx` | Input + submit |

### 3.6 Profile & Jurisdiction Context (Unchanged from v0.4)

- Lightweight settings panel:
  - Persona: `single-director`, `advisor`, `employee`, `investor`, etc.
  - Jurisdictions: `['IE', 'EU', 'UK', 'NI', 'IM']`
  - These values are sent with each `/api/chat` request

### 3.7 Graph Visualization (Unchanged from v0.4)

- Separate `/graph` page using ForceGraph2D
- SSE subscription to graph updates
- Interactive node selection and filtering

---

## 4. Backend Architecture (Unchanged from v0.4)

_No changes from v0.4. See `docs/architecture_v_0_4.md` sections 4-10 for:_

- API Route Handlers
- Compliance Engine
- Agent System
- Graph Layer
- LLM Integration
- Privacy & Data Boundaries
- Deployment Architecture

---

## 5. Key Architecture Decisions (UI Layer - New in v0.5)

### 5.1 Tailwind CSS v4 Migration

**Decision**: Migrate from Tailwind v3 to v4

**Rationale**:
- **CSS-first approach**: Better for component libraries and design systems
- **Improved performance**: Faster build times with optimized PostCSS plugin
- **CSS variables**: Native CSS custom properties for theming
- **Future-proof**: Latest version with active development

**Implementation**:
- Remove `tailwind.config.js` (configuration now in CSS)
- Use `@import "tailwindcss"` instead of `@tailwind` directives
- Define design tokens in `@theme` blocks
- Dark mode via CSS selectors instead of config

### 5.2 shadcn/ui Over Component Library

**Decision**: Use shadcn/ui instead of traditional component library (e.g., MUI, Ant Design)

**Rationale**:
- **Copy-to-codebase**: Full control without forking npm package
- **Tailwind-native**: First-class Tailwind CSS support
- **Radix UI foundation**: Best-in-class accessibility
- **Customizable**: Change anything without CSS overrides
- **Type-safe**: Full TypeScript support
- **No lock-in**: Components are just code in your repo

**Trade-offs**:
- ✅ Full customization
- ✅ No bundle size from unused components
- ✅ Easy to understand and modify
- ⚠️ Manual updates (copy new versions when needed)
- ⚠️ More initial setup vs. `npm install`

### 5.3 AI Elements-Inspired Components

**Decision**: Build custom chat components inspired by Vercel AI Elements patterns

**Rationale**:
- **AI Elements not yet stable**: Registry had availability issues during implementation
- **Future-proof**: Components designed to match official patterns for easy migration
- **Immediate value**: Professional chat UI without waiting for official release
- **Learning**: Understand patterns before adopting official components

**Migration Path**:
- Custom components in `src/components/chat/`
- When AI Elements available: install to `src/components/ai-elements/`
- Gradual migration or keep both (AI Elements for new features)
- No breaking changes required

### 5.4 Radix UI for Accessibility

**Decision**: Use Radix UI primitives as foundation for all interactive components

**Rationale**:
- **Accessibility-first**: WAI-ARIA compliant, keyboard navigation, focus management
- **Unstyled**: No opinions, full styling control
- **Composable**: Build complex components from primitives
- **Battle-tested**: Used by shadcn/ui, Vercel, and thousands of apps
- **TypeScript-native**: Excellent type definitions

**Benefits**:
- ✅ WCAG AA/AAA compliance out of the box
- ✅ Keyboard navigation without custom code
- ✅ Screen reader support
- ✅ Reduced accessibility bugs
- ✅ Professional-grade UX

### 5.5 CSS Variables for Theming

**Decision**: Use CSS custom properties (CSS variables) for all design tokens

**Rationale**:
- **Runtime theming**: Change themes without rebuilding
- **Semantic naming**: `--color-primary` instead of `#3b82f6`
- **Dark mode**: Switch via CSS cascade, not JavaScript
- **Tooling**: Better IDE support, live preview in DevTools
- **Standard**: Native CSS feature, no build-time magic

**Implementation**:
```css
@theme {
  --color-primary: 240 5.9% 10%;
}

.dark {
  @theme {
    --color-primary: 0 0% 98%;
  }
}
```

Usage in components:
```tsx
<div className="bg-primary text-primary-foreground">
```

---

## 6. Privacy & Data Boundaries (Unchanged from v0.4)

_See `docs/architecture_v_0_4.md` section 1.2 for privacy boundaries._

**UI Layer Implications**:
- Chat components **never** store PII locally
- All user data flows through API routes
- No direct database access from frontend
- Message history managed server-side (via ComplianceEngine)

---

## 7. Technology Stack Update

### 7.1 Frontend Stack (Updated)

```
Node.js 24 LTS
├── Next.js 16 (App Router, Turbopack)
├── React 19
├── TypeScript 5.9+
└── UI Layer
    ├── Tailwind CSS v4 (CSS-first config)
    ├── PostCSS 8 (@tailwindcss/postcss plugin)
    ├── shadcn/ui components (copy-to-codebase)
    ├── Radix UI primitives (@radix-ui/*)
    ├── Vercel AI SDK v5 (ai, @ai-sdk/react)
    ├── class-variance-authority (CVA)
    ├── clsx + tailwind-merge (className utilities)
    └── lucide-react (icon library)
```

### 7.2 Backend Stack (Unchanged from v0.4)

_See `docs/architecture_v_0_4.md` for backend stack details._

---

## 8. File Structure (UI Layer Focus)

```
apps/demo-web/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout with dark mode
│   │   ├── page.tsx                  # Chat interface (refactored)
│   │   ├── graph/page.tsx            # Graph visualization
│   │   ├── globals.css               # Tailwind v4 config + theme
│   │   └── api/
│   │       ├── chat/route.ts         # Chat SSE endpoint
│   │       └── graph/                # Graph API endpoints
│   │
│   ├── components/
│   │   ├── ui/                       # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── card.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── scroll-area.tsx
│   │   │   ├── avatar.tsx
│   │   │   └── separator.tsx
│   │   │
│   │   ├── chat/                     # AI Elements-inspired
│   │   │   ├── message.tsx           # Message + MessageLoading
│   │   │   ├── chat-container.tsx    # ChatContainer + ChatWelcome
│   │   │   ├── prompt-input.tsx      # PromptInput
│   │   │   └── index.ts              # Barrel exports
│   │   │
│   │   └── GraphVisualization.tsx    # Graph viewer (existing)
│   │
│   └── lib/
│       └── utils.ts                  # cn() utility for className merging
│
├── UI_IMPLEMENTATION.md              # Detailed UI documentation
├── components.json                   # shadcn/ui config
├── package.json                      # Dependencies
├── tsconfig.json                     # TypeScript config
├── next.config.js                    # Next.js config
└── postcss.config.js                 # PostCSS with Tailwind v4 plugin
```

---

## 9. Development Workflow

### 9.1 Adding New UI Components

1. **Radix UI primitive needed?**
   ```bash
   pnpm add @radix-ui/react-[primitive]
   ```

2. **Create shadcn/ui component:**
   ```bash
   # Manual: create in src/components/ui/
   # Copy pattern from existing components
   ```

3. **Export from component file:**
   ```tsx
   export { Component, type ComponentProps } from './component'
   ```

4. **Use in application:**
   ```tsx
   import { Component } from '@/components/ui/component'
   ```

### 9.2 Customizing Theme

Edit `src/app/globals.css`:

```css
@theme {
  --color-primary: 220 90% 56%;  /* Change primary color */
  --radius: 0.75rem;              /* Change border radius */
}
```

### 9.3 Adding AI Elements (Future)

When registry is available:

```bash
# Initialize AI Elements
npx ai-elements@latest init

# Add specific components
npx ai-elements@latest add message
npx ai-elements@latest add prompt-input
npx ai-elements@latest add conversation

# Components installed to src/components/ai-elements/
```

Migrate gradually:
- Keep custom components in `src/components/chat/`
- Use AI Elements for new features
- Replace custom components when stable

---

## 10. Best Practices (UI Layer)

### 10.1 Component Development

1. **Use the `cn()` utility** for combining classNames
   ```tsx
   <div className={cn("base-styles", className)}>
   ```

2. **Prefer composition** over creating new components
   ```tsx
   <Card>
     <CardHeader>
       <CardTitle>Title</CardTitle>
     </CardHeader>
   </Card>
   ```

3. **Keep components small** and focused on one responsibility

4. **Use TypeScript** for type safety
   ```tsx
   interface Props {
     children: React.ReactNode
     className?: string
   }
   ```

5. **Follow accessibility guidelines**
   - Always test with keyboard
   - Use semantic HTML
   - Provide ARIA labels where needed

### 10.2 Styling

1. **Use semantic tokens** instead of arbitrary values
   ```tsx
   // Good
   <div className="bg-primary text-primary-foreground">

   // Avoid
   <div className="bg-blue-600 text-white">
   ```

2. **Leverage Radix UI** for complex interactive components
   - Don't reinvent dropdowns, dialogs, etc.
   - Use Radix primitives + Tailwind styling

3. **Keep styling colocated** with components
   - Use Tailwind classes, not separate CSS files
   - CSS modules only for very complex animations

4. **Document color choices** in component comments
   ```tsx
   // Uses blue-500 for emphasis (matches brand color)
   ```

### 10.3 Accessibility

1. **Keyboard navigation**
   - All interactive elements must be keyboard-accessible
   - Test with Tab, Enter, Escape, Arrow keys

2. **Screen reader support**
   - Provide ARIA labels for icon buttons
   - Use semantic HTML (header, nav, main, etc.)

3. **Focus management**
   - Visible focus indicators (`focus:ring-*`)
   - Manage focus after modal close

4. **Color contrast**
   - Ensure WCAG AA compliance (4.5:1 for normal text)
   - Use contrast checker during development

---

## 11. Summary of Changes in v0.5

### Added

- ✅ **Clean Layered UI Architecture** documentation
- ✅ **Tailwind CSS v4** configuration and migration guide
- ✅ **shadcn/ui component library** integration
- ✅ **Radix UI primitives** for accessibility
- ✅ **AI Elements-inspired chat components**
- ✅ **Design system** with CSS variables
- ✅ **Dark mode support** (3 methods)
- ✅ **Component catalog** and file structure
- ✅ **Best practices** for UI development
- ✅ **Future migration path** for official AI Elements

### Modified

- 📝 **Frontend Architecture** section expanded
- 📝 **Technology Stack** updated with UI dependencies
- 📝 **File Structure** includes new component directories

### Unchanged from v0.4

- ✅ Backend architecture (ComplianceEngine, agents, graph)
- ✅ Privacy & data boundaries
- ✅ LLM integration
- ✅ Deployment architecture
- ✅ Graph streaming
- ✅ Egress/Ingress guards

---

## 12. Migration Notes

### From v0.4 to v0.5

**No breaking changes** to backend architecture. The v0.5 update is purely additive:

1. **UI layer additions**:
   - Tailwind v4 configuration
   - shadcn/ui components
   - Chat components
   - No API changes

2. **Compatibility**:
   - All v0.4 backend code works unchanged
   - API contracts preserved
   - ComplianceEngine interface unchanged

3. **Incremental adoption**:
   - Teams can adopt UI components gradually
   - Existing pages work alongside new components
   - No forced migration timeline

---

## References

- `apps/demo-web/UI_IMPLEMENTATION.md` - Detailed UI implementation guide
- `docs/architecture_v_0_4.md` - Backend architecture (unchanged)
- `docs/governance/decisions/versions/decisions_v_0_5.md` - Architecture decision records (new in v0.5)
- [Tailwind CSS v4 Documentation](https://tailwindcss.com/)
- [shadcn/ui Documentation](https://ui.shadcn.com/)
- [Radix UI Documentation](https://www.radix-ui.com/)
- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [Vercel AI Elements GitHub](https://github.com/vercel/ai-elements)
