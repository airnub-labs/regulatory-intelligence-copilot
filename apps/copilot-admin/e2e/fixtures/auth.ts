/**
 * Authentication fixtures for Copilot Admin E2E tests
 *
 * Admin User Hierarchy (from realistic seed data):
 * - Super Admin: Full platform access
 * - Platform Engineer: Infrastructure and code access
 * - Account Manager: Assigned tenant management
 * - Compliance Auditor: Read-only audit access
 * - Support Tier 3: Engineering-level debugging
 * - Support Tier 2: Cross-tenant support access
 * - Support Tier 1: Limited tenant support access
 */

import type { Page } from '@playwright/test';

export interface TestAdminUser {
  id: string;
  email: string;
  password: string;
  name: string;
  role: string;
  location: string;
  department: string;
}

// Admin password for all platform admins (from seed data)
const ADMIN_PASSWORD = 'AdminPassword123!';

/**
 * Platform Admin Users - Global Support Team
 * Based on realistic seed data from 04_platform_admins.sql
 */
export const ADMIN_USERS = {
  // Super Admin (Dublin HQ) - Full platform access
  superAdmin: {
    id: 'e1f20304-a506-4c7d-8e9f-0a1b2c3d4e5f',
    email: 'grainne.nimhaonaigh@regintel.io',
    password: ADMIN_PASSWORD,
    name: 'Gráinne Ní Mhaonaigh',
    role: 'super_admin',
    location: 'Dublin, Ireland',
    department: 'Executive',
  },

  // Platform Engineers (Dublin) - Infrastructure access
  platformEngineer1: {
    id: 'e2f30405-a607-4d8e-9f0a-1b2c3d4e5f60',
    email: 'tadhg.oreilly@regintel.io',
    password: ADMIN_PASSWORD,
    name: "Tadhg O'Reilly",
    role: 'platform_engineer',
    location: 'Dublin, Ireland',
    department: 'Engineering',
  },
  platformEngineer2: {
    id: 'e3f40506-a708-4e9f-0a1b-2c3d4e5f6071',
    email: 'caoimhe.byrne@regintel.io',
    password: ADMIN_PASSWORD,
    name: 'Caoimhe Byrne',
    role: 'platform_engineer',
    location: 'Dublin, Ireland',
    department: 'Engineering',
  },

  // Account Manager (Dublin) - Client relationship management
  accountManager: {
    id: 'e4f50607-a809-4f0a-1b2c-3d4e5f607182',
    email: 'donal.lynch@regintel.io',
    password: ADMIN_PASSWORD,
    name: 'Donal Lynch',
    role: 'account_manager',
    location: 'Dublin, Ireland',
    department: 'Customer Success',
  },

  // Compliance Auditor (Brussels) - Audit access
  complianceAuditor: {
    id: 'e5f60708-a90a-4a1b-2c3d-4e5f60718293',
    email: 'marie.dubois@regintel.io',
    password: ADMIN_PASSWORD,
    name: 'Marie Dubois',
    role: 'compliance_auditor',
    location: 'Brussels, Belgium',
    department: 'Legal & Compliance',
  },

  // Support Tier 3 (Dublin) - Senior Engineering Support
  supportTier3: {
    id: 'e6f70809-a00b-4b2c-3d4e-5f60718293a4',
    email: 'padraig.brennan@regintel.io',
    password: ADMIN_PASSWORD,
    name: 'Pádraig Brennan',
    role: 'support_tier_3',
    location: 'Dublin, Ireland',
    department: 'Technical Support',
  },

  // Support Tier 2 (Bangalore) - Escalation Support
  supportTier2_1: {
    id: 'e7f8090a-a10c-4c3d-4e5f-60718293a4b5',
    email: 'priya.sharma@regintel.io',
    password: ADMIN_PASSWORD,
    name: 'Priya Sharma',
    role: 'support_tier_2',
    location: 'Bangalore, India',
    department: 'Technical Support',
  },
  supportTier2_2: {
    id: 'e8f9000b-a20d-4d4e-5f60-718293a4b5c6',
    email: 'rajesh.kumar@regintel.io',
    password: ADMIN_PASSWORD,
    name: 'Rajesh Kumar',
    role: 'support_tier_2',
    location: 'Bangalore, India',
    department: 'Technical Support',
  },

  // Support Tier 1 (Manila) - Frontline Support
  supportTier1_1: {
    id: 'e9f0010c-a30e-4e5f-6071-8293a4b5c6d7',
    email: 'maria.santos@regintel.io',
    password: ADMIN_PASSWORD,
    name: 'Maria Santos',
    role: 'support_tier_1',
    location: 'Manila, Philippines',
    department: 'Customer Support',
  },
  supportTier1_2: {
    id: 'e0f1020d-a40f-4f60-7182-93a4b5c6d7e8',
    email: 'jose.reyes@regintel.io',
    password: ADMIN_PASSWORD,
    name: 'Jose Reyes',
    role: 'support_tier_1',
    location: 'Manila, Philippines',
    department: 'Customer Support',
  },
} satisfies Record<string, TestAdminUser>;

// Convenience groupings by role tier
export const USERS_BY_ROLE = {
  superAdmin: [ADMIN_USERS.superAdmin],
  platformEngineers: [ADMIN_USERS.platformEngineer1, ADMIN_USERS.platformEngineer2],
  accountManagers: [ADMIN_USERS.accountManager],
  complianceAuditors: [ADMIN_USERS.complianceAuditor],
  supportTier3: [ADMIN_USERS.supportTier3],
  supportTier2: [ADMIN_USERS.supportTier2_1, ADMIN_USERS.supportTier2_2],
  supportTier1: [ADMIN_USERS.supportTier1_1, ADMIN_USERS.supportTier1_2],
};

// Users by geographic location
export const USERS_BY_LOCATION = {
  dublin: [
    ADMIN_USERS.superAdmin,
    ADMIN_USERS.platformEngineer1,
    ADMIN_USERS.platformEngineer2,
    ADMIN_USERS.accountManager,
    ADMIN_USERS.supportTier3,
  ],
  bangalore: [ADMIN_USERS.supportTier2_1, ADMIN_USERS.supportTier2_2],
  manila: [ADMIN_USERS.supportTier1_1, ADMIN_USERS.supportTier1_2],
  brussels: [ADMIN_USERS.complianceAuditor],
};

/**
 * Login to the admin dashboard with the given user credentials
 */
export async function login(page: Page, user: TestAdminUser): Promise<void> {
  await page.goto('/login');

  // Wait for login form to be visible
  await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });

  // Fill in credentials
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('input[type="password"], input[name="password"]').first();

  await emailInput.fill(user.email);
  await passwordInput.fill(user.password);

  // Submit the form
  const submitButton = page.locator('button[type="submit"]');
  await submitButton.click();

  // Wait for navigation away from login page (handles both root redirect and specific pages)
  // Also wait for the "Signing in..." state to complete
  await page.waitForFunction(
    () => {
      const url = window.location.pathname;
      const signInButton = document.querySelector('button[type="submit"]');
      const isLoading = signInButton?.textContent?.includes('Signing') || signInButton?.hasAttribute('disabled');
      return !url.includes('/login') || !isLoading;
    },
    { timeout: 30000 }
  );

  // Final check: ensure we're not on login page
  await page.waitForURL(/\/(dashboard|users|administrators|notifications|settings)?$/, {
    timeout: 30000,
  });
}

/**
 * Login with retry logic for flaky authentication
 */
export async function loginWithRetry(
  page: Page,
  user: TestAdminUser,
  maxRetries: number = 3
): Promise<void> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await login(page, user);
      return;
    } catch (error) {
      lastError = error as Error;
      console.warn(`Login attempt ${attempt} failed:`, error);

      if (attempt < maxRetries) {
        await page.context().clearCookies();
        await page.waitForTimeout(1000 * attempt);
      }
    }
  }

  throw lastError;
}

/**
 * Logout from the admin dashboard
 */
export async function logout(page: Page): Promise<void> {
  // Look for user menu button
  const userMenuButton = page.locator('[data-testid="user-menu"], button:has-text("Account")').first();

  if (await userMenuButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await userMenuButton.click();

    // Click logout option
    const logoutOption = page.locator('text=Logout, text=Sign out, [data-testid="logout"]').first();
    await logoutOption.click();
  } else {
    // Fallback: navigate directly to signout endpoint
    await page.goto('/api/auth/signout');
  }

  // Handle signout confirmation page if present
  const signOutConfirmButton = page.locator('button:has-text("Sign out")');
  if (await signOutConfirmButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await signOutConfirmButton.click();
  }

  // Wait for redirect to login
  await page.waitForURL(/\/login/, { timeout: 10000 });
}

/**
 * Check if user is currently authenticated
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  try {
    // Check if we can access a protected page without redirect
    const response = await page.goto('/dashboard');
    const url = page.url();
    return !url.includes('/login') && response?.ok() === true;
  } catch {
    return false;
  }
}

/**
 * Get the current logged-in user's display name
 */
export async function getCurrentUserName(page: Page): Promise<string | null> {
  try {
    const userNameElement = page.locator(
      '[data-testid="user-name"], [data-testid="current-user"], .user-name'
    ).first();

    if (await userNameElement.isVisible({ timeout: 3000 })) {
      return await userNameElement.textContent();
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Clear session and cookies
 */
export async function clearSession(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

/**
 * Navigate as a specific user - ensures login before navigation
 */
export async function navigateAsUser(
  page: Page,
  user: TestAdminUser,
  path: string
): Promise<void> {
  // Check if already logged in as this user
  const currentUrl = page.url();
  if (!currentUrl.includes('/login')) {
    const userName = await getCurrentUserName(page);
    if (userName?.includes(user.name.split(' ')[0])) {
      // Already logged in as this user
      await page.goto(path);
      return;
    }
  }

  // Clear session and login
  await clearSession(page);
  await login(page, user);
  await page.goto(path);
}

// Export all users for convenience
export const ALL_ADMIN_USERS = Object.values(ADMIN_USERS);
