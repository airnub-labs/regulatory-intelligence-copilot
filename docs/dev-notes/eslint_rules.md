# ESLint Rules for v0.4 Architecture Compliance

This document describes the ESLint rules configured to enforce v0.4 architecture patterns.

**Configuration:** `eslint.config.mjs` (ESLint 9.x flat config format)

## Graph Write Discipline

Per `docs/governance/decisions/versions/decisions_v_0_4.md` (D-026, D-028), all writes to Memgraph must go through `GraphWriteService`.

### Rules

**Rule:** `no-restricted-syntax` (session.run)
- **Error:** Direct `session.run()` calls are prohibited
- **Why:** Bypasses Graph Ingress Guard aspects (PII blocking, schema validation, property whitelisting)
- **Fix:** Use `GraphWriteService` methods instead
- **See:** `docs/safety/safety-guards/graph_ingress_guard_v_0_1.md`

**Rule:** `no-restricted-syntax` (executeCypher)
- **Error:** Direct `executeCypher()` calls are prohibited
- **Why:** Bypasses Graph Ingress Guard aspects
- **Fix:** Use `GraphWriteService` methods instead

### Exemptions

The following files are **exempt** from these rules (they ARE the guarded services):

1. `packages/reg-intel-graph/src/graphWriteService.ts` - The service itself
2. `packages/reg-intel-graph/src/boltGraphClient.ts` - Read-only client
3. `packages/reg-intel-core/src/graph/graphClient.ts` - Legacy MCP client

### Warnings (Not Errors)

The following files generate **warnings** (not errors):

1. `scripts/test-graph-changes.ts` - Testing script with documented DELETE operations
   - DELETE is not yet supported by GraphWriteService API
   - Clearly documented in code comments

### Test Files

All `**/*.test.ts` and `**/*.spec.ts` files are exempt (testing may require direct access).

## Usage

### Check for Violations

```bash
pnpm eslint packages/reg-intel-core/src packages/reg-intel-graph/src scripts
```

### Auto-Fix (Where Possible)

```bash
pnpm eslint --fix packages/reg-intel-core/src packages/reg-intel-graph/src scripts
```

### CI Integration

Add to `.github/workflows` or CI pipeline:

```yaml
- name: Lint codebase
  run: pnpm eslint packages apps scripts
```

## Adding New Write Operations

When adding new write operations:

1. **Add method to GraphWriteService** (e.g. `upsertFoo`, `createBar`)
2. **Use the new method** in your code
3. **ESLint will prevent** direct Cypher writes

## Future Enhancements

Planned rules:

1. Ban direct Bolt driver instantiation outside approved locations
2. Require GraphWriteService import in files that write to graph
3. Flag MCP writes (Memgraph MCP should be read-only per D-028)

---

**See Also:**
- `docs/safety/safety-guards/graph_ingress_guard_v_0_1.md`
- `docs/governance/decisions/versions/decisions_v_0_4.md` (D-026, D-028)
- `docs/PHASE_1_FIXES.md`
