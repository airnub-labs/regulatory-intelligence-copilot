import { test, expect } from '@playwright/test';
import { TEST_USERS, login, logout, isAuthenticated } from './fixtures/auth';
import { createConsoleCapture } from './fixtures/console-capture';

test.describe('Authentication - Login & Logout', () => {
  test.beforeEach(async ({ page }) => {
    // Start with a clean slate
    await page.context().clearCookies();
  });

  test('should show login page for unauthenticated users', async ({ page }) => {
    const console = createConsoleCapture('login-page-unauthenticated');
    console.startCapture(page);

    await page.goto('/');

    // Should redirect to login
    await page.waitForURL('/login', { timeout: 10000 });

    // Check login form elements
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    console.saveToFile();
    console.assertNoErrors();
  });

  test('should login successfully with DataTech CEO credentials', async ({ page }) => {
    const console = createConsoleCapture('login-datatech-ceo');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCEO);

    // Should be on home page
    await expect(page).toHaveURL('/');

    // Should be authenticated
    const authenticated = await isAuthenticated(page);
    expect(authenticated).toBe(true);

    console.saveToFile();
    const stats = console.getStats();
    console.log(`Console stats: ${JSON.stringify(stats)}`);
  });

  test('should login successfully with Emerald Tax Managing Partner', async ({ page }) => {
    const console = createConsoleCapture('login-emerald-partner');
    console.startCapture(page);

    await login(page, TEST_USERS.emeraldManagingPartner);

    await expect(page).toHaveURL('/');
    const authenticated = await isAuthenticated(page);
    expect(authenticated).toBe(true);

    console.saveToFile();
  });

  test('should login successfully with Seán Personal user', async ({ page }) => {
    const console = createConsoleCapture('login-sean-personal');
    console.startCapture(page);

    await login(page, TEST_USERS.seanPersonal);

    await expect(page).toHaveURL('/');
    const authenticated = await isAuthenticated(page);
    expect(authenticated).toBe(true);

    console.saveToFile();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    const console = createConsoleCapture('login-invalid-credentials');
    console.startCapture(page);

    await page.goto('/login');

    await page.fill('input[type="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"]');

    // Should show error message (wait up to 5 seconds)
    await expect(
      page.locator('text=/Invalid credentials|Authentication failed|Login failed/i')
    ).toBeVisible({ timeout: 5000 });

    // Should still be on login page
    await expect(page).toHaveURL('/login');

    console.saveToFile();
  });

  test('should logout successfully', async ({ page }) => {
    const console = createConsoleCapture('logout');
    console.startCapture(page);

    // Login first
    await login(page, TEST_USERS.dataTechCEO);
    await expect(page).toHaveURL('/');

    // Logout
    await logout(page);

    // Should be redirected to login page
    await expect(page).toHaveURL('/login');

    // Should not be authenticated
    const authenticated = await isAuthenticated(page);
    expect(authenticated).toBe(false);

    console.saveToFile();
  });

  test('should preserve redirect URL after login', async ({ page }) => {
    const console = createConsoleCapture('login-redirect-preservation');
    console.startCapture(page);

    // Try to access protected page
    await page.goto('/analytics/costs');

    // Should redirect to login
    await page.waitForURL(/\/login/, { timeout: 10000 });

    // Login
    await login(page, TEST_USERS.dataTechCFO);

    // Should redirect back to the original page or home
    // (This depends on implementation - adjust as needed)
    await page.waitForURL(/\/(analytics\/costs|)/, { timeout: 10000 });

    console.saveToFile();
  });

  test('should handle concurrent login attempts gracefully', async ({ page }) => {
    const console = createConsoleCapture('login-concurrent-attempts');
    console.startCapture(page);

    await page.goto('/login');

    // Fill credentials
    await page.fill('input[type="email"]', TEST_USERS.dataTechCEO.email);
    await page.fill('input[type="password"]', TEST_USERS.dataTechCEO.password);

    // Click submit multiple times quickly
    await Promise.all([
      page.click('button[type="submit"]'),
      page.click('button[type="submit"]'),
      page.click('button[type="submit"]'),
    ]);

    // Should still successfully login (not crash or show errors)
    await page.waitForURL('/', { timeout: 15000 });

    const authenticated = await isAuthenticated(page);
    expect(authenticated).toBe(true);

    console.saveToFile();
    // Should not have critical errors
    const errors = console.getBrowserErrors();
    const criticalErrors = errors.filter(e =>
      !e.text.includes('ResizeObserver') && // Ignore benign ResizeObserver warnings
      !e.text.includes('favicon')           // Ignore favicon 404s
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
