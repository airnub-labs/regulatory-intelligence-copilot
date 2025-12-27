# CI/CD Testing Guidelines – Path System

**Last Updated**: 2025-12-27
**Purpose**: Ensure the critical conversation path system never regresses through automated testing in CI/CD pipelines

---

## Overview

The conversation path system is a **core differentiator** of the Regulatory Intelligence Copilot, enabling users to edit any message and explore alternatives while preserving complete conversation history (time travel).

This document defines **mandatory** CI/CD requirements to prevent regression of this critical functionality.

---

## 1. Critical Invariants (MUST NEVER REGRESS)

These four invariants are the foundation of the path system and must be continuously validated:

### Invariant 1: Original Path Preservation
When editing message N in a conversation of M messages (where N < M), the original path MUST preserve ALL M messages, including messages N+1 through M.

### Invariant 2: Path Isolation
Switching paths must return ONLY messages from the active path. No cross-contamination between paths.

### Invariant 3: No Message Loss on Branching
Creating a branch NEVER deletes or moves messages from the original path.

### Invariant 4: Complete History on Path Switch
When switching back to a path, the UI MUST show the complete conversation history for that path, including all messages that came after any branch points.

---

## 2. Required Test Suites

### Test Suite 1: Two-Question Flow
**File**: `apps/demo-web/src/app/__tests__/two-question-flow.test.tsx`
**Purpose**: Prevent regression of basic multi-turn conversation flow
**Status**: ✅ **REQUIRED** for all PRs touching conversation management

**What it tests**:
- ✅ Consecutive questions display correctly
- ✅ `isStreamingRef` flag management
- ✅ Conversation reload after streaming
- ✅ No race conditions in message display

**Run Command**:
```bash
cd apps/demo-web
npm test -- two-question-flow
```

### Test Suite 2: Path System Integration
**File**: `apps/demo-web/src/app/__tests__/path-system-integration.test.tsx`
**Purpose**: Comprehensive path system functionality testing
**Status**: ✅ **REQUIRED** for all PRs touching paths, messages, or UI state

**What it tests**:
- ✅ Multi-question conversations (5+ questions)
- ✅ Message editing and branching
- ✅ Path switching and navigation
- ✅ Complex branching (nested, parallel)
- ✅ UI state consistency
- ✅ Error handling

**Run Command**:
```bash
cd apps/demo-web
npm test -- path-system-integration
```

### Test Suite 3: Edit Previous Message (MOST CRITICAL)
**File**: `apps/demo-web/src/app/__tests__/edit-previous-message.test.tsx`
**Purpose**: Validate the core "time travel" feature
**Status**: ✅ **REQUIRED** for ALL PRs (this is the core differentiator)

**What it tests**:
- ✅ Editing PREVIOUS message (not last) creates branch
- ✅ Original path preserves ALL messages after branch point
- ✅ Switching back shows complete history
- ✅ Multiple edits maintain path integrity
- ✅ Edge cases (edit first message, various positions)
- ✅ Rapid path switching maintains isolation
- ✅ Deep branch hierarchies
- ✅ Parallel branches from same message
- ✅ **REGRESSION TESTS**: Critical invariants validation

**Run Command**:
```bash
cd apps/demo-web
npm test -- edit-previous-message
```

---

## 3. Pre-Commit Hooks

### Required Local Checks
Before committing ANY changes to conversation management, path system, or UI state:

```bash
#!/bin/bash
# .husky/pre-commit or similar

echo "Running path system tests..."
cd apps/demo-web

# Run all three critical test suites
npm test -- --run two-question-flow.test.tsx || exit 1
npm test -- --run path-system-integration.test.tsx || exit 1
npm test -- --run edit-previous-message.test.tsx || exit 1

echo "✅ All path system tests passed"
```

### File Pattern Triggers
These file patterns should trigger path system tests:

```yaml
trigger_patterns:
  - 'apps/demo-web/src/app/page.tsx'                    # Main conversation page
  - 'apps/demo-web/src/components/message.tsx'           # Message display
  - 'apps/demo-web/src/components/path-*.tsx'            # Path components
  - 'apps/demo-web/src/app/api/chat/**'                  # Chat API
  - 'apps/demo-web/src/app/api/conversations/**'         # Conversation API
  - 'apps/demo-web/src/lib/conversation-store.ts'        # Conversation state
  - 'packages/*/src/**/*conversation*.ts'                # Conversation packages
  - 'packages/*/src/**/*path*.ts'                        # Path packages
  - 'packages/*/src/**/*message*.ts'                     # Message packages
```

---

## 4. GitHub Actions CI Pipeline

### Required Workflow Configuration

```yaml
name: Path System Integration Tests

on:
  pull_request:
    paths:
      - 'apps/demo-web/src/app/page.tsx'
      - 'apps/demo-web/src/components/message.tsx'
      - 'apps/demo-web/src/components/path-*.tsx'
      - 'apps/demo-web/src/app/api/chat/**'
      - 'apps/demo-web/src/app/api/conversations/**'
      - 'apps/demo-web/src/lib/conversation-store.ts'
      - 'packages/*/src/**/*conversation*.ts'
      - 'packages/*/src/**/*path*.ts'
      - 'packages/*/src/**/*message*.ts'
  push:
    branches:
      - main
      - develop

jobs:
  path-system-tests:
    name: Path System Integration Tests
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run Two-Question Flow Tests
        run: |
          cd apps/demo-web
          npm test -- --run two-question-flow.test.tsx

      - name: Run Path System Integration Tests
        run: |
          cd apps/demo-web
          npm test -- --run path-system-integration.test.tsx

      - name: Run Edit Previous Message Tests (CRITICAL)
        run: |
          cd apps/demo-web
          npm test -- --run edit-previous-message.test.tsx

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: path-system-test-results
          path: apps/demo-web/coverage/
```

### Required Status Checks

In GitHub repository settings → Branches → Branch protection rules:

```yaml
required_status_checks:
  - "Path System Integration Tests / path-system-tests"

settings:
  require_status_checks_to_pass: true
  require_branches_to_be_up_to_date: true
  strict: true
```

**CRITICAL**: PRs **CANNOT** be merged if path system tests fail.

---

## 5. Coverage Requirements

### Minimum Coverage Thresholds

```json
// jest.config.js or vitest.config.ts
{
  "coverageThreshold": {
    "global": {
      "branches": 80,
      "functions": 80,
      "lines": 80,
      "statements": 80
    },
    "apps/demo-web/src/app/page.tsx": {
      "branches": 90,
      "functions": 90,
      "lines": 90,
      "statements": 90
    },
    "apps/demo-web/src/components/message.tsx": {
      "branches": 85,
      "functions": 85,
      "lines": 85,
      "statements": 85
    }
  }
}
```

### Coverage Reporting

```yaml
# GitHub Actions step
- name: Generate coverage report
  run: |
    cd apps/demo-web
    npm test -- --coverage

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v4
  with:
    files: ./apps/demo-web/coverage/coverage-final.json
    flags: path-system
    fail_ci_if_error: true
```

---

## 6. Deployment Gates

### Staging Deployment
Before deploying to staging:

```bash
#!/bin/bash
# deploy/pre-staging-checks.sh

echo "Running full path system test suite..."
cd apps/demo-web

npm test -- --run __tests__/two-question-flow.test.tsx
npm test -- --run __tests__/path-system-integration.test.tsx
npm test -- --run __tests__/edit-previous-message.test.tsx

if [ $? -eq 0 ]; then
  echo "✅ All tests passed. Proceeding with staging deployment."
  exit 0
else
  echo "❌ Tests failed. Blocking staging deployment."
  exit 1
fi
```

### Production Deployment
Before deploying to production:

```bash
#!/bin/bash
# deploy/pre-production-checks.sh

echo "Running CRITICAL path system regression tests..."
cd apps/demo-web

# Run with explicit coverage requirements
npm test -- --coverage --run __tests__/edit-previous-message.test.tsx

# Check for any test failures
if [ $? -ne 0 ]; then
  echo "❌ CRITICAL path system tests failed. BLOCKING production deployment."
  exit 1
fi

# Verify all critical invariant tests passed
grep -q "CRITICAL.*✓" test-results.log || {
  echo "❌ Critical invariant tests missing or failed. BLOCKING production deployment."
  exit 1
}

echo "✅ All critical tests passed. Production deployment approved."
exit 0
```

---

## 7. Test Failure Response Protocol

### When Path System Tests Fail

1. **Immediate Action**:
   - ❌ **STOP** all merges and deployments
   - 🚨 Alert development team immediately
   - 📋 Create P0 incident ticket

2. **Investigation**:
   - Review test failure logs
   - Identify which invariant was violated
   - Check git blame for recent changes to affected files

3. **Resolution**:
   - Fix the regression immediately (drop everything else)
   - Verify fix with local test runs
   - Request emergency code review
   - Re-run full CI pipeline

4. **Post-Mortem**:
   - Document what caused the regression
   - Add additional test coverage if gaps found
   - Update this document with lessons learned

### Escalation Path

```
Test Failure
    ↓
Notify: @path-system-owners (Slack/Teams)
    ↓
If not resolved in 2 hours
    ↓
Escalate to: Engineering Lead
    ↓
If not resolved in 4 hours
    ↓
Emergency meeting with CTO
```

---

## 8. Monitoring and Alerting

### Test Execution Monitoring

```yaml
# monitoring/path-system-tests.yaml
alerts:
  - name: "Path System Test Failures"
    condition: "test_status == 'failed' AND test_suite IN ['edit-previous-message', 'path-system-integration']"
    severity: "critical"
    notify:
      - slack: "#engineering-alerts"
      - pagerduty: "path-system-oncall"

  - name: "Path System Test Coverage Drop"
    condition: "coverage.path_system < 85%"
    severity: "high"
    notify:
      - slack: "#engineering-alerts"
```

### Metrics to Track

```typescript
// CI/CD metrics dashboard
const pathSystemMetrics = {
  testExecutionTime: "Track test suite duration (alert if > 5 min)",
  testSuccessRate: "Track success rate (alert if < 100%)",
  coveragePercentage: "Track coverage (alert if < 85%)",
  regressionCount: "Track number of regressions (alert if > 0)",
  timeSinceLastFailure: "Days since last test failure",
};
```

---

## 9. Developer Checklist

### Before Opening a PR

- [ ] Run all three path system test suites locally
- [ ] Verify tests pass with `npm test`
- [ ] Check test coverage meets thresholds
- [ ] Review changes don't violate critical invariants
- [ ] Add new test cases if introducing new path system behavior

### During Code Review

**Reviewer Checklist**:
- [ ] CI path system tests are green
- [ ] No changes to message filtering logic without corresponding tests
- [ ] Branch creation doesn't modify original path messages
- [ ] Path switching correctly filters messages by `pathId`
- [ ] UI state updates reflect active path's complete history
- [ ] No hard-coded assumptions about message counts or sequences

---

## 10. Continuous Improvement

### Quarterly Reviews

Every quarter, the team should:

1. **Review Test Coverage**:
   - Identify any gaps in test scenarios
   - Add tests for edge cases discovered in production

2. **Performance Analysis**:
   - Measure test execution time
   - Optimize slow tests
   - Consider parallelization opportunities

3. **Documentation Updates**:
   - Update this document with new learnings
   - Add examples of caught regressions
   - Document new test patterns

### Adding New Tests

When adding new path system tests:

1. Document the test scenario in `docs/testing/PATH_SYSTEM_TESTING.md`
2. Add the test to the appropriate suite
3. Update CI configuration if needed
4. Add test to the required status checks
5. Document in this file under "Required Test Suites"

---

## 11. References

- **Test Documentation**: `docs/testing/PATH_SYSTEM_TESTING.md`
- **Architecture**: `AGENTS.md` § 7 (Conversation Path System)
- **Bug Fix History**: `docs/fixes/TWO_QUESTION_FLOW_FIX.md`
- **Path System Status**: `docs/development/PATH_SYSTEM_STATUS.md`

---

## Appendix A: Quick Reference

### Run All Path System Tests
```bash
cd apps/demo-web
npm test -- two-question-flow path-system-integration edit-previous-message
```

### Run Only Critical Tests
```bash
cd apps/demo-web
npm test -- edit-previous-message
```

### Run With Coverage
```bash
cd apps/demo-web
npm test -- --coverage edit-previous-message
```

### Watch Mode (Development)
```bash
cd apps/demo-web
npm test -- --watch edit-previous-message
```

---

**REMEMBER**: The path system is a core differentiator. Any regression is a **critical incident** that requires immediate resolution.
