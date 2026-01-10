# E2E Testing Setup Guide

Complete guide for setting up and running Playwright E2E tests for the Regulatory Intelligence Copilot platform.

## Quick Start

```bash
# 1. Install Playwright browsers
pnpm test:e2e:install

# 2. Start infrastructure
supabase start                    # Starts PostgreSQL + seeds realistic data
docker compose -f docker/docker-compose.yml up -d memgraph

# 3. Seed Memgraph
pnpm setup:indices
pnpm seed:graph:realistic:expanded

# 4. Run tests
pnpm test:e2e
```

## Detailed Setup

### 1. Prerequisites

**Required**:
- Node.js 24+
- pnpm 8.10+
- Docker (for Memgraph)
- Supabase CLI

**Optional**:
- LLM API key (Groq, OpenAI, or Anthropic)

### 2. Install Dependencies

```bash
# From monorepo root
pnpm install

# Install Playwright browsers (Chromium, Firefox, WebKit)
cd apps/demo-web
pnpm test:e2e:install

# Or from monorepo root
pnpm test:e2e:install
```

This downloads ~1GB of browser binaries to `~/.cache/ms-playwright/`.

### 3. Start Supabase

```bash
# First time (takes 5-10 minutes)
supabase start

# Check status
supabase status
```

**Output**:
```
API URL: http://localhost:54321
DB URL: postgresql://postgres:postgres@localhost:54322/postgres
Studio URL: http://localhost:54323
Anon key: eyJhb...
Service role key: eyJhb...
```

**Important**: Copy the `Anon key` and `Service role key` for `.env.local`.

### 4. Seed Supabase with Realistic Data

The realistic seed data is automatically loaded when you run `supabase db reset`:

```bash
supabase db reset
```

This creates:
- **DataTech Solutions** (12 users) - Enterprise tenant
- **Emerald Tax Consulting** (6 users) - Pro tenant
- **Seán O'Brien** (1 user) - Personal tenant
- **Platform admins** (10 users) - Global support team

**Verify seed data**:
```bash
supabase db shell

-- Check users
SELECT email FROM auth.users WHERE email LIKE '%datatech%';

-- Should see:
-- niamh.mccarthy@datatech.ie
-- ronan.osullivan@datatech.ie
-- ... (10 more users)
```

### 5. Start Memgraph

```bash
docker compose -f docker/docker-compose.yml up -d memgraph

# Check it's running
docker ps | grep memgraph
```

**Verify Memgraph**:
```bash
docker exec -it memgraph mgconsole

# Should connect to Memgraph shell
memgraph> RETURN "Hello";
```

### 6. Seed Memgraph with Realistic Graph Data

```bash
# Create indices (run once)
pnpm setup:indices

# Seed realistic regulatory data
pnpm seed:graph:realistic:expanded
```

**Verify graph data**:
```bash
docker exec -it memgraph mgconsole

MATCH (n) RETURN count(n);
-- Should return 74 nodes

MATCH (r:Relief) RETURN r.id, r.name;
-- Should see: IE_RELIEF_RND_CREDIT, IE_RELIEF_ENTREPRENEUR, etc.
```

### 7. Configure Environment Variables

Create `apps/demo-web/.env.local`:

```env
# Supabase (from 'supabase status')
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Memgraph
MEMGRAPH_URI=bolt://localhost:7687

# LLM Provider (at least one required)
GROQ_API_KEY=gsk_...
# OR
OPENAI_API_KEY=sk-...
# OR
ANTHROPIC_API_KEY=sk-ant-...

# Auth
NEXTAUTH_SECRET=your-random-secret-here
NEXTAUTH_URL=http://localhost:3000
```

**Generate NEXTAUTH_SECRET**:
```bash
openssl rand -base64 32
```

### 8. Start Development Server

```bash
# From monorepo root
pnpm dev:web

# Or from apps/demo-web
pnpm dev
```

**Verify**:
- Open http://localhost:3000
- Should see login page
- Try logging in with `ronan.osullivan@datatech.ie` / `Password123!`

### 9. Run E2E Tests

```bash
# All tests (headless)
pnpm test:e2e

# With UI (interactive mode)
pnpm test:e2e:ui

# With browser visible
pnpm test:e2e:headed

# Debug mode
pnpm test:e2e:debug
```

## Test Structure

```
apps/demo-web/
├── e2e/
│   ├── fixtures/
│   │   ├── auth.ts                    # Authentication helpers
│   │   └── console-capture.ts         # Console logging utilities
│   ├── 01-auth-login.spec.ts          # Authentication tests (8 tests)
│   ├── 02-chat-graphrag.spec.ts       # Chat & GraphRAG (8 tests)
│   ├── 03-conversation-branching.spec.ts  # Branching (4 tests)
│   ├── 04-graph-visualization.spec.ts # Graph viz (7 tests)
│   ├── 05-cost-analytics.spec.ts      # Cost analytics (7 tests)
│   ├── 06-workspaces-team.spec.ts     # Workspaces (8 tests)
│   ├── 07-end-to-end-flow.spec.ts     # E2E flows (4 tests)
│   └── README.md                      # Test documentation
├── playwright.config.ts               # Playwright configuration
└── package.json                       # Test scripts
```

## Running Specific Tests

### By Test Suite

```bash
# Authentication
pnpm test:e2e:auth

# Chat & GraphRAG
pnpm test:e2e:chat

# Conversation branching
pnpm test:e2e:branch

# Graph visualization
pnpm test:e2e:graph

# Cost analytics
pnpm test:e2e:costs

# Workspaces & teams
pnpm test:e2e:team

# End-to-end flows
pnpm test:e2e:flow
```

### By Browser

```bash
# Chromium only
pnpm test:e2e:chromium

# Firefox only
pnpm test:e2e:firefox

# WebKit/Safari only
pnpm test:e2e:webkit

# Mobile devices
pnpm test:e2e:mobile
```

### By Test Name

```bash
# Run specific test
pnpm test:e2e -- -g "should login successfully with DataTech CEO"

# Run tests matching pattern
pnpm test:e2e -- -g "GraphRAG"
```

## Viewing Test Results

### HTML Report

```bash
pnpm test:e2e:report
```

Opens interactive HTML report with:
- Test results and timings
- Screenshots on failure
- Videos of failed tests
- Console logs
- Network activity
- Trace viewer for debugging

### Console Logs

Console output is saved to `playwright-results/console/`:

```bash
# View all console logs
ls -la playwright-results/console/

# View specific test logs
cat playwright-results/console/chat-rnd-credit-graphrag_*_browser.log

# View error summary
cat playwright-results/console/chat-rnd-credit-graphrag_*_errors.log
```

## Troubleshooting

### Test Fails: "Navigation timeout"

**Cause**: Dev server not running or slow to start

**Fix**:
```bash
# Start dev server manually first
pnpm dev:web

# Then run tests in another terminal
pnpm test:e2e
```

### Test Fails: "Invalid credentials"

**Cause**: Seed data not loaded

**Fix**:
```bash
# Reset and reseed database
supabase db reset

# Verify user exists
supabase db shell
SELECT email FROM auth.users WHERE email = 'ronan.osullivan@datatech.ie';
```

### Test Fails: "Graph nodes not found"

**Cause**: Memgraph not seeded

**Fix**:
```bash
# Seed Memgraph
pnpm setup:indices
pnpm seed:graph:realistic:expanded

# Verify nodes
docker exec -it memgraph mgconsole
MATCH (n) RETURN count(n);  -- Should be 74
```

### Playwright Browsers Not Installed

**Cause**: Browsers not downloaded

**Fix**:
```bash
pnpm test:e2e:install
```

### Environment Variables Missing

**Cause**: `.env.local` not configured

**Fix**:
```bash
# Get Supabase keys
supabase status

# Copy to .env.local
cp apps/demo-web/.env.example apps/demo-web/.env.local
# Edit .env.local with actual keys
```

### Tests Pass Locally But Fail in CI

**Cause**: Timing differences or missing services

**Fix**:
1. Check GitHub Actions logs for service health
2. Increase timeouts in `playwright.config.ts`
3. Verify CI environment variables are set

## CI/CD Setup

### GitHub Actions

Tests run automatically on:
- Push to `main` branch
- Pull requests
- Nightly builds (2 AM UTC)

**Required Secrets**:
- `SUPABASE_ANON_KEY_TEST`
- `SUPABASE_SERVICE_ROLE_KEY_TEST`
- `GROQ_API_KEY_TEST`

**Artifacts**:
- Playwright HTML report (30 days)
- Console logs (30 days)
- Screenshots/videos (30 days)

### Running Tests Before Commit

```bash
# Quick smoke test
pnpm test:e2e:chromium -- -g "should login"

# Full test suite
pnpm test:all  # GraphRAG + E2E
```

## Performance Benchmarks

Expected test execution times (M1 MacBook Pro):

| Test Suite | Tests | Time | Notes |
|------------|-------|------|-------|
| 01-auth-login | 8 | ~30s | Fast, no LLM calls |
| 02-chat-graphrag | 8 | ~3m | LLM API calls |
| 03-conversation-branching | 4 | ~2m | LLM API calls |
| 04-graph-visualization | 7 | ~1m | Rendering tests |
| 05-cost-analytics | 7 | ~45s | Data queries |
| 06-workspaces-team | 8 | ~1m | CRUD operations |
| 07-end-to-end-flow | 4 | ~4m | Complete flows |
| **Total** | **46** | **~12m** | All browsers |

**Optimization**:
- Use `pnpm test:e2e:chromium` for quick feedback (~4 minutes)
- Run full suite before pushing to main

## Best Practices

1. **Clean state** - Each test starts with cleared cookies
2. **Realistic data** - Use actual seed data, not mocks
3. **Console capture** - Always capture browser console for debugging
4. **Error handling** - Test both success and error paths
5. **Timeouts** - Use appropriate timeouts for LLM calls (30s)
6. **Mobile testing** - Test critical flows on mobile viewports
7. **Parallel execution** - Tests run in parallel for speed

## Maintenance

### Updating Test Users

When seed data changes:
1. Update `e2e/fixtures/auth.ts` with new credentials
2. Update `e2e/README.md` with new user list

### Adding New Tests

1. Create spec file: `e2e/08-new-feature.spec.ts`
2. Add npm script: `"test:e2e:new-feature": "playwright test e2e/08-new-feature.spec.ts"`
3. Update `e2e/README.md` with test description

### Debugging Failed Tests

```bash
# Run in debug mode
pnpm test:e2e:debug e2e/02-chat-graphrag.spec.ts

# View trace
pnpm test:e2e:report

# Check console logs
cat playwright-results/console/<test-name>_*_errors.log
```

## Resources

- [Playwright Documentation](https://playwright.dev)
- [E2E Test README](../../apps/demo-web/e2e/README.md)
- [Realistic Seed Data](../supabase/seed/realistic_seed/README.md)
- [GraphRAG Validation](./GRAPHRAG_VALIDATION_TESTS.md)

---

**Last Updated**: 2026-01-09
**Playwright Version**: 1.49.1
**Test Coverage**: 46 tests across 7 suites
