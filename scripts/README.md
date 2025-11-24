# Scripts

This directory contains utility scripts for the Regulatory Intelligence Copilot.

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
