# Environment Variables Setup Guide

This repository uses different `.env` files for different purposes. This guide explains which file to use and when.

## Overview

```
regulatory-intelligence-copilot/
├── .env.example              # For repository scripts (graph seeding, migrations)
└── apps/
    └── demo-web/
        └── .env.local.example # For the Next.js web application
```

## Quick Start

### 1. For Running the Web Application

**Location:** `apps/demo-web/.env.local`

```bash
cd apps/demo-web
cp .env.local.example .env.local
# Edit .env.local with your API keys
pnpm dev
```

**Required Variables:**
- At least ONE LLM provider API key (GROQ_API_KEY, OPENAI_API_KEY, etc.)
- PERPLEXITY_API_KEY (for web search)
- Supabase configuration (for conversation storage)
- NEXTAUTH_SECRET (for authentication)

See [`apps/demo-web/.env.local.example`](./apps/demo-web/.env.local.example) for the complete list with documentation.

### 2. For Running Repository Scripts

**Location:** `.env` (root level)

```bash
# From repository root
cp .env.example .env
# Edit .env with database credentials
pnpm tsx scripts/seed-graph.ts
```

**Required Variables:**
- MEMGRAPH_URI (for graph seeding scripts)
- SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (for migration scripts)

See [`.env.example`](./.env.example) for details.

## Detailed Breakdown

### Root `.env` (Repository Scripts)

**Purpose:** Running repository-level maintenance and setup scripts

**Used by:**
- `scripts/seed-graph.ts` - Seeds the Memgraph database with regulatory rules
- `scripts/seed-special-jurisdictions.ts` - Seeds special jurisdiction data
- `scripts/test-graph-changes.ts` - Tests graph database connectivity
- `scripts/apply-migration.ts` - Applies Supabase database migrations

**Configuration File:** `.env.example` → `.env`

**Variables:**
| Variable | Purpose | Required For |
|----------|---------|--------------|
| `MEMGRAPH_URI` | Memgraph connection | Graph seeding scripts |
| `MEMGRAPH_USERNAME` | Memgraph auth | Graph seeding (if auth enabled) |
| `MEMGRAPH_PASSWORD` | Memgraph auth | Graph seeding (if auth enabled) |
| `SUPABASE_URL` | Supabase connection | Migration scripts |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin access | Migration scripts |

### Web App `.env.local` (Next.js Application)

**Purpose:** Running the demo web application

**Used by:**
- `apps/demo-web` - The Next.js web application
- All API routes and server components

**Configuration File:** `apps/demo-web/.env.local.example` → `apps/demo-web/.env.local`

**Variable Categories:**

#### Required Variables

1. **LLM Provider** (at least one):
   - `GROQ_API_KEY` - Groq API for fast inference
   - `OPENAI_API_KEY` - OpenAI GPT models
   - `ANTHROPIC_API_KEY` - Anthropic Claude models
   - `GOOGLE_GENERATIVE_AI_API_KEY` - Google Gemini models

2. **Web Search:**
   - `PERPLEXITY_API_KEY` - Perplexity API for web search via MCP

3. **Database:**
   - `MEMGRAPH_URI` - Graph database connection
   - `NEXT_PUBLIC_SUPABASE_URL` - Supabase API URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
   - `SUPABASE_SERVICE_ROLE_KEY` - Supabase admin key

4. **Authentication:**
   - `NEXTAUTH_SECRET` - Secret for NextAuth (generate with `openssl rand -base64 32`)
   - `NEXTAUTH_URL` - Your application URL (e.g., http://localhost:3000)

#### Optional Variables

1. **Code Execution:**
   - `E2B_API_KEY` - E2B API for sandboxed Python execution

2. **Local LLM:**
   - `LOCAL_LLM_BASE_URL` - OpenAI-compatible local LLM endpoint

3. **Mode Configuration:**
   - `COPILOT_CONVERSATIONS_MODE` - Storage mode: 'auto', 'memory', 'supabase'
   - `COPILOT_GRAPH_WRITE_MODE` - Graph writes: 'auto', 'enabled', 'disabled'

4. **Observability (OpenTelemetry):**
   - `OTEL_SERVICE_NAME` - Service name for traces
   - `OTEL_EXPORTER_OTLP_ENDPOINT` - OTLP collector endpoint
   - `OTEL_TRACES_SAMPLING_RATIO` - Trace sampling ratio (0.0-1.0)

5. **Logging:**
   - `LOG_LEVEL` - Log level: 'debug', 'info', 'warn', 'error'
   - `LOG_SAFE_PAYLOADS` - Log sanitized payloads: 'true' or 'false'

6. **Cron Jobs:**
   - `CRON_SECRET` - Secret for authenticating cron endpoints

## Package-Level Configuration

Individual packages (under `packages/`) do not require their own `.env` files. They are imported as libraries and use the environment variables from the consuming application (web app or scripts).

## Common Issues

### "Module not found" errors during build

If you see module resolution errors during `pnpm build`, ensure you're using `pnpm dev` instead. The production build has known Turbopack limitations with workspace packages.

### Missing API keys

The application will fail to start if required environment variables are missing. Check the console output for specific missing variables.

### Supabase connection issues

Ensure Supabase is running locally with `supabase start` and the credentials in your `.env.local` match the output of `supabase status`.

## Getting API Keys

- **Groq:** https://console.groq.com/keys
- **OpenAI:** https://platform.openai.com/api-keys
- **Anthropic:** https://console.anthropic.com/settings/keys
- **Google Gemini:** https://ai.google.dev/gemini-api/docs/api-key
- **Perplexity:** https://www.perplexity.ai/settings/api
- **E2B:** https://e2b.dev/dashboard/api-keys

## Examples

### Minimal Setup (Web App)

```bash
# apps/demo-web/.env.local
GROQ_API_KEY=gsk_xxx
PERPLEXITY_API_KEY=pplx-xxx
MEMGRAPH_URI=bolt://localhost:7687
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx
NEXTAUTH_SECRET=$(openssl rand -base64 32)
NEXTAUTH_URL=http://localhost:3000
```

### Full Production Setup

See `apps/demo-web/.env.local.example` for a complete production-ready configuration with all optional features enabled.

## Troubleshooting

1. **Check which file is being loaded:**
   - Web app: `apps/demo-web/.env.local`
   - Scripts: `.env` in repository root

2. **Verify file exists:**
   ```bash
   ls -la apps/demo-web/.env.local
   ls -la .env
   ```

3. **Validate syntax:**
   - No spaces around `=`
   - No quotes needed for values (unless value contains spaces)
   - One variable per line

4. **Restart after changes:**
   - Kill dev server and restart: `Ctrl+C` then `pnpm dev`
   - Rebuild if needed: `pnpm build`

## Security Notes

⚠️ **Never commit `.env` or `.env.local` files to git!**

- `.env.example` and `.env.local.example` are templates (safe to commit)
- `.env` and `.env.local` contain actual secrets (in `.gitignore`)
- Use different secrets for development and production
- Rotate API keys regularly
- Use environment-specific variables in CI/CD
