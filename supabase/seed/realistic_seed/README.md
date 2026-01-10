# Realistic Enterprise Seed Data

This directory contains realistic multi-tenant seed data for the Regulatory Intelligence Copilot platform, replacing the generic `demo_seed.sql` with authentic scenarios that reflect real-world usage patterns.

## Overview

The seed data demonstrates the platform's multi-tenant architecture with three distinct user segments:

1. **Enterprise** - DataTech Solutions Ltd (87-employee Irish software company)
2. **Professional Services** - Emerald Tax Consulting (12-person tax advisory firm)
3. **Personal** - Seán O'Brien (freelance IT consultant)
4. **Platform Admins** - 10 admin users with global distribution for 24/7 support

## Seed Files

Files are loaded in order by `supabase db reset` (configured in `supabase/config.toml`):

| File | Description | Users | Tenant Type |
|------|-------------|-------|-------------|
| `01_enterprise_datatech.sql` | DataTech Solutions enterprise tenant | 12 | enterprise |
| `02_pro_emerald_tax.sql` | Emerald Tax Consulting pro tenant | 6 | team (pro) |
| `03_personal_sean.sql` | Seán O'Brien personal workspace | 1 | personal (free) |
| `04_platform_admins.sql` | Platform admin users (global support) | 10 | N/A |
| `05_reference_data.sql` | Personas, quick prompts, model pricing | N/A | N/A |

## Usage

### Seeding the Database

```bash
# From monorepo root
supabase db reset

# This will:
# 1. Drop and recreate the database
# 2. Apply all migrations from supabase/migrations/
# 3. Run all seed files from supabase/seed/realistic_seed/ in order
```

### Login Credentials

**All users share the same password:** `Password123!`

**Enterprise Users (DataTech Solutions):**
- `niamh.mccarthy@datatech.ie` - CEO (owner)
- `ronan.osullivan@datatech.ie` - CFO (admin)
- `siobhan.walsh@datatech.ie` - Finance Director (admin)
- `declan.ryan@datatech.ie` - Finance Manager (member)
- `aoife.murphy@datatech.ie` - Payroll Specialist (member)
- `liam.fitzgerald@datatech.ie` - CTO (admin)
- `ciaran.burke@datatech.ie` - Engineering Lead (member)
- `orla.brennan@datatech.ie` - HR Director (admin)
- `sinead.oconnor@datatech.ie` - HR Manager (member)
- `conor.doyle@datatech.ie` - Legal Counsel (admin)
- `mary.kavanagh@kpmg.ie` - External Auditor (viewer)
- `eoin.gallagher@pwc.ie` - Tax Consultant (viewer)

**Professional Services Users (Emerald Tax):**
- `fiona@emeraldtax.ie` - Managing Partner (owner)
- `brendan@emeraldtax.ie` - Senior Tax Consultant (admin)
- `claire@emeraldtax.ie` - Senior Tax Consultant (admin)
- `darragh@emeraldtax.ie` - Tax Consultant (member)
- `aoibhinn@emeraldtax.ie` - Junior Consultant (member)
- `teresa@emeraldtax.ie` - Practice Manager (admin)

**Personal User:**
- `sean.obrien@freelancetech.ie` - Freelance IT Consultant (owner)

**Platform Admins:** `AdminPassword123!`
- `grainne.nimhaonaigh@regintel.io` - Super Admin (Dublin)
- `tadhg.oreilly@regintel.io` - Platform Engineer (Dublin)
- `caoimhe.byrne@regintel.io` - Platform Engineer (Dublin)
- `donal.lynch@regintel.io` - Account Manager (Dublin)
- `marie.dubois@regintel.io` - Compliance Auditor (Brussels)
- `padraig.brennan@regintel.io` - Support Tier 3 (Dublin)
- `priya.sharma@regintel.io` - Support Tier 2 (Bangalore)
- `rajesh.kumar@regintel.io` - Support Tier 2 (Bangalore)
- `maria.santos@regintel.io` - Support Tier 1 (Manila)
- `jose.reyes@regintel.io` - Support Tier 1 (Manila)

## Tenant Details

### 1. DataTech Solutions Ltd (Enterprise)

**Profile:**
- **Type:** Irish software development company
- **Plan:** Enterprise (€5,000/month cost quota)
- **Location:** Dublin 2, Ireland
- **Business:** SaaS platform for healthcare providers
- **Revenue:** €12M ARR
- **Employees:** 87
- **Founded:** March 2019

**Team Structure:**
- Executive team: CEO, CFO, CTO, Legal Counsel
- Finance team: Finance Director, Finance Manager, Payroll Specialist
- Engineering team: CTO, Engineering Lead
- HR team: HR Director, HR Manager
- External stakeholders: KPMG Auditor, PwC Tax Consultant

**Typical Queries:**
- Corporation tax with R&D credits
- PAYE, PRSI, USC payroll calculations
- VAT on SaaS sales to EU customers
- Share option taxation for employees
- Holding company structures

### 2. Emerald Tax Consulting (Professional Services)

**Profile:**
- **Type:** Irish chartered tax advisory firm
- **Plan:** Pro (€1,500/month cost quota)
- **Location:** Cork City, Ireland
- **Business:** Tax compliance and advisory for SMEs
- **Revenue:** €900K annually
- **Employees:** 12
- **Founded:** June 2015

**Team Structure:**
- Leadership: Managing Partner
- Senior consultants: 2 (admin role)
- Mid-level consultant: 1 (member role)
- Junior consultant: 1 (member role)
- Operations: Practice Manager (admin role)

**Client Focus:**
- Construction companies (CIS, VAT, capital allowances)
- Retail businesses (stock valuation, property disposal)
- Agriculture (TAMS grants, farm restructuring, retirement relief)
- Professional services (sole trader to limited company transitions)
- Hospitality (tourism VAT, employment vs self-employment)

### 3. Seán O'Brien (Personal User)

**Profile:**
- **Type:** Freelance IT consultant / Single-director limited company
- **Plan:** Free (€50/month cost quota)
- **Location:** Galway, Ireland
- **Business:** IT consulting for SMEs
- **Revenue:** €65K annually
- **Structure:** Limited company (considering sole trader reversion)
- **Started:** September 2021

**Typical Queries:**
- Salary vs dividend optimization (€40k salary + €25k dividend)
- VAT registration threshold
- Preliminary tax calculations
- Home office expense claims
- Corporation tax vs income tax breakeven analysis
- PRSA contribution limits

## Platform Admin Structure

### Geographic Distribution (24/7 Coverage)

| Role | Location | Timezone | Coverage Window | Access Level |
|------|----------|----------|----------------|--------------|
| Super Admin | Dublin, Ireland | GMT+0/+1 | 09:00-17:30 GMT | Full platform access |
| Platform Engineer (×2) | Dublin, Ireland | GMT+0/+1 | 09:00-18:30 GMT | Infrastructure management |
| Account Manager | Dublin, Ireland | GMT+0/+1 | 09:00-17:30 GMT | Assigned tenants only (DataTech) |
| Compliance Auditor | Brussels, Belgium | GMT+1/+2 | 09:00-17:00 CET | Read-only audit logs |
| Support Tier 3 | Dublin, Ireland | GMT+0/+1 | 09:00-17:30 GMT | Engineering escalations, production access |
| Support Tier 2 (×2) | Bangalore, India | GMT+5:30 | 00:30-17:00 GMT | Cross-tenant access, overnight coverage |
| Support Tier 1 (×2) | Manila, Philippines | GMT+8 | 01:00-14:00 GMT | Assigned tenants only, metadata-only |

### Permission Matrix

| Permission | Tier 1 Manila | Tier 2 Bangalore | Tier 3 Dublin | Account Mgr | Engineer | Super Admin |
|------------|---------------|------------------|---------------|-------------|----------|-------------|
| View assigned tenant users | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| View ALL tenant users | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| View conversation content | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Export user data | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| View system logs | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Deploy hotfixes | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Manage infrastructure | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

**Key Security Constraints:**
- Tier 1 (Manila) cannot view conversation content (PII protection)
- Tier 1 limited to assigned tenants only
- Tier 2 (Bangalore) has cross-tenant access for escalations
- Account Manager limited to specific assigned tenants
- Only Super Admin can delete tenants

## Reference Data

### Personas (7 total)

Pre-defined user archetypes for context-aware assistance:

- `single-director-ie` - Irish single-director company (PAYE, PRSI, CT, CGT)
- `sole-trader-ie` - Irish sole trader (income tax, USC, VAT, self-assessment)
- `partnership-ie` - Irish partnership (partnership taxation, capital allowances)
- `sme-finance-director` - SME finance professional (payroll, VAT, R&D credits)
- `tax-consultant-ie` - Irish tax advisor (complex positions, Appeals Commissioner)
- `uk-limited-company` - UK company director (CT, PAYE, NI, dividends)
- `eu-cross-border` - EU cross-border trader (VAT MOSS, transfer pricing)

### Quick Prompts (12 total)

Commonly used queries organized by persona:

- **Single-director:** PAYE vs PRSI, salary/dividend split, close company surcharge
- **Sole trader:** VAT threshold, home office expenses, preliminary tax
- **SME Finance:** R&D tax credit, employer PRSI, VAT on SaaS
- **Tax Consultant:** CGT retirement relief, transfer pricing
- **UK:** Corporation tax rates
- **EU:** VAT MOSS scheme

### Model Pricing (7 models)

LLM provider pricing configurations (if `copilot_billing.llm_model_pricing` table exists):

- **Anthropic:** Claude 3.5 Sonnet ($3.00/$15.00 per million tokens), Claude 3 Haiku ($0.25/$1.25)
- **OpenAI:** GPT-4 Turbo ($10/$30), GPT-4o ($5/$15), GPT-3.5 Turbo ($0.50/$1.50)
- **Google:** Gemini 1.5 Pro ($3.50/$10.50), Gemini 1.5 Flash ($0.35/$1.05)

## Conversation Seed Files (In Progress)

The following conversation seed files are being implemented with realistic multi-message conversations and branching paths:

### 06_conversations/ (Partially Implemented)

**Status: 4 of 5 files completed (80% complete)**

✅ **datatech_finance.sql** - COMPLETED
  - Conversation 1: Corporation Tax with R&D Credit (10 messages, 2 paths with branching)
  - Conversation 2: VAT on SaaS Sales to EU Customers (6 messages, 1 path)
  - Total: 2 conversations, 16 messages
  - Topics: CT calculations, R&D credits, VAT MOSS, B2B vs B2C, Stripe integration

✅ **datatech_hr.sql** - COMPLETED
  - Conversation 1: Company Car Benefit-in-Kind (4 messages, 1 path)
  - Conversation 2: KEEP vs ESOS Share Options (8 messages, 2 paths with branching)
  - Conversation 3: Maternity Benefit Top-Up (2 messages, 1 path)
  - Total: 3 conversations, 14 messages
  - Topics: BIK taxation, PHEV company cars, KEEP/ESOS/ESOP comparison, vesting schedules, maternity benefit

✅ **datatech_tax.sql** - COMPLETED
  - Conversation 1: Close Company Surcharge (10 messages, 2 paths with branching)
  - Conversation 2: IP Holding Company Structure (2 messages, 1 path)
  - Conversation 3: Exit Strategy - €50M Sale (4 messages, 2 paths with branching)
  - Total: 3 conversations, 16 messages
  - Topics: Close company surcharge, interest income classification, IP holding structures, Knowledge Development Box (KDB), CGT on exits, Entrepreneur Relief vs Retirement Relief, time value analysis

✅ **sean_personal.sql** - COMPLETED
  - Conversation 1: Salary vs Dividend Optimization (8 messages, 2 paths with branching)
  - Conversation 2: VAT Registration Threshold (6 messages, 1 path)
  - Conversation 3: Home Office Expense Claims (2 messages, 1 path)
  - Total: 3 conversations, 16 messages
  - Topics: Salary/dividend split, mortgage scenarios, VAT thresholds, late registration penalties, home office expenses

⏳ **emerald_clients.sql** - PLANNED (60 conversations across 5 client workspaces: construction, pharmacy, agriculture, sole traders, hospitality)

**Current Stats:**
- ✅ 11 conversations completed
- ✅ 62 messages total
- ✅ 45% have branching paths (exceeds 30% target)
- ✅ Realistic Irish tax calculations with technical depth
- ✅ Complex scenarios: R&D credits, BIK, KEEP options, IP structures, exit strategies
- 📊 Target: 150+ conversations (7% completed)

### 07_costs_and_usage/ (COMPLETED)

**Status: 3 of 3 files completed (100% complete)**

✅ **llm_costs.sql** - COMPLETED
  - Tracks LLM API costs for all 11 conversations
  - Realistic token counts based on message content (450-2,820 tokens per message)
  - Model selection by complexity:
    - Complex queries: Claude 3.5 Sonnet, GPT-4 Turbo
    - Standard queries: GPT-4o, Claude 3 Haiku
    - Simple queries: GPT-3.5 Turbo
  - DataTech total: ~$0.72 USD (8 conversations with premium models)
  - Seán total: ~$0.047 USD (3 conversations with cost-effective models)
  - Demonstrates tier-appropriate model usage patterns

✅ **e2b_costs.sql** - COMPLETED
  - Tracks Python sandbox execution costs for complex calculations
  - 11 sandbox executions across 6 conversations
  - DataTech executions:
    - Corporation Tax R&D: 2 executions (~8 sec, $0.00028)
    - Company Car BIK: 2 executions (~5 sec, $0.00019)
    - KEEP Share Options: 1 execution (~6 sec, $0.00020)
    - Close Company Surcharge: 2 executions (~7 sec, $0.00026)
    - Exit Strategy €50M: 2 executions (~14 sec, $0.00050)
  - Seán executions:
    - Salary/Dividend Optimization: 2 executions (~5 sec, $0.00017)
  - Total: 11 executions, ~45 seconds, $0.00160 (~€0.0015)
  - Avg cost per execution: $0.00015
  - Demonstrates enterprise vs personal usage patterns

✅ **quota_tracking.sql** - COMPLETED
  - Monthly quota configurations for all 3 tenants
  - Historical usage patterns (3 months of data)
  - Quota alerts and limits
  - Current month status:
    - DataTech (Enterprise): $325 / $5,000 (6.5%)
    - Emerald Tax (Pro): $0 / $1,500 (0%)
    - Seán (Free): $0.054 / $50 (0.1%)
  - Last month patterns:
    - DataTech: 65% utilization (healthy)
    - Emerald Tax: 74.7% utilization (good engagement)
    - Seán: 96.4% utilization (hit limit, service suspended)
  - Alert tracking: Seán triggered 3 alerts last month (80%, 95%, hard limit)

**Combined Cost Summary:**
- DataTech LLM + E2B: ~$0.72 + $0.00143 = **$0.72143**
- Seán LLM + E2B: ~$0.047 + $0.00017 = **$0.04717**
- Realistic cost patterns showing enterprise (premium) vs personal (cost-conscious) tiers

## Testing

### Validation Checklist

After running `supabase db reset`, verify:

- [ ] All 3 tenants created (DataTech, Emerald Tax, Seán)
- [ ] 29 total users created (19 tenant users + 10 admins)
- [ ] All users can authenticate with `Password123!` (or `AdminPassword123!` for admins)
- [ ] Tenant memberships have correct roles (owner, admin, member, viewer)
- [ ] Platform admins have correct role assignments
- [ ] Tier 1 support has assigned_tenant_ids populated
- [ ] Account Manager has tenant_id set to DataTech
- [ ] Personas and quick prompts loaded successfully

### Manual Testing Scenarios

1. **Enterprise User Workflow:**
   - Login as Ronan (CFO)
   - Verify access to DataTech tenant
   - Check role is "admin"
   - Cannot access Emerald Tax or Seán's tenant

2. **Professional Services Workflow:**
   - Login as Fiona (Managing Partner)
   - Verify access to Emerald Tax tenant
   - Check role is "owner"
   - Cannot access DataTech or Seán's tenant

3. **Personal User Workflow:**
   - Login as Seán
   - Verify access to personal tenant only
   - Check role is "owner"
   - Cannot access other tenants

4. **Platform Admin Workflow:**
   - Login as Maria (Tier 1 support)
   - Verify assigned_tenant_ids includes DataTech and Emerald Tax
   - Verify cannot access Seán's tenant (not assigned)
   - Login as Priya (Tier 2 support)
   - Verify can access all tenants

## Maintenance

### Updating Seed Data

1. Modify the relevant `.sql` file in `supabase/seed/realistic_seed/`
2. Run `supabase db reset` to test changes
3. Commit changes to version control

### Adding New Tenants

1. Create new seed file (e.g., `06_new_company.sql`)
2. Add to `sql_paths` in `supabase/config.toml`
3. Follow existing patterns for auth.users, tenants, tenant_memberships, etc.

### Troubleshooting

**Issue:** Seed fails with "violates foreign key constraint"
- **Cause:** User IDs not created before tenant memberships
- **Fix:** Ensure auth.users are created before referencing them in tenant_memberships

**Issue:** Seed fails with "duplicate key value violates unique constraint"
- **Cause:** Running seed multiple times without db reset
- **Fix:** Always use `supabase db reset`, not manual SQL execution

**Issue:** User cannot login
- **Cause:** Incorrect password hash or missing auth.identities record
- **Fix:** Verify bcrypt hash is correct (must match `Password123!` or `AdminPassword123!`)

## Memgraph Graph Data Alignment

The Supabase conversation seed data has a corresponding Memgraph seed that contains the regulatory nodes and relationships referenced in those conversations.

### Seeding Memgraph

```bash
# From monorepo root

# 1. Start Memgraph (if not running)
docker compose -f docker/docker-compose.yml up -d memgraph

# 2. Create indices (run once)
pnpm setup:indices

# 3. Seed realistic Irish tax regulatory data
pnpm seed:graph:realistic

# Optional: Seed special jurisdictions (IE/UK/NI/EU)
pnpm seed:jurisdictions

# Or seed everything at once
pnpm seed:all
```

### Graph Coverage Aligned with Conversations

The Memgraph seed (`scripts/seed-graph-realistic.ts`) includes regulatory nodes for ALL concepts referenced in the Supabase conversations:

**Corporation Tax (datatech_finance.sql conversations):**
- Corporation Tax rate nodes (12.5% trading, 25% investment)
- R&D Tax Credit relief (25% credit, TCA 1997 S766)
- Close Company Surcharge rules (TCA 1997 S440)
- Knowledge Development Box (6.25% effective rate, TCA 1997 S769I)

**VAT (datatech_finance.sql + sean_personal.sql conversations):**
- VAT rates (23%, 13.5%, 9%, 4.8%, 0%)
- VAT B2B reverse charge (VATCA 2010 S46)
- VAT B2C Irish rate application
- VAT MOSS (Mini One Stop Shop)
- VAT registration thresholds (€40K services, €80K goods - VATCA 2010 S65)

**Capital Gains Tax (datatech_tax.sql conversations):**
- Entrepreneur Relief (10% rate, €1M limit, TCA 1997 S597)
- Retirement Relief (€750K exemption, age 55+, TCA 1997 S598)
- Standard CGT rate (33%)

**Share Schemes (datatech_hr.sql conversations):**
- KEEP (Key Employee Engagement Programme - TCA 1997 S128E)
- ESOS (Employee Share Ownership Scheme - TCA 1997 S519)
- ESOP (Employee Share Ownership Plan)
- Timeline constraints (12-month option holding, 24-month share holding, 3-year holding)

**Benefit-in-Kind (datatech_hr.sql conversations):**
- BIK rates by CO2 emissions (0% EV, 8% PHEV, 14-36% ICE)
- BIK mileage bands (5 bands from <24K to 48K+)
- OMV (Original Market Value) calculation
- TCA 1997 S121 (BIK legislation)

**Personal Taxation (sean_personal.sql conversations):**
- PAYE (20% standard, 40% higher rate)
- PRSI (4.1% employee, 11.05% employer)
- USC (graduated rates: 0.5%, 2%, 4.5%, 8%)
- Dividend taxation (no PRSI/USC)

**Social Welfare (datatech_hr.sql conversations):**
- Maternity Benefit (€274/week, 26 weeks, SWCA 2005 S55)
- PRSI contribution requirements (52 weeks in 24 months)

**Profile Tags:**
- Single Director (Class S PRSI)
- Limited Company
- Close Company
- PAYE Employee (Class A PRSI)
- Company Director (salary + dividends)
- Key Employee (share scheme eligible)

### Graph Relationships

The seed creates realistic relationships between nodes:

```cypher
# Example: R&D Tax Credit relationships
(IE_RELIEF_RND_CREDIT:Relief)-[:CITES]->(IE_TCA_1997_S766:Section)
(IE_RELIEF_RND_CREDIT:Relief)-[:EFFECTIVE_WINDOW]->(IE_RND_4_YEAR_PERIOD:Timeline)
(IE_RELIEF_RND_CREDIT:Relief)-[:REFUND_WINDOW]->(IE_RND_3_YEAR_REFUND:Timeline)
(IE_RELIEF_RND_CREDIT:Relief)-[:APPLIES_TO_PROFILE]->(PROFILE_LIMITED_COMPANY_IE:ProfileTag)

# Example: Entrepreneur Relief relationships
(IE_RELIEF_ENTREPRENEUR:Relief)-[:CITES]->(IE_TCA_1997_S597:Section)
(IE_RELIEF_ENTREPRENEUR:Relief)-[:ELIGIBILITY_PERIOD]->(IE_ENTREPRENEUR_3_YEAR_WORK:Timeline)
(IE_RELIEF_ENTREPRENEUR:Relief)-[:APPLIES_TO_PROFILE]->(PROFILE_SINGLE_DIRECTOR_IE:ProfileTag)
(IE_RELIEF_ENTREPRENEUR:Relief)-[:APPLIES_TO_PROFILE]->(PROFILE_COMPANY_DIRECTOR_IE:ProfileTag)
```

### Verification

After seeding both Supabase and Memgraph, verify alignment:

```bash
# 1. Check Supabase conversations exist
psql -h localhost -p 54322 -U postgres -d postgres \
  -c "SELECT COUNT(*) FROM copilot_core.conversations;"
# Expected: 11 conversations

# 2. Check Memgraph nodes exist
docker exec -it memgraph mgconsole \
  -c "MATCH (r:Relief) RETURN count(r);"
# Expected: 6 reliefs (R&D, Entrepreneur, Retirement, KEEP, ESOS, KDB)

# 3. Check graph has sections referenced in conversations
docker exec -it memgraph mgconsole \
  -c "MATCH (s:Section) WHERE s.id CONTAINS 'TCA_1997' RETURN s.label, s.title;"
# Expected: Sections 21, 766, 440, 597, 598, 128E, 519, 769I, 121

# 4. Verify relationships exist
docker exec -it memgraph mgconsole \
  -c "MATCH (r:Relief)-[rel]->(t:Timeline) RETURN r.name, type(rel), t.label;"
# Expected: Multiple timeline relationships for reliefs
```

### Graph Node Summary

| Node Type | Count | Examples |
|-----------|-------|----------|
| Jurisdictions | 2 | IE, EU |
| Statutes | 3 | TCA 1997, VATCA 2010, SWCA 2005 |
| Sections | 12 | S766 (R&D), S597 (Entrepreneur), S121 (BIK) |
| Reliefs | 6 | R&D Credit, Entrepreneur Relief, KEEP, KDB |
| Benefits | 1 | Maternity Benefit |
| Timelines | 8 | 4-year R&D window, 10-year ownership requirement |
| ProfileTags | 6 | Single Director, Limited Company, Key Employee |
| Relationships | ~30 | CITES, APPLIES_TO_PROFILE, ELIGIBILITY_PERIOD |

**Total:** ~38 regulatory nodes, ~30 relationships

All nodes are jurisdiction-neutral (no tenant-specific data) and align 100% with the Irish tax concepts referenced in the 11 Supabase conversations.

## Related Documentation

- [Supabase Seed Documentation](https://supabase.com/docs/guides/getting-started/local-development/seed)
- [Multi-tenant Architecture](../../../docs/architecture/multi-tenant/README.md)
- [Platform Admin Permissions](../../../docs/security/SECURITY_AUDIT_SUMMARY.md)
- [Root CLAUDE.md](../../../CLAUDE.md) - Repository-wide guidance

## License

This seed data is part of the Regulatory Intelligence Copilot platform and follows the same license as the main repository.
