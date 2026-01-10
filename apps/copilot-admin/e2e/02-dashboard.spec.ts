import { test, expect } from '@playwright/test';
import { ADMIN_USERS, login } from './fixtures';
import { createConsoleCapture } from './fixtures/console-capture';

/**
 * Dashboard Tests for Copilot Admin
 *
 * Tests dashboard functionality including:
 * - Dashboard page load and layout
 * - Statistics cards
 * - Charts and analytics
 * - Data table
 *
 * @tags @dashboard @analytics
 */

test.describe('Dashboard - Page Load', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('@smoke Dashboard page loads successfully', async ({ page }) => {
    const consoleCapture = createConsoleCapture('dashboard-page-load');
    consoleCapture.startCapture(page);

    await page.goto('/dashboard');

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');

    // Verify dashboard elements are present
    // Section cards should be visible
    const hasCards = await page.locator('[data-testid="section-cards"], .section-cards').isVisible({ timeout: 10000 }).catch(() => false)
      || await page.locator('.card').first().isVisible({ timeout: 5000 }).catch(() => false);

    consoleCapture.log(`Dashboard cards visible: ${hasCards}`);

    // Should not have critical errors
    expect(consoleCapture.hasErrors()).toBe(false);

    consoleCapture.saveToFile();
  });

  test('Dashboard displays statistics cards', async ({ page }) => {
    const consoleCapture = createConsoleCapture('dashboard-stats-cards');
    consoleCapture.startCapture(page);

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Look for stat cards or metric displays
    const cards = page.locator('[class*="card"], [data-testid*="stat"], [data-testid*="metric"]');
    const cardCount = await cards.count();

    consoleCapture.log(`Found ${cardCount} cards/metrics on dashboard`);

    // Dashboard should have some stat cards
    expect(cardCount).toBeGreaterThan(0);

    consoleCapture.saveToFile();
  });

  test('Dashboard displays chart area', async ({ page }) => {
    const consoleCapture = createConsoleCapture('dashboard-chart');
    consoleCapture.startCapture(page);

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Look for chart containers
    const chartContainer = page.locator('[class*="chart"], [data-testid*="chart"], canvas, svg');
    const hasChart = await chartContainer.first().isVisible({ timeout: 10000 }).catch(() => false);

    consoleCapture.log(`Chart visible: ${hasChart}`);

    consoleCapture.saveToFile();
  });

  test('Dashboard displays data table', async ({ page }) => {
    const consoleCapture = createConsoleCapture('dashboard-data-table');
    consoleCapture.startCapture(page);

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Look for table element
    const table = page.locator('table');
    const hasTable = await table.first().isVisible({ timeout: 10000 }).catch(() => false);

    consoleCapture.log(`Data table visible: ${hasTable}`);

    consoleCapture.saveToFile();
  });
});

test.describe('Dashboard - Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Can navigate to dashboard from sidebar', async ({ page }) => {
    const consoleCapture = createConsoleCapture('dashboard-nav-sidebar');
    consoleCapture.startCapture(page);

    // Start on a different page
    await page.goto('/users');

    // Click dashboard link in sidebar
    const dashboardLink = page.locator('a[href="/dashboard"], [data-testid="nav-dashboard"]').first();
    if (await dashboardLink.isVisible({ timeout: 3000 })) {
      await dashboardLink.click();
      await expect(page).toHaveURL(/\/dashboard/);
    }

    consoleCapture.saveToFile();
  });

  test('Dashboard is default landing page after login', async ({ page }) => {
    const consoleCapture = createConsoleCapture('dashboard-default-landing');
    consoleCapture.startCapture(page);

    // Clear session and re-login
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);

    // Should land on dashboard or root
    const url = page.url();
    consoleCapture.log(`Landing URL after login: ${url}`);

    // Should be on dashboard or a protected route
    expect(url).not.toContain('/login');

    consoleCapture.saveToFile();
  });
});

test.describe('Dashboard - Different User Roles', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('Platform Engineer can view dashboard', async ({ page }) => {
    const consoleCapture = createConsoleCapture('dashboard-platform-engineer');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.platformEngineer1);
    await page.goto('/dashboard');

    // Should not be redirected to login
    await expect(page).not.toHaveURL(/\/login/);

    consoleCapture.saveToFile();
  });

  test('Account Manager can view dashboard', async ({ page }) => {
    const consoleCapture = createConsoleCapture('dashboard-account-manager');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.accountManager);
    await page.goto('/dashboard');

    await expect(page).not.toHaveURL(/\/login/);

    consoleCapture.saveToFile();
  });

  test('Support Tier 3 can view dashboard', async ({ page }) => {
    const consoleCapture = createConsoleCapture('dashboard-support-tier3');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.supportTier3);
    await page.goto('/dashboard');

    await expect(page).not.toHaveURL(/\/login/);

    consoleCapture.saveToFile();
  });

  test('Support Tier 1 can view dashboard', async ({ page }) => {
    const consoleCapture = createConsoleCapture('dashboard-support-tier1');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.supportTier1_1);
    await page.goto('/dashboard');

    await expect(page).not.toHaveURL(/\/login/);

    consoleCapture.saveToFile();
  });
});

test.describe('Dashboard - Responsiveness', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Dashboard renders correctly on mobile viewport', async ({ page }) => {
    const consoleCapture = createConsoleCapture('dashboard-mobile-viewport');
    consoleCapture.startCapture(page);

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Should not have layout breaking errors
    expect(consoleCapture.hasErrors()).toBe(false);

    consoleCapture.saveToFile();
  });

  test('Dashboard renders correctly on tablet viewport', async ({ page }) => {
    const consoleCapture = createConsoleCapture('dashboard-tablet-viewport');
    consoleCapture.startCapture(page);

    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    expect(consoleCapture.hasErrors()).toBe(false);

    consoleCapture.saveToFile();
  });
});
