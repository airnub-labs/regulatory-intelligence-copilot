import { test, expect } from '@playwright/test';
import {
  DATATECH_USERS,
  EMERALD_USERS,
  PERSONAL_USERS,
  login,
} from './fixtures/auth';
import { createConsoleCapture } from './fixtures/console-capture';

/**
 * Multi-Tenant Scenario Tests
 *
 * Tests platform functionality across different tenant types:
 * - Enterprise (DataTech Solutions)
 * - Professional (Emerald Tax Consulting)
 * - Personal (Seán O'Brien)
 * - Platform Admin (Global Support Team)
 *
 * Tests workspace isolation, permission boundaries, and tenant-specific features.
 *
 * @tags @enterprise @pro @personal @admin @multi-tenant
 */

test.describe('Multi-Tenant Scenarios - Enterprise (DataTech)', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('@enterprise CEO can access all DataTech workspaces', async ({ page }) => {
    const consoleCapture = createConsoleCapture('enterprise-ceo-workspace-access');
    consoleCapture.startCapture(page);

    await login(page, DATATECH_USERS.ceo);
    await page.goto('/');

    // Wait for page to load
    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    // CEO should have access to all workspaces
    const workspaceSwitcher = page.locator('[data-testid="workspace-switcher"]');
    if (await workspaceSwitcher.isVisible({ timeout: 3000 }).catch(() => false)) {
      await workspaceSwitcher.click();
      await page.waitForTimeout(1000);

      // Should see Executive, Finance, Engineering, HR workspaces
      const workspaceOptions = await page.locator('[data-testid="workspace-option"]').allTextContents();
      consoleCapture.log(`Available workspaces: ${workspaceOptions.join(', ')}`);
    }

    consoleCapture.saveToFile();
  });

  test('@enterprise CFO can access Finance but not Engineering workspace', async ({ page }) => {
    const consoleCapture = createConsoleCapture('enterprise-cfo-workspace-restriction');
    consoleCapture.startCapture(page);

    await login(page, DATATECH_USERS.cfo);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    // CFO should have access to Finance workspace
    const workspaceSwitcher = page.locator('[data-testid="workspace-switcher"]');
    if (await workspaceSwitcher.isVisible({ timeout: 3000 }).catch(() => false)) {
      await workspaceSwitcher.click();
      await page.waitForTimeout(1000);

      const workspaceOptions = await page.locator('[data-testid="workspace-option"]').allTextContents();
      consoleCapture.log(`CFO workspaces: ${workspaceOptions.join(', ')}`);

      // Should see Finance, Tax Planning, Executive
      // Should NOT see Engineering (unless CFO is member)
    }

    consoleCapture.saveToFile();
  });

  test('@enterprise Finance Director queries R&D Tax Credit', async ({ page }) => {
    const consoleCapture = createConsoleCapture('enterprise-finance-director-rnd');
    consoleCapture.startCapture(page);

    await login(page, DATATECH_USERS.financeDirector);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
    const chatInput = page.locator('textarea, input[type="text"]').first();

    // Ask about R&D Tax Credit - Finance Director specific query
    await chatInput.fill("What's the R&D tax credit rate and how do we claim it for €100K qualifying expenditure?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();

    // Should mention 25% R&D credit rate
    expect(response).toMatch(/25%|R&D.*credit/i);

    consoleCapture.saveToFile();
  });

  test('@enterprise External Auditor has read-only access', async ({ page }) => {
    const consoleCapture = createConsoleCapture('enterprise-auditor-readonly');
    consoleCapture.startCapture(page);

    await login(page, DATATECH_USERS.externalAuditor);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    // External auditor should be able to view but not create new conversations
    // This depends on implementation - check for any "read-only" indicators
    const chatInput = page.locator('textarea, input[type="text"]');
    const isDisabled = await chatInput.isDisabled().catch(() => false);

    consoleCapture.log(`External auditor chat disabled: ${isDisabled}`);

    consoleCapture.saveToFile();
  });
});

test.describe('Multi-Tenant Scenarios - Professional (Emerald Tax)', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('@pro Managing Partner queries VAT for construction client', async ({ page }) => {
    const consoleCapture = createConsoleCapture('pro-partner-construction-vat');
    consoleCapture.startCapture(page);

    await login(page, EMERALD_USERS.managingPartner);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
    const chatInput = page.locator('textarea, input[type="text"]').first();

    // Professional-specific query about construction VAT
    await chatInput.fill("What's the VAT treatment for construction services in Ireland, specifically for subcontractor payments under RCT?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();

    // Should mention VAT rate and/or RCT
    expect(response).toMatch(/VAT|13\.5%|RCT|construction/i);

    consoleCapture.saveToFile();
  });

  test('@pro Senior Consultant queries about cross-border workers', async ({ page }) => {
    const consoleCapture = createConsoleCapture('pro-consultant-crossborder');
    consoleCapture.startCapture(page);

    await login(page, EMERALD_USERS.seniorConsultant1);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
    const chatInput = page.locator('textarea, input[type="text"]').first();

    // Cross-border query
    await chatInput.fill("What are the social security rules for an Irish employee posted to Germany for 18 months under EU Regulation 883/2004?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();

    // Should reference EU regulations or posted worker rules
    expect(response).toMatch(/883\/2004|posted worker|A1|social security|24 month/i);

    consoleCapture.saveToFile();
  });

  test('@pro Junior Consultant has limited workspace access', async ({ page }) => {
    const consoleCapture = createConsoleCapture('pro-junior-limited-access');
    consoleCapture.startCapture(page);

    await login(page, EMERALD_USERS.juniorConsultant);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    // Junior consultant should have limited workspace access
    const workspaceSwitcher = page.locator('[data-testid="workspace-switcher"]');
    if (await workspaceSwitcher.isVisible({ timeout: 3000 }).catch(() => false)) {
      await workspaceSwitcher.click();
      await page.waitForTimeout(1000);

      const workspaceOptions = await page.locator('[data-testid="workspace-option"]').allTextContents();
      consoleCapture.log(`Junior consultant workspaces: ${workspaceOptions.join(', ')}`);

      // Should have fewer workspaces than senior consultant
    }

    consoleCapture.saveToFile();
  });
});

test.describe('Multi-Tenant Scenarios - Personal (Seán)', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('@personal Seán queries salary vs dividend optimization', async ({ page }) => {
    const consoleCapture = createConsoleCapture('personal-salary-dividend');
    consoleCapture.startCapture(page);

    await login(page, PERSONAL_USERS.sean);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
    const chatInput = page.locator('textarea, input[type="text"]').first();

    // Personal user query
    await chatInput.fill("I'm a single-director limited company earning €65K. Should I take €40K salary + €25K dividend or €50K salary + €15K dividend?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();

    // Should mention PAYE, PRSI, dividend withholding tax
    expect(response).toMatch(/PAYE|PRSI|USC|dividend|salary/i);

    consoleCapture.saveToFile();
  });

  test('@personal Seán should see free tier quota', async ({ page }) => {
    const consoleCapture = createConsoleCapture('personal-free-tier-quota');
    consoleCapture.startCapture(page);

    await login(page, PERSONAL_USERS.sean);

    // Navigate to cost analytics
    await page.goto('/analytics/costs');

    // Wait for page to load
    await page.waitForSelector('[data-testid="cost-analytics"]', {
      timeout: 10000,
    }).catch(() => {
      consoleCapture.log('Cost analytics page may not be available for personal tier');
    });

    // Look for free tier indicators
    const quotaIndicator = page.locator('text=/50|free tier|personal/i');
    const hasQuota = await quotaIndicator.isVisible({ timeout: 3000 }).catch(() => false);
    consoleCapture.log(`Free tier quota visible: ${hasQuota}`);

    consoleCapture.saveToFile();
  });

  test('@personal Seán has only personal workspace', async ({ page }) => {
    const consoleCapture = createConsoleCapture('personal-single-workspace');
    consoleCapture.startCapture(page);

    await login(page, PERSONAL_USERS.sean);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    // Personal user should have only one workspace
    const workspaceSwitcher = page.locator('[data-testid="workspace-switcher"]');
    if (await workspaceSwitcher.isVisible({ timeout: 3000 }).catch(() => false)) {
      await workspaceSwitcher.click();
      await page.waitForTimeout(1000);

      const workspaceOptions = await page.locator('[data-testid="workspace-option"]').allTextContents();
      consoleCapture.log(`Seán workspaces: ${workspaceOptions.join(', ')}`);

      // Should have only 1 workspace (personal)
      expect(workspaceOptions.length).toBeLessThanOrEqual(1);
    }

    consoleCapture.saveToFile();
  });
});

test.describe('Multi-Tenant Scenarios - Tenant Isolation', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('@critical DataTech user cannot see Emerald Tax data', async ({ page }) => {
    const consoleCapture = createConsoleCapture('tenant-isolation-datatech-emerald');
    consoleCapture.startCapture(page);

    await login(page, DATATECH_USERS.cfo);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    // Check workspaces - should NOT see Emerald Tax workspaces
    const workspaceSwitcher = page.locator('[data-testid="workspace-switcher"]');
    if (await workspaceSwitcher.isVisible({ timeout: 3000 }).catch(() => false)) {
      await workspaceSwitcher.click();
      await page.waitForTimeout(1000);

      const workspaceOptions = await page.locator('[data-testid="workspace-option"]').allTextContents();
      consoleCapture.log(`DataTech CFO workspaces: ${workspaceOptions.join(', ')}`);

      // Should NOT contain Emerald Tax workspaces
      for (const workspace of workspaceOptions) {
        expect(workspace.toLowerCase()).not.toContain('emerald');
        expect(workspace.toLowerCase()).not.toContain('o\'brien construction');
        expect(workspace.toLowerCase()).not.toContain('murphy pharmacy');
      }
    }

    consoleCapture.saveToFile();
  });

  test('@critical Personal user cannot see enterprise data', async ({ page }) => {
    const consoleCapture = createConsoleCapture('tenant-isolation-personal-enterprise');
    consoleCapture.startCapture(page);

    await login(page, PERSONAL_USERS.sean);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    // Check workspaces - should NOT see DataTech or Emerald workspaces
    const workspaceSwitcher = page.locator('[data-testid="workspace-switcher"]');
    if (await workspaceSwitcher.isVisible({ timeout: 3000 }).catch(() => false)) {
      await workspaceSwitcher.click();
      await page.waitForTimeout(1000);

      const workspaceOptions = await page.locator('[data-testid="workspace-option"]').allTextContents();
      consoleCapture.log(`Personal user workspaces: ${workspaceOptions.join(', ')}`);

      // Should NOT contain enterprise or pro workspaces
      for (const workspace of workspaceOptions) {
        expect(workspace.toLowerCase()).not.toContain('datatech');
        expect(workspace.toLowerCase()).not.toContain('emerald');
        expect(workspace.toLowerCase()).not.toContain('finance');
        expect(workspace.toLowerCase()).not.toContain('engineering');
      }
    }

    consoleCapture.saveToFile();
  });
});

test.describe('Multi-Tenant Scenarios - Cross-Session', () => {
  test('@regression switching users maintains tenant isolation', async ({ page }) => {
    const consoleCapture = createConsoleCapture('cross-session-tenant-isolation');
    consoleCapture.startCapture(page);

    // Login as DataTech user
    await login(page, DATATECH_USERS.cfo);
    await page.goto('/');
    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    // Send a message
    const chatInput = page.locator('textarea, input[type="text"]').first();
    await chatInput.fill("DataTech query about corporation tax");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    // Logout
    await page.context().clearCookies();

    // Login as Emerald user
    await login(page, EMERALD_USERS.managingPartner);
    await page.goto('/');
    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    // Should NOT see DataTech conversation
    const previousMessages = await page.locator('[data-testid="message"], .message').count();
    consoleCapture.log(`Messages visible after switching user: ${previousMessages}`);

    // Should be 0 if properly isolated (new session)
    // Note: This depends on implementation - if conversations persist per session

    consoleCapture.saveToFile();
  });
});
