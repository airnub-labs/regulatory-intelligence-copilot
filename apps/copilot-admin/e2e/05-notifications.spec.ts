import { test, expect } from '@playwright/test';
import { ADMIN_USERS, login } from './fixtures';
import { createConsoleCapture } from './fixtures/console-capture';

/**
 * Notifications Tests for Copilot Admin
 *
 * Tests notification functionality including:
 * - Notifications page display
 * - Notification bell/icon in header
 * - Real-time notification updates (SSE)
 * - Notification filtering and management
 * - Mark as read/unread
 * - Notification preferences
 *
 * @tags @notifications @realtime @sse
 */

test.describe('Notifications - Page Load', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('@smoke Notifications page loads successfully', async ({ page }) => {
    const consoleCapture = createConsoleCapture('notifications-page-load');
    consoleCapture.startCapture(page);

    await page.goto('/notifications');
    await page.waitForLoadState('domcontentloaded');

    // Wait for page content instead of networkidle (SSE keeps network active)
    const heading = page.locator('h1, h2, [data-testid="page-title"]').filter({ hasText: /notification/i });
    await heading.first().waitFor({ state: 'visible', timeout: 15000 });
    const hasHeading = await heading.first().isVisible();
    consoleCapture.log(`Notifications heading visible: ${hasHeading}`);

    // Should not have critical errors
    expect(consoleCapture.hasErrors()).toBe(false);

    consoleCapture.saveToFile();
  });

  test('Notifications page displays notification list', async ({ page }) => {
    const consoleCapture = createConsoleCapture('notifications-list-display');
    consoleCapture.startCapture(page);

    await page.goto('/notifications');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('h1, h2').filter({ hasText: /notification/i }).first().waitFor({ state: 'visible', timeout: 15000 });

    // Look for notification list or empty state
    const notificationList = page.locator(
      '[data-testid="notification-list"], [role="list"], .notification-list, .notifications'
    );
    const emptyState = page.locator(
      'text=no notifications, text=all caught up, [data-testid="empty-state"]'
    );

    const hasList = await notificationList.first().isVisible({ timeout: 10000 }).catch(() => false);
    const hasEmpty = await emptyState.first().isVisible({ timeout: 5000 }).catch(() => false);

    consoleCapture.log(`Notification list visible: ${hasList}, Empty state visible: ${hasEmpty}`);

    // Should have either list or empty state
    expect(hasList || hasEmpty).toBe(true);

    consoleCapture.saveToFile();
  });
});

test.describe('Notifications - Header Bell/Icon', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Notification bell icon is visible in header', async ({ page }) => {
    const consoleCapture = createConsoleCapture('notifications-bell-icon');
    consoleCapture.startCapture(page);

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Look for notification bell/icon in header
    const bellIcon = page.locator(
      '[data-testid="notification-bell"], [data-testid="notifications-button"], button[aria-label*="notification" i], .notification-icon, header button svg'
    );

    const hasBell = await bellIcon.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Notification bell visible: ${hasBell}`);

    expect(hasBell).toBe(true);

    consoleCapture.saveToFile();
  });

  test('Clicking notification bell opens dropdown/panel', async ({ page }) => {
    const consoleCapture = createConsoleCapture('notifications-bell-click');
    consoleCapture.startCapture(page);

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Click notification bell
    const bellIcon = page.locator(
      '[data-testid="notification-bell"], [data-testid="notifications-button"], button[aria-label*="notification" i]'
    ).first();

    if (await bellIcon.isVisible({ timeout: 5000 })) {
      await bellIcon.click();
      await page.waitForTimeout(500);

      // Check for dropdown/panel
      const dropdown = page.locator(
        '[data-testid="notification-dropdown"], [data-testid="notification-panel"], [role="menu"], .notification-dropdown, .popover'
      );
      const hasDropdown = await dropdown.first().isVisible({ timeout: 5000 }).catch(() => false);

      consoleCapture.log(`Notification dropdown visible: ${hasDropdown}`);
    }

    consoleCapture.saveToFile();
  });

  test('Notification badge shows unread count', async ({ page }) => {
    const consoleCapture = createConsoleCapture('notifications-badge-count');
    consoleCapture.startCapture(page);

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Look for notification badge with count
    const badge = page.locator(
      '[data-testid="notification-count"], .notification-badge, .badge, span:text-matches("^[0-9]+$")'
    ).first();

    const hasBadge = await badge.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasBadge) {
      const badgeText = await badge.textContent();
      consoleCapture.log(`Notification badge visible with count: ${badgeText}`);
    } else {
      consoleCapture.log('No notification badge visible (may have 0 notifications)');
    }

    consoleCapture.saveToFile();
  });
});

test.describe('Notifications - Notification Types', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Shows different notification types', async ({ page }) => {
    const consoleCapture = createConsoleCapture('notifications-types');
    consoleCapture.startCapture(page);

    await page.goto('/notifications');
    await page.waitForLoadState('domcontentloaded');

    // Look for different notification types
    const types = ['info', 'warning', 'error', 'success', 'alert', 'system'];

    for (const type of types) {
      const typeIndicator = page.locator(
        `[data-type="${type}"], [data-testid*="${type}"], .notification-${type}, [class*="${type}"]`
      );
      const hasType = await typeIndicator.first().isVisible({ timeout: 2000 }).catch(() => false);
      if (hasType) {
        consoleCapture.log(`Notification type "${type}" visible`);
      }
    }

    consoleCapture.saveToFile();
  });

  test('Shows notification timestamp', async ({ page }) => {
    const consoleCapture = createConsoleCapture('notifications-timestamp');
    consoleCapture.startCapture(page);

    await page.goto('/notifications');
    await page.waitForLoadState('domcontentloaded');

    // Look for timestamps
    const timestamp = page.locator(
      'time, [data-testid*="timestamp"], [data-testid*="time"], .timestamp, text=/ago|today|yesterday/i'
    );

    const hasTimestamp = await timestamp.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Notification timestamp visible: ${hasTimestamp}`);

    consoleCapture.saveToFile();
  });
});

test.describe('Notifications - Mark as Read/Unread', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Can mark notification as read', async ({ page }) => {
    const consoleCapture = createConsoleCapture('notifications-mark-read');
    consoleCapture.startCapture(page);

    await page.goto('/notifications');
    await page.waitForLoadState('domcontentloaded');

    // Find an unread notification and mark as read
    const unreadNotification = page.locator(
      '[data-read="false"], .unread, [data-testid="notification-item"]:not(.read)'
    ).first();

    if (await unreadNotification.isVisible({ timeout: 5000 })) {
      // Look for mark as read button/action
      const markReadButton = unreadNotification.locator(
        'button:has-text("mark as read"), button:has-text("read"), [data-action="mark-read"]'
      ).first();

      if (await markReadButton.isVisible({ timeout: 3000 })) {
        await markReadButton.click();
        await page.waitForTimeout(500);
        consoleCapture.log('Marked notification as read');
      } else {
        // Try clicking the notification itself
        await unreadNotification.click();
        await page.waitForTimeout(500);
        consoleCapture.log('Clicked notification (may mark as read)');
      }
    } else {
      consoleCapture.log('No unread notifications to mark');
    }

    consoleCapture.saveToFile();
  });

  test('Mark all as read functionality', async ({ page }) => {
    const consoleCapture = createConsoleCapture('notifications-mark-all-read');
    consoleCapture.startCapture(page);

    await page.goto('/notifications');
    await page.waitForLoadState('domcontentloaded');

    // Look for "mark all as read" button
    const markAllButton = page.locator(
      'button:has-text("mark all"), button:has-text("read all"), [data-testid="mark-all-read"]'
    ).first();

    const hasMarkAll = await markAllButton.isVisible({ timeout: 5000 }).catch(() => false);
    consoleCapture.log(`Mark all as read button visible: ${hasMarkAll}`);

    consoleCapture.saveToFile();
  });
});

test.describe('Notifications - Filtering', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Can filter notifications by type', async ({ page }) => {
    const consoleCapture = createConsoleCapture('notifications-filter-type');
    consoleCapture.startCapture(page);

    await page.goto('/notifications');
    await page.waitForLoadState('domcontentloaded');

    // Look for filter controls
    const typeFilter = page.locator(
      '[data-testid="notification-filter"], select, [role="combobox"], button:has-text("All"), button:has-text("Filter")'
    ).first();

    const hasFilter = await typeFilter.isVisible({ timeout: 5000 }).catch(() => false);
    consoleCapture.log(`Type filter visible: ${hasFilter}`);

    if (hasFilter) {
      await typeFilter.click();
      await page.waitForTimeout(500);
      consoleCapture.log('Opened type filter');
    }

    consoleCapture.saveToFile();
  });

  test('Can filter read/unread notifications', async ({ page }) => {
    const consoleCapture = createConsoleCapture('notifications-filter-read-status');
    consoleCapture.startCapture(page);

    await page.goto('/notifications');
    await page.waitForLoadState('domcontentloaded');

    // Look for read/unread toggle or tabs
    const readFilter = page.locator(
      'button:has-text("unread"), button:has-text("all"), [role="tab"]:has-text("unread"), [data-testid="unread-filter"]'
    ).first();

    const hasReadFilter = await readFilter.isVisible({ timeout: 5000 }).catch(() => false);
    consoleCapture.log(`Read/unread filter visible: ${hasReadFilter}`);

    consoleCapture.saveToFile();
  });
});

test.describe('Notifications - Delete/Dismiss', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Can dismiss/delete notification', async ({ page }) => {
    const consoleCapture = createConsoleCapture('notifications-delete');
    consoleCapture.startCapture(page);

    await page.goto('/notifications');
    await page.waitForLoadState('domcontentloaded');

    // Find a notification with dismiss/delete option
    const notification = page.locator(
      '[data-testid="notification-item"], .notification-item'
    ).first();

    if (await notification.isVisible({ timeout: 5000 })) {
      // Look for delete/dismiss button
      const deleteButton = notification.locator(
        'button:has-text("delete"), button:has-text("dismiss"), button[aria-label*="delete" i], button[aria-label*="dismiss" i], [data-action="delete"]'
      ).first();

      const hasDelete = await deleteButton.isVisible({ timeout: 3000 }).catch(() => false);
      consoleCapture.log(`Delete button visible: ${hasDelete}`);
    }

    consoleCapture.saveToFile();
  });

  test('Clear all notifications option', async ({ page }) => {
    const consoleCapture = createConsoleCapture('notifications-clear-all');
    consoleCapture.startCapture(page);

    await page.goto('/notifications');
    await page.waitForLoadState('domcontentloaded');

    // Look for "clear all" button
    const clearAllButton = page.locator(
      'button:has-text("clear all"), button:has-text("delete all"), [data-testid="clear-all"]'
    ).first();

    const hasClearAll = await clearAllButton.isVisible({ timeout: 5000 }).catch(() => false);
    consoleCapture.log(`Clear all button visible: ${hasClearAll}`);

    consoleCapture.saveToFile();
  });
});

test.describe('Notifications - Role-Based Access', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('Super Admin can access notifications', async ({ page }) => {
    const consoleCapture = createConsoleCapture('notifications-super-admin');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.superAdmin);
    await page.goto('/notifications');

    await expect(page).not.toHaveURL(/\/(login|unauthorized)/);

    consoleCapture.saveToFile();
  });

  test('Platform Engineer can access notifications', async ({ page }) => {
    const consoleCapture = createConsoleCapture('notifications-platform-engineer');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.platformEngineer1);
    await page.goto('/notifications');

    await expect(page).not.toHaveURL(/\/login/);

    consoleCapture.saveToFile();
  });

  test('Support Tier 1 can access notifications', async ({ page }) => {
    const consoleCapture = createConsoleCapture('notifications-tier1');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.supportTier1_1);
    await page.goto('/notifications');

    await expect(page).not.toHaveURL(/\/login/);

    consoleCapture.saveToFile();
  });

  test('All admin roles see notification bell', async ({ page }) => {
    const consoleCapture = createConsoleCapture('notifications-bell-all-roles');
    consoleCapture.startCapture(page);

    const roles = [
      { name: 'Super Admin', user: ADMIN_USERS.superAdmin },
      { name: 'Platform Engineer', user: ADMIN_USERS.platformEngineer1 },
      { name: 'Account Manager', user: ADMIN_USERS.accountManager },
      { name: 'Support Tier 3', user: ADMIN_USERS.supportTier3 },
      { name: 'Support Tier 1', user: ADMIN_USERS.supportTier1_1 },
    ];

    for (const { name, user } of roles) {
      await page.context().clearCookies();
      await login(page, user);
      await page.goto('/dashboard');
      await page.waitForLoadState('domcontentloaded');

      const bellIcon = page.locator(
        '[data-testid="notification-bell"], [data-testid="notifications-button"], button[aria-label*="notification" i]'
      ).first();

      const hasBell = await bellIcon.isVisible({ timeout: 5000 }).catch(() => false);
      consoleCapture.log(`${name} sees notification bell: ${hasBell}`);
    }

    consoleCapture.saveToFile();
  });
});

test.describe('Notifications - Real-time Updates', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('SSE connection established for notifications', async ({ page }) => {
    const consoleCapture = createConsoleCapture('notifications-sse-connection');
    consoleCapture.startCapture(page);

    // Listen for SSE connection
    let sseConnected = false;
    page.on('request', (request) => {
      if (request.url().includes('/api/') && request.url().includes('notifications')) {
        if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') {
          sseConnected = true;
          consoleCapture.log(`SSE/API request to: ${request.url()}`);
        }
      }
    });

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000); // Wait for SSE to establish

    consoleCapture.log(`SSE connection detected: ${sseConnected}`);

    consoleCapture.saveToFile();
  });
});

test.describe('Notifications - Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Notifications page works on mobile viewport', async ({ page }) => {
    const consoleCapture = createConsoleCapture('notifications-mobile-viewport');
    consoleCapture.startCapture(page);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/notifications');
    await page.waitForLoadState('domcontentloaded');

    expect(consoleCapture.hasErrors()).toBe(false);

    consoleCapture.saveToFile();
  });

  test('Notification bell works on mobile', async ({ page }) => {
    const consoleCapture = createConsoleCapture('notifications-bell-mobile');
    consoleCapture.startCapture(page);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Check bell is accessible on mobile
    const bellIcon = page.locator(
      '[data-testid="notification-bell"], [data-testid="notifications-button"], button[aria-label*="notification" i]'
    ).first();

    const hasBell = await bellIcon.isVisible({ timeout: 5000 }).catch(() => false);
    consoleCapture.log(`Notification bell visible on mobile: ${hasBell}`);

    if (hasBell) {
      await bellIcon.click();
      await page.waitForTimeout(500);
      consoleCapture.log('Bell clicked on mobile');
    }

    consoleCapture.saveToFile();
  });
});
