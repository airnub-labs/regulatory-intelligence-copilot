# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **IMPORTANT:** This app is part of the Regulatory Intelligence Copilot monorepo. For architecture, agent specifications, and repository-wide rules, see the root [`CLAUDE.md`](../../CLAUDE.md) and [`AGENTS.md`](../../AGENTS.md).

---

## Build & Development Commands

```bash
# From this directory (apps/copilot-admin)
pnpm dev              # Start dev server (localhost:3001)
pnpm build            # Production build
pnpm lint             # Run ESLint

# From monorepo root
pnpm --filter copilot-admin dev
pnpm --filter copilot-admin build
pnpm --filter copilot-admin lint
```

### Required Pre-Commit Checks

```bash
pnpm lint           # Must pass
pnpm build          # Must pass
```

### Database Commands (Supabase)

```bash
# From monorepo root
supabase db reset   # Reset database, apply all migrations, and run seed data (supabase/seed/demo_seed.sql)
supabase status     # Check if Supabase is running and get connection details
supabase start      # Start local Supabase (first run takes 5-10 minutes)
supabase stop       # Stop Supabase
```

**Important:** After making changes to migrations or when you need fresh data, run `supabase db reset` to:
1. Drop and recreate the database
2. Apply all migrations from `supabase/migrations/`
3. Run seed data from `supabase/seed/demo_seed.sql`

This ensures the local database matches the expected schema and has test data available.

---

## Application Overview

**Copilot Admin** is the administrative dashboard for the Regulatory Intelligence Copilot platform. It provides tenant/workspace management, user administration, analytics, and system configuration.

### Key Technologies

- **Framework:** Next.js 16, React 19, Tailwind v4, shadcn/ui
- **Authentication:** NextAuth.js v5 (Auth.js)
- **Database:** Supabase/Postgres with Row Level Security
- **Internationalization:** next-intl
- **UI Components:** Radix UI primitives, Tabler Icons, Recharts

---

## Mandatory Design Requirements

All code in this application MUST follow these requirements. These are non-negotiable architectural constraints.

### 1. Accessibility (WCAG 2.1 AA)

**Every UI component MUST be fully accessible:**

- **Keyboard Navigation:** All interactive elements must be keyboard accessible with visible focus indicators
- **Screen Reader Support:** Use semantic HTML, ARIA labels, and live regions appropriately
- **Color Contrast:** Minimum 4.5:1 for normal text, 3:1 for large text and UI components
- **Focus Management:** Proper focus trapping in modals, proper focus restoration
- **Motion Preferences:** Respect `prefers-reduced-motion` for all animations

```typescript
// REQUIRED: All buttons, links, and controls must have accessible names
<Button aria-label="Delete user">
  <TrashIcon aria-hidden="true" />
</Button>

// REQUIRED: Form inputs must have associated labels
<Label htmlFor="email">Email Address</Label>
<Input id="email" type="email" aria-describedby="email-error" />
{error && <p id="email-error" role="alert">{error}</p>}

// REQUIRED: Use semantic HTML
<nav aria-label="Main navigation">...</nav>
<main id="main-content">...</main>
<aside aria-label="Sidebar">...</aside>

// REQUIRED: Tables must have proper headers and captions
<table aria-label="User list">
  <caption className="sr-only">List of users with their roles and status</caption>
  <thead>
    <tr>
      <th scope="col">Name</th>
      ...
    </tr>
  </thead>
</table>
```

**Skip Links:** Every page MUST have a skip link to main content:

```typescript
// In layout.tsx - REQUIRED
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute ...">
  Skip to main content
</a>
```

### 2. Internationalization (next-intl)

**All user-facing text MUST be internationalized. This application MUST support all 10 required locales consistently.**

#### Architecture: Base Language + Regional Overrides

This application uses a **flat structure** with **base language files** and **regional override files**:

- **Base language files** (`en.json`, `ga.json`, `es.json`, `fr.json`, `de.json`, `pt.json`) contain shared strings for that language (90%+ of content)
- **Regional override files** (`en-IE.json`, `en-GB.json`, etc.) contain locale-specific strings that override or extend the base

At runtime, messages are merged: `{ ...baseMessages, ...regionMessages }` — regional values take precedence.

#### Required Locales (Mandatory)

The following 10 locales MUST be supported and maintained consistently:

| Locale Code | Language | Region | Currency | Base File |
|-------------|----------|--------|----------|-----------|
| `en-IE` | English | Ireland | EUR | `en.json` |
| `ga-IE` | Irish (Gaeilge) | Ireland | EUR | `ga.json` |
| `en-GB` | English | United Kingdom | GBP | `en.json` |
| `en-US` | English | United States | USD | `en.json` |
| `es-ES` | Spanish | Spain | EUR | `es.json` |
| `fr-FR` | French | France | EUR | `fr.json` |
| `fr-CA` | French | Canada | CAD | `fr.json` |
| `de-DE` | German | Germany | EUR | `de.json` |
| `pt-PT` | Portuguese | Portugal | EUR | `pt.json` |
| `pt-BR` | Portuguese | Brazil | BRL | `pt.json` |

**Default locale:** `en-IE` (English Ireland)

#### File Structure (Mandatory)

```
translations/
├── en.json          # Base English (shared across en-IE, en-GB, en-US)
├── en-IE.json       # Ireland English overrides - DEFAULT
├── en-GB.json       # UK English overrides
├── en-US.json       # US English overrides
├── ga.json          # Base Irish
├── ga-IE.json       # Ireland Irish overrides
├── es.json          # Base Spanish
├── es-ES.json       # Spain Spanish overrides
├── fr.json          # Base French
├── fr-FR.json       # France French overrides
├── fr-CA.json       # Canada French overrides
├── de.json          # Base German
├── de-DE.json       # Germany German overrides
├── pt.json          # Base Portuguese
├── pt-PT.json       # Portugal Portuguese overrides
├── pt-BR.json       # Brazil Portuguese overrides
└── README.md        # Detailed documentation
```

#### Key Format: Nested JSON Structure

Use **nested JSON structure** for all translation keys (required by next-intl):

```json
{
  "common": {
    "appName": "Copilot Admin",
    "loading": "Loading...",
    "save": "Save"
  },
  "auth": {
    "signInTitle": "Sign in to your account",
    "email": "Email",
    "password": "Password"
  },
  "dashboard": {
    "welcome": "Welcome back, {name}"
  }
}
```

Access translations using dot notation in code:

```typescript
const t = useTranslations('common');
t('appName'); // "Copilot Admin"

// Or with full path
const t = useTranslations();
t('common.appName'); // "Copilot Admin"
```

#### ICU MessageFormat

Use [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) for dynamic content:

**Pluralization:**
```json
{
  "common.itemCount": "{count, plural, =0 {No items} one {# item} other {# items}}",
  "notifications.count": "{count, plural, =0 {No notifications} one {# notification} other {# notifications}}"
}
```

**Irish pluralization** (supports all 5 plural forms):
```json
{
  "common.itemCount": "{count, plural, =0 {Gan míreanna} one {# mír amháin} two {# mhír} few {# mhír} other {# mír}}"
}
```

**Variables:**
```json
{
  "dashboard.welcome": "Welcome back, {name}",
  "validation.minLength": "Must be at least {min, number} characters"
}
```

#### Regional Vocabulary Differences

When maintaining regional variants of the same language, be aware of vocabulary differences:

**English (en-GB vs en-US):**

| Concept | en-GB | en-US |
|---------|-------|-------|
| Color | Colour | Color |
| License | Licence | License |
| Organize | Organise | Organize |

**French (fr-FR vs fr-CA):**

| Concept | fr-FR (France) | fr-CA (Canada) |
|---------|----------------|----------------|
| Email | E-mail | Courriel |
| Weekend | Week-end | Fin de semaine |
| Shopping | Faire du shopping | Magasiner |

**Portuguese (pt-PT vs pt-BR):**

| Concept | pt-PT (Portugal) | pt-BR (Brazil) |
|---------|------------------|----------------|
| Bus | Autocarro | Ônibus |
| Mobile phone | Telemóvel | Celular |
| File (computer) | Ficheiro | Arquivo |

#### Usage Patterns

```typescript
// Use translations for all user-facing text
import { useTranslations } from 'next-intl';

export function UserCard({ user }: Props) {
  const t = useTranslations();

  return (
    <Card>
      <CardTitle>{t('dashboard.title')}</CardTitle>
      <p>{t('dashboard.welcome', { name: user.name })}</p>
      <Button>{t('common.edit')}</Button>
    </Card>
  );
}

// Use formatters for dates, numbers, currencies
// NEVER hardcode currency symbols - use useFormatter()
import { useFormatter } from 'next-intl';

function PriceDisplay({ amount }: { amount: number }) {
  const format = useFormatter();
  return <span>{format.number(amount, { style: "currency" })}</span>;
}
// en-IE: "€1,234.56"
// en-GB: "£1,234.56"
// en-US: "$1,234.56"
// pt-BR: "R$ 1.234,56"

// Date formatting with named formats
function LastUpdated({ date }: { date: Date }) {
  const format = useFormatter();
  return <span>{format.dateTime(date, "medium")}</span>;
}
// en-IE: "25 Dec 2024"
// en-US: "Dec 25, 2024"
// de-DE: "25. Dez. 2024"
```

#### What Goes Where

**Base Language File (`en.json`, `fr.json`, etc.):**
- Common UI strings (buttons, labels, navigation)
- Error messages and validation messages
- Generic notifications
- Strings **identical** across all regional variants of that language

**Regional Override File (`en-IE.json`, `en-GB.json`, etc.):**
- Legal/regulatory terminology
- Tax-related terms (VAT, PRSI, USC for Ireland; NI for UK)
- Jurisdiction-specific content
- Spelling differences (colour vs color)
- Document names (Passport, Driving Licence vs Driver's License)
- Currency-related text references

#### Core Requirements

- **NEVER** hardcode user-facing strings in components
- **ALL** text must come from translation files
- **EVERY** new translation key MUST be added to ALL 10 locale sets simultaneously
- **NEVER** merge code with missing translations in any locale
- **NEVER** hardcode currency symbols - use `useFormatter()`
- Format dates, numbers, and currencies using `useFormatter()`
- Use ICU MessageFormat for pluralization and interpolation
- Regional files should be **small** - only locale-specific differences
- Irish (ga-IE) has complex grammatical rules - work with native speakers
- Regional variants MUST use region-appropriate vocabulary (see tables above)

#### Adding New Translations Workflow

1. Add the new key to ALL base language files:
   - `en.json` (English base)
   - `ga.json` (Irish base)
   - `es.json` (Spanish base)
   - `fr.json` (French base)
   - `de.json` (German base)
   - `pt.json` (Portuguese base)

2. If locale-specific, add to the appropriate regional override files:
   - `en-IE.json`, `en-GB.json`, `en-US.json` (English variants)
   - `ga-IE.json` (Irish)
   - `es-ES.json` (Spanish)
   - `fr-FR.json`, `fr-CA.json` (French variants)
   - `de-DE.json` (German)
   - `pt-PT.json`, `pt-BR.json` (Portuguese variants)

3. Run `pnpm build` to verify

**NEVER commit with partial translations. All 10 locales must be updated together.**

See `translations/README.md` for detailed documentation on the translation system.

### 3. GDPR Compliance

**All data handling MUST comply with GDPR:**

- **Data Minimization:** Only collect and display data that is necessary
- **Consent Management:** Obtain explicit consent before processing personal data
- **Right to Access:** Provide data export functionality for user data
- **Right to Erasure:** Support account deletion and data removal
- **Data Retention:** Implement and document retention policies
- **Audit Logging:** Log all access to personal data with purpose

```typescript
// REQUIRED: Document data purpose for any personal data field
interface UserFormData {
  /** Required for account identification - retained until account deletion */
  email: string;
  /** Optional profile data - user can remove at any time */
  displayName?: string;
  /** Collected for security audit logs - retained for 90 days */
  ipAddress?: string;
}

// REQUIRED: Audit logging for personal data access
async function getUserDetails(userId: string, requesterId: string, purpose: string) {
  await auditLog.record({
    action: 'user_data_access',
    targetUserId: userId,
    requesterId,
    purpose, // e.g., 'support_request', 'admin_review'
    timestamp: new Date().toISOString(),
  });

  return await db.users.findUnique({ where: { id: userId } });
}

// REQUIRED: Cookie consent before non-essential cookies
// Use a consent management component that:
// - Blocks non-essential cookies until consent
// - Stores consent preferences
// - Allows withdrawal of consent
```

**Privacy by Design Checklist:**

- [ ] Personal data is encrypted at rest and in transit
- [ ] Access to personal data is role-based and audited
- [ ] Data exports include all personal data in portable format
- [ ] Deletion requests cascade to all related data
- [ ] Retention periods are documented and enforced

### 4. SOC2 Compliance

**All code MUST follow SOC2 security controls:**

#### Access Control

```typescript
// REQUIRED: Role-based access control for all admin operations
type AdminRole = 'super_admin' | 'tenant_admin' | 'support' | 'viewer';

// Check permissions before any action
async function deleteUser(targetId: string, actor: AdminUser) {
  assertRole(actor, ['super_admin', 'tenant_admin']);
  assertSameTenant(actor, targetId); // tenant_admin can only manage own tenant

  await auditLog.record({
    action: 'user_delete',
    targetId,
    actorId: actor.id,
    actorRole: actor.role,
  });

  // Proceed with deletion
}

// REQUIRED: Session timeout for admin sessions
// Configure in auth.ts - max session age 8 hours, idle timeout 30 minutes
```

#### Audit Logging

```typescript
// REQUIRED: All admin operations must be logged
interface AuditLogEntry {
  timestamp: string;
  actorId: string;
  actorEmail: string;
  action: string;
  resource: string;
  resourceId: string;
  outcome: 'success' | 'failure' | 'denied';
  ipAddress: string;
  userAgent: string;
  details?: Record<string, unknown>;
}

// Log security events: login, logout, failed attempts, permission changes
// Log data events: create, read (sensitive), update, delete
// Log system events: config changes, role changes, API key generation
```

#### Input Validation

```typescript
// REQUIRED: Validate all inputs with Zod schemas
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email().max(255),
  displayName: z.string().min(1).max(100).optional(),
  role: z.enum(['tenant_admin', 'support', 'viewer']),
  tenantId: z.string().uuid(),
});

// REQUIRED: Sanitize all outputs to prevent XSS
// React handles this by default, but be careful with dangerouslySetInnerHTML
// NEVER use dangerouslySetInnerHTML with user-provided content
```

### 5. NextAuth.js v5 Security

**Authentication MUST follow these security patterns:**

```typescript
// auth.ts - REQUIRED configuration patterns
import NextAuth from 'next-auth';
import { SupabaseAdapter } from '@auth/supabase-adapter';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: SupabaseAdapter({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    secret: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  }),

  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours max session
  },

  callbacks: {
    // REQUIRED: Include role and tenant in token
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.tenantId = user.tenantId;
      }
      return token;
    },

    // REQUIRED: Validate session on each request
    async session({ session, token }) {
      session.user.role = token.role;
      session.user.tenantId = token.tenantId;
      return session;
    },

    // REQUIRED: Restrict sign-in to authorized domains/users
    async signIn({ user, account }) {
      // Implement domain allowlist or invitation-only logic
      const isAllowed = await checkUserAuthorized(user.email);
      return isAllowed;
    },
  },

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },

  // REQUIRED: Security headers
  trustHost: true,
});
```

**Middleware Protection:**

```typescript
// middleware.ts - REQUIRED for protected routes
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith('/auth');

  // Redirect unauthenticated users to sign-in
  if (!isLoggedIn && !isAuthPage) {
    return NextResponse.redirect(new URL('/auth/signin', req.url));
  }

  // Redirect authenticated users away from auth pages
  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  // REQUIRED: Check role-based access for admin routes
  if (req.nextUrl.pathname.startsWith('/admin')) {
    if (req.auth?.user?.role !== 'super_admin') {
      return NextResponse.redirect(new URL('/unauthorized', req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

**CSRF Protection:**

```typescript
// REQUIRED: All state-changing API routes must verify CSRF token
// NextAuth.js handles this for auth endpoints
// For custom API routes, use the pattern:

import { auth } from '@/auth';

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Validate CSRF token for non-GET requests
  const csrfToken = req.headers.get('x-csrf-token');
  if (!csrfToken || !validateCsrfToken(csrfToken, session)) {
    return new Response('Invalid CSRF token', { status: 403 });
  }

  // Proceed with request
}
```

---

## Environment Configuration

Required environment variables (see `.env.example`):

```bash
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=  # Server-side only, NEVER expose to client

# Auth (Required for NextAuth.js)
AUTH_SECRET=  # Generate with: openssl rand -base64 32
AUTH_URL=     # Full URL of your application

# Optional
NEXT_PUBLIC_SITE_URL=
```

**Security Notes:**

- NEVER commit `.env.local` or any file containing secrets
- NEVER use `SUPABASE_SERVICE_ROLE_KEY` in client-side code
- Rotate `AUTH_SECRET` if you suspect it has been compromised
- Use environment-specific secrets for dev/staging/production

---

## Code Review Checklist

Before merging any PR, verify:

### Accessibility
- [ ] All interactive elements are keyboard accessible
- [ ] All images have alt text (or aria-hidden if decorative)
- [ ] Color contrast meets WCAG 2.1 AA standards
- [ ] Focus indicators are visible
- [ ] Screen reader testing passes

### Internationalization (All 10 Locales Required)
- [ ] No hardcoded user-facing strings
- [ ] All text uses translation keys with nested JSON structure
- [ ] Date/number/currency formatting uses `useFormatter()` (no hardcoded symbols)
- [ ] New keys added to ALL 6 base language files (en, ga, es, fr, de, pt)
- [ ] Regional overrides added to ALL 10 regional files where needed
- [ ] ICU MessageFormat used for pluralization and variables
- [ ] Irish (ga-IE) translations reviewed for grammatical accuracy (5 plural forms)
- [ ] Regional variants use region-appropriate vocabulary (en-GB vs en-US, fr-FR vs fr-CA, pt-PT vs pt-BR)
- [ ] Regional files contain only locale-specific overrides (not duplicated base content)
- [ ] `pnpm build` passes with all translations in place

### GDPR
- [ ] Personal data collection is documented
- [ ] Audit logging for data access
- [ ] Data can be exported/deleted

### SOC2
- [ ] Role-based access control implemented
- [ ] All inputs validated with Zod
- [ ] Audit logging for admin operations
- [ ] No sensitive data in logs

### Security
- [ ] No secrets in code or logs
- [ ] CSRF protection on state-changing routes
- [ ] Session management follows patterns above
- [ ] Dependencies are up to date

---

## Key Documentation

- Root `CLAUDE.md` - Repository-wide architectural rules
- Root `AGENTS.md` - Agent specifications and patterns
- `docs/architecture/multi-tenant/README.md` - Multi-tenant architecture
- `docs/security/` - Security specifications
