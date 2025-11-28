# Architecture Decision Records (v0.5)

This document extends the v0.4 decisions with new UI layer architecture decisions made in v0.5.

## Previous Decisions

All v0.4 backend architecture decisions remain unchanged. See `docs/governance/decisions/archive/decisions_v_0_4.md` for:
- ComplianceEngine architecture
- LLM provider routing
- Graph data boundaries
- Egress/Ingress guards
- Node.js 24 LTS adoption

---

## UI Layer Decisions (New in v0.5)

### Decision 1: Adopt Tailwind CSS v4

**Date**: 2025-01-15

**Status**: ✅ Accepted

**Context**:
- Tailwind v3 used old `@tailwind` directives and `tailwind.config.js`
- v4 introduces CSS-first approach with `@import` and `@theme` blocks
- Better performance with new PostCSS plugin
- Native CSS custom properties for theming

**Decision**:
Migrate to Tailwind CSS v4 with CSS-first configuration.

**Consequences**:

✅ **Positive**:
- **Better performance**: Faster build times with optimized plugin
- **CSS variables**: Runtime theming without rebuilds
- **Future-proof**: Latest version with active development
- **Simpler config**: No `tailwind.config.js` needed
- **Better IDE support**: CSS variables show up in DevTools

⚠️ **Negative**:
- **Migration effort**: Had to remove `tailwind.config.js` and update `globals.css`
- **Learning curve**: Team needs to learn new `@theme` syntax
- **Documentation**: Some v3 tutorials outdated

**Implementation**:
```css
/* globals.css */
@import "tailwindcss";

@theme {
  --color-primary: 240 5.9% 10%;
  --radius: 0.5rem;
}
```

**Alternatives Considered**:
1. **Stay on Tailwind v3**: Would work but miss performance improvements
2. **Switch to vanilla CSS**: Too low-level, would lose utility-first benefits
3. **Use CSS-in-JS (styled-components)**: Runtime overhead, worse performance

---

### Decision 2: Use shadcn/ui Over Traditional Component Libraries

**Date**: 2025-01-15

**Status**: ✅ Accepted

**Context**:
- Need accessible, professional UI components
- Traditional libraries (MUI, Ant Design) bundle large CSS, limited customization
- shadcn/ui uses copy-to-codebase approach (not npm package)
- Built on Radix UI for accessibility, styled with Tailwind

**Decision**:
Adopt shadcn/ui as primary component library using copy-to-codebase model.

**Consequences**:

✅ **Positive**:
- **Full control**: Components are just code in your repo
- **No lock-in**: Easy to modify or replace individual components
- **Tailwind-native**: Perfect integration with Tailwind CSS
- **Accessible**: Built on Radix UI primitives (WAI-ARIA compliant)
- **Type-safe**: Full TypeScript support
- **Small bundle**: Only ship components you use
- **Customizable**: Change anything without CSS overrides

⚠️ **Negative**:
- **Manual updates**: Have to copy new versions when needed (not `npm update`)
- **More initial setup**: Copy components instead of `npm install`
- **No global theming**: Each component styled independently

**Implementation**:
```tsx
// src/components/ui/button.tsx
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(/* ... */)

export function Button({ className, variant, ...props }) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />
}
```

**Alternatives Considered**:
1. **Material-UI (MUI)**: Heavy bundle, opinionated styling, harder to customize
2. **Ant Design**: Good for admin dashboards, but heavyweight for chat UI
3. **Chakra UI**: Excellent but not Tailwind-native
4. **Headless UI**: Good but shadcn/ui provides styled versions on top of Radix

**Why shadcn/ui Won**:
- Tailwind-native (perfect fit with our CSS framework)
- Radix UI foundation (best-in-class accessibility)
- Copy-to-codebase (no npm bloat, full control)
- Active community and documentation
- Used by Vercel, Next.js docs, and thousands of projects

---

### Decision 3: Build on Radix UI Primitives

**Date**: 2025-01-15

**Status**: ✅ Accepted

**Context**:
- Accessibility is critical for compliance with WCAG AA/AAA
- Building accessible components from scratch is error-prone
- Radix UI provides unstyled, accessible primitives
- Used as foundation by shadcn/ui

**Decision**:
Use Radix UI primitives for all interactive components (modals, dropdowns, scroll areas, etc.).

**Consequences**:

✅ **Positive**:
- **Accessibility out-of-the-box**: WAI-ARIA compliant, keyboard navigation, focus management
- **Unstyled**: Full styling control, no CSS to override
- **Composable**: Build complex widgets from simple primitives
- **Battle-tested**: Used by Vercel, GitHub, Linear, and thousands of apps
- **TypeScript-native**: Excellent type definitions
- **Reduced bugs**: Don't have to implement complex patterns (focus traps, etc.)

⚠️ **Negative**:
- **Learning curve**: Need to understand each primitive's API
- **More dependencies**: Each primitive is a separate package

**Implementation**:
```tsx
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

export const ScrollArea = ({ children }) => (
  <ScrollAreaPrimitive.Root>
    <ScrollAreaPrimitive.Viewport>
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollAreaPrimitive.Scrollbar orientation="vertical">
      <ScrollAreaPrimitive.Thumb />
    </ScrollAreaPrimitive.Scrollbar>
  </ScrollAreaPrimitive.Root>
)
```

**Alternatives Considered**:
1. **Build from scratch**: Too error-prone, would miss edge cases
2. **Headless UI**: Good but limited primitive selection
3. **React Aria**: Excellent but more low-level than needed
4. **Ariakit**: Good alternative but smaller community

**Why Radix Won**:
- Widest primitive selection
- Best TypeScript support
- shadcn/ui already uses it
- Largest community and ecosystem

---

### Decision 4: Create AI Elements-Inspired Chat Components

**Date**: 2025-01-15

**Status**: ✅ Accepted

**Context**:
- Vercel AI Elements (official chat components) announced but registry had availability issues
- Need professional chat UI immediately
- AI Elements built on shadcn/ui, so patterns are compatible
- Future migration to official components should be easy

**Decision**:
Build custom chat components (`Message`, `ChatContainer`, `PromptInput`) inspired by Vercel AI Elements patterns, with a clear migration path when official components are available.

**Consequences**:

✅ **Positive**:
- **Immediate value**: Professional chat UI without waiting
- **Learning**: Understand patterns before adopting official components
- **Full control**: Customize for our specific use case
- **Future-proof**: Designed to match official patterns for easy migration
- **No blocker**: Don't wait for registry availability

⚠️ **Negative**:
- **Maintenance**: Have to maintain custom components
- **Migration work**: Will need to migrate when AI Elements stabilizes
- **Potential divergence**: Official components might have different API

**Implementation**:
```tsx
// src/components/chat/message.tsx
export function Message({ role, content }: MessageProps) {
  const isUser = role === "user"

  return (
    <div className={cn("flex gap-3", isUser && "justify-end")}>
      {!isUser && <Avatar><AvatarFallback>AI</AvatarFallback></Avatar>}
      <div className={cn(
        "rounded-lg px-4 py-3",
        isUser ? "bg-primary text-primary-foreground" : "bg-muted"
      )}>
        <MessageContent>{content}</MessageContent>
      </div>
      {isUser && <Avatar><AvatarFallback>U</AvatarFallback></Avatar>}
    </div>
  )
}
```

**Migration Path**:
```bash
# When AI Elements available:
npx ai-elements@latest add message prompt-input conversation

# Components go to src/components/ai-elements/
# Custom components stay in src/components/chat/
# Migrate gradually or keep both
```

**Alternatives Considered**:
1. **Wait for AI Elements**: Would delay project significantly
2. **Use generic chat library**: Not AI-specific, would need heavy customization
3. **Build completely custom**: More work, no community patterns

**Why Custom + Migration Path Won**:
- Unblocks development immediately
- Learn patterns before committing to official library
- Easy migration when ready
- No vendor lock-in

---

### Decision 5: Use CSS Variables for Theming

**Date**: 2025-01-15

**Status**: ✅ Accepted

**Context**:
- Dark mode and theming are critical UX features
- Tailwind v4 supports CSS variables natively
- Need runtime theme switching without rebuilds
- shadcn/ui uses CSS variables pattern

**Decision**:
Use CSS custom properties (CSS variables) for all design tokens (colors, radii, spacing).

**Consequences**:

✅ **Positive**:
- **Runtime theming**: Switch themes without rebuilding
- **Semantic naming**: `--color-primary` instead of `#3b82f6`
- **Dark mode**: Via CSS cascade, not JavaScript
- **IDE support**: Variables show up in DevTools, easier debugging
- **Standard**: Native CSS feature, no build-time magic
- **SSR-friendly**: No flash of unstyled content

⚠️ **Negative**:
- **Browser support**: Very old browsers don't support CSS variables (not a concern for modern apps)
- **Specificity**: Need to understand CSS cascade

**Implementation**:
```css
@theme {
  --color-primary: 240 5.9% 10%;
  --color-background: 0 0% 100%;
  --radius: 0.5rem;
}

.dark {
  @theme {
    --color-primary: 0 0% 98%;
    --color-background: 240 10% 3.9%;
  }
}
```

Usage:
```tsx
<div className="bg-background text-foreground rounded-radius">
```

**Alternatives Considered**:
1. **JavaScript theming**: Runtime overhead, requires client-side logic
2. **Separate stylesheets**: Duplicate CSS, larger bundle
3. **CSS-in-JS**: Runtime cost, worse performance

**Why CSS Variables Won**:
- Native CSS, zero runtime cost
- Perfect for Tailwind v4
- SSR-friendly
- Industry best practice

---

### Decision 6: Adopt Clean Layered UI Architecture

**Date**: 2025-01-15

**Status**: ✅ Accepted

**Context**:
- UI codebase growing with multiple concerns (styling, accessibility, business logic)
- Need clear separation of concerns
- Want to enable easy testing and maintenance
- Industry trend towards layered frontend architectures

**Decision**:
Implement clean layered architecture with clear responsibilities at each layer:

```
Application Pages → Chat Components → shadcn/ui → Radix UI → Tailwind v4
```

**Consequences**:

✅ **Positive**:
- **Separation of concerns**: Each layer has single responsibility
- **Testability**: Easy to test each layer independently
- **Maintainability**: Changes to one layer don't affect others
- **Reusability**: Lower layers can be used across different features
- **Onboarding**: New developers understand structure quickly
- **Composition**: Build complex UIs from simple parts

⚠️ **Negative**:
- **More files**: More granular structure means more files
- **Learning curve**: Team needs to understand layer boundaries

**Layer Responsibilities**:

1. **Tailwind v4 (Base)**:
   - Design tokens (colors, radii, spacing)
   - Utility classes
   - Theme system

2. **Radix UI (Primitives)**:
   - Accessible component primitives
   - Keyboard navigation
   - ARIA support

3. **shadcn/ui (Components)**:
   - Styled reusable components
   - Button, Input, Card, Badge, etc.

4. **Chat Components (Features)**:
   - Domain-specific components
   - Message, ChatContainer, PromptInput

5. **Pages (Application)**:
   - Route components
   - Data fetching
   - State management

**Enforcement**:
- File structure mirrors layers (`src/components/ui/`, `src/components/chat/`)
- Clear dependency direction (upper layers depend on lower, never reverse)
- Documentation of layer boundaries

**Alternatives Considered**:
1. **Flat structure**: All components in one directory - harder to maintain
2. **Feature-based**: Group by feature instead of layer - mixing concerns
3. **Atomic design**: Atoms/molecules/organisms - less clear for our use case

**Why Layered Architecture Won**:
- Clear separation of concerns
- Matches shadcn/ui and Radix UI patterns
- Easy to explain and understand
- Industry best practice

---

## Technology Stack Decisions

### Installed Dependencies (v0.5)

**UI Framework**:
- `tailwindcss@^4.1.17` - CSS framework with v4 features
- `@tailwindcss/postcss@^4.1.17` - PostCSS plugin for Tailwind v4
- `postcss@^8.5.6` - CSS processor
- `autoprefixer@^10.4.22` - Vendor prefixing

**Component Libraries**:
- `class-variance-authority@^0.7.1` - CVA for component variants
- `clsx@^2.1.1` - Conditional className utility
- `tailwind-merge@^3.4.0` - Merge Tailwind classes intelligently
- `lucide-react@^0.555.0` - Icon library

**Radix UI Primitives**:
- `@radix-ui/react-slot@^1.2.4`
- `@radix-ui/react-select@^2.2.6`
- `@radix-ui/react-scroll-area@^1.2.10`
- `@radix-ui/react-avatar@^1.1.11`
- `@radix-ui/react-separator@^1.1.8`
- `@radix-ui/react-label@^1.1.8`

**AI SDK**:
- `ai@^5.0.101` - Vercel AI SDK core
- `@ai-sdk/react@^2.0.104` - React hooks for AI SDK

**Rationale**:
- Tailwind v4 for modern CSS-first approach
- Radix UI for accessible primitives
- CVA for type-safe variant management
- AI SDK for future AI Elements integration

---

## Migration Decisions

### TypeScript Strictness

**Decision**: Fix GraphVisualization type errors instead of disabling strict mode.

**Context**:
- Build failed due to `ForceGraph2D` library type incompatibilities
- Could have disabled strict TypeScript checks
- Chose to fix properly with type assertions

**Solution**:
```tsx
// Use type assertions to bridge library types
nodeCanvasObject={(node: any, ctx, globalScale) => {
  const typedNode = node as ForceGraphNode;
  const x = typedNode.x ?? 0;  // Handle undefined
  const y = typedNode.y ?? 0;
  // ...
}}
```

**Rationale**:
- Maintain type safety across codebase
- Explicit handling of undefined values
- Better developer experience with proper types

---

## Best Practices Established

### Component Development

1. **Use `cn()` utility** for className merging
2. **Prefer composition** over creating new components
3. **Keep components small** and focused
4. **Use TypeScript** for type safety
5. **Follow accessibility guidelines**

### Styling

1. **Use semantic tokens** (`bg-primary` not `bg-blue-600`)
2. **Leverage Radix UI** for complex interactions
3. **Keep styling colocated** with components
4. **Document color choices** in comments

### Accessibility

1. **Keyboard navigation** for all interactive elements
2. **ARIA labels** for icon buttons and landmarks
3. **Focus management** with visible indicators
4. **Color contrast** WCAG AA minimum

---

## Future Decisions

### When AI Elements Registry Becomes Available

**Action Plan**:
1. Evaluate official AI Elements components
2. Compare APIs with custom components
3. Create migration plan (gradual or full)
4. Document any breaking changes
5. Update architecture docs

**Decision Criteria**:
- API compatibility with custom components
- Feature parity
- Performance characteristics
- Community adoption
- Maintenance burden

---

## Summary of v0.5 Decisions

| Decision | Status | Impact |
|----------|--------|--------|
| Tailwind CSS v4 | ✅ Accepted | High - Foundation of UI layer |
| shadcn/ui | ✅ Accepted | High - Primary component library |
| Radix UI | ✅ Accepted | High - Accessibility foundation |
| AI Elements-inspired | ✅ Accepted | Medium - Chat components |
| CSS Variables | ✅ Accepted | Medium - Theming system |
| Layered Architecture | ✅ Accepted | High - Code organization |

All decisions support the goal of building a maintainable, accessible, and future-proof UI layer.

---

## References

- `docs/architecture/archive/architecture_v_0_5.md` - Full architecture documentation
- `apps/demo-web/UI_IMPLEMENTATION.md` - Implementation details
- `docs/architecture/archive/architecture_diagrams_v_0_5.md` - Mermaid diagrams (v0.5)
- [Tailwind CSS v4 Docs](https://tailwindcss.com/)
- [shadcn/ui Docs](https://ui.shadcn.com/)
- [Radix UI Docs](https://www.radix-ui.com/)
- [Vercel AI Elements GitHub](https://github.com/vercel/ai-elements)
