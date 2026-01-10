# Test Infrastructure Fixes

## Summary

Fixed critical test infrastructure issues that were preventing ALL tests in `apps/demo-web` from running.

## Issues Fixed

### 1. Module Resolution Error
**Problem:** All tests were failing with:
```
Error: Failed to resolve import "@reg-copilot/reg-intel-observability/browser"
from "src/components/chat/path-breadcrumb-nav.tsx". Does the file exist?
```

**Root Cause:** The package subpath export `@reg-copilot/reg-intel-observability/browser` could not be resolved in the Vitest test environment because:
- The package.json exports point to `dist/browserMetrics.js`
- In tests, we use source files (src/) not dist files
- Vitest/Vite couldn't resolve the subpath during module transformation

**Solution:** Mock the component that imports the problematic module in the global test setup:
```typescript
// apps/demo-web/src/test/setup.ts
vi.mock('@/components/chat/path-breadcrumb-nav', () => ({
  PathBreadcrumbNav: () => null,
}));
```

### 2. Missing `useClientTelemetry` Export
**Problem:** Tests were failing with:
```
Error: [vitest] No "useClientTelemetry" export is defined on the "@/lib/clientTelemetry" mock.
```

**Root Cause:** The test mocks only included `createClientTelemetry` but components use `useClientTelemetry` hook.

**Solution:** Added `useClientTelemetry` to the global test setup:
```typescript
// apps/demo-web/src/test/setup.ts
vi.mock('@/lib/clientTelemetry', () => {
  const mockTelemetry = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequest: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
    newRequestId: vi.fn(() => 'test-request-id'),
  };
  return {
    createClientTelemetry: () => mockTelemetry,
    useClientTelemetry: () => mockTelemetry,
  };
});
```

### 3. Theme Provider Dependency
**Problem:** Tests were failing with:
```
Error: useTheme must be used within a ThemeProvider
```

**Solution:** Mock the ThemeToggle component in global setup:
```typescript
vi.mock('@/components/theme/theme-toggle', () => ({
  ThemeToggle: () => null,
}));
```

### 4. Supabase Dependency
**Problem:** Tests were failing with Supabase connection errors from TenantSwitcher component.

**Solution:** Mock TenantSwitcher in global setup:
```typescript
vi.mock('@/components/TenantSwitcher', () => ({
  default: () => null,
  TenantSwitcher: () => null,
}));
```

## Files Modified

### apps/demo-web/src/test/setup.ts
- Added global mocks for components with problematic dependencies
- Added clientTelemetry mock with both exports
- This setup file runs before all tests

### apps/demo-web/vitest.config.ts
- Removed conflicting alias for `@reg-copilot/reg-intel-observability/browser`
  - The alias was trying to resolve a physical file while the mock should intercept

### apps/demo-web/src/app/__tests__/two-question-flow.test.tsx
- Updated clientTelemetry mock to include `useClientTelemetry`

### apps/demo-web/src/app/__tests__/branch-navigation-regression.test.tsx
- Created new regression test file
- Added Next.js navigation mocks (`useSearchParams`, `usePathname`)
- Setup elaborate fetch mocks for conversation data

## Current Status

### ✅ Fixed
- Module resolution errors - all tests can now load without import errors
- Missing telemetry exports - components can use useClientTelemetry hook
- Theme provider errors - theme components are mocked
- Supabase dependency errors - tenant switcher is mocked

### ⚠️ Remaining Issues

#### Integration Tests Timing Out
The regression tests and some existing tests (like two-question-flow) are timing out waiting for UI elements to appear:
```
Unable to find an element with the text: First user message
```

**Possible Causes:**
1. Missing React context providers that the Home component requires
2. Fetch mocks not being triggered correctly
3. Component expects additional URL parameters or state
4. Tests are too complex and need to be broken down into smaller units

**Recommended Next Steps:**
1. **Option A: Simplify Tests** - Instead of testing the entire Home component, create focused unit tests for specific components like:
   - `PathBreadcrumbs` component (already exists in packages/reg-intel-ui)
   - Message rendering components
   - Branch navigation buttons

2. **Option B: Manual Regression Testing** - Create a manual testing checklist for the three bugs:
   - BUG #1: Verify message content shows, not `[Branch 1]` placeholders
   - BUG #2: Verify "View Branch" navigates in same window
   - BUG #3: Verify path dropdown shows correct active path

3. **Option C: Debug Integration Tests** - Add debug output to understand what's actually rendering:
   ```typescript
   screen.debug(); // Shows what's actually in the DOM
   ```

## Testing Best Practices Learned

1. **Global Setup for Common Mocks** - Put frequently needed mocks in `src/test/setup.ts` rather than repeating them in every test file

2. **Mock Components, Not Modules** - When facing module resolution issues, mock the component that imports the problematic module rather than trying to mock the module itself

3. **Don't Conflict Aliases with Mocks** - If you're mocking a module, don't also add a Vite alias trying to resolve it to a real file

4. **Start Simple** - Begin with unit tests for individual components rather than complex integration tests of entire pages

## Impact

These fixes enable all tests in `apps/demo-web` to at least load and start execution. Tests that were previously blocked by import errors can now run, though some may need additional setup to pass their assertions.
