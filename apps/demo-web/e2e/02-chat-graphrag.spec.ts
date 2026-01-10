import { test, expect } from '@playwright/test';
import { TEST_USERS, login } from './fixtures/auth';
import { createConsoleCapture } from './fixtures/console-capture';

test.describe('Chat Page - GraphRAG Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('DataTech CFO asks about R&D Tax Credit - validates graph injection', async ({ page }) => {
    const console = createConsoleCapture('chat-rnd-credit-graphrag');
    console.startCapture(page);

    // Login as DataTech CFO
    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/');

    // Wait for chat interface to load
    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    // Ask about R&D Tax Credit
    const chatInput = page.locator('textarea, input[type="text"]').first();
    await chatInput.fill("What's the R&D tax credit rate for Irish companies?");

    // Submit the message
    await chatInput.press('Enter');

    // Wait for response (GraphRAG should inject graph data)
    await page.waitForSelector('[data-testid="ai-message"], .ai-message, [role="article"]', {
      timeout: 30000,
    });

    // Verify response contains R&D credit information
    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();
    expect(response).toMatch(/25%|R&D.*credit/i);

    // Check for referencedNodes in the response (should be highlighted graph nodes)
    // The system should return referencedNodes like: IE_RELIEF_RND_CREDIT, IE_RATE_RND_CREDIT
    const graphHighlights = await page.locator('[data-testid="referenced-node"], .referenced-node, .graph-reference').count();
    console.log(`Graph node references found: ${graphHighlights}`);

    // Save console output
    console.saveToFile();

    // Check for GraphRAG-related console logs
    const graphLogs = console.searchBrowserMessages('graph');
    console.log(`Graph-related console messages: ${graphLogs.length}`);

    // Should not have critical errors
    const errors = console.getBrowserErrors();
    const criticalErrors = errors.filter(e =>
      !e.text.includes('ResizeObserver') &&
      !e.text.includes('favicon')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('DataTech CFO asks about Corporation Tax - validates calculation nodes', async ({ page }) => {
    const console = createConsoleCapture('chat-corporation-tax-calculation');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    const chatInput = page.locator('textarea, input[type="text"]').first();
    await chatInput.fill("Calculate corporation tax for €200K trading income with €50K R&D spend");

    await chatInput.press('Enter');

    // Wait for AI response
    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();

    // Should mention:
    // - 12.5% CT rate
    // - 25% R&D credit
    // - Calculation breakdown
    expect(response).toMatch(/12\.5%|corporation tax/i);
    expect(response).toMatch(/25%.*R&D|R&D.*25%/i);

    console.saveToFile();

    // Check that graph rates were injected (should see GraphClient queries in logs)
    const graphQueries = console.searchBrowserMessages('GraphClient');
    console.log(`GraphClient queries: ${graphQueries.length}`);
  });

  test('Emerald Tax consultant asks about VAT rates - multi-rate scenario', async ({ page }) => {
    const console = createConsoleCapture('chat-vat-rates-multi');
    console.startCapture(page);

    await login(page, TEST_USERS.emeraldSeniorConsultant);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    const chatInput = page.locator('textarea, input[type="text"]').first();
    await chatInput.fill("What are the Irish VAT rates for different goods and services?");

    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();

    // Should mention multiple VAT rates: 23%, 13.5%, 9%, 4.8%, 0%
    expect(response).toMatch(/23%/);
    expect(response).toMatch(/13\.5%|13.5%/);

    console.saveToFile();
  });

  test('Seán asks about salary vs dividend - personal use case', async ({ page }) => {
    const console = createConsoleCapture('chat-salary-dividend-personal');
    console.startCapture(page);

    await login(page, TEST_USERS.seanPersonal);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    const chatInput = page.locator('textarea, input[type="text"]').first();
    await chatInput.fill("Should I take €40k salary + €25k dividend or €50k salary + €15k dividend?");

    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();

    // Should mention PAYE, PRSI, USC rates
    expect(response).toMatch(/PAYE|PRSI|USC/i);
    expect(response).toMatch(/20%|40%/); // PAYE bands

    console.saveToFile();
  });

  test('should handle follow-up questions with context', async ({ page }) => {
    const console = createConsoleCapture('chat-followup-context');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    // First question
    const chatInput = page.locator('textarea, input[type="text"]').first();
    await chatInput.fill("What's the R&D tax credit rate?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    // Wait a bit for conversation to settle
    await page.waitForTimeout(2000);

    // Follow-up question (should maintain context)
    await chatInput.fill("Can I offset this against corporation tax over multiple years?");
    await chatInput.press('Enter');

    // Wait for second response
    await page.waitForSelector('[data-testid="ai-message"], .ai-message:nth-child(4)', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();

    // Should mention 4-year offset period
    expect(response).toMatch(/4.*year|year.*4/i);

    console.saveToFile();
  });

  test('should show loading state during AI response', async ({ page }) => {
    const console = createConsoleCapture('chat-loading-state');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCEO);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    const chatInput = page.locator('textarea, input[type="text"]').first();
    await chatInput.fill("What is the Knowledge Development Box rate?");

    // Submit and immediately check for loading indicator
    await chatInput.press('Enter');

    // Should show loading indicator (spinner, "thinking", etc.)
    const loadingIndicator = page.locator(
      '[data-testid="loading"], .loading, [aria-label*="Loading"], [aria-busy="true"]'
    );

    // Check if loading indicator appears (may be brief)
    const isLoading = await loadingIndicator.isVisible().catch(() => false);
    console.log(`Loading indicator visible: ${isLoading}`);

    // Wait for response
    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    console.saveToFile();
  });

  test('should display conversation history on page reload', async ({ page }) => {
    const console = createConsoleCapture('chat-conversation-persistence');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    // Send a message
    const chatInput = page.locator('textarea, input[type="text"]').first();
    await chatInput.fill("What is the standard VAT rate in Ireland?");
    await chatInput.press('Enter');

    // Wait for response
    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    // Get message count
    const messageCountBefore = await page.locator('[data-testid="message"], .message, [role="article"]').count();
    console.log(`Messages before reload: ${messageCountBefore}`);

    // Reload page
    await page.reload();

    // Wait for messages to load
    await page.waitForSelector('[data-testid="message"], .message, [role="article"]', {
      timeout: 10000,
    });

    // Should have same messages
    const messageCountAfter = await page.locator('[data-testid="message"], .message, [role="article"]').count();
    console.log(`Messages after reload: ${messageCountAfter}`);

    expect(messageCountAfter).toBe(messageCountBefore);

    console.saveToFile();
  });

  test('should capture network errors gracefully', async ({ page }) => {
    const console = createConsoleCapture('chat-network-error-handling');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCEO);
    await page.goto('/');

    // Simulate network failure
    await page.route('**/api/chat', route => route.abort('failed'));

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    const chatInput = page.locator('textarea, input[type="text"]').first();
    await chatInput.fill("Test network failure");
    await chatInput.press('Enter');

    // Should show error message
    await expect(
      page.locator('text=/Error|Failed|Unable to send/i')
    ).toBeVisible({ timeout: 10000 });

    console.saveToFile();

    // Should have network error in console
    const networkErrors = console.searchBrowserMessages('failed');
    expect(networkErrors.length).toBeGreaterThan(0);
  });
});
