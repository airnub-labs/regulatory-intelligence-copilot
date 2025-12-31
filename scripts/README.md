# Scripts

This directory contains utility scripts for the Regulatory Intelligence Copilot.

## Quick Start

```bash
# Setup Memgraph indices (run this first for optimal performance)
pnpm setup:indices

# Seed basic Irish regulatory data
pnpm seed:graph

# Seed special jurisdictions (IE/UK/NI/IM/EU, CTA, NI Protocol)
pnpm seed:jurisdictions

# Seed everything
pnpm seed:all
```

## Recommended Setup Order

For a new Memgraph instance:

1. **Create indices** - `pnpm setup:indices` (optimal query performance)
2. **Seed graph data** - `pnpm seed:all` (regulatory data)
3. **Verify** - Check Memgraph Lab at http://localhost:7444

## Graph Seeding (`seed-graph.ts`)

Seeds the Memgraph database with minimal Ireland regulatory data for testing and development.

### Prerequisites

1. **Memgraph Running**: Ensure Memgraph is running and accessible
   ```bash
   docker run -p 7687:7687 -p 7444:7444 memgraph/memgraph-platform
   ```

2. **Dependencies**: Install dependencies from project root
   ```bash
   pnpm install
   ```

### Usage

Run the seeding script using `tsx`:

```bash
# From project root
npx tsx scripts/seed-graph.ts
```

### Configuration

The script uses environment variables for connection:

- `MEMGRAPH_URI` - Bolt URI (default: `bolt://localhost:7687`)
- `MEMGRAPH_USERNAME` - Username (optional, not required for default Memgraph)
- `MEMGRAPH_PASSWORD` - Password (optional, not required for default Memgraph)

Example with custom configuration:

```bash
MEMGRAPH_URI=bolt://my-memgraph:7687 npx tsx scripts/seed-graph.ts
```

### What Gets Seeded

The script creates a minimal regulatory graph for Ireland:

#### Jurisdictions
- **Ireland (IE)** - Republic of Ireland
- **European Union (EU)** - Supranational entity
- **Malta (MT)** - For cross-border testing

#### Profile Tags
- **Single Director (Ireland)** - Single director, Class S PRSI
- **Self-Employed (Ireland)** - Self-employed, Class S PRSI
- **PAYE Employee (Ireland)** - PAYE employee, Class A PRSI

#### Benefits
- **Jobseeker's Benefit (Self-Employed)** - Weekly payment for self-employed who lose their job
- **Illness Benefit (Class S)** - Payment for self-employed unable to work due to illness
- **Treatment Benefit** - Dental and optical benefits for PRSI contributors

#### Timelines
- **2-Year Lookback** - Common PRSI contribution lookback period
- **12-Month Lookback** - One-year lookback for recent contributions
- **39-Week Lookback** - Specific lookback for Jobseeker's Benefit
- **4-Year Lock-in** - Lock-in period for certain tax reliefs

#### Conditions
- **PRSI Class S Required** - Must be paying Class S contributions
- **Minimum 104 Weeks Contributions** - 2 years of contributions
- **Minimum 39 Weeks Contributions** - 39 weeks in relevant period
- **Ceased Self-Employment** - Must have stopped trading

#### Statutory Sections
- **Social Welfare Consolidation Act 2005, Section 62** - Jobseeker's Benefit
- **Social Welfare Consolidation Act 2005, Section 41** - Illness Benefit

### Idempotence

The script uses `MERGE` operations exclusively, making it **safe to run multiple times**. It will:
- Create nodes/relationships if they don't exist
- Update properties if nodes already exist
- Not create duplicates

### Clearing Data

The script includes a **clear data** step at the beginning:

```typescript
await executeCypher(driver, 'MATCH (n) DETACH DELETE n');
```

⚠️ **Warning**: This deletes ALL data in Memgraph. Comment out this line if you want to preserve existing data when re-seeding.

### Output

The script provides detailed progress logging:

```
🌱 Starting graph seeding...
📍 Connecting to: bolt://localhost:7687
✅ Connected to Memgraph
🧹 Clearing existing data...
🌍 Creating jurisdictions...
👤 Creating profile tags...
⏰ Creating timeline nodes...
💰 Creating benefit nodes...
✅ Creating condition nodes...
📜 Creating statutory sections...
🔗 Creating benefit-jurisdiction relationships...
🔗 Creating benefit-profile relationships...
🔗 Creating benefit-condition relationships...
🔗 Creating benefit-timeline relationships...
🔗 Creating benefit-section relationships...

✅ Graph seeding complete!
📊 Created 23 nodes and 35 relationships

📋 Node Summary:
   - Benefit: 3
   - Condition: 4
   - Timeline: 4
   - Jurisdiction: 3
   - ProfileTag: 3
   - Section: 2
```

### Troubleshooting

**Cannot connect to Memgraph**
```
Error: Could not perform discovery. No routing servers available.
```
**Solution**: Ensure Memgraph is running on the specified URI.

**Authentication error**
```
Error: Authentication failure
```
**Solution**: Check `MEMGRAPH_USERNAME` and `MEMGRAPH_PASSWORD` environment variables.

### Next Steps

After seeding:

1. **Query the graph** via the `/api/graph` endpoint
2. **Test agents** using the seeded data
3. **Add more data** by editing the seed script or creating additional seed files

### Adding More Data

To add more regulatory data:

1. Follow the same `MERGE` pattern for idempotence
2. Use consistent naming conventions (e.g., `benefit-`, `condition-`, `timeline-`)
3. Always link to jurisdictions and profile tags
4. Add statutory references where available
5. Create timeline constraints for time-based rules

Example:

```typescript
await executeCypher(driver, `
  MERGE (b:Benefit {id: 'my-new-benefit'})
  SET b.label = 'My New Benefit',
      b.description = '...',
      b.amount = '...'

  MATCH (ie:Jurisdiction {id: 'IE'})
  MERGE (b)-[:IN_JURISDICTION]->(ie)

  MATCH (p:ProfileTag {id: 'single-director-ie'})
  MERGE (b)-[:APPLIES_TO]->(p)
`);
```

---

## Special Jurisdictions Seeding (`seed-special-jurisdictions.ts`)

Seeds Memgraph with special jurisdiction modelling for IE/UK/NI/IM/EU, Common Travel Area (CTA), and Northern Ireland Protocol framework.

Implements the design documented in:
- `docs/architecture/graph/special_jurisdictions_modelling_v_0_1.md`
- `docs/architecture/graph/seed_ni_uk_ie_eu.txt`

### Usage

```bash
# From project root
pnpm seed:jurisdictions

# Or directly with tsx
npx tsx scripts/seed-special-jurisdictions.ts
```

### What Gets Seeded

The script creates the special jurisdiction framework:

#### Jurisdictions (4 nodes)
- **Ireland (IE)** - Sovereign state
- **United Kingdom (UK)** - Sovereign state
- **Isle of Man (IM)** - Crown dependency
- **European Union (EU)** - Supranational entity

#### Regions (1 node)
- **Northern Ireland (NI)** - Special trade region, part of UK
  - Linked via `[:PART_OF]->(UK)`

#### Agreements (3 nodes)
- **Common Travel Area (CTA)** - Mobility cooperation between IE/UK/IM
- **Ireland/Northern Ireland Protocol (NI_PROTOCOL)** - Post-Brexit goods/customs protocol
- **Windsor Framework (WINDSOR_FRAMEWORK)** - Implementing framework for NI Protocol
  - Linked via `[:MODIFIED_BY]->` relationship

#### Regimes (2 nodes)
- **CTA Mobility Rights (CTA_MOBILITY_RIGHTS)** - Rights to live and work across CTA
  - Domain: mobility, Scope: persons
  - Subjects: IE, UK, IM
- **NI EU-Linked Goods Regime (NI_EU_GOODS_REGIME)** - EU single-market rules for goods in NI
  - Domain: goods, Scope: trade/customs/VAT
  - Coordinated with EU, implemented via Windsor Framework
  - Subject: Northern Ireland region only

#### Benefits & Rules
- **CTA Right to Live and Work** - Mobility benefit available across CTA jurisdictions
- **IE-UK Social Security Coordination** - Cross-border social security coordination rule

#### Timelines
- **Brexit Date (BREXIT_DATE)** - 2020-01-31, marking when NI Protocol came into effect

### Key Relationships

The script creates a sophisticated relationship model:

```
(IE)-[:PARTY_TO]->(CTA)-[:ESTABLISHES_REGIME]->(CTA_MOBILITY_RIGHTS)
(UK)-[:PARTY_TO]->(CTA)
(IM)-[:PARTY_TO]->(CTA)

(NI:Region)-[:PART_OF]->(UK)
(NI)-[:SUBJECT_TO_REGIME]->(NI_EU_GOODS_REGIME)

(NI_PROTOCOL)-[:ESTABLISHES_REGIME]->(NI_EU_GOODS_REGIME)
(NI_PROTOCOL)-[:MODIFIED_BY]->(WINDSOR_FRAMEWORK)
(NI_PROTOCOL)-[:EFFECTIVE_FROM]->(BREXIT_DATE:Timeline)

(NI_EU_GOODS_REGIME)-[:COORDINATED_WITH]->(EU)
(NI_EU_GOODS_REGIME)-[:IMPLEMENTED_VIA]->(WINDSOR_FRAMEWORK)
```

### Design Principles

This seeding follows v0.1 special jurisdiction modelling principles:

1. **Constitutional Reality** - NI is modelled as a Region within UK, not a separate Jurisdiction
2. **Regulatory Reality** - EU goods rules apply to NI via the special regime mechanism
3. **Agreement-Regime Pattern** - Treaties/protocols establish regimes that apply to jurisdictions/regions
4. **No Hard-Coding** - All cross-border logic is derivable from the graph structure

### Use Cases

This data enables queries like:

- "Show all regions where EU goods rules apply but that are not in the EU"
- "Which jurisdictions are part of the Common Travel Area?"
- "Explain why VAT treatment differs in NI vs GB"
- "What mobility rights do IE citizens have in the UK?"

### Idempotence

Like `seed-graph.ts`, this script uses `MERGE` operations exclusively, making it safe to run multiple times. It will create nodes if they don't exist, or update properties if they do.

### Running Both Seeders

To seed the complete graph with both Irish regulatory data and special jurisdictions:

```bash
pnpm seed:all
```

This runs `seed-graph.ts` first (Irish benefits/conditions), then `seed-special-jurisdictions.ts` (cross-border framework).

---

## Memgraph Index Setup (`setup-memgraph-indices.ts`)

Creates comprehensive indices in Memgraph for optimal query performance. This script implements the indexing strategy documented in `docs/architecture/GRAPH_ID_RESOLUTION_IMPLEMENTATION.md` (Phase 4).

### Why Indices Matter

Indices provide **10-1000x performance improvements** for graph queries:

| Query Type | Without Indices | With Indices | Improvement |
|------------|----------------|--------------|-------------|
| ID lookup | O(n) scan | O(1) hash | 100-1000x |
| Timestamp filter | O(n) scan | O(log n) index | 10-100x |
| Property filter | O(n) scan | O(log n) index | 10-100x |
| Keyword search | O(n) scan | O(log n) index | 10-100x |

### Usage

```bash
# Using default connection (bolt://localhost:7687)
pnpm setup:indices

# With custom connection
MEMGRAPH_URI=bolt://your-host:7687 pnpm setup:indices

# With authentication
MEMGRAPH_URI=bolt://your-host:7687 \
MEMGRAPH_USERNAME=admin \
MEMGRAPH_PASSWORD=secret \
pnpm setup:indices
```

### What Gets Created

The script creates **41 indices** across 4 categories:

#### 1. Primary ID Indices (24 indices)
Enables O(1) ID-based lookups for all node types:
```cypher
CREATE INDEX ON :Benefit(id);
CREATE INDEX ON :Relief(id);
CREATE INDEX ON :Section(id);
CREATE INDEX ON :Jurisdiction(id);
CREATE INDEX ON :ProfileTag(id);
...
```

#### 2. Timestamp Indices (4 indices)
Critical for GraphChangeDetector timestamp-based queries:
```cypher
CREATE INDEX ON :Benefit(updated_at);
CREATE INDEX ON :Relief(updated_at);
CREATE INDEX ON :Section(updated_at);
CREATE INDEX ON :Obligation(updated_at);
```

#### 3. Property Indices (7 indices)
Speeds up common filter operations:
```cypher
CREATE INDEX ON :TaxYear(year);
CREATE INDEX ON :TaxYear(jurisdiction);
CREATE INDEX ON :Rate(category);
CREATE INDEX ON :Threshold(unit);
...
```

#### 4. Search Indices (6 indices)
Optimizes keyword searches:
```cypher
CREATE INDEX ON :Benefit(label);
CREATE INDEX ON :Benefit(name);
CREATE INDEX ON :Relief(label);
CREATE INDEX ON :Relief(name);
...
```

### Output

The script provides detailed progress logging:

```
========================================
Memgraph Index Setup
========================================
Connecting to: bolt://localhost:7687

✓ Connected to Memgraph successfully

Creating Primary ID Indices...
✓ CREATE INDEX ON :Benefit(id)
✓ CREATE INDEX ON :Relief(id)
...

Creating Timestamp Indices...
✓ CREATE INDEX ON :Benefit(updated_at)
...

Creating Property Indices...
✓ CREATE INDEX ON :TaxYear(year)
...

Creating Search Indices...
✓ CREATE INDEX ON :Benefit(label)
...

========================================
✓ Index setup complete!
  Total indices: 41
========================================
```

### Idempotence

The script is **idempotent** - safe to run multiple times. If an index already exists, it will be skipped with a warning:

```
⚠ CREATE INDEX ON :Benefit(id) - already exists (skipped)
```

### Verification

After running the script, verify indices were created in Memgraph Lab:

```cypher
SHOW INDEX INFO;
```

You should see all 41 indices listed.

### Alternative: Direct Cypher Script

You can also run the raw Cypher script directly:

```bash
# Using mgconsole
mgconsole < scripts/memgraph-indices.cypher

# Or copy-paste into Memgraph Lab query editor at http://localhost:7444
```

### Troubleshooting

**Connection Failed**
```
Error: Could not connect to Memgraph
```
**Solution**: Ensure Memgraph is running:
```bash
docker ps | grep memgraph
```

**Index Already Exists**
```
⚠ CREATE INDEX ON :Benefit(id) - already exists (skipped)
```
**Solution**: This is normal and safe. The index already exists.

### Performance Impact

Expected performance improvements after creating indices:

- **Initial Graph Load** (`/api/graph`): 10-100x faster ID lookups
- **Change Detection** (SSE): 10-100x faster timestamp queries
- **Keyword Search**: 10-100x faster text searches
- **Filtered Queries**: 10-100x faster WHERE clause evaluation

### See Also

- **Full Documentation**: `scripts/README-INDICES.md`
- **Implementation Plan**: `docs/architecture/GRAPH_ID_RESOLUTION_IMPLEMENTATION.md`
- **Memgraph Docs**: https://memgraph.com/docs/fundamentals/indexes

---

## Testing Scripts

### Graph Change Detection Tests (`test-graph-changes.ts`)

Tests the GraphChangeDetector functionality for detecting changes to the Memgraph graph.

#### Usage

```bash
# Test all change detection scenarios
pnpm test:changes

# Test specific change type
pnpm test:changes:add       # Test adding new nodes
pnpm test:changes:update    # Test updating existing nodes
pnpm test:changes:remove    # Test removing nodes
pnpm test:changes:simulate  # Simulate realistic change scenarios
```

#### What It Tests

- **Add Node**: Detects newly created nodes with timestamps
- **Update Node**: Detects property changes to existing nodes
- **Remove Node**: Detects deleted nodes (if tracking is enabled)
- **Simulate**: Runs a realistic change scenario with multiple operations

#### Configuration

Uses the same environment variables as the seeding scripts:
- `MEMGRAPH_URI` - Bolt URI (default: `bolt://localhost:7687`)
- `MEMGRAPH_USERNAME` - Username (optional)
- `MEMGRAPH_PASSWORD` - Password (optional)

### Supabase Store Check (`manual-supabase-store-check.ts`)

Manually tests the Supabase conversation store connectivity and functionality.

#### Usage

```bash
pnpm check:supabase-store
```

#### What It Tests

- Supabase connection and authentication
- Conversation creation and retrieval
- Message storage and retrieval
- Store configuration and mode detection

#### Configuration

Requires Supabase environment variables:
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## Development Scripts

### Quick Reference

```bash
# Development
pnpm dev              # Start all packages in dev mode
pnpm dev:web          # Start only the web app
pnpm build            # Build all packages
pnpm lint             # Lint all packages
pnpm type-check       # Type-check all packages

# Database Setup
pnpm setup:indices    # Create Memgraph indices
pnpm seed:graph       # Seed Irish regulatory data
pnpm seed:jurisdictions  # Seed special jurisdictions
pnpm seed:all         # Seed all data (graph + jurisdictions)

# Testing
pnpm test:changes     # Test graph change detection
pnpm check:supabase-store  # Test Supabase store connectivity
```
