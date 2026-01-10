# Branch Navigation Regression Tests

This document describes the regression test suite for critical branch navigation bugs that were fixed.

## Test Files Created

1. **`apps/demo-web/src/app/__tests__/branch-navigation-regression.test.tsx`**
   - Integration tests for all three bug fixes
   - Tests complete user flows with mocked API responses

2. **`packages/reg-intel-ui/src/components/__tests__/PathBreadcrumbs.test.tsx`**
   - Component-level tests for breadcrumb functionality
   - Tests keyboard navigation and accessibility

3. **Updated `apps/demo-web/vitest.config.ts`**
   - Added `.tsx` file support to test include pattern

## Bugs Covered

### BUG #1: Version Switching Message Disappears
**Test Coverage:**
- `should display actual message content for messages with branches`
- `should not create synthetic version messages when message has branches`

**What it tests:**
- Messages always show actual content, not `[Branch 1]` placeholders
- No synthetic branch preview messages are created
- Version navigation arrows don't appear (since synthetic versions were removed)

### BUG #2: View Branch Button Does Not Navigate
**Test Coverage:**
- `should navigate to branch in current window when View Branch is clicked`
- `should update URL with pathId when navigating to branch`

**What it tests:**
- `window.open()` is NOT called (verifies no new tab opens)
- `history.pushState()` IS called with pathId parameter
- Navigation happens in current window

### BUG #3: Path Dropdown Defaults to Wrong Branch
**Test Coverage:**
- `should update path dropdown when navigating to branch via View Branch button`
- `should reload path provider when path changes`

**What it tests:**
- Path dropdown shows correct active path after navigation
- ConversationPathProvider reloads when path changes
- Fetch is called to reload conversation data with new path

### Enhancement: Breadcrumbs Show On Main Path
**Test Coverage:**
- `should render breadcrumbs when on main path (regression test for enhancement)`
- `should show "Main" in breadcrumbs when on primary path`
- Breadcrumb navigation tests
- Keyboard navigation tests (ArrowLeft, ArrowRight, Home, End)

**What it tests:**
- Breadcrumbs visible even when only one path exists
- Current path breadcrumb is disabled
- Keyboard navigation works correctly
- Branch point messages appear in tooltips

## Setup Required

Before running the tests, ensure testing dependencies are installed:

```bash
cd apps/demo-web
pnpm add -D @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

Then update `vitest.config.ts` to use jsdom environment:

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom', // Changed from 'node'
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test/setup.ts'], // Optional setup file
  },
  // ...
});
```

## Running the Tests

```bash
# Run all regression tests
pnpm --filter demo-web test -- --run branch-navigation-regression

# Run specific test suite
pnpm --filter demo-web test -- --run "BUG #1"

# Run component tests
pnpm --filter reg-intel-ui test -- --run PathBreadcrumbs

# Run all tests
pnpm --filter demo-web test -- --run
```

## Integration Test Coverage

The integration test also includes a complete flow test:

```
Complete Branch Navigation Flow
1. Start on main path
2. Click View Branch button
3. Verify navigation in current window (not new tab)
4. Verify dropdown updates to show branch path
5. Click breadcrumb to navigate back to main
6. Verify UI updates correctly
```

## Expected Results

All tests should pass once testing dependencies are set up:

```
✓ BUG #1: Message Content Always Shows (2 tests)
✓ BUG #2: View Branch Button Navigates In Current Window (2 tests)
✓ BUG #3: Path Dropdown Shows Correct Active Path (2 tests)
✓ Enhancement: Breadcrumbs Show On Main Path (2 tests)
✓ Integration: Complete Branch Navigation Flow (1 test)
✓ PathBreadcrumbs Component (15+ tests)
```

## Continuous Integration

Add these tests to your CI pipeline to prevent regression:

```yaml
# .github/workflows/test.yml
- name: Run regression tests
  run: pnpm test -- --run branch-navigation-regression

- name: Run component tests
  run: pnpm --filter reg-intel-ui test -- --run PathBreadcrumbs
```

## Maintenance

When modifying branch navigation functionality:
1. Run regression tests first to ensure no breakage
2. Update tests if behavior intentionally changes
3. Add new tests for new functionality
4. Keep test descriptions up to date with actual behavior
