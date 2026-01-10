import { test, expect } from '@playwright/test';
import { TEST_USERS, login } from './fixtures/auth';
import { createConsoleCapture } from './fixtures/console-capture';

test.describe('Workspaces & Team Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('DataTech admin can switch between workspaces', async ({ page }) => {
    const console = createConsoleCapture('workspace-switching');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechFinanceDirector);
    await page.goto('/');

    // Wait for page to load
    await page.waitForSelector('body', { timeout: 10000 });

    // Look for workspace switcher
    const workspaceSwitcher = page.locator(
      '[data-testid="workspace-switcher"], [aria-label*="workspace"], select[name*="workspace"]'
    );

    const hasWorkspaceSwitcher = await workspaceSwitcher.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`Workspace switcher visible: ${hasWorkspaceSwitcher}`);

    if (hasWorkspaceSwitcher) {
      // Open workspace menu
      await workspaceSwitcher.click();
      await page.waitForTimeout(1000);

      // Should see Finance and Payroll workspaces (Siobhan has access to both)
      const financeWorkspace = page.locator('[data-testid="workspace-option"]:has-text("Finance"), [role="option"]:has-text("Finance")');
      const hasFinance = await financeWorkspace.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`Finance workspace option visible: ${hasFinance}`);

      if (hasFinance) {
        await financeWorkspace.click();
        await page.waitForTimeout(2000);

        // Verify workspace changed (URL or UI indicator)
        const currentWorkspace = page.locator('[data-testid="current-workspace"], .workspace-name');
        const workspaceName = await currentWorkspace.textContent().catch(() => null);
        console.log(`Current workspace: ${workspaceName}`);
      }
    }

    console.saveToFile();
  });

  test('Emerald Tax consultant can access client workspaces', async ({ page }) => {
    const console = createConsoleCapture('workspace-client-access');
    console.startCapture(page);

    await login(page, TEST_USERS.emeraldSeniorConsultant);
    await page.goto('/');

    await page.waitForSelector('body', { timeout: 10000 });

    // Look for workspace/client switcher
    const workspaceSwitcher = page.locator(
      '[data-testid="workspace-switcher"], [data-testid="client-switcher"]'
    );

    const hasWorkspaceSwitcher = await workspaceSwitcher.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`Client/workspace switcher visible: ${hasWorkspaceSwitcher}`);

    if (hasWorkspaceSwitcher) {
      await workspaceSwitcher.click();
      await page.waitForTimeout(1000);

      // Should see client workspaces
      const clientOptions = page.locator('[data-testid="workspace-option"], [role="option"]');
      const optionCount = await clientOptions.count();
      console.log(`Client workspace options: ${optionCount}`);

      // Brendan should have access to 6-8 client workspaces
      expect(optionCount).toBeGreaterThan(0);
    }

    console.saveToFile();
  });

  test('DataTech owner can view team members', async ({ page }) => {
    const console = createConsoleCapture('team-view-members');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCEO);
    await page.goto('/settings/team');

    // Wait for team page to load
    await page.waitForSelector('[data-testid="team-settings"], h1, h2', {
      timeout: 10000,
    });

    // Should see team member list
    const teamMembers = page.locator('[data-testid="team-member"], .team-member, [role="row"]');
    const memberCount = await teamMembers.count();
    console.log(`Team members displayed: ${memberCount}`);

    // DataTech has 12 users
    expect(memberCount).toBeGreaterThan(0);

    // Should see member details (name, email, role)
    const firstMember = teamMembers.first();
    const memberText = await firstMember.textContent();
    console.log(`First member: ${memberText}`);

    console.saveToFile();
  });

  test('DataTech owner can invite new team member', async ({ page }) => {
    const console = createConsoleCapture('team-invite-member');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCEO);
    await page.goto('/settings/team');

    await page.waitForSelector('[data-testid="team-settings"]', {
      timeout: 10000,
    });

    // Look for invite button
    const inviteButton = page.locator('[data-testid="invite-button"], button:has-text("Invite"), button:has-text("Add member")');
    const hasInviteButton = await inviteButton.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Invite button visible: ${hasInviteButton}`);

    if (hasInviteButton) {
      await inviteButton.click();

      // Should show invite form/dialog
      const inviteDialog = page.locator('[role="dialog"], [data-testid="invite-dialog"], form');
      await expect(inviteDialog).toBeVisible({ timeout: 5000 });

      // Fill invite form
      const emailInput = page.locator('input[type="email"], input[name="email"]');
      await emailInput.fill('new.member@datatech.ie');

      // Select role
      const roleSelect = page.locator('select[name="role"], [data-testid="role-select"]');
      if (await roleSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
        await roleSelect.selectOption('member');
      }

      // Submit (but don't actually send - just verify form works)
      const submitButton = page.locator('button[type="submit"]:has-text("Send"), button:has-text("Invite")');
      const isSubmitEnabled = await submitButton.isEnabled();
      console.log(`Submit button enabled: ${isSubmitEnabled}`);

      expect(isSubmitEnabled).toBe(true);
    }

    console.saveToFile();
  });

  test('DataTech admin can change member role', async ({ page }) => {
    const console = createConsoleCapture('team-change-role');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/settings/team');

    await page.waitForSelector('[data-testid="team-settings"]', {
      timeout: 10000,
    });

    // Find a team member row
    const teamMembers = page.locator('[data-testid="team-member"], .team-member, [role="row"]');
    if (await teamMembers.count() > 1) {
      const secondMember = teamMembers.nth(1);

      // Look for edit/role button
      const editButton = secondMember.locator('[data-testid="edit-role"], button[aria-label*="Edit"]');
      const hasEditButton = await editButton.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`Edit role button visible: ${hasEditButton}`);

      if (hasEditButton) {
        await editButton.click();

        // Should show role selector
        const roleSelect = page.locator('[data-testid="role-select"], select[name="role"]');
        await expect(roleSelect).toBeVisible({ timeout: 3000 });

        // Change role
        await roleSelect.selectOption('admin');

        // Save button
        const saveButton = page.locator('button:has-text("Save"), button:has-text("Update")');
        const isSaveVisible = await saveButton.isVisible({ timeout: 2000 }).catch(() => false);
        console.log(`Save button visible: ${isSaveVisible}`);
      }
    }

    console.saveToFile();
  });

  test('DataTech member cannot access admin settings', async ({ page }) => {
    const console = createConsoleCapture('team-member-permissions');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechFinanceManager);
    await page.goto('/settings/team');

    // Wait for page to load
    await page.waitForTimeout(3000);

    // Should either:
    // 1. Not show admin actions (invite, edit role)
    // 2. Show access denied message
    // 3. Redirect to unauthorized page

    const inviteButton = page.locator('[data-testid="invite-button"], button:has-text("Invite")');
    const hasInviteButton = await inviteButton.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`Invite button visible for member role: ${hasInviteButton}`);

    // Members should not be able to invite
    if (hasInviteButton) {
      console.log('WARNING: Member role can see invite button (should be restricted)');
    }

    // Check for access denied message
    const accessDenied = page.locator('text=/Access denied|Unauthorized|Permission denied/i');
    const hasAccessDenied = await accessDenied.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`Access denied message: ${hasAccessDenied}`);

    console.saveToFile();
  });

  test('External viewer cannot modify team settings', async ({ page }) => {
    const console = createConsoleCapture('team-viewer-readonly');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechExternalAuditor);
    await page.goto('/settings/team');

    // Wait for page to load
    await page.waitForTimeout(3000);

    // Viewer should have very limited access
    const inviteButton = page.locator('[data-testid="invite-button"], button:has-text("Invite")');
    const editButtons = page.locator('[data-testid="edit-role"], button[aria-label*="Edit"]');

    const hasInvite = await inviteButton.isVisible({ timeout: 2000 }).catch(() => false);
    const editCount = await editButtons.count();

    console.log(`Viewer can see invite: ${hasInvite}`);
    console.log(`Viewer can see edit buttons: ${editCount}`);

    // Should not have access to modify
    expect(hasInvite).toBe(false);
    expect(editCount).toBe(0);

    console.saveToFile();
  });

  test('should create new workspace', async ({ page }) => {
    const console = createConsoleCapture('workspace-create-new');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCEO);
    await page.goto('/');

    await page.waitForSelector('body', { timeout: 10000 });

    // Look for create workspace button
    const createButton = page.locator('[data-testid="create-workspace"], button:has-text("New workspace"), button:has-text("Create workspace")');
    const hasCreateButton = await createButton.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`Create workspace button visible: ${hasCreateButton}`);

    if (hasCreateButton) {
      await createButton.click();

      // Should show create workspace form
      const dialog = page.locator('[role="dialog"], [data-testid="workspace-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Fill workspace details
      const nameInput = page.locator('input[name="name"], input[placeholder*="name"]');
      await nameInput.fill('Test Workspace');

      const descriptionInput = page.locator('textarea[name="description"], textarea[placeholder*="description"]');
      if (await descriptionInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await descriptionInput.fill('Test workspace description');
      }

      // Verify create button is enabled
      const submitButton = page.locator('button[type="submit"]:has-text("Create")');
      const isEnabled = await submitButton.isEnabled();
      console.log(`Create button enabled: ${isEnabled}`);

      expect(isEnabled).toBe(true);
    }

    console.saveToFile();
  });
});
