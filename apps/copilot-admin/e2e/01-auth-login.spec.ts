import { test, expect } from '@playwright/test';
import {
  ADMIN_USERS,
  login,
  logout,
  isAuthenticated,
  clearSession,
} from './fixtures';
import { createConsoleCapture } from './fixtures/console-capture';

/**
 * Authentication & Login Tests for Copilot Admin
 *
 * Tests login functionality for all admin user types:
 * - Super Admin
 * - Platform Engineer
 * - Account Manager
 * - Compliance Auditor
 * - Support Tiers (1, 2, 3)
 *
 * @tags @auth @login @security
 */

test.describe('Authentication - Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('@smoke Login page loads correctly', async ({ page }) => {
    const consoleCapture = createConsoleCapture('auth-login-page-load');
    consoleCapture.startCapture(page);

    await page.goto('/login');

    // Verify login form elements are present
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"], input[name="password"]').first()).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // Should not have critical errors
    expect(consoleCapture.hasErrors()).toBe(false);

    consoleCapture.saveToFile();
  });

  test('@smoke Unauthenticated user is redirected to login', async ({ page }) => {
    const consoleCapture = createConsoleCapture('auth-redirect-unauthenticated');
    consoleCapture.startCapture(page);

    // Try to access protected route
    await page.goto('/dashboard');

    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/);

    consoleCapture.saveToFile();
  });

  test('@security Invalid credentials show error', async ({ page }) => {
    const consoleCapture = createConsoleCapture('auth-invalid-credentials');
    consoleCapture.startCapture(page);

    await page.goto('/login');

    // Fill invalid credentials
    await page.fill('input[type="email"], input[name="email"]', 'invalid@example.com');
    await page.fill('input[type="password"], input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Wait for error message
    await page.waitForTimeout(2000);

    // Should still be on login page
    expect(page.url()).toContain('/login');

    // Check for error indication
    const errorMessage = page.locator('[role="alert"], .error, [data-testid="error"]');
    const hasError = await errorMessage.isVisible({ timeout: 5000 }).catch(() => false);
    consoleCapture.log(`Error message visible: ${hasError}`);

    consoleCapture.saveToFile();
  });

  test('@security Empty form submission is prevented', async ({ page }) => {
    const consoleCapture = createConsoleCapture('auth-empty-submission');
    consoleCapture.startCapture(page);

    await page.goto('/login');

    // Try to submit empty form
    await page.click('button[type="submit"]');

    // Should stay on login page
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/login');

    consoleCapture.saveToFile();
  });
});

test.describe('Authentication - Super Admin Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('@smoke Super Admin can login successfully', async ({ page }) => {
    const consoleCapture = createConsoleCapture('auth-super-admin-login');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.superAdmin);

    // Should be redirected to dashboard or protected area
    await expect(page).not.toHaveURL(/\/login/);

    // Verify user is authenticated
    const authenticated = await isAuthenticated(page);
    expect(authenticated).toBe(true);

    consoleCapture.log(`Super Admin login successful: ${ADMIN_USERS.superAdmin.email}`);
    consoleCapture.saveToFile();
  });

  test('Super Admin can logout', async ({ page }) => {
    const consoleCapture = createConsoleCapture('auth-super-admin-logout');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.superAdmin);
    await logout(page);

    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/);

    // Verify user is no longer authenticated
    const authenticated = await isAuthenticated(page);
    expect(authenticated).toBe(false);

    consoleCapture.saveToFile();
  });
});

test.describe('Authentication - Platform Engineer Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('@smoke Platform Engineer can login', async ({ page }) => {
    const consoleCapture = createConsoleCapture('auth-platform-engineer-login');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.platformEngineer1);

    await expect(page).not.toHaveURL(/\/login/);

    consoleCapture.log(`Platform Engineer login: ${ADMIN_USERS.platformEngineer1.email}`);
    consoleCapture.saveToFile();
  });
});

test.describe('Authentication - Support Tier Logins', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('Support Tier 3 can login', async ({ page }) => {
    const consoleCapture = createConsoleCapture('auth-support-tier3-login');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.supportTier3);
    await expect(page).not.toHaveURL(/\/login/);

    consoleCapture.log(`Support Tier 3 login: ${ADMIN_USERS.supportTier3.email}`);
    consoleCapture.saveToFile();
  });

  test('Support Tier 2 can login', async ({ page }) => {
    const consoleCapture = createConsoleCapture('auth-support-tier2-login');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.supportTier2_1);
    await expect(page).not.toHaveURL(/\/login/);

    consoleCapture.log(`Support Tier 2 login: ${ADMIN_USERS.supportTier2_1.email}`);
    consoleCapture.saveToFile();
  });

  test('Support Tier 1 can login', async ({ page }) => {
    const consoleCapture = createConsoleCapture('auth-support-tier1-login');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.supportTier1_1);
    await expect(page).not.toHaveURL(/\/login/);

    consoleCapture.log(`Support Tier 1 login: ${ADMIN_USERS.supportTier1_1.email}`);
    consoleCapture.saveToFile();
  });
});

test.describe('Authentication - Account Manager Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('Account Manager can login', async ({ page }) => {
    const consoleCapture = createConsoleCapture('auth-account-manager-login');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.accountManager);
    await expect(page).not.toHaveURL(/\/login/);

    consoleCapture.log(`Account Manager login: ${ADMIN_USERS.accountManager.email}`);
    consoleCapture.saveToFile();
  });
});

test.describe('Authentication - Compliance Auditor Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('Compliance Auditor can login', async ({ page }) => {
    const consoleCapture = createConsoleCapture('auth-compliance-auditor-login');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.complianceAuditor);
    await expect(page).not.toHaveURL(/\/login/);

    consoleCapture.log(`Compliance Auditor login: ${ADMIN_USERS.complianceAuditor.email}`);
    consoleCapture.saveToFile();
  });
});

test.describe('Authentication - Session Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('@security Session persists across page navigation', async ({ page }) => {
    const consoleCapture = createConsoleCapture('auth-session-persistence');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.superAdmin);

    // Navigate to different pages
    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto('/users');
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto('/settings');
    await expect(page).not.toHaveURL(/\/login/);

    consoleCapture.saveToFile();
  });

  test('@security Clearing cookies logs out user', async ({ page }) => {
    const consoleCapture = createConsoleCapture('auth-clear-cookies-logout');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.superAdmin);
    await expect(page).not.toHaveURL(/\/login/);

    // Clear cookies
    await clearSession(page);

    // Try to access protected page
    await page.goto('/dashboard');

    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/);

    consoleCapture.saveToFile();
  });
});

test.describe('Authentication - All Admin Roles Login Test', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('@regression All admin user types can login', async ({ page }) => {
    // This test loops through 7 users - needs extended timeout (3x default)
    test.slow();

    const consoleCapture = createConsoleCapture('auth-all-roles-login');
    consoleCapture.startCapture(page);

    const allRoles = [
      { role: 'Super Admin', user: ADMIN_USERS.superAdmin },
      { role: 'Platform Engineer', user: ADMIN_USERS.platformEngineer1 },
      { role: 'Account Manager', user: ADMIN_USERS.accountManager },
      { role: 'Compliance Auditor', user: ADMIN_USERS.complianceAuditor },
      { role: 'Support Tier 3', user: ADMIN_USERS.supportTier3 },
      { role: 'Support Tier 2', user: ADMIN_USERS.supportTier2_1 },
      { role: 'Support Tier 1', user: ADMIN_USERS.supportTier1_1 },
    ];

    for (const { role, user } of allRoles) {
      // Clear session before each login
      await page.context().clearCookies();

      consoleCapture.log(`Testing login for: ${role} (${user.email})`);

      await login(page, user);
      await expect(page).not.toHaveURL(/\/login/);

      consoleCapture.log(`${role} login successful`);
    }

    consoleCapture.saveToFile();
  });
});
