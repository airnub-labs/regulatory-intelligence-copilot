# Supabase RLS Architecture Options

## Your Question: Can We Still Use Supabase RLS?

**Short answer**: Yes! The architecture supports **two approaches** for RLS:

1. **Hybrid Approach** (Recommended) - RLS where possible, service_role where needed
2. **Full RLS Approach** - RLS everywhere (Supabase-specific but more secure)

---

## Understanding Current RLS Issue

### The Problem

Your current code uses **service_role** which **bypasses RLS**:

```typescript
// Current approach
const supabase = createServerClient(
  supabaseUrl,
  supabaseServiceKey  // ⚠️ Bypasses ALL RLS policies
);

const conversations = await supabase
  .from('conversations')
  .select('*')
  .eq('tenant_id', tenantId);  // Manual filtering in app code
```

**Why this is suboptimal**:
- RLS policies exist but aren't enforced
- Tenant filtering happens in application code
- If app code has bug, tenant isolation breaks
- Doesn't leverage Supabase's security features

### Why Service Role is Used

Service role is needed for:
- Creating resources on behalf of users
- Admin operations
- Reading data across tenants (for admins)
- Operations that RLS would block

---

## Option 1: Hybrid Approach (Recommended for NextAuth)

Use **authenticated role** with RLS for queries, **service_role** for mutations.

### Architecture

```typescript
// For READS (queries) - use authenticated role + RLS
const supabaseClient = createServerClient(
  supabaseUrl,
  supabaseAnonKey,  // ✅ RLS policies enforced!
  { cookies }
);

// For WRITES (mutations) - use service_role when needed
const supabaseAdmin = createServerClient(
  supabaseUrl,
  supabaseServiceKey,  // Bypasses RLS (use carefully!)
  { cookies }
);
```

### How It Works

#### Step 1: Set JWT Claims

NextAuth sets custom JWT claims that RLS can read:

```typescript
// apps/demo-web/src/lib/auth/options.ts

async jwt({ token, user }) {
  // NextAuth JWT (not the same as Supabase JWT!)
  token.activeTenantId = user.activeTenantId;
  return token;
}
```

**Problem**: Supabase RLS can't read NextAuth's JWT directly.

**Solution**: Set Supabase RLS context manually in each request:

```typescript
// Set RLS context for this request
await supabase.rpc('set_tenant_context', {
  p_tenant_id: session.user.activeTenantId
});

// Now RLS policies can read this context
const { data } = await supabase
  .from('conversations')
  .select('*');  // RLS auto-filters by tenant!
```

#### Step 2: Update RLS Policies

```sql
-- Function to get current tenant from context
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  -- Try to get from Supabase JWT (if using Supabase Auth)
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id',
    -- Fallback: get from session variable (set by app)
    nullif(current_setting('app.current_tenant_id', true), '')
  )::uuid;
$$;

-- RLS policy uses this function
CREATE POLICY conversations_tenant_read
  ON copilot_internal.conversations
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.current_tenant_id());
```

#### Step 3: Set Context in API Routes

```typescript
// apps/demo-web/src/lib/supabase/withTenantContext.ts

export async function withTenantRLS(
  session: Session,
  callback: (supabase: SupabaseClient) => Promise<any>
) {
  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,  // Uses RLS!
    { cookies }
  );

  // Set tenant context for RLS
  await supabase.rpc('exec_sql', {
    sql: `SET LOCAL app.current_tenant_id = '${session.user.activeTenantId}'`
  });

  // Now all queries auto-filter by tenant
  return callback(supabase);
}
```

#### Step 4: Use in API Routes

```typescript
// apps/demo-web/src/app/api/conversations/route.ts

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  return withTenantRLS(session, async (supabase) => {
    // RLS automatically filters by tenant!
    const { data } = await supabase
      .from('conversations')
      .select('*');  // No .eq('tenant_id', ...) needed!

    return NextResponse.json({ conversations: data });
  });
}
```

### Pros & Cons

**Pros**:
- ✅ Leverages Supabase RLS for security
- ✅ Works with NextAuth
- ✅ Can still use service_role when needed
- ✅ Defense in depth (RLS + app logic)

**Cons**:
- ⚠️ Requires setting context per request
- ⚠️ Slightly more complex than pure service_role
- ⚠️ Need to be careful with transaction boundaries

---

## Option 2: Full RLS Approach (Supabase Auth Only)

**Only works if using Supabase Auth directly** (not NextAuth).

### Architecture

```typescript
// User authenticates with Supabase
const { data } = await supabase.auth.signInWithPassword({
  email, password
});

// Supabase sets JWT with user_id
// App stores active_tenant_id in user_metadata or custom claim

// RLS reads directly from Supabase JWT
CREATE FUNCTION current_tenant_id() RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'active_tenant_id')::uuid;
$$;
```

**This doesn't work well with NextAuth** because:
- NextAuth manages its own JWT (separate from Supabase)
- Would need to sync JWT claims between systems
- Defeats the purpose of NextAuth's flexibility

---

## Option 3: Service Role + App-Level Filtering (Current/Simplest)

Keep using service_role, do tenant filtering in app.

### Architecture

```typescript
// Use service_role (bypasses RLS)
const supabase = createServerClient(url, serviceKey);

// Filter by tenant in app code
const { tenantId } = await getTenantContext(session);

const { data } = await supabase
  .from('conversations')
  .select('*')
  .eq('tenant_id', tenantId);  // Manual filter
```

### Pros & Cons

**Pros**:
- ✅ Simplest to implement
- ✅ Works with any auth provider
- ✅ No RLS context management needed
- ✅ Easier debugging

**Cons**:
- ⚠️ RLS not enforced (defense in depth lost)
- ⚠️ If app bug, tenant isolation could break
- ⚠️ Not leveraging Supabase security feature

---

## Recommendation: Hybrid Approach

For your use case (NextAuth + future flexibility), I recommend:

### Use RLS for tenant tables (NEW)

```sql
-- RLS on tenant management tables
ALTER TABLE copilot_internal.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_internal.tenant_memberships ENABLE ROW LEVEL SECURITY;

-- Policies check actual membership
CREATE POLICY tenants_member_read
  ON copilot_internal.tenants
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT tenant_id
      FROM copilot_internal.tenant_memberships
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );
```

These work even with service_role queries because they check actual membership!

### Use service_role + app filtering for data tables (EXISTING)

```typescript
// For conversations, messages, etc.
const { tenantId } = await getTenantContext(session);

const { data } = await supabaseAdmin  // service_role
  .from('conversations')
  .select('*')
  .eq('tenant_id', tenantId);  // App-level filter
```

**Why this works**:
- `getTenantContext()` verifies user is actually a member (via RLS query!)
- Once verified, use service_role for data queries
- Defense in depth: membership check (RLS) + tenant filter (app)

---

## Updated Architecture with RLS

### Recommended Pattern

```typescript
// apps/demo-web/src/lib/auth/tenantContext.ts

export async function getTenantContext(session: Session) {
  const userId = session?.user?.id;
  const activeTenantId = session?.user?.activeTenantId;

  if (!userId || !activeTenantId) {
    throw new Error('Unauthorized');
  }

  // Use authenticated role + RLS to verify membership
  const supabaseClient = createServerClient(
    supabaseUrl,
    supabaseAnonKey,  // ✅ RLS enforced
    { cookies }
  );

  const { data: membership } = await supabaseClient
    .from('tenant_memberships')  // ✅ Protected by RLS
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', activeTenantId)
    .eq('status', 'active')
    .single();

  if (!membership) {
    throw new Error('Not a member of this tenant');
  }

  // Return verified context for service_role queries
  return {
    userId,
    tenantId: activeTenantId,
    role: membership.role,
  };
}
```

**This approach**:
1. Uses RLS to verify tenant membership (security!)
2. Returns verified context for app-level filtering
3. Service_role queries use the verified tenantId
4. Defense in depth: RLS check + app filter

---

## Code Changes for RLS Support

### Migration Update (Already Included!)

The migration I provided **already includes RLS**:

```sql
-- From 20260105000000_multi_tenant_user_model.sql

ALTER TABLE copilot_internal.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_internal.tenant_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenants_member_read
  ON copilot_internal.tenants
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT tenant_id
      FROM copilot_internal.tenant_memberships
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );
```

### Implementation (Already in Plan!)

The `getTenantContext()` function I proposed uses authenticated role:

```typescript
// Uses authenticated client (RLS enforced)
const { data: access } = await supabase  // anon key, not service key!
  .rpc('verify_tenant_access', {
    p_user_id: userId,
    p_tenant_id: activeTenantId,
  })
  .single();
```

**The RLS policy ensures** this function can only verify memberships the user actually has!

---

## Summary: RLS Strategy

### For Tenant Tables (tenants, memberships, preferences)
- ✅ **Use RLS** (already in migration)
- ✅ Use authenticated role for queries
- ✅ Enforces membership checking
- ✅ Works with NextAuth

### For Data Tables (conversations, messages, etc.)
- **Option A**: Service role + app filtering (simpler, works with any auth)
- **Option B**: Authenticated role + RLS context (more secure, Supabase-specific)

### Recommended: Hybrid
1. RLS on tenant tables (membership verification)
2. Service role + app filtering on data tables
3. `getTenantContext()` verifies membership via RLS
4. Data queries use verified tenantId

**This gives you**:
- ✅ Security (RLS enforces membership)
- ✅ Flexibility (works with NextAuth + any provider)
- ✅ Simplicity (no complex RLS context management)
- ✅ Defense in depth (RLS + app logic)

---

## Your Questions Answered

### "Can I still use Supabase RLS?"
**Yes!** The architecture uses RLS for tenant membership tables and optionally for data tables.

### "Will this work with NextAuth?"
**Yes!** The hybrid approach works perfectly with NextAuth while still leveraging RLS.

### "Can I switch auth providers later?"
**Yes!** The RLS policies check membership table, which works with any auth provider.

### "Is this secure?"
**Yes!** More secure than current approach:
- Current: Service role + app filtering only
- New: RLS (membership check) + service role + app filtering (defense in depth)
