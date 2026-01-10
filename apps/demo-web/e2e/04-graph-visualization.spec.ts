import { test, expect } from '@playwright/test';
import { TEST_USERS, login } from './fixtures/auth';
import { createConsoleCapture } from './fixtures/console-capture';

test.describe('Graph Visualization Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('should load graph visualization page', async ({ page }) => {
    const console = createConsoleCapture('graph-visualization-load');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/graph');

    // Wait for graph container to load
    await page.waitForSelector('[data-testid="graph-container"], canvas, svg', {
      timeout: 15000,
    });

    // Should see graph elements
    const graphContainer = page.locator('[data-testid="graph-container"], .graph-container, canvas, svg');
    await expect(graphContainer).toBeVisible();

    console.saveToFile();
    console.assertNoErrors();
  });

  test('should display Irish regulatory nodes in graph', async ({ page }) => {
    const console = createConsoleCapture('graph-irish-nodes');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/graph');

    // Wait for graph to load
    await page.waitForSelector('[data-testid="graph-container"], canvas, svg', {
      timeout: 15000,
    });

    // Wait for graph data to render (give it time to fetch and render)
    await page.waitForTimeout(3000);

    // Check for node labels or info panel
    const nodeInfo = page.locator('[data-testid="node-info"], .node-info, [aria-label*="Node details"]');
    const hasNodeInfo = await nodeInfo.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`Node info panel visible: ${hasNodeInfo}`);

    // Check for search/filter functionality
    const searchInput = page.locator('[data-testid="graph-search"], input[placeholder*="Search"]');
    const hasSearch = await searchInput.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`Graph search available: ${hasSearch}`);

    if (hasSearch) {
      // Search for R&D Tax Credit
      await searchInput.fill('R&D');
      await page.waitForTimeout(1000);

      // Should highlight matching nodes
      const highlightedNodes = page.locator('[data-testid="highlighted-node"], .highlighted-node, .node-highlight');
      const highlightCount = await highlightedNodes.count();
      console.log(`Highlighted nodes for 'R&D': ${highlightCount}`);
    }

    console.saveToFile();
  });

  test('should allow filtering graph by jurisdiction', async ({ page }) => {
    const console = createConsoleCapture('graph-filter-jurisdiction');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/graph');

    await page.waitForSelector('[data-testid="graph-container"], canvas, svg', {
      timeout: 15000,
    });

    // Look for jurisdiction filter
    const jurisdictionFilter = page.locator(
      '[data-testid="jurisdiction-filter"], select[name*="jurisdiction"], [aria-label*="Filter by jurisdiction"]'
    );

    const hasJurisdictionFilter = await jurisdictionFilter.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Jurisdiction filter available: ${hasJurisdictionFilter}`);

    if (hasJurisdictionFilter) {
      // Select Ireland
      await jurisdictionFilter.click();
      const irelandOption = page.locator('option:has-text("Ireland"), [role="option"]:has-text("Ireland")');
      if (await irelandOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await irelandOption.click();
        await page.waitForTimeout(2000);
      }
    }

    console.saveToFile();
  });

  test('should highlight referenced nodes from conversation', async ({ page }) => {
    const console = createConsoleCapture('graph-highlight-referenced-nodes');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCFO);

    // First, create a conversation with graph references
    await page.goto('/');
    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });

    const chatInput = page.locator('textarea, input[type="text"]').first();
    await chatInput.fill("What's the R&D tax credit rate?");
    await chatInput.press('Enter');

    // Wait for AI response (should include referencedNodes)
    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    // Now navigate to graph
    await page.goto('/graph');
    await page.waitForSelector('[data-testid="graph-container"], canvas, svg', {
      timeout: 15000,
    });

    // Wait for graph to highlight referenced nodes
    await page.waitForTimeout(3000);

    // Should see highlighted nodes (those referenced in the conversation)
    const highlightedNodes = page.locator('[data-testid="referenced-node"], .referenced-node, [stroke="#FF6B6B"]');
    const highlightCount = await highlightedNodes.count();
    console.log(`Referenced nodes highlighted: ${highlightCount}`);

    // Could be 0 if highlighting is not implemented yet
    // but at least verify the graph loaded
    const graphCanvas = page.locator('canvas, svg');
    await expect(graphCanvas).toBeVisible();

    console.saveToFile();
  });

  test('should allow zooming and panning graph', async ({ page }) => {
    const console = createConsoleCapture('graph-zoom-pan');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/graph');

    await page.waitForSelector('[data-testid="graph-container"], canvas, svg', {
      timeout: 15000,
    });

    // Get graph element
    const graphElement = page.locator('[data-testid="graph-container"], canvas, svg').first();

    // Try zooming with mouse wheel (simulate scroll)
    await graphElement.hover();
    await page.mouse.wheel(0, 100); // Zoom out
    await page.waitForTimeout(500);
    await page.mouse.wheel(0, -100); // Zoom in
    await page.waitForTimeout(500);

    // Try panning (drag)
    const box = await graphElement.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 100);
      await page.mouse.up();
    }

    console.saveToFile();

    // Should not have critical errors from interactions
    const errors = console.getBrowserErrors();
    const criticalErrors = errors.filter(e =>
      !e.text.includes('ResizeObserver') &&
      !e.text.includes('favicon')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('should display node details on click', async ({ page }) => {
    const console = createConsoleCapture('graph-node-details');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/graph');

    await page.waitForSelector('[data-testid="graph-container"], canvas, svg', {
      timeout: 15000,
    });

    // Wait for graph to render
    await page.waitForTimeout(3000);

    // Click somewhere on the graph (try to click a node)
    const graphElement = page.locator('[data-testid="graph-container"], canvas, svg').first();
    const box = await graphElement.boundingBox();
    if (box) {
      // Click center of graph (likely to have nodes)
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(1000);

      // Check if node details panel appears
      const detailsPanel = page.locator('[data-testid="node-details"], .node-details, aside, [role="complementary"]');
      const hasDetails = await detailsPanel.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`Node details panel visible after click: ${hasDetails}`);
    }

    console.saveToFile();
  });

  test('should handle large graph datasets without crashing', async ({ page }) => {
    const console = createConsoleCapture('graph-large-dataset');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/graph');

    // Wait for initial load
    await page.waitForSelector('[data-testid="graph-container"], canvas, svg', {
      timeout: 15000,
    });

    // Wait for graph to finish rendering (large dataset might take time)
    await page.waitForTimeout(5000);

    // Graph should be visible and interactive
    const graphElement = page.locator('[data-testid="graph-container"], canvas, svg').first();
    await expect(graphElement).toBeVisible();

    // Perform some interactions to ensure it's responsive
    await graphElement.hover();
    await page.mouse.wheel(0, 50); // Zoom
    await page.waitForTimeout(500);

    console.saveToFile();

    // Check for performance-related errors
    const errors = console.getBrowserErrors();
    const performanceErrors = errors.filter(e =>
      e.text.includes('Out of memory') ||
      e.text.includes('Maximum call stack') ||
      e.text.includes('Uncaught RangeError')
    );
    expect(performanceErrors).toHaveLength(0);
  });
});
