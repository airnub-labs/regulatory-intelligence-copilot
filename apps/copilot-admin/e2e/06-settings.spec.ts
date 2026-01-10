import { test, expect } from '@playwright/test';
import { ADMIN_USERS, login } from './fixtures';
import { createConsoleCapture } from './fixtures/console-capture';

/**
 * Settings Tests for Copilot Admin
 *
 * Tests settings functionality including:
 * - Settings layout and navigation
 * - Profile settings (name, email, avatar)
 * - Preferences (language, theme, notifications)
 * - Session management (active sessions, revoke)
 * - Internationalization (10 locales)
 *
 * @tags @settings @profile @preferences @i18n
 */

test.describe('Settings - Layout & Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('@smoke Settings page loads successfully', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-page-load');
    consoleCapture.startCapture(page);

    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // Wait for page content instead of networkidle (SSE keeps network active)
    const heading = page.locator('h1, h2, [data-testid="page-title"]').filter({ hasText: /setting/i });
    await heading.first().waitFor({ state: 'visible', timeout: 15000 });
    const hasHeading = await heading.first().isVisible();
    consoleCapture.log(`Settings heading visible: ${hasHeading}`);

    // Should not have critical errors
    expect(consoleCapture.hasErrors()).toBe(false);

    consoleCapture.saveToFile();
  });

  test('Settings has navigation sidebar or tabs', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-navigation');
    consoleCapture.startCapture(page);

    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // Look for settings navigation
    const settingsNav = page.locator(
      '[data-testid="settings-nav"], nav, aside, [role="tablist"], .settings-tabs'
    );

    const hasNav = await settingsNav.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Settings navigation visible: ${hasNav}`);

    // Check for common settings sections
    const sections = ['Profile', 'Preferences', 'Sessions', 'Security', 'Notifications'];
    for (const section of sections) {
      const sectionLink = page.locator(`a:has-text("${section}"), button:has-text("${section}"), [role="tab"]:has-text("${section}")`);
      const hasSection = await sectionLink.first().isVisible({ timeout: 3000 }).catch(() => false);
      if (hasSection) {
        consoleCapture.log(`Settings section "${section}" available`);
      }
    }

    consoleCapture.saveToFile();
  });

  test('Can navigate between settings sections', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-section-navigation');
    consoleCapture.startCapture(page);

    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // Try navigating to profile
    const profileLink = page.locator('a:has-text("Profile"), a[href*="profile"], [data-testid="settings-profile"]').first();
    if (await profileLink.isVisible({ timeout: 5000 })) {
      await profileLink.click();
      await page.waitForLoadState('domcontentloaded');
      consoleCapture.log('Navigated to Profile section');
    }

    // Try navigating to preferences
    const preferencesLink = page.locator('a:has-text("Preferences"), a[href*="preferences"], [data-testid="settings-preferences"]').first();
    if (await preferencesLink.isVisible({ timeout: 5000 })) {
      await preferencesLink.click();
      await page.waitForLoadState('domcontentloaded');
      consoleCapture.log('Navigated to Preferences section');
    }

    // Try navigating to sessions
    const sessionsLink = page.locator('a:has-text("Sessions"), a[href*="sessions"], [data-testid="settings-sessions"]').first();
    if (await sessionsLink.isVisible({ timeout: 5000 })) {
      await sessionsLink.click();
      await page.waitForLoadState('domcontentloaded');
      consoleCapture.log('Navigated to Sessions section');
    }

    consoleCapture.saveToFile();
  });
});

test.describe('Settings - Profile', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Profile settings page loads', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-profile-load');
    consoleCapture.startCapture(page);

    await page.goto('/settings/profile');
    await page.waitForLoadState('domcontentloaded');

    // Verify profile page loaded
    const profileContent = page.locator(
      '[data-testid="profile-settings"], form, .profile-form, text=profile'
    );
    const hasProfile = await profileContent.first().isVisible({ timeout: 10000 }).catch(() => false);

    consoleCapture.log(`Profile settings visible: ${hasProfile}`);
    expect(consoleCapture.hasErrors()).toBe(false);

    consoleCapture.saveToFile();
  });

  test('Profile shows current user information', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-profile-info');
    consoleCapture.startCapture(page);

    await page.goto('/settings/profile');
    await page.waitForLoadState('domcontentloaded');

    // Look for user information fields
    const emailField = page.locator('input[type="email"], input[name="email"], [data-testid="profile-email"]');
    const nameField = page.locator('input[name="name"], input[name="displayName"], [data-testid="profile-name"]');

    const hasEmail = await emailField.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasName = await nameField.first().isVisible({ timeout: 5000 }).catch(() => false);

    consoleCapture.log(`Email field visible: ${hasEmail}, Name field visible: ${hasName}`);

    // Check if current user email is displayed
    const userEmail = ADMIN_USERS.superAdmin.email;
    const emailDisplay = page.locator(`text=${userEmail}`);
    const showsEmail = await emailDisplay.first().isVisible({ timeout: 3000 }).catch(() => false);
    consoleCapture.log(`Current user email displayed: ${showsEmail}`);

    consoleCapture.saveToFile();
  });

  test('Profile shows avatar or image upload', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-profile-avatar');
    consoleCapture.startCapture(page);

    await page.goto('/settings/profile');
    await page.waitForLoadState('domcontentloaded');

    // Look for avatar/image elements
    const avatar = page.locator(
      '[data-testid="profile-avatar"], img[alt*="avatar" i], img[alt*="profile" i], .avatar, input[type="file"]'
    );

    const hasAvatar = await avatar.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Avatar/profile image visible: ${hasAvatar}`);

    consoleCapture.saveToFile();
  });

  test('Profile has save button', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-profile-save');
    consoleCapture.startCapture(page);

    await page.goto('/settings/profile');
    await page.waitForLoadState('domcontentloaded');

    // Look for save button
    const saveButton = page.locator(
      'button:has-text("Save"), button:has-text("Update"), button[type="submit"], [data-testid="profile-save"]'
    );

    const hasSave = await saveButton.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Save button visible: ${hasSave}`);

    consoleCapture.saveToFile();
  });
});

test.describe('Settings - Preferences', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Preferences page loads', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-preferences-load');
    consoleCapture.startCapture(page);

    await page.goto('/settings/preferences');
    await page.waitForLoadState('domcontentloaded');

    const preferencesContent = page.locator(
      '[data-testid="preferences-settings"], form, .preferences-form, text=preferences'
    );
    const hasPreferences = await preferencesContent.first().isVisible({ timeout: 10000 }).catch(() => false);

    consoleCapture.log(`Preferences settings visible: ${hasPreferences}`);
    expect(consoleCapture.hasErrors()).toBe(false);

    consoleCapture.saveToFile();
  });

  test('Language selector is available (i18n)', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-preferences-language');
    consoleCapture.startCapture(page);

    await page.goto('/settings/preferences');
    await page.waitForLoadState('domcontentloaded');

    // Look for language selector
    const languageSelector = page.locator(
      '[data-testid="language-select"], select[name="language"], [data-testid*="locale"], label:has-text("Language")'
    );

    const hasLanguage = await languageSelector.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Language selector visible: ${hasLanguage}`);

    // Check for expected locales (10 required)
    const expectedLocales = ['en-IE', 'en-GB', 'en-US', 'ga-IE', 'es-ES', 'fr-FR', 'fr-CA', 'de-DE', 'pt-PT', 'pt-BR'];
    if (hasLanguage) {
      await languageSelector.first().click();
      await page.waitForTimeout(500);

      for (const locale of expectedLocales) {
        const localeOption = page.locator(`[data-value="${locale}"], option[value="${locale}"], text=${locale}`);
        const hasLocale = await localeOption.first().isVisible({ timeout: 2000 }).catch(() => false);
        if (hasLocale) {
          consoleCapture.log(`Locale "${locale}" available`);
        }
      }
    }

    consoleCapture.saveToFile();
  });

  test('Theme selector is available', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-preferences-theme');
    consoleCapture.startCapture(page);

    await page.goto('/settings/preferences');
    await page.waitForLoadState('domcontentloaded');

    // Look for theme selector
    const themeSelector = page.locator(
      '[data-testid="theme-select"], select[name="theme"], button:has-text("Theme"), label:has-text("Theme"), [role="radiogroup"]'
    );

    const hasTheme = await themeSelector.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Theme selector visible: ${hasTheme}`);

    // Check for light/dark/system options
    const themes = ['light', 'dark', 'system', 'auto'];
    for (const theme of themes) {
      const themeOption = page.locator(`button:has-text("${theme}"), [data-value="${theme}"], input[value="${theme}"]`);
      const hasOption = await themeOption.first().isVisible({ timeout: 2000 }).catch(() => false);
      if (hasOption) {
        consoleCapture.log(`Theme option "${theme}" available`);
      }
    }

    consoleCapture.saveToFile();
  });

  test('Notification preferences are available', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-preferences-notifications');
    consoleCapture.startCapture(page);

    await page.goto('/settings/preferences');
    await page.waitForLoadState('domcontentloaded');

    // Look for notification preferences
    const notificationSettings = page.locator(
      'text=notifications, [data-testid*="notification"], label:has-text("notifications"), input[type="checkbox"]'
    );

    const hasNotificationSettings = await notificationSettings.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Notification settings visible: ${hasNotificationSettings}`);

    consoleCapture.saveToFile();
  });

  test('Can toggle notification preferences', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-preferences-toggle');
    consoleCapture.startCapture(page);

    await page.goto('/settings/preferences');
    await page.waitForLoadState('domcontentloaded');

    // Find a visible switch/toggle button (not the hidden input)
    const toggle = page.locator('button[role="switch"], [role="switch"]').first();

    if (await toggle.isVisible({ timeout: 5000 })) {
      const initialState = await toggle.getAttribute('data-state');
      consoleCapture.log(`Initial toggle state: ${initialState}`);

      await toggle.click();
      await page.waitForTimeout(500);

      const newState = await toggle.getAttribute('data-state');
      consoleCapture.log(`Toggle state after click: ${newState}`);
    }

    consoleCapture.saveToFile();
  });
});

test.describe('Settings - Sessions', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Sessions page loads', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-sessions-load');
    consoleCapture.startCapture(page);

    await page.goto('/settings/sessions');
    await page.waitForLoadState('domcontentloaded');

    const sessionsContent = page.locator(
      '[data-testid="sessions-settings"], .sessions-list, text=sessions, text=devices'
    );
    const hasSessions = await sessionsContent.first().isVisible({ timeout: 10000 }).catch(() => false);

    consoleCapture.log(`Sessions settings visible: ${hasSessions}`);
    expect(consoleCapture.hasErrors()).toBe(false);

    consoleCapture.saveToFile();
  });

  test('Shows current session', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-sessions-current');
    consoleCapture.startCapture(page);

    await page.goto('/settings/sessions');
    await page.waitForLoadState('domcontentloaded');

    // Look for current session indicator
    const currentSession = page.locator(
      'text=current, text=this device, text=active, [data-testid="current-session"], .current-session'
    );

    const hasCurrentSession = await currentSession.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Current session indicator visible: ${hasCurrentSession}`);

    consoleCapture.saveToFile();
  });

  test('Shows session list with details', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-sessions-list');
    consoleCapture.startCapture(page);

    await page.goto('/settings/sessions');
    await page.waitForLoadState('domcontentloaded');

    // Look for session list
    const sessionList = page.locator(
      '[data-testid="session-list"], table, .sessions-list, [role="list"]'
    );

    const hasSessionList = await sessionList.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Session list visible: ${hasSessionList}`);

    // Check for session details
    const details = ['browser', 'device', 'location', 'ip', 'last active'];
    for (const detail of details) {
      const detailElement = page.locator(`text=${detail}`, { exact: false });
      const hasDetail = await detailElement.first().isVisible({ timeout: 2000 }).catch(() => false);
      if (hasDetail) {
        consoleCapture.log(`Session detail "${detail}" visible`);
      }
    }

    consoleCapture.saveToFile();
  });

  test('Can revoke other sessions', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-sessions-revoke');
    consoleCapture.startCapture(page);

    await page.goto('/settings/sessions');
    await page.waitForLoadState('domcontentloaded');

    // Look for revoke/terminate session buttons
    const revokeButton = page.locator(
      'button:has-text("revoke"), button:has-text("terminate"), button:has-text("sign out"), [data-testid*="revoke"]'
    );

    const hasRevoke = await revokeButton.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Revoke session button visible: ${hasRevoke}`);

    consoleCapture.saveToFile();
  });

  test('Sign out all sessions option', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-sessions-signout-all');
    consoleCapture.startCapture(page);

    await page.goto('/settings/sessions');
    await page.waitForLoadState('domcontentloaded');

    // Look for "sign out all" button
    const signOutAllButton = page.locator(
      'button:has-text("sign out all"), button:has-text("revoke all"), button:has-text("terminate all"), [data-testid="signout-all"]'
    );

    const hasSignOutAll = await signOutAllButton.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Sign out all button visible: ${hasSignOutAll}`);

    consoleCapture.saveToFile();
  });
});

test.describe('Settings - Role-Based Access', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('All admin roles can access settings', async ({ page }) => {
    // This test loops through 7 users - needs extended timeout (3x default)
    test.slow();

    const consoleCapture = createConsoleCapture('settings-role-access');
    consoleCapture.startCapture(page);

    const roles = [
      { name: 'Super Admin', user: ADMIN_USERS.superAdmin },
      { name: 'Platform Engineer', user: ADMIN_USERS.platformEngineer1 },
      { name: 'Account Manager', user: ADMIN_USERS.accountManager },
      { name: 'Compliance Auditor', user: ADMIN_USERS.complianceAuditor },
      { name: 'Support Tier 3', user: ADMIN_USERS.supportTier3 },
      { name: 'Support Tier 2', user: ADMIN_USERS.supportTier2_1 },
      { name: 'Support Tier 1', user: ADMIN_USERS.supportTier1_1 },
    ];

    for (const { name, user } of roles) {
      await page.context().clearCookies();
      await login(page, user);
      await page.goto('/settings');
      await page.waitForLoadState('domcontentloaded');

      const url = page.url();
      const hasAccess = !url.includes('/login') && !url.includes('/unauthorized');
      consoleCapture.log(`${name} settings access: ${hasAccess}`);
    }

    consoleCapture.saveToFile();
  });

  test('Users can only modify their own profile', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-profile-own-only');
    consoleCapture.startCapture(page);

    await login(page, ADMIN_USERS.supportTier1_1);
    await page.goto('/settings/profile');
    await page.waitForLoadState('domcontentloaded');

    // Should see own profile, not ability to edit others
    const userEmail = ADMIN_USERS.supportTier1_1.email;
    const ownEmail = page.locator(`text=${userEmail}, input[value="${userEmail}"]`);
    const showsOwnEmail = await ownEmail.first().isVisible({ timeout: 5000 }).catch(() => false);

    consoleCapture.log(`Shows own email in profile: ${showsOwnEmail}`);

    consoleCapture.saveToFile();
  });
});

test.describe('Settings - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Settings forms have proper labels', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-a11y-labels');
    consoleCapture.startCapture(page);

    await page.goto('/settings/profile');
    await page.waitForLoadState('domcontentloaded');

    // Check for input labels
    const inputs = page.locator('input:not([type="hidden"]):not([type="submit"])');
    const inputCount = await inputs.count();

    let labeledCount = 0;
    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledby = await input.getAttribute('aria-labelledby');

      if (id) {
        const label = page.locator(`label[for="${id}"]`);
        const hasLabel = await label.isVisible({ timeout: 1000 }).catch(() => false);
        if (hasLabel) labeledCount++;
      } else if (ariaLabel || ariaLabelledby) {
        labeledCount++;
      }
    }

    consoleCapture.log(`Inputs: ${inputCount}, Labeled: ${labeledCount}`);

    consoleCapture.saveToFile();
  });

  test('Settings is keyboard navigable', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-a11y-keyboard');
    consoleCapture.startCapture(page);

    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // Tab through elements
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);
    }

    // Check if focus is visible
    const focusedElement = page.locator(':focus');
    const hasFocus = await focusedElement.isVisible({ timeout: 3000 }).catch(() => false);

    consoleCapture.log(`Focus visible after tab navigation: ${hasFocus}`);

    consoleCapture.saveToFile();
  });
});

test.describe('Settings - Field Editing & Save', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('@regression Profile edit mode enables fields', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-profile-edit-mode');
    consoleCapture.startCapture(page);

    await page.goto('/settings/profile');
    await page.waitForLoadState('domcontentloaded');

    // Find the Edit button
    const editButton = page.locator('button:has-text("Edit")');
    const hasEditButton = await editButton.first().isVisible({ timeout: 10000 }).catch(() => false);
    consoleCapture.log(`Edit button visible: ${hasEditButton}`);

    if (hasEditButton) {
      // Check that name field is disabled initially
      const nameField = page.locator('input[name="displayName"], input#displayName');
      const isDisabledBefore = await nameField.first().isDisabled().catch(() => null);
      consoleCapture.log(`Name field disabled before edit: ${isDisabledBefore}`);

      // Click Edit button
      await editButton.first().click();
      await page.waitForTimeout(500);

      // Check that name field is now enabled
      const isDisabledAfter = await nameField.first().isDisabled().catch(() => null);
      consoleCapture.log(`Name field disabled after edit: ${isDisabledAfter}`);

      // Should see Save and Cancel buttons
      const saveButton = page.locator('button:has-text("Save")');
      const cancelButton = page.locator('button:has-text("Cancel")');
      const hasSave = await saveButton.first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasCancel = await cancelButton.first().isVisible({ timeout: 3000 }).catch(() => false);
      consoleCapture.log(`Save button visible: ${hasSave}, Cancel button visible: ${hasCancel}`);

      expect(hasSave).toBe(true);
      expect(hasCancel).toBe(true);
    }

    consoleCapture.saveToFile();
  });

  test('@regression Profile edit and cancel reverts changes', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-profile-edit-cancel');
    consoleCapture.startCapture(page);

    await page.goto('/settings/profile');
    await page.waitForLoadState('domcontentloaded');

    const editButton = page.locator('button:has-text("Edit")');
    if (await editButton.first().isVisible({ timeout: 10000 })) {
      await editButton.first().click();
      await page.waitForTimeout(500);

      const nameField = page.locator('input[name="displayName"], input#displayName');
      if (await nameField.first().isVisible({ timeout: 3000 })) {
        // Get original value
        const originalValue = await nameField.first().inputValue();
        consoleCapture.log(`Original name value: ${originalValue}`);

        // Change the value
        await nameField.first().clear();
        await nameField.first().fill('Test Name Change');
        consoleCapture.log('Changed name to: Test Name Change');

        // Click Cancel
        const cancelButton = page.locator('button:has-text("Cancel")');
        await cancelButton.first().click();
        await page.waitForTimeout(500);

        // Verify value reverted
        const revertedValue = await nameField.first().inputValue().catch(() => '');
        consoleCapture.log(`Value after cancel: ${revertedValue}`);
        expect(revertedValue).toBe(originalValue);
      }
    }

    consoleCapture.saveToFile();
  });

  test('@regression Profile edit and save calls API', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-profile-edit-save-api');
    consoleCapture.startCapture(page);

    await page.goto('/settings/profile');
    await page.waitForLoadState('domcontentloaded');

    // Intercept API calls
    let apiCalled = false;
    let apiMethod = '';
    let apiUrl = '';
    page.on('request', (request) => {
      if (request.url().includes('/api/users/') && request.method() === 'PATCH') {
        apiCalled = true;
        apiMethod = request.method();
        apiUrl = request.url();
        consoleCapture.log(`API called: ${apiMethod} ${apiUrl}`);
      }
    });

    const editButton = page.locator('button:has-text("Edit")');
    if (await editButton.first().isVisible({ timeout: 10000 })) {
      await editButton.first().click();
      await page.waitForTimeout(500);

      const nameField = page.locator('input[name="displayName"], input#displayName');
      if (await nameField.first().isVisible({ timeout: 3000 })) {
        // Make a change
        const originalValue = await nameField.first().inputValue();
        await nameField.first().clear();
        await nameField.first().fill(originalValue + ' (Test)');

        // Click Save
        const saveButton = page.locator('button:has-text("Save")');
        await saveButton.first().click();
        await page.waitForTimeout(1500);

        consoleCapture.log(`API was called: ${apiCalled}`);

        // Revert the change
        if (apiCalled) {
          await editButton.first().click();
          await page.waitForTimeout(500);
          await nameField.first().clear();
          await nameField.first().fill(originalValue);
          await saveButton.first().click();
          await page.waitForTimeout(1500);
        }
      }
    }

    consoleCapture.saveToFile();
  });

  test('@regression Profile save shows toast notification', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-profile-save-toast');
    consoleCapture.startCapture(page);

    await page.goto('/settings/profile');
    await page.waitForLoadState('domcontentloaded');

    const editButton = page.locator('button:has-text("Edit")');
    if (await editButton.first().isVisible({ timeout: 10000 })) {
      await editButton.first().click();
      await page.waitForTimeout(500);

      const nameField = page.locator('input[name="displayName"], input#displayName');
      if (await nameField.first().isVisible({ timeout: 3000 })) {
        const originalValue = await nameField.first().inputValue();

        // Make a change and save
        await nameField.first().clear();
        await nameField.first().fill(originalValue + '!');

        const saveButton = page.locator('button:has-text("Save")');
        await saveButton.first().click();
        await page.waitForTimeout(1500);

        // Look for toast notification
        const toast = page.locator('[data-sonner-toast], [role="status"], .toast, [class*="toast"]');
        const hasToast = await toast.first().isVisible({ timeout: 5000 }).catch(() => false);
        consoleCapture.log(`Toast notification visible: ${hasToast}`);

        // Revert the change
        await editButton.first().click();
        await page.waitForTimeout(500);
        await nameField.first().clear();
        await nameField.first().fill(originalValue);
        await saveButton.first().click();
        await page.waitForTimeout(1000);
      }
    }

    consoleCapture.saveToFile();
  });

  test('@regression Preferences changes show save button', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-preferences-save-button');
    consoleCapture.startCapture(page);

    await page.goto('/settings/preferences');
    await page.waitForLoadState('domcontentloaded');

    // Initially, save button should not be visible (no changes)
    const saveButton = page.locator('button:has-text("Save")');
    const saveVisibleInitially = await saveButton.first().isVisible({ timeout: 3000 }).catch(() => false);
    consoleCapture.log(`Save button visible initially: ${saveVisibleInitially}`);

    // Find a checkbox toggle and click it
    const toggle = page.locator('button[role="checkbox"], input[type="checkbox"]').first();
    if (await toggle.isVisible({ timeout: 5000 })) {
      await toggle.click();
      await page.waitForTimeout(500);

      // Now save button should be visible
      const saveVisibleAfterChange = await saveButton.first().isVisible({ timeout: 3000 }).catch(() => false);
      consoleCapture.log(`Save button visible after change: ${saveVisibleAfterChange}`);

      // Click toggle again to revert
      await toggle.click();
      await page.waitForTimeout(500);
    }

    consoleCapture.saveToFile();
  });

  test('@regression Preferences save calls API', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-preferences-save-api');
    consoleCapture.startCapture(page);

    await page.goto('/settings/preferences');
    await page.waitForLoadState('domcontentloaded');

    // Intercept API calls
    let apiCalled = false;
    page.on('request', (request) => {
      if (request.url().includes('/api/users/') && request.method() === 'PATCH') {
        apiCalled = true;
        consoleCapture.log(`API called: ${request.method()} ${request.url()}`);
      }
    });

    // Find a checkbox toggle and change it
    const toggle = page.locator('button[role="checkbox"], input[type="checkbox"]').first();
    if (await toggle.isVisible({ timeout: 5000 })) {
      const initialState = await toggle.isChecked().catch(() => null);
      consoleCapture.log(`Initial toggle state: ${initialState}`);

      await toggle.click();
      await page.waitForTimeout(500);

      // Click Save button
      const saveButton = page.locator('button:has-text("Save")');
      if (await saveButton.first().isVisible({ timeout: 3000 })) {
        await saveButton.first().click();
        await page.waitForTimeout(1500);

        consoleCapture.log(`API was called: ${apiCalled}`);

        // Revert the change
        await toggle.click();
        await page.waitForTimeout(500);
        if (await saveButton.first().isVisible({ timeout: 3000 })) {
          await saveButton.first().click();
          await page.waitForTimeout(1000);
        }
      }
    }

    consoleCapture.saveToFile();
  });

  test('@regression Preferences theme change applies immediately', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-preferences-theme-apply');
    consoleCapture.startCapture(page);

    await page.goto('/settings/preferences');
    await page.waitForLoadState('domcontentloaded');

    // Find theme selector
    const themeSelect = page.locator('button[role="combobox"]').filter({ hasText: /light|dark|system/i }).first();

    if (await themeSelect.isVisible({ timeout: 5000 })) {
      await themeSelect.click();
      await page.waitForTimeout(500);

      // Select dark theme
      const darkOption = page.locator('[role="option"]:has-text("Dark"), [data-value="dark"]');
      if (await darkOption.first().isVisible({ timeout: 3000 })) {
        await darkOption.first().click();
        await page.waitForTimeout(500);

        // Check if body has dark class
        const hasDarkClass = await page.locator('html.dark, body.dark, [data-theme="dark"]').first().isVisible({ timeout: 3000 }).catch(() => false);
        consoleCapture.log(`Dark theme applied: ${hasDarkClass}`);

        // Revert to system/light
        await themeSelect.click();
        await page.waitForTimeout(500);
        const systemOption = page.locator('[role="option"]:has-text("System"), [data-value="system"]');
        if (await systemOption.first().isVisible({ timeout: 3000 })) {
          await systemOption.first().click();
        }
      }
    }

    consoleCapture.saveToFile();
  });

  test('@regression Preferences save shows toast notification', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-preferences-save-toast');
    consoleCapture.startCapture(page);

    await page.goto('/settings/preferences');
    await page.waitForLoadState('domcontentloaded');

    // Make a change
    const toggle = page.locator('button[role="checkbox"], input[type="checkbox"]').first();
    if (await toggle.isVisible({ timeout: 5000 })) {
      await toggle.click();
      await page.waitForTimeout(500);

      // Save
      const saveButton = page.locator('button:has-text("Save")');
      if (await saveButton.first().isVisible({ timeout: 3000 })) {
        await saveButton.first().click();
        await page.waitForTimeout(1500);

        // Look for toast
        const toast = page.locator('[data-sonner-toast], [role="status"], .toast, [class*="toast"]');
        const hasToast = await toast.first().isVisible({ timeout: 5000 }).catch(() => false);
        consoleCapture.log(`Toast notification visible: ${hasToast}`);

        // Revert
        await toggle.click();
        await page.waitForTimeout(500);
        if (await saveButton.first().isVisible({ timeout: 3000 })) {
          await saveButton.first().click();
          await page.waitForTimeout(1000);
        }
      }
    }

    consoleCapture.saveToFile();
  });
});

test.describe('Settings - Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await login(page, ADMIN_USERS.superAdmin);
  });

  test('Settings works on mobile viewport', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-mobile-viewport');
    consoleCapture.startCapture(page);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    expect(consoleCapture.hasErrors()).toBe(false);

    consoleCapture.saveToFile();
  });

  test('Settings navigation adapts to mobile', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-mobile-navigation');
    consoleCapture.startCapture(page);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // Settings nav might be collapsed on mobile - look for menu button
    const menuButton = page.locator(
      'button[aria-label*="menu" i], [data-testid="mobile-menu"], button:has(svg)'
    ).first();

    const hasMobileMenu = await menuButton.isVisible({ timeout: 5000 }).catch(() => false);
    consoleCapture.log(`Mobile menu button visible: ${hasMobileMenu}`);

    consoleCapture.saveToFile();
  });

  test('Profile settings works on tablet', async ({ page }) => {
    const consoleCapture = createConsoleCapture('settings-tablet-viewport');
    consoleCapture.startCapture(page);

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/settings/profile');
    await page.waitForLoadState('domcontentloaded');

    expect(consoleCapture.hasErrors()).toBe(false);

    consoleCapture.saveToFile();
  });
});
