// apps/demo-web/src/types/auth.ts
// Multi-tenant authentication type definitions

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
  currentTenantId?: string; // Currently active tenant ID
}

export interface ExtendedSession {
  user: ExtendedUser;
  expires: string;
}

export interface ExtendedJWT {
  sub: string; // User ID
  email: string;
  name?: string;
  currentTenantId?: string; // Currently active tenant ID
  lastValidated?: number; // Timestamp of last validation
}
