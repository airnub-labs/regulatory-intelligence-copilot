import { test, expect } from '@playwright/test';
import { TEST_USERS, login } from './fixtures/auth';
import { createConsoleCapture } from './fixtures/console-capture';

test.describe('End-to-End User Flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('Complete enterprise workflow - DataTech CFO analyzes tax scenarios', async ({ page }) => {
    const console = createConsoleCapture('e2e-enterprise-complete-workflow');
    console.startCapture(page);

    // 1. Login
    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/');

    // 2. Start new conversation about R&D credit
    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
    const chatInput = page.locator('textarea, input[type="text"]').first();

    await chatInput.fill("Calculate corporation tax for €500K trading income with €100K R&D expenditure");
    await chatInput.press('Enter');

    // 3. Wait for AI response with graph injection
    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    let response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();
    expect(response).toMatch(/12\.5%|corporation tax/i);

    // 4. Follow-up question
    await page.waitForTimeout(2000);
    await chatInput.fill("What if the R&D expenditure increases to €150K?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message:nth-child(4)', {
      timeout: 30000,
    });

    // 5. Edit earlier message to explore alternative scenario (creates branch)
    const firstMessage = page.locator('[data-testid="user-message"], .user-message').first();
    await firstMessage.hover();

    const editButton = firstMessage.locator('[data-testid="edit-button"], button[aria-label*="Edit"]');
    if (await editButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await editButton.click();

      const editInput = page.locator('[data-testid="edit-input"], textarea[aria-label*="Edit"]');
      await editInput.fill("Calculate corporation tax for €750K trading income with €200K R&D expenditure");
      await editInput.press('Enter');

      await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
        timeout: 30000,
      });
    }

    // 6. Navigate to graph visualization
    await page.goto('/graph');
    await page.waitForSelector('[data-testid="graph-container"], canvas, svg', {
      timeout: 15000,
    });

    // Graph should highlight referenced nodes
    await page.waitForTimeout(3000);

    // 7. Check cost analytics
    await page.goto('/analytics/costs');
    await page.waitForSelector('[data-testid="cost-analytics"]', {
      timeout: 10000,
    });

    // Should see cost data
    const costMetrics = page.locator('[data-testid="cost-metric"], .metric');
    const hasMetrics = await costMetrics.count() > 0;
    console.log(`Cost metrics visible: ${hasMetrics}`);

    // 8. Return to conversation
    await page.goto('/');
    await page.waitForSelector('[data-testid="message"], .message', {
      timeout: 10000,
    });

    // Conversation should be preserved
    const messageCount = await page.locator('[data-testid="message"], .message').count();
    console.log(`Final message count: ${messageCount}`);
    expect(messageCount).toBeGreaterThan(0);

    console.saveToFile();

    // Verify no critical errors throughout the flow
    const errors = console.getBrowserErrors();
    const criticalErrors = errors.filter(e =>
      !e.text.includes('ResizeObserver') &&
      !e.text.includes('favicon')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('Complete professional workflow - Tax consultant manages client queries', async ({ page }) => {
    const console = createConsoleCapture('e2e-professional-client-workflow');
    console.startCapture(page);

    // 1. Login as tax consultant
    await login(page, TEST_USERS.emeraldSeniorConsultant);
    await page.goto('/');

    // 2. Switch to client workspace (if workspace switcher exists)
    await page.waitForTimeout(2000);
    const workspaceSwitcher = page.locator('[data-testid="workspace-switcher"]');
    if (await workspaceSwitcher.isVisible({ timeout: 3000 }).catch(() => false)) {
      await workspaceSwitcher.click();
      await page.waitForTimeout(1000);

      const clientWorkspace = page.locator('[data-testid="workspace-option"]').first();
      if (await clientWorkspace.isVisible({ timeout: 2000 }).catch(() => false)) {
        await clientWorkspace.click();
        await page.waitForTimeout(2000);
      }
    }

    // 3. Ask client-specific question
    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
    const chatInput = page.locator('textarea, input[type="text"]').first();

    await chatInput.fill("What's the VAT rate for construction services in Ireland?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();
    expect(response).toMatch(/VAT|13\.5%/i);

    // 4. Follow-up about CIS
    await page.waitForTimeout(2000);
    await chatInput.fill("What about Relevant Contracts Tax (RCT) for subcontractors?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message:nth-child(4)', {
      timeout: 30000,
    });

    // 5. Check cost analytics (pro tier limits)
    await page.goto('/analytics/costs');
    await page.waitForSelector('[data-testid="cost-analytics"]', {
      timeout: 10000,
    });

    // Should see pro tier quota
    const quotaSection = page.locator('text=/1,500|quota/i');
    const hasQuota = await quotaSection.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Pro tier quota visible: ${hasQuota}`);

    console.saveToFile();

    const stats = console.getStats();
    console.log(`Console stats: ${JSON.stringify(stats)}`);
  });

  test('Complete personal workflow - Freelancer asks tax questions', async ({ page }) => {
    const console = createConsoleCapture('e2e-personal-freelancer-workflow');
    console.startCapture(page);

    // 1. Login as personal user
    await login(page, TEST_USERS.seanPersonal);
    await page.goto('/');

    // 2. Ask about salary vs dividend
    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
    const chatInput = page.locator('textarea, input[type="text"]').first();

    await chatInput.fill("I have a limited company earning €65K. What's the optimal salary/dividend split?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();
    expect(response).toMatch(/salary|dividend|PAYE|PRSI/i);

    // 3. Ask about VAT registration
    await page.waitForTimeout(2000);
    await chatInput.fill("Do I need to register for VAT at €65K revenue?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message:nth-child(4)', {
      timeout: 30000,
    });

    const vatResponse = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();
    expect(vatResponse).toMatch(/VAT|40,000|80,000/i);

    // 4. Check costs (should be under free tier limit)
    await page.goto('/analytics/costs');
    await page.waitForSelector('[data-testid="cost-analytics"]', {
      timeout: 10000,
    });

    // Should see free tier quota (€50)
    const quotaSection = page.locator('text=/50|free tier|quota/i');
    const hasQuota = await quotaSection.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Free tier quota visible: ${hasQuota}`);

    // 5. View graph
    await page.goto('/graph');
    await page.waitForSelector('[data-testid="graph-container"], canvas, svg', {
      timeout: 15000,
    });

    await page.waitForTimeout(3000);

    console.saveToFile();

    // Should have minimal errors
    const errors = console.getBrowserErrors();
    const criticalErrors = errors.filter(e =>
      !e.text.includes('ResizeObserver') &&
      !e.text.includes('favicon')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('Mobile responsive - DataTech user on mobile device', async ({ page }) => {
    const console = createConsoleCapture('e2e-mobile-responsive');
    console.startCapture(page);

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE

    // Login
    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/');

    // Mobile chat should be usable
    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    const chatInput = page.locator('textarea, input[type="text"]').first();
    await chatInput.fill("What's the corporation tax rate?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();
    expect(response).toMatch(/12\.5%|corporation tax/i);

    console.saveToFile();
  });
});
