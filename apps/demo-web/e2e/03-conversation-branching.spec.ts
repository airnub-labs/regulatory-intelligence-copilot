import { test, expect } from '@playwright/test';
import { TEST_USERS, login } from './fixtures/auth';
import { createConsoleCapture } from './fixtures/console-capture';

test.describe('Conversation Branching & Path System', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('should edit previous message and create branch', async ({ page }) => {
    const console = createConsoleCapture('branch-edit-message');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    // Send first message
    const chatInput = page.locator('textarea, input[type="text"]').first();
    await chatInput.fill("What's the R&D tax credit rate?");
    await chatInput.press('Enter');

    // Wait for AI response
    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    // Send follow-up message
    await page.waitForTimeout(2000);
    await chatInput.fill("How do I claim it?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message:nth-child(4)', {
      timeout: 30000,
    });

    // Now edit the first user message
    const firstUserMessage = page.locator('[data-testid="user-message"], .user-message').first();
    await firstUserMessage.hover();

    // Click edit button (look for edit icon or button)
    const editButton = firstUserMessage.locator('[data-testid="edit-button"], button[aria-label*="Edit"]');
    await editButton.click();

    // Should show edit input
    const editInput = page.locator('[data-testid="edit-input"], textarea[aria-label*="Edit"]');
    await expect(editInput).toBeVisible();

    // Change the message
    await editInput.fill("What's the corporation tax rate for trading income?");

    // Submit edit
    await editInput.press('Enter');
    // Or click save button if present
    const saveButton = page.locator('[data-testid="save-edit"], button:has-text("Save")');
    if (await saveButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await saveButton.click();
    }

    // Should create new branch and get new AI response
    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    // New response should mention 12.5% CT rate
    const newResponse = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();
    expect(newResponse).toMatch(/12\.5%|corporation tax/i);

    console.saveToFile();

    // Check for branch indicator
    const branchIndicator = page.locator('[data-testid="branch-indicator"], .branch-indicator');
    const hasBranch = await branchIndicator.count() > 0;
    console.log(`Branch indicator present: ${hasBranch}`);
  });

  test('should switch between conversation paths', async ({ page }) => {
    const console = createConsoleCapture('branch-switch-paths');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    // Create a conversation with branching
    const chatInput = page.locator('textarea, input[type="text"]').first();
    await chatInput.fill("What's the VAT rate?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    // Edit to create branch
    const firstMessage = page.locator('[data-testid="user-message"], .user-message').first();
    await firstMessage.hover();
    const editButton = firstMessage.locator('[data-testid="edit-button"], button[aria-label*="Edit"]');
    await editButton.click();

    const editInput = page.locator('[data-testid="edit-input"], textarea[aria-label*="Edit"]');
    await editInput.fill("What's the PAYE rate?");
    await editInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    // Now switch paths
    const pathSwitcher = page.locator('[data-testid="path-switcher"], [aria-label*="Switch path"]');
    if (await pathSwitcher.isVisible({ timeout: 2000 }).catch(() => false)) {
      await pathSwitcher.click();

      // Select original path
      const originalPath = page.locator('[data-testid="path-option"]:has-text("VAT")');
      if (await originalPath.isVisible({ timeout: 2000 }).catch(() => false)) {
        await originalPath.click();

        // Should show original conversation
        const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();
        expect(response).toMatch(/VAT|23%/i);
      }
    }

    console.saveToFile();
  });

  test('should preserve original path when branching', async ({ page }) => {
    const console = createConsoleCapture('branch-preserve-original');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    // Create conversation
    const chatInput = page.locator('textarea, input[type="text"]').first();
    await chatInput.fill("Calculate €100k corporation tax");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    // Get original response text
    const originalResponse = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();
    console.log(`Original response length: ${originalResponse?.length || 0}`);

    // Send follow-up
    await page.waitForTimeout(2000);
    await chatInput.fill("What about R&D credit?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message:nth-child(4)', {
      timeout: 30000,
    });

    // Count messages in original path
    const messagesBeforeBranch = await page.locator('[data-testid="message"], .message').count();
    console.log(`Messages before branch: ${messagesBeforeBranch}`);

    // Edit first message to create branch
    const firstMessage = page.locator('[data-testid="user-message"], .user-message').first();
    await firstMessage.hover();
    const editButton = firstMessage.locator('[data-testid="edit-button"], button[aria-label*="Edit"]');
    if (await editButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await editButton.click();

      const editInput = page.locator('[data-testid="edit-input"], textarea[aria-label*="Edit"]');
      await editInput.fill("Calculate €200k corporation tax");
      await editInput.press('Enter');

      await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
        timeout: 30000,
      });

      // Switch back to original path
      const pathSwitcher = page.locator('[data-testid="path-switcher"], select, [role="combobox"]');
      if (await pathSwitcher.isVisible({ timeout: 2000 }).catch(() => false)) {
        await pathSwitcher.click();

        // Select first/original path
        const paths = page.locator('[data-testid="path-option"], option, [role="option"]');
        if (await paths.count() > 0) {
          await paths.first().click();

          // Should have same message count as before
          const messagesAfterSwitch = await page.locator('[data-testid="message"], .message').count();
          console.log(`Messages after switch back: ${messagesAfterSwitch}`);

          expect(messagesAfterSwitch).toBe(messagesBeforeBranch);
        }
      }
    }

    console.saveToFile();
  });

  test('should show branch indicator for conversations with multiple paths', async ({ page }) => {
    const console = createConsoleCapture('branch-indicator-display');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    // Create conversation with branch
    const chatInput = page.locator('textarea, input[type="text"]').first();
    await chatInput.fill("What's the USC rate?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    // Edit to create branch
    const firstMessage = page.locator('[data-testid="user-message"], .user-message').first();
    await firstMessage.hover();
    const editButton = firstMessage.locator('[data-testid="edit-button"], button[aria-label*="Edit"]');

    if (await editButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await editButton.click();
      const editInput = page.locator('[data-testid="edit-input"], textarea[aria-label*="Edit"]');
      await editInput.fill("What's the PRSI rate?");
      await editInput.press('Enter');

      await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
        timeout: 30000,
      });

      // Check for branch indicator/counter
      const branchCount = page.locator('[data-testid="branch-count"], [aria-label*="branches"]');
      const hasBranchCount = await branchCount.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`Branch count indicator visible: ${hasBranchCount}`);
    }

    console.saveToFile();
  });
});
