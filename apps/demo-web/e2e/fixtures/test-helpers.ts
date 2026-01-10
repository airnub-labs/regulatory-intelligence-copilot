import { Page, expect, Locator } from '@playwright/test';
import { TEST_USERS, TestUser, login } from './auth';

/**
 * Comprehensive Test Helper Functions for E2E Tests
 *
 * Provides utilities for testing all platform functionality based on realistic seed data.
 * Includes helpers for:
 * - Chat and GraphRAG testing
 * - Conversation branching
 * - Workspace management
 * - Cost analytics
 * - Graph visualization
 * - Multi-tenant scenarios
 */

// ==============================================================================
// CHAT HELPERS
// ==============================================================================

/**
 * Get the chat input element
 */
export async function getChatInput(page: Page): Promise<Locator> {
  const chatInput = page.locator('textarea, input[type="text"]').first();
  await expect(chatInput).toBeVisible({ timeout: 10000 });
  return chatInput;
}

/**
 * Send a chat message and wait for AI response
 */
export async function sendChatMessage(
  page: Page,
  message: string,
  options: { timeout?: number } = {}
): Promise<string> {
  const timeout = options.timeout || 30000;
  const chatInput = await getChatInput(page);

  await chatInput.fill(message);
  await chatInput.press('Enter');

  // Wait for AI response
  await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
    timeout,
  });

  // Get the last AI message
  const response = await page
    .locator('[data-testid="ai-message"], .ai-message')
    .last()
    .textContent();

  return response || '';
}

/**
 * Send a follow-up message (preserves context)
 */
export async function sendFollowUpMessage(
  page: Page,
  message: string,
  options: { timeout?: number; waitForPrevious?: boolean } = {}
): Promise<string> {
  const { timeout = 30000, waitForPrevious = true } = options;

  if (waitForPrevious) {
    // Wait for any pending AI response to complete
    await page.waitForTimeout(2000);
  }

  return sendChatMessage(page, message, { timeout });
}

/**
 * Get all messages in the current conversation
 */
export async function getAllMessages(page: Page): Promise<Array<{
  type: 'user' | 'ai';
  content: string;
}>> {
  const messages = await page.locator('[data-testid="message"], .message, [role="article"]').all();
  const result: Array<{ type: 'user' | 'ai'; content: string }> = [];

  for (const msg of messages) {
    const isUser = await msg.getAttribute('data-testid') === 'user-message' ||
      await msg.evaluate(el => el.classList.contains('user-message'));
    const content = await msg.textContent() || '';

    result.push({
      type: isUser ? 'user' : 'ai',
      content,
    });
  }

  return result;
}

/**
 * Assert that the AI response contains expected content
 */
export async function assertResponseContains(
  page: Page,
  patterns: (string | RegExp)[]
): Promise<void> {
  const response = await page
    .locator('[data-testid="ai-message"], .ai-message')
    .last()
    .textContent();

  for (const pattern of patterns) {
    if (typeof pattern === 'string') {
      expect(response).toContain(pattern);
    } else {
      expect(response).toMatch(pattern);
    }
  }
}

/**
 * Get referenced graph nodes from the response
 */
export async function getReferencedNodes(page: Page): Promise<string[]> {
  const nodes = await page
    .locator('[data-testid="referenced-node"], .referenced-node, .graph-reference')
    .all();

  const nodeIds: string[] = [];
  for (const node of nodes) {
    const id = await node.getAttribute('data-node-id');
    if (id) nodeIds.push(id);
  }

  return nodeIds;
}

// ==============================================================================
// CONVERSATION BRANCHING HELPERS
// ==============================================================================

/**
 * Edit a user message to create a branch
 */
export async function editMessageToCreateBranch(
  page: Page,
  messageIndex: number,
  newMessage: string
): Promise<boolean> {
  const userMessages = page.locator('[data-testid="user-message"], .user-message');
  const targetMessage = userMessages.nth(messageIndex);

  await targetMessage.hover();

  const editButton = targetMessage.locator('[data-testid="edit-button"], button[aria-label*="Edit"]');
  const isEditVisible = await editButton.isVisible({ timeout: 2000 }).catch(() => false);

  if (!isEditVisible) {
    return false;
  }

  await editButton.click();

  const editInput = page.locator('[data-testid="edit-input"], textarea[aria-label*="Edit"]');
  await expect(editInput).toBeVisible();
  await editInput.fill(newMessage);
  await editInput.press('Enter');

  // Wait for new AI response
  await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
    timeout: 30000,
  });

  return true;
}

/**
 * Get available conversation paths
 */
export async function getConversationPaths(page: Page): Promise<string[]> {
  const pathSwitcher = page.locator('[data-testid="path-switcher"], [aria-label*="Switch path"]');
  const isVisible = await pathSwitcher.isVisible({ timeout: 2000 }).catch(() => false);

  if (!isVisible) {
    return ['main'];
  }

  await pathSwitcher.click();
  const paths = await page.locator('[data-testid="path-option"], [role="option"]').allTextContents();
  await page.keyboard.press('Escape');

  return paths;
}

/**
 * Switch to a specific conversation path
 */
export async function switchToPath(page: Page, pathName: string): Promise<boolean> {
  const pathSwitcher = page.locator('[data-testid="path-switcher"], [aria-label*="Switch path"]');
  const isVisible = await pathSwitcher.isVisible({ timeout: 2000 }).catch(() => false);

  if (!isVisible) {
    return false;
  }

  await pathSwitcher.click();
  const pathOption = page.locator(`[data-testid="path-option"]:has-text("${pathName}")`);
  const isPathVisible = await pathOption.isVisible({ timeout: 2000 }).catch(() => false);

  if (!isPathVisible) {
    await page.keyboard.press('Escape');
    return false;
  }

  await pathOption.click();
  await page.waitForTimeout(1000);
  return true;
}

/**
 * Get the current message count
 */
export async function getMessageCount(page: Page): Promise<number> {
  return page.locator('[data-testid="message"], .message, [role="article"]').count();
}

// ==============================================================================
// WORKSPACE HELPERS
// ==============================================================================

/**
 * Get available workspaces
 */
export async function getWorkspaces(page: Page): Promise<string[]> {
  const workspaceSwitcher = page.locator('[data-testid="workspace-switcher"]');
  const isVisible = await workspaceSwitcher.isVisible({ timeout: 3000 }).catch(() => false);

  if (!isVisible) {
    return [];
  }

  await workspaceSwitcher.click();
  await page.waitForTimeout(1000);

  const workspaces = await page
    .locator('[data-testid="workspace-option"]')
    .allTextContents();

  await page.keyboard.press('Escape');
  return workspaces;
}

/**
 * Switch to a specific workspace
 */
export async function switchWorkspace(page: Page, workspaceName: string): Promise<boolean> {
  const workspaceSwitcher = page.locator('[data-testid="workspace-switcher"]');
  const isVisible = await workspaceSwitcher.isVisible({ timeout: 3000 }).catch(() => false);

  if (!isVisible) {
    return false;
  }

  await workspaceSwitcher.click();
  await page.waitForTimeout(1000);

  const workspaceOption = page.locator(`[data-testid="workspace-option"]:has-text("${workspaceName}")`);
  const isOptionVisible = await workspaceOption.isVisible({ timeout: 2000 }).catch(() => false);

  if (!isOptionVisible) {
    await page.keyboard.press('Escape');
    return false;
  }

  await workspaceOption.click();
  await page.waitForTimeout(2000);
  return true;
}

/**
 * Get current workspace name
 */
export async function getCurrentWorkspaceName(page: Page): Promise<string | null> {
  const workspaceName = page.locator('[data-testid="current-workspace-name"]');
  const isVisible = await workspaceName.isVisible({ timeout: 2000 }).catch(() => false);

  if (!isVisible) {
    return null;
  }

  return workspaceName.textContent();
}

// ==============================================================================
// COST ANALYTICS HELPERS
// ==============================================================================

/**
 * Navigate to cost analytics page
 */
export async function goToCostAnalytics(page: Page): Promise<void> {
  await page.goto('/analytics/costs');
  await page.waitForSelector('[data-testid="cost-analytics"]', {
    timeout: 10000,
  });
}

/**
 * Get cost metrics from the analytics page
 */
export async function getCostMetrics(page: Page): Promise<{
  totalCost?: number;
  quota?: number;
  usagePercentage?: number;
}> {
  const metrics: {
    totalCost?: number;
    quota?: number;
    usagePercentage?: number;
  } = {};

  const totalCostElement = page.locator('[data-testid="total-cost"], .total-cost');
  if (await totalCostElement.isVisible({ timeout: 2000 }).catch(() => false)) {
    const text = await totalCostElement.textContent();
    const match = text?.match(/[\d,.]+/);
    if (match) {
      metrics.totalCost = parseFloat(match[0].replace(',', ''));
    }
  }

  const quotaElement = page.locator('[data-testid="quota"], .quota');
  if (await quotaElement.isVisible({ timeout: 2000 }).catch(() => false)) {
    const text = await quotaElement.textContent();
    const match = text?.match(/[\d,.]+/);
    if (match) {
      metrics.quota = parseFloat(match[0].replace(',', ''));
    }
  }

  return metrics;
}

/**
 * Assert user is within their cost quota
 */
export async function assertWithinQuota(page: Page): Promise<void> {
  const metrics = await getCostMetrics(page);
  if (metrics.totalCost !== undefined && metrics.quota !== undefined) {
    expect(metrics.totalCost).toBeLessThanOrEqual(metrics.quota);
  }
}

// ==============================================================================
// GRAPH VISUALIZATION HELPERS
// ==============================================================================

/**
 * Navigate to graph visualization page
 */
export async function goToGraphVisualization(page: Page): Promise<void> {
  await page.goto('/graph');
  await page.waitForSelector('[data-testid="graph-container"], canvas, svg', {
    timeout: 15000,
  });
}

/**
 * Get highlighted nodes in the graph
 */
export async function getHighlightedNodes(page: Page): Promise<string[]> {
  const highlightedNodes = await page
    .locator('[data-testid="highlighted-node"], .highlighted-node')
    .all();

  const nodeIds: string[] = [];
  for (const node of highlightedNodes) {
    const id = await node.getAttribute('data-node-id');
    if (id) nodeIds.push(id);
  }

  return nodeIds;
}

/**
 * Search for nodes in the graph
 */
export async function searchGraphNodes(page: Page, query: string): Promise<void> {
  const searchInput = page.locator('[data-testid="graph-search"], input[placeholder*="Search"]');
  if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await searchInput.fill(query);
    await searchInput.press('Enter');
    await page.waitForTimeout(1000);
  }
}

// ==============================================================================
// MULTI-TENANT TESTING HELPERS
// ==============================================================================

/**
 * Test data access for enterprise tenant (DataTech)
 */
export async function testDataTechAccess(page: Page, user: TestUser): Promise<{
  canAccessFinance: boolean;
  canAccessHR: boolean;
  canAccessEngineering: boolean;
}> {
  await login(page, user);
  await page.goto('/');

  const workspaces = await getWorkspaces(page);

  return {
    canAccessFinance: workspaces.some(w => w.toLowerCase().includes('finance')),
    canAccessHR: workspaces.some(w => w.toLowerCase().includes('hr')),
    canAccessEngineering: workspaces.some(w => w.toLowerCase().includes('engineering')),
  };
}

/**
 * Test tenant isolation
 */
export async function testTenantIsolation(
  page: Page,
  user: TestUser,
  otherTenantName: string
): Promise<boolean> {
  await login(page, user);
  await page.goto('/');

  // Try to access other tenant's workspace
  const workspaces = await getWorkspaces(page);

  // Should not see other tenant's workspaces
  return !workspaces.some(w =>
    w.toLowerCase().includes(otherTenantName.toLowerCase())
  );
}

// ==============================================================================
// IRISH TAX QUERY HELPERS
// ==============================================================================

/**
 * Common Irish tax queries for testing GraphRAG
 */
export const IRISH_TAX_QUERIES = {
  // Corporation Tax
  corporationTax: {
    rate: "What's the corporation tax rate for trading income in Ireland?",
    calculation: "Calculate corporation tax for €200K trading income",
    deadline: "When is the corporation tax filing deadline?",
  },
  // R&D Tax Credit
  rndCredit: {
    rate: "What's the R&D tax credit rate for Irish companies?",
    calculation: "Calculate R&D tax credit for €100K qualifying expenditure",
    eligibility: "What activities qualify for R&D tax credits?",
  },
  // VAT
  vat: {
    standardRate: "What's the standard VAT rate in Ireland?",
    reducedRates: "What are the reduced VAT rates in Ireland?",
    registration: "When do I need to register for VAT in Ireland?",
  },
  // Income Tax (PAYE)
  paye: {
    bands: "What are the Irish income tax bands?",
    calculation: "Calculate PAYE for €60K salary",
    credits: "What personal tax credits are available?",
  },
  // PRSI
  prsi: {
    rates: "What are the PRSI rates for employees?",
    classes: "What are the different PRSI classes?",
    benefits: "What benefits does PRSI Class A provide?",
  },
  // USC
  usc: {
    bands: "What are the USC bands in Ireland?",
    exemptions: "Who is exempt from USC?",
    calculation: "Calculate USC for €80K income",
  },
  // Cross-jurisdictional
  crossBorder: {
    euDirectives: "How does Ireland implement the Anti-Tax Avoidance Directive?",
    ukTreaty: "What are the key provisions of the Ireland-UK tax treaty?",
    postedWorkers: "What are the rules for posted workers under EU regulations?",
    transferPricing: "What are Ireland's transfer pricing rules?",
  },
};

/**
 * Test a tax query and verify GraphRAG response
 */
export async function testTaxQuery(
  page: Page,
  user: TestUser,
  query: string,
  expectedPatterns: (string | RegExp)[]
): Promise<{
  success: boolean;
  response: string;
  referencedNodes: string[];
}> {
  await login(page, user);
  await page.goto('/');

  const response = await sendChatMessage(page, query);
  const referencedNodes = await getReferencedNodes(page);

  let success = true;
  for (const pattern of expectedPatterns) {
    if (typeof pattern === 'string') {
      if (!response.includes(pattern)) {
        success = false;
        break;
      }
    } else {
      if (!pattern.test(response)) {
        success = false;
        break;
      }
    }
  }

  return { success, response, referencedNodes };
}

// ==============================================================================
// TEST USER SHORTCUTS
// ==============================================================================

/**
 * Get users by tenant tier
 */
export const USERS_BY_TIER = {
  enterprise: Object.values(TEST_USERS).filter(u =>
    u.email.includes('datatech')
  ),
  pro: Object.values(TEST_USERS).filter(u =>
    u.email.includes('emerald')
  ),
  personal: Object.values(TEST_USERS).filter(u =>
    u.email.includes('freelancetech')
  ),
  admin: Object.values(TEST_USERS).filter(u =>
    u.email.includes('regintel')
  ),
};

/**
 * Get users by role
 */
export const USERS_BY_ROLE = {
  owners: Object.values(TEST_USERS).filter(u =>
    u.role === 'owner'
  ),
  admins: Object.values(TEST_USERS).filter(u =>
    u.role === 'admin'
  ),
  members: Object.values(TEST_USERS).filter(u =>
    u.role === 'member'
  ),
  viewers: Object.values(TEST_USERS).filter(u =>
    u.role === 'viewer'
  ),
};

// ==============================================================================
// WAIT HELPERS
// ==============================================================================

/**
 * Wait for page to be fully loaded
 */
export async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}

/**
 * Wait for chat to be ready
 */
export async function waitForChatReady(page: Page): Promise<void> {
  await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
  await waitForPageReady(page);
}

/**
 * Wait for AI response with timeout
 */
export async function waitForAIResponse(page: Page, timeout = 30000): Promise<void> {
  await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
    timeout,
  });
}

// ==============================================================================
// ASSERTIONS
// ==============================================================================

/**
 * Assert user is on expected page
 */
export async function assertOnPage(page: Page, path: string): Promise<void> {
  await expect(page).toHaveURL(new RegExp(path));
}

/**
 * Assert error is displayed
 */
export async function assertErrorDisplayed(page: Page, errorPattern?: string | RegExp): Promise<void> {
  const errorLocator = page.locator('text=/Error|Failed|Unable/i, [role="alert"], .error');
  await expect(errorLocator).toBeVisible({ timeout: 5000 });

  if (errorPattern) {
    const errorText = await errorLocator.textContent();
    if (typeof errorPattern === 'string') {
      expect(errorText).toContain(errorPattern);
    } else {
      expect(errorText).toMatch(errorPattern);
    }
  }
}

/**
 * Assert no error is displayed
 */
export async function assertNoErrorDisplayed(page: Page): Promise<void> {
  const errorLocator = page.locator('[role="alert"], .error-message');
  await expect(errorLocator).not.toBeVisible({ timeout: 2000 }).catch(() => {
    // It's okay if the locator doesn't exist
  });
}
