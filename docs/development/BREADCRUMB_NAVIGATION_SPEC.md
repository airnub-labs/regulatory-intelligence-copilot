# Breadcrumb Navigation with Jump-to-Message Specification

> **Feature**: Enhanced path breadcrumbs with branch point navigation
> **Created**: 2025-12-27
> **Status**: Proposed (Phase 4 - Future)

## Overview

Breadcrumb navigation that allows users to:
1. **Switch between paths** (click path name)
2. **Jump to branch point message** (click or auto-scroll)
3. **See branch context** (tooltips or inline display)

---

## User Stories

### Story 1: Navigate to Parent Path
**As a user**
When I'm viewing a nested branch
I want to click on a parent path in the breadcrumb
So I can quickly navigate back to see the full parent conversation

### Story 2: Jump to Branch Point
**As a user**
When I click on a parent path
I want to automatically scroll to the message where the current branch originated
So I can see the exact context of why the branch was created

### Story 3: View Branch Context
**As a user**
When I hover over a path in the breadcrumb
I want to see a preview of the branch point message
So I can understand what each branch represents without navigating

---

## Data Model

### Path with Branch Point
```typescript
interface ConversationPath {
  id: string;
  conversationId: string;
  parentPathId: string | null;
  branchPointMessageId: string | null; // ← Key field!
  name: string | null;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### Branch Point Message
```typescript
interface PathMessage {
  id: string;
  conversationId: string;
  pathId: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  sequenceInPath: number;
  isBranchPoint: boolean;
  branchedToPaths: string[]; // All paths branched from this message
}
```

---

## Component Architecture

### PathBreadcrumbs Component

**File**: `packages/reg-intel-ui/src/components/PathBreadcrumbs.tsx`

```typescript
'use client';

import { Fragment } from 'react';
import { ChevronRight, MessageCircle } from 'lucide-react';
import { cn } from '../utils.js';
import type { ClientPath, PathMessage } from '../types.js';

export interface PathBreadcrumbsProps {
  /** The currently active path */
  activePath: ClientPath | null;
  /** All paths for the conversation */
  paths: ClientPath[];
  /** All messages (to show branch point context) */
  messages?: PathMessage[];
  /** Callback when user clicks a path */
  onNavigate: (pathId: string, options?: NavigateOptions) => void;
  /** Optional className */
  className?: string;
}

export interface NavigateOptions {
  /** Should scroll to branch point message */
  scrollToMessage?: string;
  /** Should highlight the message */
  highlightMessage?: boolean;
}

/**
 * Build breadcrumb chain from root to active path
 */
function buildBreadcrumbChain(
  activePath: ClientPath | null,
  allPaths: ClientPath[]
): ClientPath[] {
  if (!activePath) return [];

  const chain: ClientPath[] = [];
  let current: ClientPath | null = activePath;

  // Walk up the parent chain
  while (current) {
    chain.unshift(current);
    if (!current.parentPathId) break;
    current = allPaths.find(p => p.id === current!.parentPathId) || null;
  }

  return chain;
}

/**
 * Get branch point message content for tooltip
 */
function getBranchPointPreview(
  branchPointMessageId: string | null,
  messages?: PathMessage[]
): string {
  if (!branchPointMessageId || !messages) return '';

  const message = messages.find(m => m.id === branchPointMessageId);
  if (!message) return 'Branch point message';

  const preview = message.content.substring(0, 80);
  return preview + (message.content.length > 80 ? '...' : '');
}

export function PathBreadcrumbs({
  activePath,
  paths,
  messages,
  onNavigate,
  className,
}: PathBreadcrumbsProps) {
  const breadcrumbs = buildBreadcrumbChain(activePath, paths);

  if (breadcrumbs.length === 0) return null;

  const handlePathClick = (path: ClientPath, index: number) => {
    // If clicking a non-active path, navigate to it
    if (path.id !== activePath?.id) {
      // Find the next path in the chain (the child of this path)
      const nextPath = breadcrumbs[index + 1];

      // If there's a child path, it has a branch point message
      const branchPointMessageId = nextPath?.branchPointMessageId;

      onNavigate(path.id, {
        scrollToMessage: branchPointMessageId || undefined,
        highlightMessage: !!branchPointMessageId,
      });
    }
  };

  return (
    <nav
      className={cn('flex items-center gap-1 text-xs overflow-x-auto', className)}
      aria-label="Path breadcrumb navigation"
    >
      {breadcrumbs.map((path, index) => {
        const isActive = path.id === activePath?.id;
        const nextPath = breadcrumbs[index + 1];
        const branchPointPreview = getBranchPointPreview(
          nextPath?.branchPointMessageId,
          messages
        );

        return (
          <Fragment key={path.id}>
            {index > 0 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            )}

            <button
              onClick={() => handlePathClick(path, index)}
              disabled={isActive}
              className={cn(
                'transition-colors whitespace-nowrap',
                isActive
                  ? 'font-semibold text-foreground cursor-default'
                  : 'hover:underline text-muted-foreground hover:text-foreground'
              )}
              title={
                branchPointPreview
                  ? `Next branch originated from: "${branchPointPreview}"`
                  : path.name || (path.isPrimary ? 'Primary path' : 'Branch')
              }
            >
              {path.name || (path.isPrimary ? 'Primary' : `Branch ${path.id.slice(0, 6)}`)}

              {nextPath?.branchPointMessageId && (
                <MessageCircle className="ml-1 h-2.5 w-2.5 inline opacity-50" />
              )}
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}
```

---

## Integration with Page Component

**File**: `apps/demo-web/src/app/page.tsx`

### Add Breadcrumb Component

```typescript
import { PathBreadcrumbs } from '@reg-copilot/reg-intel-ui';

// In the render:
<div className="flex flex-col gap-2">
  {/* Breadcrumb navigation */}
  <PathBreadcrumbs
    activePath={activePath}
    paths={paths}
    messages={messages}
    onNavigate={handleBreadcrumbNavigate}
    className="px-4 pt-2"
  />

  {/* Existing PathToolbar */}
  <PathToolbar
    compact
    onPathSwitch={(path) => {
      updateUrl(conversationId, path.id);
      loadConversation(conversationId);
    }}
  />
</div>
```

### Handle Navigation with Scroll

```typescript
const handleBreadcrumbNavigate = async (
  pathId: string,
  options?: { scrollToMessage?: string; highlightMessage?: boolean }
) => {
  // Switch to the path
  if (conversationId) {
    await fetch(`/api/conversations/${conversationId}/active-path`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ pathId }),
    });

    // Update URL
    updateUrl(conversationId, pathId);

    // Reload messages
    await loadConversation(conversationId);

    // Scroll to branch point if specified
    if (options?.scrollToMessage) {
      // Wait for messages to render
      setTimeout(() => {
        const messageElement = document.getElementById(
          `message-${options.scrollToMessage}`
        );

        if (messageElement) {
          messageElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });

          if (options.highlightMessage) {
            // Add temporary highlight
            messageElement.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
            setTimeout(() => {
              messageElement.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
            }, 2000);
          }
        }
      }, 200);
    }
  }
};
```

---

## Visual Design

### Layout Examples

#### Simple Breadcrumb (No Branch Point Info)
```
Path: Primary > Alternative Scenario > Edit: What about...
      ↑ Active path is bold
```

#### With Branch Point Indicators
```
Path: Primary 💬 > Alternative Scenario 💬 > Edit: What about...
               ↑ Icon indicates next branch originated here
```

#### With Inline Branch Points
```
Path: Primary > "What are tax rules?" > Alternative > "What about France?" > Edit
               ↑ Shows actual message content (truncated)
```

#### Hover State
```
Path: Primary 💬 > Alternative Scenario > Edit
      ↑ Tooltip: "Next branch originated from: 'What are the tax rules for Ireland?'"
```

---

## Behavior Specifications

### Click Behavior

| User Action | Result |
|-------------|--------|
| Click active path | No action (already on this path) |
| Click parent path | 1. Switch to parent path<br>2. Scroll to branch point message<br>3. Highlight message for 2 seconds |
| Click grandparent path | Same as parent, but scrolls to the immediate child's branch point |

### Scroll Behavior

```typescript
// Smooth scroll to message
messageElement.scrollIntoView({
  behavior: 'smooth',    // Animated scroll
  block: 'center',       // Center message in viewport
  inline: 'nearest',     // Don't scroll horizontally
});
```

### Highlight Behavior

```typescript
// Temporary highlight (2 seconds)
messageElement.classList.add(
  'ring-2',           // Border width
  'ring-primary',     // Theme color
  'ring-offset-2',    // Space from edge
  'transition-all',   // Smooth animation
);

setTimeout(() => {
  messageElement.classList.remove(
    'ring-2',
    'ring-primary',
    'ring-offset-2',
  );
}, 2000);
```

---

## Accessibility

### Keyboard Navigation
- Tab: Move between breadcrumb links
- Enter/Space: Activate link
- Aria labels: Descriptive path names

### Screen Reader Support
```typescript
<nav aria-label="Path breadcrumb navigation">
  <button
    aria-current={isActive ? 'page' : undefined}
    aria-label={`Navigate to ${path.name || 'Primary path'}`}
  >
    {path.name}
  </button>
</nav>
```

---

## Testing

### Test Cases

1. **Basic Path Switching**
   - Click parent path → Switches to parent
   - Click grandparent → Switches to grandparent

2. **Branch Point Scrolling**
   - Click parent → Scrolls to branch point message
   - Click grandparent → Scrolls to appropriate branch point

3. **Highlight Behavior**
   - Message highlights for 2 seconds
   - Highlight fades smoothly

4. **Edge Cases**
   - Branch point message deleted → Graceful fallback
   - Very long path names → Truncation works
   - Mobile viewport → Horizontal scroll works

### Test File

`apps/demo-web/src/app/__tests__/breadcrumb-navigation.test.tsx`

---

## Performance Considerations

### Optimization Strategies

1. **Memoize Breadcrumb Chain**
   ```typescript
   const breadcrumbs = useMemo(
     () => buildBreadcrumbChain(activePath, paths),
     [activePath, paths]
   );
   ```

2. **Lazy Load Messages**
   - Only fetch messages when needed
   - Cache branch point message content

3. **Throttle Scroll Events**
   - Use requestAnimationFrame for smooth scrolling
   - Debounce scroll position updates

---

## Implementation Context

**This breadcrumb navigation feature is Phase 4** of the overall UX improvement strategy.

**See**: [PHASE_3_OPTIMAL_STRATEGY.md](./PHASE_3_OPTIMAL_STRATEGY.md) for complete phased approach.

### Prerequisites (Phase 3 - Must Be Done First)

Before implementing breadcrumb navigation, Phase 3 must complete:

1. **Message DOM IDs**: All messages must have `id="message-{messageId}"` attribute
2. **Scroll Utility**: `scrollToMessage()` function implemented and tested
3. **Highlight Utility**: `highlightMessage()` function implemented and tested
4. **Data Attributes**: Branch point messages have proper data attributes
5. **Test Coverage**: Utilities have ≥90% test coverage

**Effort**: Phase 3 = 2-3 hours | Phase 4 = 6-9 hours | **Total**: 8-12 hours

### Phase 4 Implementation Plan

#### Sub-Phase 4.1: Basic Breadcrumb (3-4 hours)
- Create PathBreadcrumbs component
- Implement path chain building logic
- Add horizontal navigation UI
- Path switching on click
- Mobile-responsive horizontal scroll

#### Sub-Phase 4.2: Jump to Message Integration (2-3 hours)
- Integrate with Phase 3 scroll utilities
- Pass branch point message IDs to breadcrumb
- Implement auto-scroll on parent path click
- Add message highlight animation
- Test scroll behavior across browsers

#### Sub-Phase 4.3: Context Enhancements (1-2 hours)
- Add tooltips showing branch point message preview
- Branch point icon indicators
- Hover states and accessibility
- Keyboard navigation

### Future Enhancements (Beyond Phase 4)
- Click to see full conversation state at branch point
- Diff view showing what changed in branch
- Merge conflict resolution UI
- Inline message previews in breadcrumb tooltips

---

## Comparison with Current PathToolbar

| Feature | PathToolbar | PathBreadcrumbs |
|---------|-------------|-----------------|
| Path switching | ✅ Dropdown | ✅ Horizontal nav |
| Shows hierarchy | ⚠️ Tree prefix | ✅ Visual chain |
| Jump to message | ❌ No | ✅ Yes |
| Branch context | ❌ No | ✅ Tooltips |
| Space efficient | ✅ Compact | ⚠️ Grows with depth |
| Mobile friendly | ✅ Yes | ⚠️ Needs scroll |

**Recommendation**: Use **both**
- PathToolbar: Quick switching, shows all paths
- PathBreadcrumbs: Context, hierarchy, jump to message

---

## API Requirements

### GET /api/conversations/:id/messages

Should return `isBranchPoint` and `branchedToPaths`:

```typescript
{
  "messages": [
    {
      "id": "msg-123",
      "content": "What are tax rules for Ireland?",
      "role": "user",
      "pathId": "path-main",
      "sequenceInPath": 0,
      "isBranchPoint": true,          // ← This message has branches
      "branchedToPaths": [             // ← Paths that branched here
        "path-alt-1",
        "path-alt-2"
      ]
    }
  ]
}
```

Already implemented ✅

---

## Summary

**This is Phase 4** of the complete UX improvement strategy.

**See**: [PHASE_3_OPTIMAL_STRATEGY.md](./PHASE_3_OPTIMAL_STRATEGY.md) for the complete phased approach.

### What This Feature Provides

1. ✅ **Path switching** via horizontal breadcrumb navigation
2. ✅ **Jump to exact branch point message** with auto-scroll and highlight
3. ✅ **Visual context** of branch origins via tooltips
4. ✅ **Improved user understanding** of path hierarchy

### Implementation Effort

| Component | Effort |
|-----------|--------|
| Phase 3: Technical foundation (prerequisites) | 2-3 hours |
| Phase 4.1: Basic breadcrumb UI | 3-4 hours |
| Phase 4.2: Jump-to-message integration | 2-3 hours |
| Phase 4.3: Context enhancements | 1-2 hours |
| **Total** | **8-12 hours** |

### Implementation Sequence

1. **Phase 1**: Change "Main" → "Primary" (1h) ✅ Ready
2. **Phase 2**: Add tree prefixes showing depth (2-3h) ✅ Ready
3. **Phase 3**: Implement scroll utilities and DOM IDs (2-3h) ⭐ **Required**
4. **Phase 4**: Implement breadcrumb navigation ← **This spec** (6-9h)

**Prerequisites**: Phase 3 must be complete before starting Phase 4.

**User Benefit**: "I can see exactly where each branch came from and jump straight to that point in the conversation!"
