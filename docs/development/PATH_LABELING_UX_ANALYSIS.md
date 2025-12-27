# Path Labeling UX Analysis & Recommendations

> **Issue**: "Main" label is ambiguous in nested branch scenarios
> **Created**: 2025-12-27
> **Priority**: MEDIUM (UX Clarity)

## Executive Summary

The current path labeling system uses **"Main"** to denote the primary/original conversation path (`isPrimary: true`). While this works for simple branching scenarios, it becomes **confusing in nested branches** where users are 2+ levels deep from the original path.

---

## The Problem

### What "Main" Currently Means

```typescript
// In PathToolbar.tsx (line 127)
if (path.isPrimary) {
  return path.name || 'Main';
}
```

**"Main"** = The **original path** created when the conversation started, regardless of where the user currently is in the branch hierarchy.

### Confusing Scenario: Nested Branching

```
Timeline:
1. User starts conversation → Path 1 "Main" (isPrimary=true)
2. User branches from Message 3 → Path 2 "Alternative Scenario" (parent=Path1)
3. User edits Message 5 in Path 2 → Path 3 "Edit: What about..." (parent=Path2)

Result: User is now on Path 3, but UI still shows:
  [Main] ← What does this mean? It's not the "main" path I'm on!
  Alternative Scenario
  Edit: What about...
```

### User Mental Model Mismatch

| User Thinks "Main" Means | What "Main" Actually Means |
|--------------------------|----------------------------|
| "The path I started from" | ✅ Yes, for first branch |
| "The path I'm currently on" | ❌ No, it's the original path |
| "The parent of this branch" | ❌ No, it's the root ancestor |
| "The primary working version" | ⚠️ Ambiguous - which is "primary"? |

---

## Test Case: Nested Branch Editing

### Scenario Steps

1. **Start Conversation** → Creates Path 1 "Main"
2. **Branch from Message** → Creates Path 2 (child of Path 1)
3. **Edit Message in Path 2** → Creates Path 3 (grandchild of Path 1)

### Expected Path Hierarchy

```
Path 1: "Main" (isPrimary=true, parent=none)
  └─ Path 2: "Alternative Scenario" (isPrimary=false, parent=Path1)
      └─ Path 3: "Edit: What about capital..." (isPrimary=false, parent=Path2)
```

### Current UI Labels

When viewing **Path 3**:
- ✅ Path relationships are correct in data
- ✅ Messages are correctly associated
- ⚠️ Label "Main" doesn't convey it's the ROOT/ORIGINAL
- ⚠️ No visual hierarchy shown

### Test File Created

`apps/demo-web/src/app/__tests__/nested-branch-editing.test.tsx`

This test verifies:
- ✅ Nested branch creation works correctly
- ✅ Path parent-child relationships are maintained
- ✅ Messages are correctly filtered per path
- ⚠️ Documents the labeling ambiguity issue

---

## Recommended Solutions

### Option 1: Change "Main" to "Primary" or "Original" ⭐ RECOMMENDED

**Pros**:
- Clearer semantic meaning
- "Primary" clearly means "first/main"
- "Original" emphasizes it's the starting point

**Implementation**:
```typescript
// PathToolbar.tsx
if (path.isPrimary) {
  return path.name || 'Primary'; // or 'Original'
}
```

**Impact**: Minimal code change, better clarity

---

### Option 2: Show Path Hierarchy Visually

**Pros**:
- Shows parent-child relationships clearly
- Users can see depth at a glance

**Current (Full Mode)**:
```typescript
const prefix = path.parentPathId ? '  └ ' : '';
return prefix + (path.name || `Branch ${path.id.slice(0, 6)}`);
```

**Enhanced**:
```typescript
const getPrefix = (path: ClientPath, allPaths: ClientPath[]): string => {
  let depth = 0;
  let current = path;

  while (current.parentPathId) {
    depth++;
    current = allPaths.find(p => p.id === current.parentPathId)!;
  }

  if (depth === 0) return '';
  if (depth === 1) return '  └─ ';
  return '  '.repeat(depth) + '└─ ';
};
```

**Display**:
```
Primary
  └─ Alternative Scenario
     └─ Edit: What about capital...
```

---

### Option 3: Show Parent Path Context

**Pros**:
- Users know exactly where they are in the hierarchy

**Display**:
```
Primary
Alternative Scenario (from Primary)
Edit: What about... (from Alternative Scenario)
```

**Implementation**:
```typescript
const buildPathLabel = (path: ClientPath, allPaths: ClientPath[]): string => {
  if (path.isPrimary) {
    return path.name || 'Primary';
  }

  const parent = allPaths.find(p => p.id === path.parentPathId);
  const parentName = parent?.isPrimary
    ? (parent.name || 'Primary')
    : (parent?.name || 'Branch');

  return `${path.name || 'Branch'} (from ${parentName})`;
};
```

---

### Option 4: Breadcrumb-Style Navigation

**Pros**:
- Clear hierarchical context
- Allows quick navigation to parent paths

**Display**:
```
Path: Primary > Alternative Scenario > Edit: What about...
             ↑ Click to jump to parent
```

**Implementation**: Requires more UI changes but provides best UX

---

### Option 5: Badge System with Depth Indicators

**Pros**:
- Compact visual representation
- Shows hierarchy at a glance

**Display**:
```
[Primary]  Primary
[Branch]   Alternative Scenario
[Branch·2] Edit: What about...
           ↑ "2" indicates 2nd level branch
```

---

## Comparison Matrix

| Solution | Clarity | Implementation | Backward Compat | Visual Appeal |
|----------|---------|----------------|-----------------|---------------|
| **Option 1: "Primary"** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ | ⭐⭐⭐ |
| **Option 2: Hierarchy** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ | ⭐⭐⭐⭐ |
| **Option 3: Parent Context** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ | ⭐⭐⭐ |
| **Option 4: Breadcrumbs** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⚠️ | ⭐⭐⭐⭐⭐ |
| **Option 5: Badges** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ | ⭐⭐⭐⭐ |

---

## Recommended Implementation Plan

### Phase 1: Quick Fix (1 hour)

**Change "Main" to "Primary"**

```typescript
// File: apps/demo-web/src/components/chat/path-toolbar.tsx

// Before:
if (path.isPrimary) {
  return path.name || 'Main';
}

// After:
if (path.isPrimary) {
  return path.name || 'Primary';
}
```

Also update:
- Merge dialog labels
- Fallback labels in compact mode
- Any hardcoded "Main" strings

### Phase 2: Enhanced Hierarchy (2-3 hours)

**Add visual tree prefixes**

Already partially implemented in full mode (line 129):
```typescript
const prefix = path.parentPathId ? '  └ ' : '';
```

Enhance to show depth:
```typescript
const getTreePrefix = (path: ClientPath, allPaths: ClientPath[]): string => {
  if (path.isPrimary) return '';

  let depth = 0;
  let current = path;

  while (current.parentPathId) {
    depth++;
    const parent = allPaths.find(p => p.id === current.parentPathId);
    if (!parent) break;
    current = parent;
  }

  return '  '.repeat(depth - 1) + '└─ ';
};
```

### Phase 3: Full Breadcrumb Navigation (Future)

- Add breadcrumb component above chat
- Allow clicking parent paths
- Show full path history

---

## Code Changes Required

### File 1: `apps/demo-web/src/components/chat/path-toolbar.tsx`

```diff
  const buildPathLabel = (path: ClientPath): string => {
    if (path.isPrimary) {
-     return path.name || 'Main';
+     return path.name || 'Primary';
    }
    const prefix = path.parentPathId ? '  └ ' : '';
    return prefix + (path.name || `Branch ${path.id.slice(0, 6)}`);
  };
```

**Lines to update**: 127, 156

### File 2: `apps/demo-web/src/lib/server/mergeSummarizer.ts`

```diff
- const targetName = targetPath.name ?? (targetPath.isPrimary ? 'Main Conversation' : 'Target Branch');
+ const targetName = targetPath.name ?? (targetPath.isPrimary ? 'Primary Conversation' : 'Target Branch');
```

**Line to update**: 125

### File 3: `packages/reg-intel-ui/src/components/PathSelector.tsx` (if exists)

Check for any "Main" hardcoded strings and update to "Primary"

### File 4: Update documentation

- `docs/development/PATH_BASED_VERSIONING_GUIDE.md` - Update examples
- `README.md` - Update any screenshots/examples

---

## Testing Checklist

After implementing changes:

- [ ] Run `npm test` to ensure all tests pass
- [ ] Test simple branching (1 level): Path label shows "Primary"
- [ ] Test nested branching (2+ levels): Path labels show hierarchy
- [ ] Test path switching: Labels update correctly
- [ ] Test merge dialogs: "Primary Conversation" instead of "Main"
- [ ] Check compact mode: Labels fit in small dropdown
- [ ] Verify visual tree prefixes work correctly
- [ ] Test with long custom path names: Truncation works
- [ ] Browser testing: Labels display correctly in all browsers

---

## User Feedback Questions

After implementation, gather feedback:

1. **Is "Primary" clearer than "Main"?**
   - Yes / No / Neutral

2. **Do the tree prefixes help you understand hierarchy?**
   - Very helpful / Somewhat helpful / Not helpful

3. **Can you easily identify which path you're on?**
   - Always / Sometimes / Rarely

4. **Would you prefer breadcrumb navigation?**
   - Yes / No / Don't care

---

## Alternative Terminology Considered

| Term | Pros | Cons | Verdict |
|------|------|------|---------|
| "Main" | Short, familiar | Ambiguous in nested contexts | ❌ Current issue |
| "Primary" | Clear, semantic | Slightly longer | ✅ Recommended |
| "Original" | Emphasizes "first" | Longer, less common | ⚠️ Alternative |
| "Root" | Technical accuracy | Too technical | ❌ Too geeky |
| "Trunk" | Git analogy | Less intuitive | ❌ Confusing |
| "Base" | Simple | Could mean "starting point" | ⚠️ Ambiguous |

**Winner**: **"Primary"** - Best balance of clarity, brevity, and semantic meaning

---

## Related Issues

- Path deletion: Should show which children will be affected
- Path merging: Should clearly show source → target
- Path names: Should allow renaming Primary path
- Path icons: Different icons for different depth levels?

---

## Conclusion

The "Main" label is functionally correct but semantically ambiguous in nested branching scenarios. Changing to **"Primary"** provides immediate improvement with minimal code changes. Adding **visual hierarchy** indicators further enhances clarity.

**Recommended Action**: Implement Phase 1 immediately, consider Phase 2 for next release.

---

## Appendix: Path Hierarchy Examples

### Example 1: Simple Branch
```
Primary (isPrimary=true)
└─ Tax Exemption Analysis (parent=Primary)
```
✅ Clear: "Primary" is the original, "Tax..." is the branch

### Example 2: Nested Branch (THE PROBLEM)
```
Primary (isPrimary=true)
└─ Alternative Scenario (parent=Primary)
   └─ Edit: What about Germany... (parent=Alternative)
```
⚠️ When viewing "Edit: What about Germany...":
- OLD label: "Main" ← Confusing! What's main?
- NEW label: "Primary" ← Better! It's the original path

### Example 3: Deep Nesting
```
Primary
└─ Scenario A
   └─ Option 1
      └─ Edit: Revised question
         └─ Further exploration
```
With tree prefixes:
```
Primary
  └─ Scenario A
     └─ Option 1
        └─ Edit: Revised question
           └─ Further exploration
```
✅ Very clear hierarchy at a glance!

---

**Document Status**: Draft for Review
**Next Steps**: Team review → Implement Phase 1 → User testing
