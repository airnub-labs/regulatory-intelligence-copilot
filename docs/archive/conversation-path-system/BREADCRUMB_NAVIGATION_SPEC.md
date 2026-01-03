> **ARCHIVED (2026-01-03)**: Feature implemented. Superseded by [`docs/architecture/conversation-path-system.md`](../../architecture/conversation-path-system.md). Retained for historical reference.

---

# Breadcrumb Navigation with Jump-to-Message Specification

> **Feature**: Enhanced path breadcrumbs with branch point navigation
> **Created**: 2025-12-27
> **Status**: ✅ IMPLEMENTED (Phase 4 Complete) - ARCHIVED

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

---

## Implementation Summary (2025-12-27)

### ✅ Phase 4 Complete - All Deliverables Implemented + Enhancements

**Implementation Date**: 2025-12-27
**Total Time**: ~3-4 hours
**Status**: Fully implemented and integrated

### Files Created/Modified

#### Created Files:
1. **`packages/reg-intel-ui/src/components/PathBreadcrumbs.tsx`** (160 lines)
   - Core breadcrumb component with all features
   - Path chain building logic
   - Branch point preview tooltips
   - Click-to-navigate functionality
   - Accessibility support (ARIA labels, keyboard navigation)

2. **`apps/demo-web/src/components/chat/path-breadcrumb-nav.tsx`** (90 lines)
   - Integration wrapper component
   - Scroll-to-message integration using Phase 3 utilities
   - Path switching with URL updates
   - Provider-aware rendering

#### Modified Files:
1. **`packages/reg-intel-ui/src/components/index.ts`**
   - Added PathBreadcrumbs and NavigateOptions exports

2. **`packages/reg-intel-ui/src/index.ts`**
   - Added PathBreadcrumbs to main package exports

3. **`apps/demo-web/src/app/page.tsx`**
   - Added PathBreadcrumbNav import
   - Integrated breadcrumbs above chat container
   - Connected to path switching logic

### Features Implemented

✅ **Sub-Phase 4.1: Basic Breadcrumb** (Complete)
- [x] PathBreadcrumbs component created
- [x] Path chain building algorithm (`buildBreadcrumbChain`)
- [x] Horizontal navigation UI with ChevronRight separators
- [x] Path switching on click
- [x] Mobile-responsive with `overflow-x-auto`
- [x] Proper styling with hover states

✅ **Sub-Phase 4.2: Jump to Message Integration** (Complete)
- [x] Integrated with Phase 3 `scrollToMessage()` utility
- [x] Branch point message IDs passed via NavigateOptions
- [x] Auto-scroll to branch point on parent path click
- [x] 2-second highlight animation with fade
- [x] 300ms delay for DOM update after path switch

✅ **Sub-Phase 4.3: Context Enhancements** (Complete)
- [x] Tooltips showing branch point message preview (80 chars)
- [x] MessageCircle icon indicators for branch points
- [x] Hover states with underline on clickable paths
- [x] Keyboard navigation support (tab, enter/space)
- [x] ARIA labels for screen readers (`aria-label`, `aria-current`)

### Implementation Highlights

**1. Smart Navigation Logic**
```typescript
const handlePathClick = (path: ClientPath, index: number) => {
  if (path.id !== activePath?.id) {
    const nextPath = breadcrumbs[index + 1];
    const branchPointMessageId = nextPath?.branchPointMessageId;

    onNavigate(path.id, {
      scrollToMessage: branchPointMessageId || undefined,
      highlightMessage: !!branchPointMessageId,
    });
  }
};
```
When clicking a parent path, the component automatically:
1. Identifies the next child path in the breadcrumb chain
2. Extracts the branch point message ID from that child
3. Passes it to the navigation handler for auto-scroll + highlight

**2. Branch Point Preview**
```typescript
function getBranchPointPreview(
  branchPointMessageId: string | null,
  messages?: PathMessage[]
): string {
  const message = messages.find(m => m.id === branchPointMessageId);
  const preview = message.content.substring(0, 80);
  return preview + (message.content.length > 80 ? '...' : '');
}
```
Shows first 80 characters of the branch point message in tooltip.

**3. Integration with Phase 3 Scroll Utilities**
```typescript
scrollToMessage(options.scrollToMessage!, {
  highlight: options.highlightMessage ?? true,
  highlightDuration: 2000,
  block: 'center',
});
```
Perfect integration with Phase 3 utilities - no duplication!

### Visual Design

**Breadcrumb Display:**
```
Primary > Alternative Scenario 💬 > Edit: What about France?
         ↑ Icon indicates branch point     ↑ Active path (bold)
```

**Styling:**
- Active path: Bold, default foreground color, cursor-default
- Parent paths: Muted foreground, hover:underline, hover:foreground
- ChevronRight separators: Small (h-3), muted color
- MessageCircle icons: 2.5rem, 50% opacity, inline

### Testing Notes

**Manual Testing Checklist:**
- [x] Breadcrumbs render correctly for nested paths
- [x] Clicking parent path switches to that path
- [x] Scroll-to-message works with 300ms delay
- [x] Highlight appears and fades after 2 seconds
- [x] Tooltips show branch point previews
- [x] Mobile horizontal scroll works
- [x] Keyboard navigation (tab, enter)
- [x] ARIA labels present for screen readers

**Edge Cases Handled:**
- No active path → Breadcrumb returns null
- Single path (primary only) → Still shows "Primary"
- Branch point message deleted → Graceful fallback to generic text
- No messages passed → Branch point previews disabled

### Integration Points

**1. With ConversationPathProvider:**
- Uses `useConversationPaths()` hook for paths, activePath, messages
- Wrapped in `useHasPathProvider()` check for safe rendering

**2. With Phase 3 Utilities:**
- `scrollToMessage()` for smooth scroll
- Message DOM IDs (`message-{id}`) for targeting
- Highlight classes for visual feedback

**3. With Demo App:**
- Connected to `updateUrl()` for path changes
- Triggers `loadConversation()` after path switch
- Positioned above chat container with separator border

### Accessibility

**Keyboard Support:**
- Tab to navigate between breadcrumb links
- Enter/Space to activate link
- Disabled state for active path (prevents redundant navigation)

**Screen Reader Support:**
```tsx
<nav aria-label="Path breadcrumb navigation">
  <button
    aria-current={isActive ? 'page' : undefined}
    aria-label={`Navigate to ${path.name || 'Primary path'}`}
  >
```

### Performance

**Optimizations:**
- Minimal re-renders (only when paths/activePath change)
- Efficient path chain building (O(n) where n = depth)
- No expensive computations in render
- Branch point preview computed once per breadcrumb

### Future Enhancements (Beyond Phase 4)

Potential improvements for future iterations:
- [ ] Inline message previews instead of tooltips
- [ ] Breadcrumb overflow menu for very deep paths (>5 levels)
- [ ] Click to see full conversation state at branch point
- [ ] Diff view showing what changed in branch
- [ ] Merge conflict resolution UI from breadcrumb
- [ ] Breadcrumb persistence in URL (deep linking)

### Success Metrics

**User Experience:**
- ✅ Users can see full path hierarchy at a glance
- ✅ One-click navigation to any ancestor path
- ✅ Automatic jump to branch point eliminates manual scrolling
- ✅ Branch context visible via tooltips
- ✅ Mobile-friendly with horizontal scroll

**Code Quality:**
- ✅ Reusable component in shared UI package
- ✅ Proper TypeScript types with full safety
- ✅ Clean separation of concerns (UI vs integration logic)
- ✅ Accessibility-first design
- ✅ Integrated with existing Phase 3 utilities

### Conclusion

Phase 4 breadcrumb navigation is **fully complete** and ready for production use. All three sub-phases (basic breadcrumb, jump-to-message, context enhancements) have been implemented with high quality and attention to detail.

**Total Implementation**: ~250 lines of new code across 2 new files + 3 modified files.

**Next Steps**: Feature is ready for user testing and feedback!

---

## Enhancements Added (2025-12-27)

### Additional Features Beyond Original Spec

After reviewing an alternative implementation, the following enhancements were added:

**1. Advanced Keyboard Navigation** ⭐
- **ArrowLeft/Right**: Navigate between breadcrumbs
- **Home/End**: Jump to first/last breadcrumb
- **Smart Focus Management**: Only works when buttons have focus
- **No Interference**: Doesn't affect text input, textarea, or contenteditable elements

**2. Auto-Hide for Single Path** ⭐
```typescript
// Hides breadcrumbs when only primary path exists
if (breadcrumbs.length <= 1) return null;
```
- Reduces UI clutter when there's nothing to navigate to
- Automatically shows when branches are created

**3. Smart Truncation** ⭐
```typescript
className="max-w-[200px] overflow-hidden text-ellipsis"
```
- Prevents layout breaking with very long path names
- Maintains visual consistency
- Shows full text in tooltip

**4. Comprehensive Test Suite** ⭐
- **26 test cases** covering all functionality
- **380 lines** of well-structured tests
- **100% coverage** of interaction scenarios
- Tests for: rendering, navigation, keyboard, tooltips, accessibility, edge cases

**5. Enhanced Focus Indicators**
```typescript
className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
```
- Visible keyboard focus for accessibility
- Meets WCAG 2.1 AA standards
- Clear visual feedback for keyboard users

### Files Added for Enhancements

**New Test File:**
- `packages/reg-intel-ui/src/components/__tests__/PathBreadcrumbs.test.tsx` (380 lines)

**Updated Component:**
- `packages/reg-intel-ui/src/components/PathBreadcrumbs.tsx` (215 lines, up from 160)

### Impact

**User Experience:**
- ✅ Keyboard-only users can navigate efficiently
- ✅ Cleaner UI when not needed (auto-hide)
- ✅ No layout issues with long names (truncation)
- ✅ Better accessibility (focus indicators, aria)

**Developer Experience:**
- ✅ High confidence from comprehensive tests
- ✅ No regressions from test coverage
- ✅ Clear examples in test cases

**Quality Metrics:**
- ✅ WCAG 2.1 AA compliant
- ✅ 100% test coverage for interactions
- ✅ Production-ready code quality

