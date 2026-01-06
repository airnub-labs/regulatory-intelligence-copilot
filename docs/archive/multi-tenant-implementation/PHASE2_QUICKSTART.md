# Phase 2: Authentication Layer - Quick Start Guide

**Prerequisites**: Phase 1 complete and verified
**Time Estimate**: 6-8 hours
**Goal**: Update NextAuth to use multi-tenant system

---

## 📋 Phase 2 Task Checklist

```
Task 2.1: TypeScript Types              [ ] 30 min
Task 2.2: Tenant Context Helper         [ ] 1 hour
Task 2.3: Update NextAuth Options       [ ] 2-3 hours
Task 2.4: Update Session Validation     [ ] 1 hour
Task 2.5: Test Authentication Flow      [ ] 1 hour
```

---

## Task 2.1: Create TypeScript Types (30 min)

### File: `apps/demo-web/src/types/auth.ts`

Create this new file:

```typescript
// apps/demo-web/src/types/auth.ts

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  type: 'personal' | 'team' | 'enterprise';
  plan: 'free' | 'pro' | 'enterprise';
  role: 'owner' | 'admin' | 'member' | 'viewer';
  isActive: boolean;
  joinedAt: string;
}

export interface ExtendedUser {
  id: string;
  email: string;
  name?: string;
  currentTenantId?: string; // ← KEY CHANGE: renamed from tenantId
}

export interface ExtendedSession {
  user: ExtendedUser;
  expires: string;
}

export interface ExtendedJWT {
  sub: string;
  email: string;
  name?: string;
  currentTenantId?: string; // ← KEY CHANGE: renamed from tenantId
  lastValidated?: number;
}
```

**Test**:
```bash
npm run type-check
# Should compile without errors
```

---

## Task 2.2: Create Tenant Context Helper (1 hour)

### File: `apps/demo-web/src/lib/auth/tenantContext.ts`

Create this new file with the complete implementation from IMPLEMENTATION_PLAN.md (Task 2.2, lines 922-1011).

**Key features**:
- Validates user is authenticated
- Extracts currentTenantId from session
- Verifies membership via RLS-protected query
- Returns { userId, tenantId, role }
- Throws error if no valid membership

**Test API route** (optional):

```typescript
// apps/demo-web/src/app/api/test-tenant-context/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const context = await getTenantContext(session);

    return NextResponse.json({
      success: true,
      context,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 401 }
    );
  }
}
```

**Test**:
```bash
# Start dev server
npm run dev

# Login and visit
curl http://localhost:3000/api/test-tenant-context \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN"

# Should return: { success: true, context: { userId, tenantId, role } }
```

---

## Task 2.3: Update NextAuth Options (2-3 hours)

### File: `apps/demo-web/src/lib/auth/options.ts`

**Changes required**:

### Change 1: Remove unsafe fallback (Line 50)

```typescript
// REMOVE THIS LINE:
const fallbackTenantId = process.env.SUPABASE_DEMO_TENANT_ID ?? 'default'

// This is the security vulnerability we're fixing!
```

### Change 2: Update imports

```typescript
// Add at top:
import type { ExtendedJWT, ExtendedUser, ExtendedSession } from '@/types/auth';
```

### Change 3: Update type definitions (Lines 23-46)

```typescript
// REPLACE existing interfaces with imports:
import type { ExtendedJWT, ExtendedUser, ExtendedSession } from '@/types/auth';

// Remove the inline interface definitions
```

### Change 4: Update authorize callback (Lines 88-130)

**Before**:
```typescript
// Old code might have something like:
const tenantId = user.tenantId ?? fallbackTenantId;

return {
  id: userId,
  email: data.user.email,
  tenantId: tenantId, // OLD
};
```

**After** (complete replacement - see IMPLEMENTATION_PLAN.md lines 1086-1186):
```typescript
async authorize(credentials) {
  // ... authentication logic ...

  const userId = data.user.id;

  // Get or create personal tenant
  const supabaseAdmin = createServerClient(
    supabaseUrl,
    supabaseServiceKey!,
    { cookies }
  );

  let currentTenantId: string | null = null;

  // Check if user has active tenant
  const { data: activeId } = await supabaseAdmin
    .rpc('get_current_tenant_id', { p_user_id: userId })
    .single();

  if (activeId) {
    currentTenantId = activeId;
  } else {
    // New user - create personal tenant
    const { data: newTenantId, error: createError } = await supabaseAdmin
      .rpc('create_personal_tenant', {
        p_user_id: userId,
        p_user_email: data.user.email!,
      });

    if (createError || !newTenantId) {
      logger.error({ userId, error: createError }, 'Failed to create personal tenant');
      return null;
    }

    currentTenantId = newTenantId;
  }

  return {
    id: userId,
    email: data.user.email!,
    name: data.user.user_metadata?.full_name ?? data.user.email!,
    currentTenantId: currentTenantId, // NEW: renamed from tenantId
  };
}
```

### Change 5: Update JWT callback (Lines 195-250)

**Key changes**:
- Use `currentTenantId` instead of `tenantId`
- Update validation to fetch currentTenantId

```typescript
async jwt({ token, user }) {
  const extendedToken = token as ExtendedJWT;
  const extendedUser = user as ExtendedUser | undefined;

  if (extendedUser) {
    extendedToken.sub = extendedUser.id;
    extendedToken.email = extendedUser.email;
    extendedToken.name = extendedUser.name;
    extendedToken.currentTenantId = extendedUser.currentTenantId; // NEW
    extendedToken.lastValidated = Date.now();
    return token;
  }

  // ... validation logic ...

  if (validation.user) {
    extendedToken.currentTenantId = validation.user.currentTenantId; // NEW
  }

  return token;
}
```

### Change 6: Update session callback (Lines 1253-1276)

```typescript
async session({ session, token }) {
  const sessionWithUser = session as Session & ExtendedSession;
  const extendedToken = token as ExtendedJWT;

  if (sessionWithUser.user) {
    sessionWithUser.user.id = extendedToken.sub;
    sessionWithUser.user.email = extendedToken.email ?? '';
    sessionWithUser.user.name = extendedToken.name ?? '';
    sessionWithUser.user.currentTenantId = extendedToken.currentTenantId; // NEW
  }

  return sessionWithUser;
}
```

**Complete file**: See IMPLEMENTATION_PLAN.md lines 1048-1293 for full implementation.

---

## Task 2.4: Update Session Validation (1 hour)

### File: `apps/demo-web/src/lib/auth/sessionValidation.ts`

**Changes required**:

### Change 1: Update ValidateUserResult interface

```typescript
interface ValidateUserResult {
  isValid: boolean;
  user?: {
    id: string;
    email?: string | null;
    currentTenantId?: string; // CHANGED: renamed from tenantId
  };
  error?: string;
}
```

### Change 2: Update validateUserExists function

```typescript
export async function validateUserExists(userId: string): Promise<ValidateUserResult> {
  // ... existing cache logic ...

  try {
    // ... existing getUserById call ...

    if (!data.user) {
      // ... existing invalid logic ...
    }

    // NEW: Get user's active tenant ID
    const { data: currentTenantId } = await adminSupabase
      .rpc('get_current_tenant_id', { p_user_id: userId })
      .single();

    // Cache result with currentTenantId
    await validationCache.set(userId, true, currentTenantId);

    return {
      isValid: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        currentTenantId, // NEW
      },
    };
  } catch (error) {
    // ... existing error handling ...
  }
}
```

**Complete changes**: See IMPLEMENTATION_PLAN.md lines 1299-1345.

---

## Task 2.5: Test Authentication Flow (1 hour)

### Test Checklist

#### Test 1: Existing User Login

```bash
# 1. Start dev server
npm run dev

# 2. Login as demo user (created during seed)
# Visit: http://localhost:3000/login
# Should redirect to home page

# 3. Check browser console for logs
# Should see: "Tenant context verified"

# 4. Check JWT in DevTools
# Application > Cookies > next-auth.session-token
# Copy token, decode at jwt.io
# Verify payload has: sub, email, currentTenantId
```

#### Test 2: New User Signup

```bash
# 1. Create new user in Supabase
# Supabase Dashboard > Authentication > Users > Add User
# Email: newuser@test.com
# Password: testpassword123

# 2. Login with new user
# Should work without errors

# 3. Check logs
# Should see: "Creating personal tenant for new user"

# 4. Verify in database
psql postgresql://postgres:postgres@localhost:54322/postgres

SELECT
  u.email,
  t.name AS tenant_name,
  t.type,
  tm.role
FROM auth.users u
JOIN copilot_internal.user_preferences up ON up.user_id = u.id
JOIN copilot_internal.tenants t ON t.id = up.current_tenant_id
JOIN copilot_internal.tenant_memberships tm ON tm.user_id = u.id AND tm.tenant_id = t.id
WHERE u.email = 'newuser@test.com';

# Expected: 1 row showing personal tenant
```

#### Test 3: API Context Verification

```bash
# Visit test endpoint (if you created it)
curl http://localhost:3000/api/test-tenant-context \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN"

# Expected response:
{
  "success": true,
  "context": {
    "userId": "...",
    "tenantId": "...",
    "role": "owner"
  }
}
```

#### Test 4: Error Handling

```bash
# Try accessing API without authentication
curl http://localhost:3000/api/test-tenant-context

# Expected response (401):
{
  "error": "Unauthorized: No user ID in session"
}
```

### Verification Checklist

- [ ] Existing users can log in
- [ ] New users get personal tenant auto-created
- [ ] JWT includes currentTenantId
- [ ] getTenantContext() returns valid context
- [ ] API requests work with valid session
- [ ] API requests fail with 401 without session
- [ ] No errors in browser console
- [ ] No errors in server logs

---

## 🎯 Phase 2 Exit Criteria

Before proceeding to Phase 3:

- [ ] TypeScript types defined
- [ ] tenantContext.ts created and tested
- [ ] auth/options.ts updated (NO fallbackTenantId)
- [ ] sessionValidation.ts updated
- [ ] Login flow works
- [ ] Personal tenant auto-created for new users
- [ ] JWT includes currentTenantId
- [ ] All tests passing

---

## 🚨 Common Issues & Solutions

### Issue: "Cannot find module '@/types/auth'"

**Solution**: Verify TypeScript path mapping in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Issue: "get_current_tenant_id function does not exist"

**Solution**: Verify Phase 1 migration was applied:

```sql
\df public.get_current_tenant_id

-- Should show the function
```

### Issue: "Personal tenant creation fails"

**Solution**: Check service role key is set:

```bash
# In .env.local
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Restart dev server after adding
```

### Issue: JWT doesn't include currentTenantId

**Solution**: Clear browser cookies and login again:

```javascript
// In browser console
document.cookie.split(";").forEach(c => {
  document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
});
// Then login again
```

---

## 📚 Code References

Complete implementations available in:
- **IMPLEMENTATION_PLAN.md** - Lines 873-1395 (Phase 2)
- **MULTI_TENANT_ARCHITECTURE.md** - Lines 444-549 (Auth strategy)

---

## ✅ Ready to Start?

1. Review this guide
2. Check Phase 1 is verified and complete
3. Start with Task 2.1 (TypeScript types)
4. Work through tasks sequentially
5. Test thoroughly after each task
6. Mark todos complete as you finish

**Good luck with Phase 2!** 🚀

---

**Next Phase**: Phase 3 - API Routes (34 files)
**Estimated Time**: 8-12 hours
