# Auth Provider Flexibility with Multi-Tenant Architecture

## How the Architecture Remains Provider-Agnostic

### Current Setup (Supabase)

```typescript
// apps/demo-web/src/lib/auth/options.ts

providers: [
  CredentialsProvider({
    async authorize(credentials) {
      // Supabase authentication
      const { data } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      const userId = data.user.id; // Supabase user ID

      // Tenant lookup (provider-agnostic!)
      const { data: activeTenantId } = await supabase
        .rpc('get_active_tenant_id', { p_user_id: userId });

      return { id: userId, email: data.user.email, activeTenantId };
    }
  })
]
```

### Switch to Google OAuth (Example)

```typescript
// apps/demo-web/src/lib/auth/options.ts

import GoogleProvider from 'next-auth/providers/google'

providers: [
  // Add Google OAuth
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  }),

  // Keep Supabase too (multiple providers!)
  CredentialsProvider({
    // ... existing Supabase auth
  })
]

callbacks: {
  async signIn({ user, account }) {
    // New user from Google? Create personal tenant
    if (account.provider === 'google') {
      const existingTenant = await supabase
        .rpc('get_active_tenant_id', { p_user_id: user.id });

      if (!existingTenant) {
        await supabase.rpc('create_personal_tenant', {
          p_user_id: user.id,
          p_user_email: user.email,
        });
      }
    }
    return true;
  },

  async jwt({ token, user }) {
    if (user) {
      // Get active tenant (works for ANY auth provider!)
      const { data: activeTenantId } = await supabase
        .rpc('get_active_tenant_id', { p_user_id: user.id });

      token.activeTenantId = activeTenantId;
    }
    return token;
  }
}
```

### Switch to Auth0 (Example)

```typescript
import Auth0Provider from 'next-auth/providers/auth0'

providers: [
  Auth0Provider({
    clientId: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET,
    issuer: process.env.AUTH0_ISSUER,
  })
]

// Tenant logic UNCHANGED - just needs user.id!
```

### Switch to Completely Different Database (Example)

```typescript
// Move from Supabase to PostgreSQL + Prisma

// 1. Keep tenant tables (migrate from Supabase to Postgres)
// 2. Switch auth from Supabase to Auth0/Clerk/Custom
// 3. Update RPC calls to Prisma queries:

// Before (Supabase RPC):
const { data } = await supabase.rpc('get_active_tenant_id', { p_user_id: userId });

// After (Prisma):
const preference = await prisma.userPreferences.findUnique({
  where: { user_id: userId },
  select: { active_tenant_id: true }
});
```

---

## Key Insight

**The tenant tables are just PostgreSQL tables**. They work with:
- ✅ Supabase (current)
- ✅ Supabase RLS + authenticated role
- ✅ Any PostgreSQL database + Prisma
- ✅ Any database + any ORM
- ✅ Any auth provider (Google, Auth0, Clerk, custom)

The only requirement: You need a `user_id` to join with `tenant_memberships`.

---

## NextAuth Provider Examples

All of these work with the multi-tenant architecture:

### Email/Password (Current)
```typescript
CredentialsProvider({ ... }) // ✅ Works
```

### OAuth Providers
```typescript
GoogleProvider({ ... })      // ✅ Works
GitHubProvider({ ... })      // ✅ Works
Auth0Provider({ ... })       // ✅ Works
```

### Enterprise SSO
```typescript
// SAML, Azure AD, Okta via Auth0 or custom
Auth0Provider({
  authorization: {
    params: {
      connection: 'samlp-enterprise'  // ✅ Works
    }
  }
})
```

### Multiple Providers Simultaneously
```typescript
providers: [
  GoogleProvider({ ... }),      // Users can sign in with Google
  GitHubProvider({ ... }),      // OR GitHub
  CredentialsProvider({ ... }), // OR email/password
  // All use same tenant_memberships table!
]
```

---

## Migration Path (Future-Proof)

If you decide to move away from Supabase:

### Step 1: Keep Tenant Tables
The tenant structure is database-agnostic:
```sql
-- These tables work ANYWHERE (Postgres, MySQL, SQLite)
CREATE TABLE tenants (...);
CREATE TABLE tenant_memberships (...);
CREATE TABLE user_preferences (...);
```

### Step 2: Switch Auth Provider
```typescript
// Change NextAuth provider
// from: CredentialsProvider (Supabase)
// to: GoogleProvider, Auth0Provider, etc.
```

### Step 3: Migrate Users (if needed)
```typescript
// Copy users from auth.users to new system
// Keep same user IDs (or create mapping)
// tenant_memberships references the user IDs
```

### Step 4: Update Database Client (if needed)
```typescript
// If leaving Supabase entirely:
// Replace: supabase.rpc()
// With: prisma.query() or raw SQL
```

**The tenant architecture remains unchanged!**

---

## Why This is MORE Flexible Than Current Approach

### Current Approach (Storing tenant_id on user)
```typescript
// ❌ Tightly coupled to user_metadata structure
user_metadata: { tenant_id: "abc" }

// Hard to switch providers (each has different metadata)
// Can't belong to multiple tenants
// Can't use RLS effectively
```

### New Approach (Separate tenant tables)
```typescript
// ✅ Decoupled from auth provider
user_id ──> tenant_memberships ──> tenants

// Easy to switch providers (just needs user ID)
// Can belong to multiple tenants
// Can use RLS properly
```

---

## Concrete Example: Adding GitHub OAuth

```typescript
// Step 1: Add provider to NextAuth (2 minutes)
import GitHubProvider from 'next-auth/providers/github'

providers: [
  GitHubProvider({
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  }),
  // Keep existing Supabase provider too
  CredentialsProvider({ ... })
]

// Step 2: Create personal tenant on first GitHub login
callbacks: {
  async signIn({ user, account }) {
    if (account.provider === 'github') {
      // Check if user has tenant
      const tenant = await getTenant(user.id);

      if (!tenant) {
        // Create personal workspace
        await createPersonalTenant(user.id, user.email);
      }
    }
    return true;
  }
}

// That's it! GitHub users can now:
// - Sign in with GitHub
// - Get personal workspace
// - Join team workspaces
// - Switch between workspaces
// All using the SAME tenant_memberships table as email users!
```

---

## Benefits of This Approach

1. **Provider Independence**
   - Tenant logic separate from auth logic
   - Switch providers without touching tenant code

2. **Multiple Providers Simultaneously**
   - Users can sign in with Google OR email
   - Same user can link multiple providers
   - All share same tenant memberships

3. **Future-Proof**
   - Easy migration path away from Supabase
   - Works with any database
   - Works with any auth system

4. **Standard Pattern**
   - How Slack, GitHub, Discord do it
   - Well-understood architecture
   - Easy to hire developers who know this pattern

---

## Summary

**Your intuition was correct**: Using NextAuth keeps you flexible.

**The good news**: The multi-tenant architecture I proposed **preserves and enhances** that flexibility.

- ✅ Can switch from Supabase to Auth0/Clerk/Custom
- ✅ Can add Google/GitHub/Apple OAuth
- ✅ Can use multiple providers simultaneously
- ✅ Tenant structure is provider-agnostic
- ✅ Easy migration path for future changes
