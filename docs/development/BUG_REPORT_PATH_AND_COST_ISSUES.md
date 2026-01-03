# Bug Report - Path Branching & Cost Tracking Issues

> **Status**: 🔴 Critical UX Bugs Identified
> **Date**: 2026-01-03
> **Affected Areas**: Path/Branch UI, Cost Analytics, Build System

---

## Executive Summary

Multiple critical UX bugs have been identified in the path branching system and cost tracking after merging implementation tasks to main. These issues are blocking normal user workflows.

### Issue Categories

| Category | Severity | Count | Status |
|----------|----------|-------|--------|
| **Path UI Crashes** | 🔴 Critical | 1 | Investigating |
| **UI State Sync** | 🔴 Critical | 2 | Investigating |
| **Cost Tracking** | 🔴 Critical | 1 | Root cause identified |
| **Build System** | 🟡 High | 1 | Root cause identified |

---

## Table of Contents

1. [Critical Bugs](#1-critical-bugs)
2. [Root Cause Analysis](#2-root-cause-analysis)
3. [Reproduction Steps](#3-reproduction-steps)
4. [Proposed Fixes](#4-proposed-fixes)
5. [Additional Issues](#5-additional-issues)

---

## 1. Critical Bugs

### Bug 1: UI Crashes When Selecting Different Branch in Dropdown

**Status**: 🔴 Critical
**Component**: `PathToolbar` component (`apps/demo-web/src/components/chat/path-toolbar.tsx`)

**Symptom**:
- When user selects a different branch from the path dropdown, the UI crashes
- Application becomes unresponsive
- No error message shown to user

**User Report**:
> "when I select a difference branch in the UI select dropdown the UI crashes"

**Affected Code**:
```typescript
// apps/demo-web/src/components/chat/path-toolbar.tsx:112-118
const handlePathChange = async (pathId: string) => {
  await switchPath(pathId);
  const newPath = paths.find(p => p.id === pathId);
  if (newPath && onPathSwitch) {
    onPathSwitch(newPath);
  }
};
```

**Likely Causes**:
1. **Uncaught Promise Rejection**: `switchPath()` may be throwing an error that isn't caught
2. **State Update After Unmount**: Component may be unmounting before async operation completes
3. **Provider Context Lost**: `useConversationPaths()` may lose context during path switch
4. **Missing Error Boundary**: No error boundary to catch and display errors gracefully

**Evidence Needed**:
- Browser console errors during crash
- Network request failures (check /api/conversations/[id]/active-path)
- React DevTools component tree state

---

### Bug 2: UI Doesn't Refresh After Edit Creates New Path/Branch

**Status**: 🔴 Critical
**Component**: Message editing flow, `ConditionalPathProvider`

**Symptom**:
- User edits a message and creates a new path/branch
- New path is created successfully (confirmed by API response)
- New path is marked as active in backend
- UI does not update to show new path content
- User still sees old path messages

**User Report**:
> "when i edit a message and create a new path /branch the UI does not refresh with the new path content even thought the new path branch is marked as active and is returned in the Api responses"

**Affected Flow**:
```
User edits message
  → POST /api/conversations/[id]/messages/[messageId]
  → New branch created
  → activePathId updated in database
  → Response includes new messages
  → ❌ UI doesn't refresh
```

**Root Cause (Likely)**:
The `loadConversation` function loads messages but doesn't trigger path provider to reload:

```typescript
// apps/demo-web/src/app/page.tsx:413-457
const loadConversation = useCallback(
  async (id: string) => {
    // ... loads messages ...
    setMessages(loadedMessages)  // ❌ This doesn't trigger path provider reload
    // ... sets other state ...
  },
  [isAuthenticated]
)
```

**Missing**:
- No path provider invalidation after message edit
- No explicit path list refresh after branch creation
- `ConversationPathProvider` may cache stale path data

**Expected Behavior**:
1. After edit creates new branch, `ConditionalPathProvider` should:
   - Detect new `conversationId` or receive explicit reload signal
   - Re-fetch path list from `/api/conversations/[id]/paths`
   - Update `activePath` to new branch
   - Display new branch messages

---

### Bug 3: Conversation Doesn't Show Active Path on Load

**Status**: 🔴 Critical
**Component**: Conversation loading, active path resolution

**Symptom**:
- User loads a conversation
- Backend returns `activePathId` pointing to a branch
- UI ignores `activePathId` and shows primary path messages instead
- User must manually select correct branch from dropdown

**User Report**:
> "when i load a conversation it does not show the active path in the UI it shows the original path conversation messages. Once a path is marked as the active path then the UI should load that by default unless a user changes to it."

**Root Cause (Confirmed)**:

**Backend is correct** - returns active path messages:
```typescript
// apps/demo-web/src/app/api/conversations/[id]/route.ts:62-66
// Get path-aware messages which include branch metadata
const messages = await conversationPathStore.resolvePathMessages({
  tenantId,
  pathId: conversation.activePathId,  // ✅ Uses activePathId
});
```

**Frontend ignores activePathId** - doesn't tell provider which path is active:
```typescript
// apps/demo-web/src/app/page.tsx:413-457
const loadConversation = useCallback(
  async (id: string) => {
    // ... fetches conversation ...
    setMessages(loadedMessages)  // ❌ No activePathId passed to provider
    // ❌ Provider doesn't know which path should be active
  },
  [isAuthenticated]
)
```

**Issue**:
- `ConditionalPathProvider` initializes without knowing the `activePathId`
- Provider defaults to primary path
- Messages from `activePathId` are loaded but not displayed because provider thinks primary is active

**Fix Required**:
1. Extract `activePathId` from API response
2. Pass it to `ConditionalPathProvider` as initial active path
3. OR: Have provider fetch active path from `/api/conversations/[id]/active-path` on mount

---

### Bug 4: Cost Page APIs Return 503 "Not Initialized"

**Status**: 🔴 Critical
**Component**: Cost tracking initialization, Supabase connection

**Symptom**:
- All cost API endpoints return `503 Service Unavailable`
- Error message: "Cost tracking storage not initialized"
- Cost analytics dashboard shows no data

**User Report**:
> "Also the cost page all the apis return a 503 and say there not initialized"

**Root Cause (Confirmed)**:

**Check in API**:
```typescript
// apps/demo-web/src/app/api/costs/aggregate/route.ts:41-48
const costService = getCostTrackingServiceIfInitialized();

if (!costService || !costService.hasStorage()) {
  return NextResponse.json(
    { error: 'Cost tracking storage not initialized' },
    { status: 503 }  // ❌ This is being returned
  );
}
```

**Initialization code exists but may not be called**:
```typescript
// apps/demo-web/src/lib/costTracking.ts:135
export const initializeCostTracking = (): void => {
  // ... initialization logic ...
}
```

**Problem**:
- `initializeCostTracking()` is **exported** but **never imported/called**
- No initialization in Next.js app startup (no import in layout.tsx, middleware, or instrumentation.ts)
- Cost service remains uninitialized

**Missing**:
```typescript
// apps/demo-web/src/app/layout.tsx or instrumentation.ts
import { initializeCostTracking } from '@/lib/costTracking';

// Call during app initialization
initializeCostTracking();
```

**Supabase Credentials**:
The initialization also requires:
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_KEY`

If credentials are missing, initialization logs a warning and skips setup.

---

### Bug 5: Build Error - Missing @supabase/supabase-js Types

**Status**: 🟡 High
**Component**: Build system, TypeScript compilation

**Symptom**:
```
packages/reg-intel-observability build: src/compactionStorage.ts(18,51): error TS2307: Cannot find module '@supabase/supabase-js' or its corresponding type declarations.
packages/reg-intel-observability build: src/costTracking/supabaseProviders.ts(22,37): error TS2307: Cannot find module '@supabase/supabase-js' or its corresponding type declarations.
```

**Root Cause**:
- `@supabase/supabase-js` **is declared** in `package.json`: `"@supabase/supabase-js": "^2.45.0"`
- `@supabase/supabase-js` **is in pnpm-lock.yaml**: `version: 2.86.0`
- **But TypeScript can't find it** - likely `node_modules` corruption or pnpm install issue

**Fix**:
```bash
# Clean and reinstall dependencies
rm -rf node_modules
rm -rf packages/*/node_modules
rm -rf apps/*/node_modules
pnpm install

# Rebuild
pnpm build
```

---

## 2. Root Cause Analysis

### Path UI Issues - Common Pattern

All three path-related bugs stem from **state synchronization** problems:

1. **Backend State**: Database has correct `activePathId`, messages, path list
2. **API Response**: APIs return correct data
3. **Frontend State**: React state (`messages`, `conversationId`) updates
4. **Provider State**: `ConversationPathProvider` doesn't sync with frontend state
5. **UI Display**: Shows stale data because provider state is out of sync

**Architecture Gap**:
- `ConditionalPathProvider` wraps the chat UI
- Provider manages its own `activePath` state
- `loadConversation()` updates parent `messages` state
- **No mechanism to sync provider state with parent state**

**Example**:
```tsx
// Parent component (page.tsx)
const [messages, setMessages] = useState([]);
const [conversationId, setConversationId] = useState(null);

// Loads conversation and updates messages
const loadConversation = async (id) => {
  const data = await fetch(`/api/conversations/${id}`);
  setMessages(data.messages);  // ✅ Messages update
  setConversationId(id);       // ✅ Conversation ID updates
  // ❌ But ConditionalPathProvider doesn't know to reload
};

return (
  <ConditionalPathProvider conversationId={conversationId}>
    {/* Provider has its own activePath state that doesn't update */}
    <PathAwareMessageList messages={messages} />
  </ConditionalPathProvider>
);
```

**Solution Approaches**:

**Option A: Provider Key Reset** (Quick Fix)
```tsx
// Force provider to remount when conversation changes
<ConditionalPathProvider
  key={`${conversationId}-${pathReloadCounter}`}
  conversationId={conversationId}
>
```

**Option B: Explicit Reload Method** (Better)
```tsx
// Provider exposes reload method via ref
const pathProviderRef = useRef();

const loadConversation = async (id) => {
  // ... load data ...
  await pathProviderRef.current?.reload();
};

<ConditionalPathProvider
  ref={pathProviderRef}
  conversationId={conversationId}
>
```

**Option C: Event-Based Sync** (Best)
```tsx
// Use event hub for cross-component communication
const loadConversation = async (id) => {
  // ... load data ...
  eventHub.emit('conversation:loaded', { conversationId: id, activePathId });
};

// Provider listens for event and reloads
```

---

### Cost Tracking - Initialization Gap

**Problem**: Initialization function exists but is never called

**Where Initialization Should Happen**:

**Option 1: Next.js Instrumentation Hook** (Recommended)
```typescript
// apps/demo-web/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeCostTracking } = await import('./src/lib/costTracking');
    initializeCostTracking();
  }
}
```

**Option 2: Root Layout** (Alternative)
```typescript
// apps/demo-web/src/app/layout.tsx
import { initializeCostTracking } from '@/lib/costTracking';

// Only initialize on server
if (typeof window === 'undefined') {
  initializeCostTracking();
}
```

**Option 3: Middleware** (For API routes only)
```typescript
// apps/demo-web/middleware.ts
import { initializeCostTracking } from '@/lib/costTracking';

// Initialize before any API requests
initializeCostTracking();
```

---

## 3. Reproduction Steps

### Bug 1: UI Crash on Branch Selection

**Steps**:
1. Open conversation with multiple branches
2. Note current branch in dropdown (e.g., "Primary")
3. Click branch dropdown
4. Select different branch (e.g., "Branch abc123")
5. **Expected**: UI switches to new branch
6. **Actual**: UI freezes/crashes, console shows error

**Environment**:
- Browser: Any
- Conversation: Must have 2+ paths

### Bug 2: UI Not Refreshing After Edit

**Steps**:
1. Open conversation with existing messages
2. Hover over a message, click "Edit"
3. Modify message text, submit edit
4. Backend creates new branch (check network tab: 200 OK)
5. **Expected**: UI shows new branch with edited message
6. **Actual**: UI still shows old branch, must manually select new branch

**API Evidence**:
```json
// POST /api/conversations/abc/messages/xyz response
{
  "newBranch": {
    "id": "path_new123",
    "isActive": true  // ✅ Backend sets as active
  },
  "messages": [ /* new branch messages */ ]
}
```

### Bug 3: Active Path Not Loaded

**Steps**:
1. Create conversation, create a branch (not primary)
2. Set branch as active via API or UI
3. Close conversation (navigate away)
4. Reload conversation from conversation list
5. **Expected**: UI shows active branch messages
6. **Actual**: UI shows primary path messages

**API Evidence**:
```json
// GET /api/conversations/abc response
{
  "conversation": {
    "activePathId": "path_branch123"  // ✅ Backend knows active path
  },
  "messages": [ /* messages from path_branch123 */ ]  // ✅ Correct messages
}
```

### Bug 4: Cost Page 503 Errors

**Steps**:
1. Navigate to `/analytics/costs`
2. Page shows loading state
3. Multiple API calls fail with 503
4. Dashboard shows "No data" or error state

**Network Tab**:
```
GET /api/costs/total → 503
GET /api/costs/aggregate → 503
GET /api/costs/quotas → 503
```

**Response**:
```json
{
  "error": "Cost tracking storage not initialized"
}
```

### Bug 5: Build Error

**Steps**:
1. Run `npm run build` or `pnpm build`
2. Build fails during TypeScript compilation
3. Error: Cannot find module '@supabase/supabase-js'

---

## 4. Proposed Fixes

### Fix 1: Add Error Boundary and Defensive Coding to PathToolbar

**File**: `apps/demo-web/src/components/chat/path-toolbar.tsx`

**Changes**:

1. **Wrap async operation in try-catch**:
```typescript
const handlePathChange = async (pathId: string) => {
  try {
    setIsLoading(true);  // Add loading state
    await switchPath(pathId);
    const newPath = paths.find(p => p.id === pathId);
    if (newPath && onPathSwitch) {
      onPathSwitch(newPath);
    }
  } catch (error) {
    console.error('Failed to switch path:', error);
    // Show error toast/notification to user
    // Revert to previous path
  } finally {
    setIsLoading(false);
  }
};
```

2. **Add error boundary around PathToolbar**:
```tsx
// apps/demo-web/src/app/page.tsx
<ErrorBoundary fallback={<div>Path toolbar error</div>}>
  <PathToolbar onPathSwitch={handlePathSwitch} />
</ErrorBoundary>
```

3. **Add loading state to select**:
```tsx
<Select
  value={activePath?.id || ''}
  onValueChange={handlePathChange}
  disabled={isLoading || isSwitchingPath}  // Disable during switch
>
```

---

### Fix 2: Sync Provider State After Edit Creates Branch

**File**: `apps/demo-web/src/app/page.tsx`

**Approach A: Force Provider Remount**
```tsx
// Add state for forcing provider reload
const [pathReloadKey, setPathReloadKey] = useState(0);

// After edit creates branch
const handleMessageEdit = async (messageId, newContent) => {
  // ... edit logic ...
  if (response.newBranch) {
    await loadConversation(conversationId);
    setPathReloadKey(prev => prev + 1);  // Force provider remount
  }
};

// Use key to force remount
<ConditionalPathProvider
  key={`${conversationId}-${pathReloadKey}`}
  conversationId={conversationId}
  apiClient={pathApiClient}
>
```

**Approach B: Add Reload Callback to Provider**
```tsx
// Modify ConditionalPathProvider to expose reload
const pathProviderRef = useRef<{ reload: () => Promise<void> }>(null);

const handleMessageEdit = async (messageId, newContent) => {
  // ... edit logic ...
  if (response.newBranch) {
    await loadConversation(conversationId);
    await pathProviderRef.current?.reload();  // Explicitly reload provider
  }
};

<ConditionalPathProvider
  ref={pathProviderRef}
  conversationId={conversationId}
  apiClient={pathApiClient}
>
```

---

### Fix 3: Pass Active Path ID to Provider on Load

**File**: `apps/demo-web/src/app/page.tsx`

**Changes**:

1. **Extract activePathId from API response**:
```typescript
const loadConversation = useCallback(
  async (id: string) => {
    if (!isAuthenticated) return
    const response = await fetch(`/api/conversations/${id}`, {
      credentials: 'include',
    })
    if (!response.ok) return
    const payload: ConversationPayload = await response.json()

    // Extract active path ID
    const activePathId = payload.conversation?.activePathId;

    const loadedMessages: ChatMessage[] = (payload.messages ?? []).map(msg => ({
      // ... existing mapping ...
    }))

    setMessages(loadedMessages)
    setConversationId(id)
    setActivePathId(activePathId);  // Store active path ID

    // ... rest of function ...
  },
  [isAuthenticated]
)
```

2. **Modify ConditionalPathProvider to accept initialActivePathId**:
```tsx
// Update ConditionalPathProvider component
<ConditionalPathProvider
  conversationId={conversationId}
  initialActivePathId={activePathId}  // Pass initial active path
  apiClient={pathApiClient}
  onPathChange={onPathChange}
  onError={onError}
>
```

3. **Update ConditionalPathProvider implementation**:
```tsx
// apps/demo-web/src/components/chat/conditional-path-provider.tsx
export function ConditionalPathProvider({
  conversationId,
  initialActivePathId,  // Add prop
  apiClient,
  onPathChange,
  onError,
  children,
}: ConditionalPathProviderProps) {
  if (!conversationId) {
    return <>{children}</>;
  }

  return (
    <ConversationPathProvider
      conversationId={conversationId}
      initialActivePathId={initialActivePathId}  // Pass to provider
      apiClient={apiClient}
      onPathChange={onPathChange}
      onError={onError}
    >
      {children}
    </ConversationPathProvider>
  );
}
```

---

### Fix 4: Initialize Cost Tracking on App Startup

**Option A: Create instrumentation.ts** (Recommended for Next.js 13+)

**File**: `apps/demo-web/instrumentation.ts` (create new)
```typescript
/**
 * Next.js Instrumentation Hook
 *
 * Called once when the server starts, before any requests are handled.
 * Perfect for one-time initialization like cost tracking setup.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Import only on server
    const { initializeCostTracking } = await import('./src/lib/costTracking');

    console.log('[Instrumentation] Initializing cost tracking...');
    initializeCostTracking();
    console.log('[Instrumentation] Cost tracking initialized');
  }
}
```

**File**: `apps/demo-web/next.config.js` (update)
```javascript
const nextConfig = {
  // Enable instrumentation hook
  experimental: {
    instrumentationHook: true,
  },
  // ... rest of config ...
};
```

**Option B: Initialize in Root Layout** (Alternative)

**File**: `apps/demo-web/src/app/layout.tsx`
```tsx
import { initializeCostTracking } from '@/lib/costTracking';

// Initialize cost tracking once on server
if (typeof window === 'undefined') {
  initializeCostTracking();
}

export default function RootLayout({ children }) {
  // ... rest of layout ...
}
```

**Environment Variables Required**:
```env
# .env.local
SUPABASE_URL=http://localhost:54321  # For local Supabase
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Optional: Notification channels
COST_ALERT_CHANNELS=slack,email
COST_ALERT_SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

**Verification**:
1. Start dev server: `npm run dev`
2. Check console for: `[Instrumentation] Cost tracking initialized`
3. Navigate to `/analytics/costs`
4. APIs should return 200 with data (or empty arrays if no usage yet)

---

### Fix 5: Fix Build Error - Reinstall Dependencies

**Steps**:
```bash
# Clean all node_modules
rm -rf node_modules
rm -rf packages/*/node_modules
rm -rf apps/*/node_modules

# Clean build artifacts
rm -rf packages/*/dist
rm -rf apps/demo-web/.next

# Reinstall dependencies
pnpm install

# Verify @supabase/supabase-js is installed
ls node_modules/@supabase/supabase-js

# Rebuild
pnpm build
```

**If error persists**:
```bash
# Force reinstall specific package
pnpm add @supabase/supabase-js@^2.45.0 --filter @reg-copilot/reg-intel-observability

# Rebuild
pnpm build
```

**Verify**:
```bash
# Should complete without TypeScript errors
pnpm build

# Should show types are available
pnpm exec tsc --noEmit
```

---

## 5. Additional Issues

### Potential Bug 6: ConversationPathProvider May Not Handle Initial Load

**Location**: `@reg-copilot/reg-intel-ui` package
**File**: Likely `packages/reg-intel-ui/src/providers/ConversationPathProvider.tsx`

**Issue**:
Provider may be loading paths but not waiting for API to return before rendering children, leading to:
- Initial render with empty `paths` array
- Second render after paths load
- Race condition if parent also loads conversation simultaneously

**Investigation Needed**:
- Check if provider has loading state
- Verify if provider waits for initial paths fetch
- Check if provider supports `initialActivePathId` prop

---

### Potential Bug 7: Path API Client May Have Caching Issues

**Location**: `apps/demo-web/src/lib/pathApiClient.ts`

**Issue**:
API client may cache path list and not invalidate cache when:
- New branch is created
- Active path is changed
- Messages are edited

**Investigation Needed**:
```typescript
// Check for cache invalidation logic
const pathApiClient = getPathApiClient();

// Does it have cache clear methods?
pathApiClient.invalidateCache?.(conversationId);
pathApiClient.refetch?.(conversationId);
```

---

### Potential Bug 8: Message Edit May Not Return New Branch Info

**Location**: `apps/demo-web/src/app/api/conversations/[id]/messages/[messageId]/route.ts`

**Issue**:
When editing creates a new branch, the API response may not include:
- New branch ID
- New branch active status
- Updated path list

**Investigation Needed**:
Check API response format:
```typescript
// Expected response when edit creates branch
{
  "message": { /* edited message */ },
  "newBranch": {
    "id": "path_abc",
    "name": "Edit from ...",
    "isActive": true,
    "parentPathId": "path_primary"
  },
  "updatedPaths": [ /* full path list */ ]
}
```

---

## 6. Testing Checklist

### Test Case 1: Branch Switching
- [ ] Can switch from primary to branch without crash
- [ ] Can switch from branch to branch without crash
- [ ] Can switch from branch to primary without crash
- [ ] Error is shown gracefully if switch fails
- [ ] Loading state is shown during switch
- [ ] Message list updates to show new branch content
- [ ] Dropdown shows correct active branch after switch

### Test Case 2: Message Edit Creating Branch
- [ ] Edit message creates new branch
- [ ] UI automatically switches to new branch
- [ ] New branch shows in dropdown
- [ ] Edited message is visible
- [ ] Path breadcrumb updates
- [ ] Can switch back to original branch

### Test Case 3: Active Path Loading
- [ ] Load conversation with active path = primary → shows primary
- [ ] Load conversation with active path = branch → shows branch
- [ ] Dropdown shows correct active path
- [ ] URL includes pathId parameter if non-primary
- [ ] Refresh page maintains active path

### Test Case 4: Cost Tracking
- [ ] Cost page loads without 503 errors
- [ ] Dashboard shows cost metrics (or "No data")
- [ ] Can query costs by date range
- [ ] Can export to CSV
- [ ] Quota status displays correctly
- [ ] Notifications work (if configured)

### Test Case 5: Build System
- [ ] `pnpm install` completes successfully
- [ ] `pnpm build` completes without errors
- [ ] All packages compile
- [ ] Type checking passes
- [ ] Can start dev server

---

## 7. Priority & Impact

| Bug | Priority | Impact | Users Affected | Workaround Available |
|-----|----------|--------|----------------|---------------------|
| Bug 1: Branch selection crash | P0 | High | All users with branches | None - feature broken |
| Bug 2: UI not refreshing | P0 | High | All users editing messages | Manual branch selection |
| Bug 3: Active path not loading | P1 | Medium | Users switching conversations | Manual branch selection |
| Bug 4: Cost 503 errors | P0 | High | Platform admins, billing | None - feature broken |
| Bug 5: Build error | P1 | Medium | Developers | Workaround: skip build check |

---

## 8. Recommended Fix Order

1. **Bug 5 first** - Fix build error so we can develop/test properly
2. **Bug 4 second** - Initialize cost tracking for revenue/billing
3. **Bug 1 third** - Fix crash to unblock basic branching
4. **Bug 2 fourth** - Fix UI refresh for editing workflow
5. **Bug 3 fifth** - Fix active path loading for better UX

**Estimated Effort**:
- Bug 5: 15 minutes (dependency reinstall)
- Bug 4: 30 minutes (add instrumentation hook)
- Bug 1: 1-2 hours (error handling + testing)
- Bug 2: 2-3 hours (state sync mechanism)
- Bug 3: 1-2 hours (pass activePathId through)

**Total**: ~5-8 hours of development

---

## 9. Next Steps

1. **Immediate**: Run dependency reinstall to fix build
2. **Immediate**: Add instrumentation hook for cost tracking
3. **Create issues**: File GitHub issues for each bug with reproduction steps
4. **Assign**: Assign bugs to developers
5. **Test**: Set up test environment with multiple branches
6. **Fix**: Implement fixes in order of priority
7. **Verify**: Run full regression test suite
8. **Deploy**: Deploy fixes to staging, then production

---

**Document Status**: Ready for Action
**Created**: 2026-01-03
**Last Updated**: 2026-01-03
