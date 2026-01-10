# End-to-End Tests with Playwright

Comprehensive E2E test suite for the Regulatory Intelligence Copilot platform using realistic seed data from Supabase and Memgraph.

## Overview

These tests validate the entire application stack:
- **Authentication & Authorization** - Login, logout, role-based access
- **Chat & GraphRAG Integration** - AI responses with graph data injection
- **Conversation Branching** - Path system, message editing, branch switching
- **Graph Visualization** - Node rendering, highlighting, interactions
- **Cost Analytics** - Usage tracking, quota enforcement, provider breakdown
- **Workspaces & Teams** - Multi-tenant management, permissions
- **End-to-End Flows** - Complete user journeys across all features

## Test Coverage

### Test Users (from realistic seed data)

All users have password: `Password123!`

**DataTech Solutions (Enterprise)**
- `niamh.mccarthy@datatech.ie` - CEO (owner)
- `ronan.osullivan@datatech.ie` - CFO (admin)
- `siobhan.walsh@datatech.ie` - Finance Director (admin)
- `declan.ryan@datatech.ie` - Finance Manager (member)
- `mary.kavanagh@kpmg.ie` - External Auditor (viewer)

**Emerald Tax Consulting (Pro)**
- `fiona@emeraldtax.ie` - Managing Partner (owner)
- `brendan@emeraldtax.ie` - Senior Tax Consultant (admin)
- `darragh@emeraldtax.ie` - Tax Consultant (member)

**Personal User**
- `sean.obrien@freelancetech.ie` - Freelance IT Consultant (owner)

### Test Suites

#### 01. Authentication & Login (8 tests)
- Login page rendering
- Successful login for all user types
- Invalid credentials handling
- Logout functionality
- Redirect preservation
- Concurrent login attempts

#### 02. Chat & GraphRAG Integration (8 tests)
- R&D Tax Credit query with graph injection
- Corporation Tax calculation with graph nodes
- VAT rates multi-rate scenario
- Salary vs dividend personal use case
- Follow-up questions with context
- Loading state display
- Conversation persistence on reload
- Network error handling

#### 03. Conversation Branching & Paths (4 tests)
- Edit message to create branch
- Switch between conversation paths
- Preserve original path when branching
- Branch indicator display

#### 04. Graph Visualization (7 tests)
- Load graph visualization page
- Display Irish regulatory nodes
- Filter by jurisdiction
- Highlight referenced nodes from conversation
- Zoom and pan interactions
- Node details on click
- Large dataset handling

#### 05. Cost Analytics (7 tests)
- View cost analytics dashboard
- Monthly cost breakdown
- LLM provider breakdown
- Quota usage and limits
- Date range filtering
- Free tier limits (personal user)
- Cost anomaly alerts
- Export cost data

#### 06. Workspaces & Team Management (8 tests)
- Switch between workspaces
- Access client workspaces (pro tier)
- View team members
- Invite new team member
- Change member role
- Member permission enforcement
- Viewer read-only access
- Create new workspace

#### 07. End-to-End User Flows (4 tests)
- Complete enterprise workflow (CFO analyzes tax scenarios)
- Complete professional workflow (tax consultant manages clients)
- Complete personal workflow (freelancer asks tax questions)
- Mobile responsive testing

**Total: 46 tests** covering all major functionality

## Prerequisites

### 1. Install Dependencies

```bash
# From monorepo root
pnpm install

# Install Playwright browsers
cd apps/demo-web
pnpm test:e2e:install
```

### 2. Set Up Test Database

```bash
# Start Supabase (includes PostgreSQL)
supabase start

# Seed realistic data
supabase db reset

# Start Memgraph
docker compose -f docker/docker-compose.yml up -d memgraph

# Seed Memgraph with realistic regulatory data
pnpm setup:indices
pnpm seed:graph:realistic:expanded
```

### 3. Configure Environment

Ensure `apps/demo-web/.env.local` has:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<from supabase status>

# Memgraph
MEMGRAPH_URI=bolt://localhost:7687

# LLM Provider (at least one)
GROQ_API_KEY=<your-key>
# OR
OPENAI_API_KEY=<your-key>

# Auth
NEXTAUTH_SECRET=<random-secret>
NEXTAUTH_URL=http://localhost:3000
```

## Running Tests

### Run All Tests

```bash
cd apps/demo-web

# Run all tests (headless)
pnpm test:e2e

# Run with UI (interactive mode)
pnpm test:e2e:ui

# Run with browser visible
pnpm test:e2e:headed

# Debug mode (step through tests)
pnpm test:e2e:debug
```

### Run Specific Test Suites

```bash
# Authentication tests
pnpm test:e2e:auth

# Chat & GraphRAG tests
pnpm test:e2e:chat

# Conversation branching tests
pnpm test:e2e:branch

# Graph visualization tests
pnpm test:e2e:graph

# Cost analytics tests
pnpm test:e2e:costs

# Workspaces & team tests
pnpm test:e2e:team

# End-to-end flow tests
pnpm test:e2e:flow
```

### Run on Specific Browsers

```bash
# Chromium only
pnpm test:e2e:chromium

# Firefox only
pnpm test:e2e:firefox

# WebKit/Safari only
pnpm test:e2e:webkit

# Mobile devices (Chrome & Safari)
pnpm test:e2e:mobile
```

### View Test Report

```bash
pnpm test:e2e:report
```

## Console Output Capture

All tests automatically capture:
- **Browser console logs** (log, info, warn, error, debug)
- **Server console output** (via webServer stdout/stderr)
- **Page errors** (uncaught exceptions, crashes)
- **Network errors** (failed requests)

Console output is saved to:
```
playwright-results/console/
  <test-name>_<timestamp>_browser.json   # Structured JSON
  <test-name>_<timestamp>_browser.log    # Human-readable
  <test-name>_<timestamp>_errors.log     # Error summary (if any)
```

### Accessing Console Logs in Tests

```typescript
import { createConsoleCapture } from './fixtures/console-capture';

test('my test', async ({ page }) => {
  const console = createConsoleCapture('my-test-name');
  console.startCapture(page);

  // ... test code ...

  // Save all console output
  console.saveToFile();

  // Assert no errors
  console.assertNoErrors();

  // Get statistics
  const stats = console.getStats();
  console.log(`Errors: ${stats.errors}, Warnings: ${stats.warnings}`);

  // Search for specific messages
  const graphLogs = console.searchBrowserMessages('GraphRAG');
});
```

## Test Artifacts

When tests fail, Playwright automatically captures:
- **Screenshots** - Visual state at failure point
- **Videos** - Recording of the test run
- **Traces** - Full debugging trace with DOM snapshots

Artifacts are saved to:
```
playwright-report/       # HTML report
test-results/           # Screenshots, videos, traces
```

## Writing New Tests

### Test Structure

```typescript
import { test, expect } from '@playwright/test';
import { TEST_USERS, login } from './fixtures/auth';
import { createConsoleCapture } from './fixtures/console-capture';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('should do something', async ({ page }) => {
    const console = createConsoleCapture('test-name');
    console.startCapture(page);

    // Login
    await login(page, TEST_USERS.dataTechCFO);

    // Navigate
    await page.goto('/some-page');

    // Interact
    await page.click('button');
    await page.fill('input', 'value');

    // Assert
    await expect(page.locator('selector')).toBeVisible();

    // Save console output
    console.saveToFile();
  });
});
```

### Best Practices

1. **Use realistic test data** - All tests use seed data from `supabase/seed/realistic_seed/`
2. **Clean state between tests** - Clear cookies in `beforeEach`
3. **Capture console output** - Always use `ConsoleCapture` for debugging
4. **Use data-testid** - Prefer `data-testid` selectors over text/class
5. **Wait for elements** - Use `waitForSelector` with appropriate timeouts
6. **Test error states** - Verify error handling and edge cases
7. **Mobile responsive** - Test on mobile viewports for critical flows

## CI/CD Integration

### GitHub Actions

Tests run automatically on:
- Push to main branch
- Pull requests
- Scheduled nightly builds

See `.github/workflows/e2e-tests.yml` for configuration.

### Local Pre-Commit

Run tests before committing:

```bash
# Quick smoke test (chromium only)
pnpm test:e2e:chromium

# Full test suite
pnpm test:e2e
```

## Troubleshooting

### Tests Fail with "Timeout"

**Cause**: Application not ready or slow response

**Fix**:
- Increase timeout in specific test: `await page.waitForSelector('selector', { timeout: 30000 })`
- Check that dev server is running: `pnpm dev`
- Ensure Supabase and Memgraph are running

### "No tests found"

**Cause**: Playwright not installed or wrong directory

**Fix**:
```bash
cd apps/demo-web
pnpm test:e2e:install
pnpm test:e2e
```

### Authentication Fails

**Cause**: Seed data not loaded or wrong credentials

**Fix**:
```bash
# Reset and reseed database
supabase db reset

# Verify user exists
supabase db shell
SELECT email FROM auth.users WHERE email = 'ronan.osullivan@datatech.ie';
```

### Graph Visualization Not Loading

**Cause**: Memgraph not running or not seeded

**Fix**:
```bash
# Start Memgraph
docker compose -f docker/docker-compose.yml up -d memgraph

# Seed graph data
pnpm setup:indices
pnpm seed:graph:realistic:expanded

# Verify nodes exist
docker exec -it memgraph mgconsole
MATCH (n) RETURN count(n);
```

### Console Errors About Missing Environment Variables

**Cause**: `.env.local` not configured

**Fix**:
```bash
# Copy example and fill in values
cp apps/demo-web/.env.example apps/demo-web/.env.local

# Get Supabase keys
supabase status
```

## Performance Benchmarks

Expected test execution times (on MacBook Pro M1):

- **01-auth-login.spec.ts**: ~30 seconds
- **02-chat-graphrag.spec.ts**: ~3 minutes (LLM calls)
- **03-conversation-branching.spec.ts**: ~2 minutes
- **04-graph-visualization.spec.ts**: ~1 minute
- **05-cost-analytics.spec.ts**: ~45 seconds
- **06-workspaces-team.spec.ts**: ~1 minute
- **07-end-to-end-flow.spec.ts**: ~4 minutes

**Total: ~12 minutes** for full suite (all browsers)

## Maintenance

### Updating Test Users

When seed data changes:
1. Update `e2e/fixtures/auth.ts` with new credentials
2. Update this README's "Test Users" section

### Adding New Test Suites

1. Create new spec file: `e2e/08-new-feature.spec.ts`
2. Add npm script to `package.json`: `"test:e2e:new-feature": "playwright test e2e/08-new-feature.spec.ts"`
3. Update this README with test description

### Reviewing Failed Tests

```bash
# View HTML report with screenshots/videos
pnpm test:e2e:report

# View console logs
cat playwright-results/console/<test-name>_<timestamp>_errors.log

# Debug specific test
pnpm test:e2e:debug e2e/02-chat-graphrag.spec.ts
```

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Realistic Seed Data](../../supabase/seed/realistic_seed/README.md)
- [GraphRAG Validation Tests](../../../docs/testing/GRAPHRAG_VALIDATION_TESTS.md)
- [Architecture Documentation](../../../docs/architecture/architecture_v_0_7.md)

---

**Last Updated**: 2026-01-09
**Test Suites**: 7 (46 tests total)
**Coverage**: Authentication, Chat, GraphRAG, Branching, Graph Viz, Costs, Teams, E2E flows
