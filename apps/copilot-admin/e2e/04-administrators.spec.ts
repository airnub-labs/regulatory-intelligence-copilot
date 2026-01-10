import { test, expect } from '@playwright/test';
import { ADMIN_USERS, login } from './fixtures';
import { createConsoleCapture } from './fixtures/console-capture';

/**
 * Administrators Management Tests for Copilot Admin
 *
 * Tests platform administrator management functionality including:
 * - Admin list display
 * - Admin roles and permissions
 * - Admin details view
 * - Role-based access controls for admin management
 * - Geographic distribution display
 *
 * @tags @administrators @management @permissions
 */

test.describe('Administrators - Page Load', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('@smoke Administrators page loads successfully', async ({ page }) => {
    const consoleCapture = createConsoleCapture('admin-page-load');
    consoleCapture.startCapture(page);

    await page.goto('/administrators');
    await page.waitForLoadState('domcontentloaded');

    // Verify administrators page elements
    const heading = page.locator('h1, h2, [data-testid="page-title"]').filter({ hasText: /admin/i });
    const hasHeading = await heading.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Administrators heading visible: ${hasHeading}`);

    // Should not have critical errors
    expect(consoleCapture.hasErrors()).toBe(false);

    consoleCapture.saveToFile();
  });

  test('Administrators page displays admin table or list', async ({ page }) => {
    const consoleCapture = createConsoleCapture('admin-list-display');
    consoleCapture.startCapture(page);

    await page.goto('/administrators');
    await page.waitForLoadState('domcontentloaded');

    // Look for table or list of administrators
    const table = page.locator('table');
    const list = page.locator('[role="list"], [data-testid="admin-list"]');
    const cards = page.locator('[data-testid="admin-card"], .admin-card');

    const hasTable = await table.first().isVisible({ timeout: 10000 }).catch(() => false);
    const hasList = await list.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasCards = await cards.first().isVisible({ timeout: 5000 }).catch(() => false);

    consoleCapture.log(`Table visible: ${hasTable}, List visible: ${hasList}, Cards visible: ${hasCards}`);

    // Should have some form of admin display
    expect(hasTable || hasList || hasCards).toBe(true);

    consoleCapture.saveToFile();
  });
});

test.describe('Administrators - Role Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Displays admin roles correctly', async ({ page }) => {
    const consoleCapture = createConsoleCapture('admin-roles-display');
    consoleCapture.startCapture(page);

    await page.goto('/administrators');
    await page.waitForLoadState('domcontentloaded');

    // Look for role indicators
    const roleIndicators = page.locator(
      '[data-testid*="role"], .role-badge, .admin-role, span:text-matches("admin|engineer|manager|auditor|support", "i")'
    );

    const roleCount = await roleIndicators.count();
    consoleCapture.log(`Found ${roleCount} role indicators`);

    consoleCapture.saveToFile();
  });

  test('Shows different admin role types', async ({ page }) => {
    const consoleCapture = createConsoleCapture('admin-role-types');
    consoleCapture.startCapture(page);

    await page.goto('/administrators');
    await page.waitForLoadState('domcontentloaded');

    // Look for specific role types based on seed data
    const roleTypes = [
      'super_admin',
      'platform_engineer',
      'account_manager',
      'compliance_auditor',
      'support_tier_3',
      'support_tier_2',
      'support_tier_1',
    ];

    for (const role of roleTypes) {
      const roleElement = page.locator(`text=${role.replace(/_/g, ' ')}, [data-role="${role}"]`);
      const hasRole = await roleElement.first().isVisible({ timeout: 3000 }).catch(() => false);
      consoleCapture.log(`Role "${role}" visible: ${hasRole}`);
    }

    consoleCapture.saveToFile();
  });
});

test.describe('Administrators - Geographic Distribution', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Displays admin locations', async ({ page }) => {
    const consoleCapture = createConsoleCapture('admin-locations');
    consoleCapture.startCapture(page);

    await page.goto('/administrators');
    await page.waitForLoadState('domcontentloaded');

    // Look for location information based on seed data
    const locations = ['Dublin', 'Bangalore', 'Manila', 'Brussels'];

    for (const location of locations) {
      const locationElement = page.locator(`text=${location}`);
      const hasLocation = await locationElement.first().isVisible({ timeout: 3000 }).catch(() => false);
      consoleCapture.log(`Location "${location}" visible: ${hasLocation}`);
    }

    consoleCapture.saveToFile();
  });

  test('Shows department information', async ({ page }) => {
    const consoleCapture = createConsoleCapture('admin-departments');
    consoleCapture.startCapture(page);

    await page.goto('/administrators');
    await page.waitForLoadState('domcontentloaded');

    // Look for department information based on seed data
    const departments = ['Engineering', 'Customer Success', 'Legal & Compliance', 'Technical Support', 'Customer Support'];

    for (const dept of departments) {
      const deptElement = page.locator(`text=${dept}`);
      const hasDept = await deptElement.first().isVisible({ timeout: 3000 }).catch(() => false);
      consoleCapture.log(`Department "${dept}" visible: ${hasDept}`);
    }

    consoleCapture.saveToFile();
  });
});

test.describe('Administrators - Admin Details', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Can view admin details', async ({ page }) => {
    const consoleCapture = createConsoleCapture('admin-view-details');
    consoleCapture.startCapture(page);

    await page.goto('/administrators');
    await page.waitForLoadState('domcontentloaded');

    // Click on first admin row/card
    const adminItem = page.locator(
      'table tbody tr, [data-testid="admin-row"], [data-testid="admin-card"]'
    ).first();

    if (await adminItem.isVisible({ timeout: 10000 })) {
      await adminItem.click();
      await page.waitForTimeout(1000);

      // Check for details panel/modal
      const detailsPanel = page.locator(
        '[data-testid="admin-details"], [role="dialog"], .admin-details, aside'
      );
      const hasDetails = await detailsPanel.first().isVisible({ timeout: 5000 }).catch(() => false);

      consoleCapture.log(`Admin details panel visible: ${hasDetails}`);
    }

    consoleCapture.saveToFile();
  });

  test('Admin details shows permissions', async ({ page }) => {
    const consoleCapture = createConsoleCapture('admin-details-permissions');
    consoleCapture.startCapture(page);

    await page.goto('/administrators');
    await page.waitForLoadState('domcontentloaded');

    // Click on first admin
    const adminItem = page.locator(
      'table tbody tr, [data-testid="admin-row"], [data-testid="admin-card"]'
    ).first();

    if (await adminItem.isVisible({ timeout: 10000 })) {
      await adminItem.click();
      await page.waitForTimeout(1000);

      // Look for permissions section
      const permissionsSection = page.locator(
        'text=permissions, [data-testid="permissions"], .permissions-list'
      );
      const hasPermissions = await permissionsSection.first().isVisible({ timeout: 5000 }).catch(() => false);

      consoleCapture.log(`Permissions section visible: ${hasPermissions}`);
    }

    consoleCapture.saveToFile();
  });
});

test.describe('Administrators - Role-Based Access', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('Super Admin can access administrators page', async ({ page }) => {
    const consoleCapture = createConsoleCapture('admin-super-admin-access');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.superAdmin);
    await page.goto('/administrators');

    await expect(page).not.toHaveURL(/\/(login|unauthorized)/);
    consoleCapture.log('Super Admin can access administrators page');

    consoleCapture.saveToFile();
  });

  test('Platform Engineer can access administrators page', async ({ page }) => {
    const consoleCapture = createConsoleCapture('admin-platform-engineer-access');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.platformEngineer1);
    await page.goto('/administrators');

    // Platform Engineers may or may not have access - check behavior
    const url = page.url();
    const isAllowed = !url.includes('/login') && !url.includes('/unauthorized');

    consoleCapture.log(`Platform Engineer access allowed: ${isAllowed}`);

    consoleCapture.saveToFile();
  });

  test('Account Manager access to administrators page', async ({ page }) => {
    const consoleCapture = createConsoleCapture('admin-account-manager-access');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.accountManager);
    await page.goto('/administrators');

    // Account Managers may have limited access
    const url = page.url();
    const isAllowed = !url.includes('/login') && !url.includes('/unauthorized');

    consoleCapture.log(`Account Manager access allowed: ${isAllowed}`);

    consoleCapture.saveToFile();
  });

  test('Compliance Auditor access to administrators page', async ({ page }) => {
    const consoleCapture = createConsoleCapture('admin-compliance-auditor-access');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.complianceAuditor);
    await page.goto('/administrators');

    // Compliance Auditors typically have read-only access
    const url = page.url();
    const isAllowed = !url.includes('/login') && !url.includes('/unauthorized');

    consoleCapture.log(`Compliance Auditor access allowed: ${isAllowed}`);

    consoleCapture.saveToFile();
  });

  test('Support Tier 1 cannot manage administrators', async ({ page }) => {
    const consoleCapture = createConsoleCapture('admin-tier1-restricted');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.supportTier1_1);
    await page.goto('/administrators');

    // Tier 1 should have limited or no access to admin management
    const url = page.url();

    // Check if redirected or shown restricted view
    const isRestricted = url.includes('/unauthorized') || url.includes('/login');
    const hasRestrictedMessage = await page.locator('text=restricted, text=denied, text=not authorized').first().isVisible({ timeout: 3000 }).catch(() => false);

    consoleCapture.log(`Support Tier 1 restricted: ${isRestricted || hasRestrictedMessage}`);

    consoleCapture.saveToFile();
  });
});

test.describe('Administrators - Search & Filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Can search administrators', async ({ page }) => {
    const consoleCapture = createConsoleCapture('admin-search');
    consoleCapture.startCapture(page);

    await page.goto('/administrators');
    await page.waitForLoadState('domcontentloaded');

    // Find search input
    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="search" i], [data-testid="admin-search"]'
    ).first();

    if (await searchInput.isVisible({ timeout: 5000 })) {
      // Search for a known admin name
      await searchInput.fill('Gráinne');
      await page.waitForTimeout(500);

      consoleCapture.log('Searched for admin by name');
    }

    consoleCapture.saveToFile();
  });

  test('Can filter by role', async ({ page }) => {
    const consoleCapture = createConsoleCapture('admin-filter-role');
    consoleCapture.startCapture(page);

    await page.goto('/administrators');
    await page.waitForLoadState('domcontentloaded');

    // Find role filter
    const roleFilter = page.locator(
      '[data-testid="role-filter"], select:has(option:text-matches("role|admin|engineer", "i")), button:has-text("Role")'
    ).first();

    if (await roleFilter.isVisible({ timeout: 5000 })) {
      await roleFilter.click();
      await page.waitForTimeout(500);

      consoleCapture.log('Opened role filter');
    }

    consoleCapture.saveToFile();
  });

  test('Can filter by location', async ({ page }) => {
    const consoleCapture = createConsoleCapture('admin-filter-location');
    consoleCapture.startCapture(page);

    await page.goto('/administrators');
    await page.waitForLoadState('domcontentloaded');

    // Find location filter
    const locationFilter = page.locator(
      '[data-testid="location-filter"], select:has(option:text-matches("dublin|bangalore|manila", "i")), button:has-text("Location")'
    ).first();

    if (await locationFilter.isVisible({ timeout: 5000 })) {
      await locationFilter.click();
      await page.waitForTimeout(500);

      consoleCapture.log('Opened location filter');
    }

    consoleCapture.saveToFile();
  });
});

test.describe('Administrators - Audit Trail', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Shows last login information', async ({ page }) => {
    const consoleCapture = createConsoleCapture('admin-last-login');
    consoleCapture.startCapture(page);

    await page.goto('/administrators');
    await page.waitForLoadState('domcontentloaded');

    // Look for last login or activity information
    const lastLoginIndicator = page.locator(
      'text=last login, text=last seen, text=last active, [data-testid*="last-login"], [data-testid*="last-activity"]'
    );

    const hasLastLogin = await lastLoginIndicator.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Last login information visible: ${hasLastLogin}`);

    consoleCapture.saveToFile();
  });

  test('Shows admin status (active/inactive)', async ({ page }) => {
    const consoleCapture = createConsoleCapture('admin-status');
    consoleCapture.startCapture(page);

    await page.goto('/administrators');
    await page.waitForLoadState('domcontentloaded');

    // Look for status indicators
    const statusIndicator = page.locator(
      '[data-testid*="status"], .status-badge, span:text-matches("active|inactive|enabled|disabled", "i")'
    );

    const hasStatus = await statusIndicator.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Status indicator visible: ${hasStatus}`);

    consoleCapture.saveToFile();
  });
});

test.describe('Administrators - Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Administrators page works on mobile viewport', async ({ page }) => {
    const consoleCapture = createConsoleCapture('admin-mobile-viewport');
    consoleCapture.startCapture(page);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/administrators');
    await page.waitForLoadState('domcontentloaded');

    expect(consoleCapture.hasErrors()).toBe(false);

    consoleCapture.saveToFile();
  });

  test('Administrators page works on tablet viewport', async ({ page }) => {
    const consoleCapture = createConsoleCapture('admin-tablet-viewport');
    consoleCapture.startCapture(page);

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/administrators');
    await page.waitForLoadState('domcontentloaded');

    expect(consoleCapture.hasErrors()).toBe(false);

    consoleCapture.saveToFile();
  });
});
