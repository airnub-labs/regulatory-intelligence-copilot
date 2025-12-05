# Local Development Guide

This guide provides comprehensive instructions for setting up and running the Regulatory Intelligence Copilot in local development mode.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Memgraph Setup](#memgraph-setup)
4. [Supabase Setup](#supabase-setup)
5. [Environment Configuration](#environment-configuration)
6. [Running the Application](#running-the-application)
7. [Development Workflow](#development-workflow)
8. [Database Migrations](#database-migrations)
9. [Troubleshooting](#troubleshooting)
10. [Advanced Topics](#advanced-topics)

---

## Prerequisites

Before starting, ensure you have the following installed:

### Required

- **Node.js 24+ LTS** – Required for all packages. See `docs/node_24_lts_rationale.md` for details.
  ```bash
  node --version  # Should be >= 24.0.0
  ```

- **pnpm 8+** – Package manager for the monorepo
  ```bash
  npm install -g pnpm
  pnpm --version  # Should be >= 8.0.0
  ```

- **Docker & Docker Compose** – For Memgraph, Supabase, and other infrastructure
  ```bash
  docker --version
  docker compose version
  ```

- **Git** – For version control
  ```bash
  git --version
  ```

### Optional but Recommended

- **Supabase CLI** – For local Supabase development
  ```bash
  # macOS
  brew install supabase/tap/supabase

  # Linux
  curl -fsSL https://raw.githubusercontent.com/supabase/cli/main/install.sh | sh

  # Windows (PowerShell)
  scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
  scoop install supabase
  ```

- **LLM Provider API Keys** – At least one of:
  - OpenAI API key (for GPT-4, GPT-OSS models)
  - Groq API key (for Llama, Mixtral)
  - Local model endpoint (vLLM, Ollama, etc.)

- **E2B API Key** (optional) – For sandboxed code execution
  - Sign up at [e2b.dev](https://e2b.dev)

---

## Initial Setup

### 1. Clone the Repository

```bash
git clone https://github.com/<your-org>/regulatory-intelligence-copilot.git
cd regulatory-intelligence-copilot
```

### 2. Install Dependencies

```bash
pnpm install
```

This installs all dependencies for the monorepo (apps and packages).

### 3. Verify Installation

```bash
# Check that packages are linked correctly
pnpm list --depth=0

# Verify builds work
pnpm build
```

---

## Memgraph Setup

Memgraph is the core knowledge graph database. The project uses **Memgraph Platform** which includes:
- Memgraph database
- Memgraph Lab (web UI)
- MAGE (graph algorithms)

### Start Memgraph

Using the provided Docker Compose configuration:

```bash
# Start Memgraph and Memgraph MCP server
docker compose -f docker/docker-compose.yml up -d memgraph memgraph-mcp
```

### Seed the graph for local testing

The repository ships with a guard-railed seeding script that uses `GraphWriteService` (and therefore the Graph Ingress Guard)
to load a minimal Ireland/EU test dataset. This is safe for local use and keeps Memgraph PII-free.

```bash
# Requires Memgraph to be running locally
# Uses MEMGRAPH_URI / MEMGRAPH_USERNAME / MEMGRAPH_PASSWORD if set
pnpm dlx tsx scripts/seed-graph.ts
```

The script clears existing data in the target Memgraph instance before inserting the sample dataset. Comment out the `clear`
step inside `scripts/seed-graph.ts` if you want to preserve existing local data between runs.

### Verify Memgraph is Running

```bash
# Check container status
docker ps | grep memgraph

# Check logs
docker logs memgraph
```

You should see:
```
Memgraph is up and running
```

### Access Memgraph Lab

Open your browser to:

- **URL**: `http://localhost:7444/`

Memgraph Lab provides:
- Visual graph exploration
- Cypher query editor with syntax highlighting
- Schema visualization
- Query performance profiling
- MAGE algorithm access

### Initial Graph Schema Setup

The `scripts/seed-graph.ts` script (see above) is the recommended way to stand up a fresh local dataset with the correct guard
rails. If you want to inspect or extend the schema manually, you can run Cypher in Memgraph Lab.

Example schema setup queries:

```cypher
// Create constraints (if supported by Memgraph)
CREATE CONSTRAINT ON (s:Section) ASSERT s.id IS UNIQUE;
CREATE CONSTRAINT ON (j:Jurisdiction) ASSERT j.code IS UNIQUE;

// Create indexes for common queries
CREATE INDEX ON :Section(jurisdiction);
CREATE INDEX ON :Benefit(jurisdiction);
CREATE INDEX ON :ProfileTag(name);

// Sample jurisdiction nodes
CREATE (:Jurisdiction {code: 'IE', name: 'Ireland'});
CREATE (:Jurisdiction {code: 'UK', name: 'United Kingdom'});
CREATE (:Jurisdiction {code: 'NI', name: 'Northern Ireland'});
CREATE (:Jurisdiction {code: 'EU', name: 'European Union'});
```

### Memgraph MCP Server

The Memgraph MCP server exposes graph tools via MCP protocol:

- **Endpoint**: `http://localhost:8001`
- **Tools**: Graph queries, updates, schema operations

Verify MCP server:

```bash
curl http://localhost:8001/health
# Should return: {"status": "healthy"}
```

---

## Supabase Setup

Supabase provides multi-tenant storage, authentication, and APIs. For local development, we run a complete Supabase stack.

### Install Supabase CLI

If not already installed (see Prerequisites):

```bash
# macOS
brew install supabase/tap/supabase

# Linux
curl -fsSL https://raw.githubusercontent.com/supabase/cli/main/install.sh | sh
```

### Initialize Supabase

First time only:

```bash
supabase init
```

This creates a `supabase/` directory with:
- `config.toml` – Supabase configuration
- `migrations/` – Database migrations
- `seed.sql` – Seed data

### Start Supabase

```bash
supabase start
```

This starts all Supabase services:
- **PostgreSQL** – Database (port 54322)
- **PostgREST** – Auto-generated REST API (port 54321)
- **GoTrue** – Authentication service
- **Realtime** – Real-time subscriptions
- **Storage** – Object storage
- **Studio** – Web UI (port 54323)

**First run takes 5-10 minutes** to download Docker images.

On the very first start you will also see a **notice** similar to:

```
NOTICE: Seeded demo user with id <user-id> and tenant id <tenant-id>
```

Copy these IDs into the **repository root** `.env.local` (the demo web app reads from the root env file; you do *not* need a separate `apps/demo-web/.env.local`).

### Access Supabase Studio

Open your browser to:

- **URL**: `http://localhost:54323`

Supabase Studio provides:
- Table editor (view and edit data)
- SQL editor
- Authentication management
- Storage browser
- API documentation

### Get Connection Details

After `supabase start`, you'll see:

```
API URL: http://localhost:54321
GraphQL URL: http://localhost:54321/graphql/v1
DB URL: postgresql://postgres:postgres@localhost:54322/postgres
Studio URL: http://localhost:54323
Inbucket URL: http://localhost:54324
JWT secret: <secret>
anon key: <key>
service_role key: <key>
```

Save these for your `.env` file.

### Seed demo data and configure the app

1. **Reset and seed** the local database so the demo tenant, user, personas, and quick prompts exist:

   ```bash
   supabase db reset --use-mig --seed supabase/seed/demo_seed.sql
   ```

   The seed will **generate IDs** for the demo tenant/user (so database sequences remain untouched). Capture them with:

   ```bash
   # Uses the default local Supabase Postgres port and password
   PGPASSWORD=postgres psql "postgresql://postgres@localhost:54322/postgres" \
     -c "select id as demo_user_id, raw_user_meta_data->>'tenant_id' as demo_tenant_id from auth.users where email='demo.user@example.com';"
   ```

2. **Expose Supabase to the platform** by adding these values to `.env.local` (use the URLs/keys printed by `supabase start`):

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-from-supabase-start>
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key-from-supabase-start>
   SUPABASE_DEMO_TENANT_ID=<demo_tenant_id-from-query-above>
   NEXT_PUBLIC_SUPABASE_DEMO_USER_ID=<demo_user_id-from-query-above>
   ```

   The demo web app reads these values to call the API with the seeded Supabase user instead of the previous hardcoded demo header.

### Stop Supabase

When done developing:

```bash
supabase stop
```

To completely reset Supabase (delete all data):

```bash
supabase stop --no-backup
```

---

## Environment Configuration

### Create Environment File

Copy the example environment file:

```bash
cp .env.example .env.local
```

Or create `.env.local` manually:

```bash
# =============================================================================
# LOCAL DEVELOPMENT ENVIRONMENT
# =============================================================================

# -----------------------------------------------------------------------------
# LLM Provider Configuration
# -----------------------------------------------------------------------------

# OpenAI
OPENAI_API_KEY=sk-...

# Groq
GROQ_API_KEY=gsk_...

# Local/OSS Models (optional)
LOCAL_LLM_BASE_URL=http://localhost:8000/v1
LOCAL_LLM_API_KEY=dummy  # Some local servers require any value

# -----------------------------------------------------------------------------
# Memgraph Configuration
# -----------------------------------------------------------------------------

MEMGRAPH_URI=bolt://localhost:7687
MEMGRAPH_USERNAME=
MEMGRAPH_PASSWORD=

# Memgraph MCP Server
MCP_GATEWAY_URL=http://localhost:8001

# -----------------------------------------------------------------------------
# Supabase Configuration
# -----------------------------------------------------------------------------

# Get these from `supabase start` output
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-from-supabase-start>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-from-supabase-start>

# Authentication (NextAuth + Supabase demo user)
NEXTAUTH_SECRET=<generate-with-`openssl rand -hex 32`>
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_DEMO_EMAIL=demo.user@example.com
# The demo seed sets password to Password123! for the seeded user in supabase/seed/demo_seed.sql
# The tenant and user IDs are generated at seed time; pull them with the psql command above.

# -----------------------------------------------------------------------------
# E2B Configuration (optional)
# -----------------------------------------------------------------------------

E2B_API_KEY=e2b_...

# -----------------------------------------------------------------------------
# Application Configuration
# -----------------------------------------------------------------------------

# Node environment
NODE_ENV=development

# Next.js
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Logging
LOG_LEVEL=debug

# Conversation + graph write modes (override defaults when needed)
# COPILOT_CONVERSATIONS_MODE=auto
# COPILOT_GRAPH_WRITE_MODE=auto
```

### Environment Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes* | OpenAI API key for GPT models |
| `GROQ_API_KEY` | Yes* | Groq API key for Llama/Mixtral |
| `LOCAL_LLM_BASE_URL` | Yes* | Local model endpoint (vLLM, Ollama) |
| `MEMGRAPH_URI` | Yes | Memgraph Bolt connection URI |
| `MEMGRAPH_USERNAME` | No | Memgraph username (empty for local) |
| `MEMGRAPH_PASSWORD` | No | Memgraph password (empty for local) |
| `MCP_GATEWAY_URL` | Yes | Memgraph MCP server URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |
| `SUPABASE_DEMO_TENANT_ID` | Yes (demo) | Tenant ID returned by the seed query for the demo user |
| `NEXT_PUBLIC_SUPABASE_DEMO_USER_ID` | Yes (demo) | User ID returned by the seed query for the demo user |
| `COPILOT_CONVERSATIONS_MODE` | No | Conversation store mode: `auto` (default) uses Supabase when credentials are set, otherwise memory; `supabase` forces Supabase; `memory` forces in-memory (testing only) |
| `COPILOT_GRAPH_WRITE_MODE` | No | Concept capture write mode: `auto` (default) uses Memgraph when `MEMGRAPH_URI` is present, otherwise disables writes; `memgraph` requires Memgraph connectivity; `memory` forces in-memory no-op writes |
| `E2B_API_KEY` | No | E2B sandbox API key |

\* At least one LLM provider required

#### Conversation & graph write modes

- **Conversations**: By default (`COPILOT_CONVERSATIONS_MODE=auto`), the Next adapter uses Supabase/Postgres when `SUPABASE_*` credentials are present and falls back to an in-memory store when they are not. Set `supabase` to fail fast if credentials are missing, or `memory` to intentionally use the in-memory store for local tests and demos.
- **Graph writes / concept capture**: `COPILOT_GRAPH_WRITE_MODE=auto` attempts to write captured concepts to Memgraph when `MEMGRAPH_URI` (and optional credentials) are configured. If Memgraph is not configured, concept capture downgrades to an in-memory no-op with a warning. Use `memgraph` to require connectivity, or `memory` to block writes for tests without Memgraph.

### Verify Configuration

```bash
# Check environment variables are loaded
pnpm --filter @regulatory-copilot/demo-web dev --help
# Should not show any missing env var errors
```

---

## Running the Application

### Start All Services

1. **Start Memgraph**:
   ```bash
   docker compose -f docker/docker-compose.yml up -d memgraph memgraph-mcp
   ```

2. **Start Supabase**:
   ```bash
   supabase start
   ```

3. **Start Next.js dev server**:
   ```bash
   pnpm dev
   ```

4. **Open the application**:
   - Chat UI: `http://localhost:3000`
   - Memgraph Lab: `http://localhost:7444`
   - Supabase Studio: `http://localhost:54323`

### Development Scripts

From the repository root:

```bash
# Start dev server
pnpm dev

# Build all packages
pnpm build

# Run linting
pnpm lint

# Run type checking
pnpm type-check

# Run tests (when available)
pnpm test

# Clean build artifacts
pnpm clean
```

From a specific app (e.g., `apps/demo-web`):

```bash
# Start only the web app
pnpm --filter @regulatory-copilot/demo-web dev

# Build only the web app
pnpm --filter @regulatory-copilot/demo-web build

# Lint only the web app
pnpm --filter @regulatory-copilot/demo-web lint
```

---

## Development Workflow

### Typical Development Cycle

1. **Start infrastructure** (Memgraph, Supabase)
2. **Start dev server** (`pnpm dev`)
3. **Make code changes**
4. **Hot reload** – Changes apply automatically
5. **Test in browser** – Chat UI updates live
6. **Inspect graph** – Use Memgraph Lab to verify graph changes
7. **Check database** – Use Supabase Studio to verify data changes

### Working with the Graph

#### Query the Graph

Open Memgraph Lab (`http://localhost:7444`) and run Cypher queries:

```cypher
// Find all benefits for Ireland
MATCH (b:Benefit)-[:IN_JURISDICTION]->(j:Jurisdiction {code: 'IE'})
RETURN b.name, b.id

// Find rules that require other rules
MATCH (r1:Section)-[:REQUIRES]->(r2:Section)
RETURN r1.id, r2.id

// Find timeline constraints
MATCH (b:Benefit)-[:LOOKBACK_WINDOW]->(t:Timeline)
RETURN b.name, t.duration, t.unit
```

#### Add Sample Data

```cypher
// Create a sample benefit with timeline
CREATE (b:Benefit {
  id: 'ie-illness-benefit',
  name: 'Illness Benefit',
  jurisdiction: 'IE',
  description: 'Short-term payment for people unable to work due to illness'
})
CREATE (t:Timeline {
  id: 'ie-illness-benefit-prsi-lookback',
  type: 'LOOKBACK_WINDOW',
  duration: 52,
  unit: 'WEEKS',
  description: 'Must have 52 weeks of PRSI contributions in last 2 years'
})
CREATE (b)-[:LOOKBACK_WINDOW]->(t)
```

### Working with Supabase

#### Run Migrations

Create a new migration:

```bash
supabase migration new my_migration_name
```

Edit `supabase/migrations/<timestamp>_my_migration_name.sql`:

```sql
-- Create a table for user profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  persona TEXT,
  jurisdictions TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);
```

Apply migrations:

```bash
supabase db reset  # Resets database and applies all migrations
```

#### Seed Data

Edit `supabase/seed.sql`:

```sql
-- Insert sample profiles
INSERT INTO public.profiles (id, persona, jurisdictions)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'self-employed', ARRAY['IE']),
  ('00000000-0000-0000-0000-000000000002', 'single-director', ARRAY['IE', 'UK']);
```

Apply seeds:

```bash
supabase db reset  # Also runs seed.sql
```

---

## Database Migrations

### Memgraph Migrations

Currently manual via Cypher scripts. Best practices:

1. **Create migration files** in `migrations/memgraph/`:
   ```
   migrations/memgraph/
     001_initial_schema.cypher
     002_add_timeline_nodes.cypher
     003_add_eu_regulations.cypher
   ```

2. **Run migrations** via Memgraph Lab or CLI:
   ```bash
   docker exec -it memgraph mgconsole < migrations/memgraph/001_initial_schema.cypher
   ```

3. **Version control** – Commit migration files to Git

### Supabase Migrations

Managed automatically via Supabase CLI:

1. **Create migration**:
   ```bash
   supabase migration new add_user_preferences
   ```

2. **Edit migration file**:
   ```sql
   -- supabase/migrations/<timestamp>_add_user_preferences.sql
   CREATE TABLE IF NOT EXISTS public.user_preferences (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES auth.users(id),
     theme TEXT DEFAULT 'dark',
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

3. **Apply locally**:
   ```bash
   supabase db reset
   ```

4. **Deploy to production** (when ready):
   ```bash
   supabase db push
   ```

---

## Troubleshooting

### Memgraph Issues

**Problem**: Can't connect to Memgraph

```
Error: Failed to connect to bolt://localhost:7687
```

**Solution**:
```bash
# Check if Memgraph is running
docker ps | grep memgraph

# Check logs
docker logs memgraph

# Restart Memgraph
docker compose -f docker/docker-compose.yml restart memgraph
```

**Problem**: Memgraph Lab not loading

**Solution**:
- Ensure Memgraph container is running
- Check port 7444 is not in use: `lsof -i :7444`
- Access via `http://localhost:7444` (not `https`)

### Supabase Issues

**Problem**: Supabase services won't start

```
Error: port 54321 already in use
```

**Solution**:
```bash
# Stop any existing Supabase instances
supabase stop

# Check what's using the port
lsof -i :54321

# Start with fresh state
supabase stop --no-backup
supabase start
```

**Problem**: Database migrations failing

**Solution**:
```bash
# Reset database completely
supabase db reset

# If that fails, stop and start fresh
supabase stop --no-backup
supabase start
```

### Next.js Issues

**Problem**: Hot reload not working

**Solution**:
```bash
# Clear Next.js cache
rm -rf apps/demo-web/.next

# Restart dev server
pnpm dev
```

**Problem**: Environment variables not loading

**Solution**:
- Ensure `.env.local` exists in repository root
- Restart dev server (env vars loaded on startup)
- Check for typos in variable names
- For `NEXT_PUBLIC_*` vars, rebuild if changed

### LLM Provider Issues

**Problem**: OpenAI API errors

```
Error: 401 Unauthorized
```

**Solution**:
- Verify API key is correct in `.env.local`
- Check API key has credits: https://platform.openai.com/usage
- Ensure key has access to GPT-4 (if using GPT-4)

**Problem**: Streaming not working

**Solution**:
- Check LLM router configuration in `packages/compliance-core/src/llm/`
- Verify provider supports streaming
- Check console for SSE parsing errors

---

## Advanced Topics

### Running Local LLM Models

Use vLLM or Ollama for local/OSS models:

#### Option 1: vLLM

```bash
# Start vLLM server with Llama 3 70B
docker run --gpus all -p 8000:8000 \
  vllm/vllm-openai:latest \
  --model meta-llama/Meta-Llama-3-70B-Instruct

# Update .env.local
LOCAL_LLM_BASE_URL=http://localhost:8000/v1
```

#### Option 2: Ollama

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull llama3:70b

# Start Ollama server (runs automatically on install)
# Exposed at http://localhost:11434

# Update .env.local
LOCAL_LLM_BASE_URL=http://localhost:11434/v1
```

### Multi-Tenant Development

To test multi-tenant features:

1. **Create multiple Supabase users**:
   ```sql
   -- In Supabase Studio SQL editor
   INSERT INTO auth.users (email, encrypted_password)
   VALUES ('tenant1@example.com', crypt('password', gen_salt('bf')));
   ```

2. **Create tenant profiles**:
   ```sql
   INSERT INTO public.profiles (id, persona, jurisdictions)
   VALUES (
     (SELECT id FROM auth.users WHERE email = 'tenant1@example.com'),
     'self-employed',
     ARRAY['IE']
   );
   ```

3. **Test with different auth tokens** in API calls

### E2B Sandbox Development

To enable sandboxed code execution:

1. **Sign up for E2B**: https://e2b.dev
2. **Get API key**: Dashboard → API Keys
3. **Add to `.env.local`**:
   ```bash
   E2B_API_KEY=e2b_...
   ```

4. **Test sandbox** (when implemented):
   ```typescript
   // In an agent or MCP tool
   const result = await e2bSandbox.runCode(`
     import requests
     # Fetch legal document...
   `);
   ```

### Performance Profiling

#### Memgraph Query Profiling

```cypher
// Use EXPLAIN for query plan
EXPLAIN MATCH (b:Benefit) RETURN b;

// Use PROFILE for execution stats
PROFILE MATCH (b:Benefit)-[:REQUIRES]->(r) RETURN b, r;
```

#### Next.js Performance

```bash
# Build with bundle analyzer
ANALYZE=true pnpm build

# Check bundle sizes in .next/analyze/
```

### Debugging Tips

1. **Enable debug logging**:
   ```bash
   # In .env.local
   LOG_LEVEL=debug
   ```

2. **Use Chrome DevTools** for Next.js:
   - Open Dev Console
   - Network tab → Filter by SSE to see streaming
   - Application tab → Local Storage for client state

3. **Memgraph query debugging**:
   - Use `EXPLAIN` and `PROFILE` in queries
   - Check indexes with `SHOW INDEX INFO;`

4. **Supabase debugging**:
   - Check Supabase logs: `supabase logs`
   - Use SQL editor to inspect data directly

---

## Additional Resources

- **Architecture Documentation**: `docs/architecture/architecture_v_0_6.md`
- **Agent Design**: `AGENTS.md`
- **Graph Schema**: `docs/specs/graph-schema/graph_schema_v_0_6.md`
- **Concept Capture & Conversation Context**: `docs/specs/conversation-context/concept_capture_from_main_chat_v_0_1.md` and `docs/specs/conversation-context/conversation_context_spec_v_0_1.md`
- **Roadmap & Decisions**: `docs/roadmap/roadmap_v_0_6.md` and `docs/decisions/decisions_v_0_6.md`
- **UI Implementation**: `apps/demo-web/UI_IMPLEMENTATION.md`

---

## Getting Help

If you encounter issues not covered here:

1. **Check the docs** – Most common issues are documented
2. **Search GitHub Issues** – Someone may have had the same problem
3. **Open an issue** – Include:
   - Steps to reproduce
   - Error messages and logs
   - Environment details (OS, Node version, etc.)
4. **Ask in discussions** – For questions and general help

---

## Next Steps

Once your local environment is running:

1. **Explore the UI** – Try the chat interface at `http://localhost:3000`
2. **Inspect the graph** – Use Memgraph Lab to explore the knowledge graph
3. **Read the architecture docs** – Understand the system design
4. **Add sample data** – Create test scenarios in the graph
5. **Implement features** – Follow the roadmap in `docs/roadmap/roadmap_v_0_6.md`

Happy developing! 🚀
