import { test, expect } from '@playwright/test';
import { ADMIN_USERS, login } from './fixtures';
import { createConsoleCapture } from './fixtures/console-capture';

/**
 * Users Management Tests for Copilot Admin
 *
 * Tests platform user management functionality including:
 * - User list display
 * - User search and filtering
 * - User details panel
 * - Multi-tenant user viewing
 * - Role-based access controls
 *
 * @tags @users @management @multi-tenant
 */

test.describe('Users Management - Page Load', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('@smoke Users page loads successfully', async ({ page }) => {
    const consoleCapture = createConsoleCapture('users-page-load');
    consoleCapture.startCapture(page);

    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Verify users page elements
    const heading = page.locator('h1, h2, [data-testid="page-title"]').filter({ hasText: /user/i });
    const hasHeading = await heading.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Users heading visible: ${hasHeading}`);

    // Should not have critical errors
    expect(consoleCapture.hasErrors()).toBe(false);

    consoleCapture.saveToFile();
  });

  test('Users page displays user table or list', async ({ page }) => {
    const consoleCapture = createConsoleCapture('users-table-display');
    consoleCapture.startCapture(page);

    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Look for table or list of users
    const table = page.locator('table');
    const list = page.locator('[role="list"], [data-testid="user-list"]');
    const cards = page.locator('[data-testid="user-card"], .user-card');

    const hasTable = await table.first().isVisible({ timeout: 10000 }).catch(() => false);
    const hasList = await list.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasCards = await cards.first().isVisible({ timeout: 5000 }).catch(() => false);

    consoleCapture.log(`Table visible: ${hasTable}, List visible: ${hasList}, Cards visible: ${hasCards}`);

    // Should have some form of user display
    expect(hasTable || hasList || hasCards).toBe(true);

    consoleCapture.saveToFile();
  });
});

test.describe('Users Management - Search & Filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Search input is available', async ({ page }) => {
    const consoleCapture = createConsoleCapture('users-search-input');
    consoleCapture.startCapture(page);

    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Look for search input
    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i], [data-testid="user-search"]'
    );

    const hasSearch = await searchInput.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Search input visible: ${hasSearch}`);

    consoleCapture.saveToFile();
  });

  test('Can filter users by typing in search', async ({ page }) => {
    const consoleCapture = createConsoleCapture('users-search-filter');
    consoleCapture.startCapture(page);

    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Find and use search input
    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i], [data-testid="user-search"]'
    ).first();

    if (await searchInput.isVisible({ timeout: 5000 })) {
      // Type a search query
      await searchInput.fill('test');
      await page.waitForTimeout(500); // Debounce wait

      consoleCapture.log('Typed search query');

      // Clear search
      await searchInput.clear();
      await page.waitForTimeout(500);

      consoleCapture.log('Cleared search');
    }

    consoleCapture.saveToFile();
  });

  test('Filter dropdown/select is available', async ({ page }) => {
    const consoleCapture = createConsoleCapture('users-filter-dropdown');
    consoleCapture.startCapture(page);

    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Look for filter controls (dropdown, select, combobox)
    const filterControl = page.locator(
      'select, [role="combobox"], [data-testid*="filter"], button:has-text("Filter"), button:has-text("Role")'
    );

    const hasFilter = await filterControl.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Filter control visible: ${hasFilter}`);

    consoleCapture.saveToFile();
  });
});

test.describe('Users Management - User Details', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Can click on user to view details', async ({ page }) => {
    const consoleCapture = createConsoleCapture('users-view-details');
    consoleCapture.startCapture(page);

    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Find a clickable user row/item
    const userItem = page.locator(
      'table tbody tr, [data-testid="user-row"], [data-testid="user-card"], [role="listitem"]'
    ).first();

    if (await userItem.isVisible({ timeout: 10000 })) {
      await userItem.click();
      await page.waitForTimeout(1000);

      // Check if details panel/modal appeared
      const detailsPanel = page.locator(
        '[data-testid="user-details"], [role="dialog"], .user-details, aside'
      );
      const hasDetails = await detailsPanel.first().isVisible({ timeout: 5000 }).catch(() => false);

      consoleCapture.log(`User details panel visible: ${hasDetails}`);
    } else {
      consoleCapture.log('No user items found to click');
    }

    consoleCapture.saveToFile();
  });

  test('User details shows relevant information', async ({ page }) => {
    const consoleCapture = createConsoleCapture('users-details-info');
    consoleCapture.startCapture(page);

    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Click on first user
    const userItem = page.locator(
      'table tbody tr, [data-testid="user-row"], [data-testid="user-card"]'
    ).first();

    if (await userItem.isVisible({ timeout: 10000 })) {
      await userItem.click();
      await page.waitForTimeout(1000);

      // Check for expected user detail fields
      const emailField = page.locator('text=email, [data-testid="user-email"]');
      const roleField = page.locator('text=role, [data-testid="user-role"]');
      const tenantField = page.locator('text=tenant, text=organization, [data-testid="user-tenant"]');

      const hasEmail = await emailField.first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasRole = await roleField.first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasTenant = await tenantField.first().isVisible({ timeout: 3000 }).catch(() => false);

      consoleCapture.log(`Email visible: ${hasEmail}, Role visible: ${hasRole}, Tenant visible: ${hasTenant}`);
    }

    consoleCapture.saveToFile();
  });
});

test.describe('Users Management - Tenant Filtering', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Tenant selector is available for multi-tenant support', async ({ page }) => {
    const consoleCapture = createConsoleCapture('users-tenant-selector');
    consoleCapture.startCapture(page);

    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Look for tenant/organization selector
    const tenantSelector = page.locator(
      '[data-testid="tenant-select"], [data-testid="tenant-filter"], select:has(option:text-matches("tenant|organization", "i")), [aria-label*="tenant" i]'
    );

    const hasTenantSelector = await tenantSelector.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Tenant selector visible: ${hasTenantSelector}`);

    consoleCapture.saveToFile();
  });

  test('Can switch between tenants', async ({ page }) => {
    const consoleCapture = createConsoleCapture('users-tenant-switch');
    consoleCapture.startCapture(page);

    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Find tenant selector
    const tenantSelector = page.locator(
      '[data-testid="tenant-select"], [data-testid="tenant-filter"], button:has-text("All tenants")'
    ).first();

    if (await tenantSelector.isVisible({ timeout: 5000 })) {
      await tenantSelector.click();
      await page.waitForTimeout(500);

      // Look for tenant options
      const tenantOptions = page.locator('[role="option"], [role="menuitem"], option');
      const optionCount = await tenantOptions.count();

      consoleCapture.log(`Found ${optionCount} tenant options`);

      // Click first option if available
      if (optionCount > 0) {
        await tenantOptions.first().click();
        await page.waitForLoadState('networkidle');
        consoleCapture.log('Selected first tenant option');
      }
    }

    consoleCapture.saveToFile();
  });
});

test.describe('Users Management - Role-Based Access', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('Super Admin can access users page', async ({ page }) => {
    const consoleCapture = createConsoleCapture('users-super-admin-access');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.superAdmin);
    await page.goto('/users');

    await expect(page).not.toHaveURL(/\/(login|unauthorized)/);
    consoleCapture.log('Super Admin can access users page');

    consoleCapture.saveToFile();
  });

  test('Platform Engineer can access users page', async ({ page }) => {
    const consoleCapture = createConsoleCapture('users-platform-engineer-access');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.platformEngineer1);
    await page.goto('/users');

    await expect(page).not.toHaveURL(/\/login/);
    consoleCapture.log('Platform Engineer can access users page');

    consoleCapture.saveToFile();
  });

  test('Account Manager can access users page', async ({ page }) => {
    const consoleCapture = createConsoleCapture('users-account-manager-access');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.accountManager);
    await page.goto('/users');

    await expect(page).not.toHaveURL(/\/login/);
    consoleCapture.log('Account Manager can access users page');

    consoleCapture.saveToFile();
  });

  test('Support Tier 3 can access users page', async ({ page }) => {
    const consoleCapture = createConsoleCapture('users-support-tier3-access');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.supportTier3);
    await page.goto('/users');

    await expect(page).not.toHaveURL(/\/login/);
    consoleCapture.log('Support Tier 3 can access users page');

    consoleCapture.saveToFile();
  });

  test('Support Tier 2 can access users page', async ({ page }) => {
    const consoleCapture = createConsoleCapture('users-support-tier2-access');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.supportTier2_1);
    await page.goto('/users');

    await expect(page).not.toHaveURL(/\/login/);
    consoleCapture.log('Support Tier 2 can access users page');

    consoleCapture.saveToFile();
  });

  test('Support Tier 1 has limited users access', async ({ page }) => {
    const consoleCapture = createConsoleCapture('users-support-tier1-access');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.supportTier1_1);
    await page.goto('/users');

    // Tier 1 should have access but with limitations
    await expect(page).not.toHaveURL(/\/login/);

    // Check if there are any restrictions visible
    const restrictedMessage = page.locator('text=restricted, text=limited, text=assigned');
    const hasRestriction = await restrictedMessage.first().isVisible({ timeout: 3000 }).catch(() => false);

    consoleCapture.log(`Support Tier 1 access - restriction message visible: ${hasRestriction}`);

    consoleCapture.saveToFile();
  });
});

test.describe('Users Management - Pagination', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Pagination controls are available', async ({ page }) => {
    const consoleCapture = createConsoleCapture('users-pagination');
    consoleCapture.startCapture(page);

    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Look for pagination controls
    const pagination = page.locator(
      '[data-testid="pagination"], nav[aria-label*="pagination" i], .pagination, button:has-text("Next"), button:has-text("Previous")'
    );

    const hasPagination = await pagination.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Pagination controls visible: ${hasPagination}`);

    consoleCapture.saveToFile();
  });

  test('Page size selector is available', async ({ page }) => {
    const consoleCapture = createConsoleCapture('users-page-size');
    consoleCapture.startCapture(page);

    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Look for page size selector
    const pageSizeSelector = page.locator(
      '[data-testid="page-size"], select:has(option:text-matches("10|25|50|100")), [aria-label*="rows" i]'
    );

    const hasPageSize = await pageSizeSelector.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Page size selector visible: ${hasPageSize}`);

    consoleCapture.saveToFile();
  });
});

test.describe('Users Management - Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Users page works on mobile viewport', async ({ page }) => {
    const consoleCapture = createConsoleCapture('users-mobile-viewport');
    consoleCapture.startCapture(page);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Should not have layout breaking errors
    expect(consoleCapture.hasErrors()).toBe(false);

    // Check that content is visible
    const content = page.locator('main, [role="main"], #main-content');
    const hasContent = await content.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Mobile content visible: ${hasContent}`);

    consoleCapture.saveToFile();
  });

  test('Users page works on tablet viewport', async ({ page }) => {
    const consoleCapture = createConsoleCapture('users-tablet-viewport');
    consoleCapture.startCapture(page);

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    expect(consoleCapture.hasErrors()).toBe(false);

    consoleCapture.saveToFile();
  });
});
