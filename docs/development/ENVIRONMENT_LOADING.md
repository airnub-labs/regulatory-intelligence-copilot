# Environment Variable Loading for Scripts

## Overview

All Memgraph seeding and graph-related scripts now automatically load environment variables from `.env` files with the correct priority:

1. `.env.local` (local overrides - NOT committed to git) - **HIGHEST PRIORITY**
2. `.env` (defaults - committed to git)

This matches Next.js environment loading behavior and ensures local development settings take precedence.

## Affected Scripts

The following scripts now automatically load environment variables:

- `pnpm setup:indices` - Create Memgraph indices
- `pnpm seed:graph` - Seed minimal graph data
- `pnpm seed:graph:realistic` - Seed realistic graph data
- `pnpm seed:graph:realistic:expanded` - Seed expanded realistic data
- `pnpm seed:jurisdictions` - Seed special jurisdictions
- `pnpm test:changes` - Test graph change detection

## Required Environment Variables

All scripts require these Memgraph connection variables (defined in `.env` or `.env.local`):

```bash
# Memgraph connection (required)
MEMGRAPH_URI=bolt://localhost:7687

# Optional authentication
MEMGRAPH_USERNAME=memgraph
MEMGRAPH_PASSWORD=your_password_here
```

## Setup Instructions

### For Local Development

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Edit `.env.local` with your local settings:
   ```bash
   # For local Memgraph (no auth)
   MEMGRAPH_URI=bolt://localhost:7687

   # For remote Memgraph with auth
   MEMGRAPH_URI=bolt+ssc://your-host:7687
   MEMGRAPH_USERNAME=your_username
   MEMGRAPH_PASSWORD=your_password
   ```

3. Run any script - it will automatically load `.env.local`:
   ```bash
   pnpm setup:indices
   pnpm seed:graph:realistic:expanded
   ```

### Verification

When scripts run, you'll see confirmation of environment loading:

```
✓ Loaded environment from .env.local (overrides)
```

Or if using `.env`:

```
✓ Loaded environment from .env
```

## Implementation Details

### Shared Environment Loader

All scripts use a shared `loadEnv()` function from `scripts/load-env.ts`:

```typescript
import { loadEnv } from './load-env.js';

// Load environment variables from .env.local or .env
loadEnv();
```

### Priority Order

1. **System environment variables** - Already set in the shell (LOWEST PRIORITY)
2. **`.env`** - Default values committed to git
3. **`.env.local`** - Local overrides (NOT in git) - **HIGHEST PRIORITY**

Values in `.env.local` will override values in `.env`, which will override system environment variables.

### No More Manual ENV Variables

Before this change, you had to run:
```bash
MEMGRAPH_URI=bolt://localhost:7687 pnpm setup:indices
```

Now you just run:
```bash
pnpm setup:indices
```

The environment variables are automatically loaded from `.env.local` or `.env`.

## Web Application vs Scripts

**IMPORTANT**: There are two separate environment configurations:

### 1. Repository Scripts (Root Level)

Files: `.env` and `.env.local` (in repository root)

Used by:
- Graph seeding scripts
- Database migration scripts
- Test scripts

Environment variables:
- `MEMGRAPH_URI`
- `MEMGRAPH_USERNAME`
- `MEMGRAPH_PASSWORD`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 2. Web Application

Files: `apps/demo-web/.env.local` (in web app directory)

Used by:
- Next.js application
- API routes
- Client-side code

Environment variables:
- `MEMGRAPH_URI`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `GROQ_API_KEY` / `OPENAI_API_KEY`
- `NEXTAUTH_SECRET`
- etc.

## Migration from Previous Setup

If you were previously setting environment variables manually:

**Before:**
```bash
MEMGRAPH_URI=bolt://localhost:7687 tsx scripts/seed-graph.ts
```

**After:**
```bash
# One-time setup: Create .env.local
echo "MEMGRAPH_URI=bolt://localhost:7687" > .env.local

# Now just run the script
pnpm seed:graph
```

## Troubleshooting

### "No .env or .env.local file found" Warning

If you see this warning:
```
⚠ No .env or .env.local file found - using system environment variables
```

**Solution**: Create a `.env.local` file in the repository root:
```bash
cp .env.example .env.local
```

### Scripts Can't Connect to Memgraph

1. Check that Memgraph is running:
   ```bash
   docker compose -f docker/docker-compose.yml up -d memgraph
   ```

2. Verify your `.env.local` has the correct URI:
   ```bash
   cat .env.local | grep MEMGRAPH_URI
   ```

3. Test connection manually:
   ```bash
   pnpm setup:indices
   ```

### Using Different Memgraph Instances

You can easily switch between local and remote Memgraph by updating `.env.local`:

**Local:**
```bash
MEMGRAPH_URI=bolt://localhost:7687
```

**Remote:**
```bash
MEMGRAPH_URI=bolt+ssc://production.memgraph.com:7687
MEMGRAPH_USERNAME=prod_user
MEMGRAPH_PASSWORD=prod_password
```

## Security Notes

- **NEVER commit `.env.local`** - It's in `.gitignore` for security
- `.env.local` should contain local development secrets
- `.env` should only contain safe defaults (no secrets)
- For production, use proper secret management (AWS Secrets Manager, etc.)
