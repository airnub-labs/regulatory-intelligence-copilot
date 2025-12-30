# Memgraph Index Setup

This directory contains scripts for creating and managing Memgraph indices to optimize query performance for the Regulatory Intelligence Copilot.

## Files

- **`memgraph-indices.cypher`** - Cypher script with all index definitions
- **`setup-memgraph-indices.ts`** - TypeScript script for programmatic index creation

## Why Indices?

Indices significantly improve query performance by:
- **Faster ID lookups**: Primary key lookups use O(1) instead of O(n)
- **Efficient filtering**: Property-based filters avoid full table scans
- **Change detection**: Timestamp indices enable fast delta queries
- **Search optimization**: Label/name indices speed up keyword searches

## Usage

### Option 1: Using the TypeScript Script (Recommended)

```bash
# Using default connection (bolt://localhost:7687)
tsx scripts/setup-memgraph-indices.ts

# With custom connection
MEMGRAPH_URI=bolt://your-host:7687 tsx scripts/setup-memgraph-indices.ts

# With authentication
MEMGRAPH_URI=bolt://your-host:7687 \
MEMGRAPH_USERNAME=admin \
MEMGRAPH_PASSWORD=secret \
tsx scripts/setup-memgraph-indices.ts
```

### Option 2: Using Cypher Script Directly

Run the Cypher script directly in Memgraph Lab or via mgconsole:

```bash
# Using mgconsole
mgconsole < scripts/memgraph-indices.cypher

# Or copy-paste into Memgraph Lab query editor
```

## Index Categories

### 1. Primary ID Indices (24 indices)
```cypher
CREATE INDEX ON :Benefit(id);
CREATE INDEX ON :Relief(id);
CREATE INDEX ON :Section(id);
...
```
**Impact**: Speeds up all ID-based node lookups by 100-1000x

### 2. Timestamp Indices (4 indices)
```cypher
CREATE INDEX ON :Benefit(updated_at);
CREATE INDEX ON :Relief(updated_at);
...
```
**Impact**: Critical for GraphChangeDetector timestamp-based queries

### 3. Property Indices (7 indices)
```cypher
CREATE INDEX ON :TaxYear(year);
CREATE INDEX ON :Rate(category);
...
```
**Impact**: Speeds up filtered queries (WHERE clauses)

### 4. Search Indices (6 indices)
```cypher
CREATE INDEX ON :Benefit(label);
CREATE INDEX ON :Benefit(name);
...
```
**Impact**: Improves keyword search performance

## Verification

After running the index creation script, verify indices were created:

```cypher
// In Memgraph Lab or mgconsole
SHOW INDEX INFO;
```

You should see all 41 indices listed.

## Performance Impact

Expected performance improvements:

| Query Type | Without Indices | With Indices | Improvement |
|------------|----------------|--------------|-------------|
| ID lookup | O(n) scan | O(1) hash | 100-1000x |
| Timestamp filter | O(n) scan | O(log n) index | 10-100x |
| Property filter | O(n) scan | O(log n) index | 10-100x |
| Keyword search | O(n) scan | O(log n) index | 10-100x |

## Troubleshooting

### Index Already Exists
If you see warnings like "already exists (skipped)", this is normal and safe. The script is idempotent.

### Connection Failed
Ensure Memgraph is running and accessible:
```bash
# Check if Memgraph is running
docker ps | grep memgraph

# Test connection
echo "RETURN 1;" | mgconsole
```

### Authentication Error
Ensure MEMGRAPH_USERNAME and MEMGRAPH_PASSWORD are set if your Memgraph instance requires authentication.

## Related Documentation

- [Memgraph Indices Documentation](https://memgraph.com/docs/fundamentals/indexes)
- [Graph ID Resolution Implementation Plan](../docs/architecture/GRAPH_ID_RESOLUTION_IMPLEMENTATION.md)
