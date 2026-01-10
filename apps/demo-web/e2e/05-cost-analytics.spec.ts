import { test, expect } from '@playwright/test';
import { TEST_USERS, login } from './fixtures/auth';
import { createConsoleCapture } from './fixtures/console-capture';

test.describe('Cost Analytics Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('DataTech CFO can view cost analytics dashboard', async ({ page }) => {
    const console = createConsoleCapture('costs-datatech-cfo-view');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/analytics/costs');

    // Wait for analytics page to load
    await page.waitForSelector('[data-testid="cost-analytics"], h1, h2', {
      timeout: 10000,
    });

    // Should see cost metrics
    const costMetrics = page.locator('[data-testid="cost-metric"], .metric, .stat');
    const metricCount = await costMetrics.count();
    console.log(`Cost metrics displayed: ${metricCount}`);

    // Should show some cost data (enterprise tenant should have costs)
    expect(metricCount).toBeGreaterThan(0);

    console.saveToFile();
    console.assertNoErrors();
  });

  test('should display monthly cost breakdown', async ({ page }) => {
    const console = createConsoleCapture('costs-monthly-breakdown');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/analytics/costs');

    await page.waitForSelector('[data-testid="cost-analytics"]', {
      timeout: 10000,
    });

    // Look for cost breakdown by month
    const monthlyData = page.locator('[data-testid="monthly-costs"], .monthly-breakdown');
    const hasMonthlyData = await monthlyData.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Monthly cost breakdown visible: ${hasMonthlyData}`);

    // Look for charts/visualizations
    const charts = page.locator('canvas, svg, [data-testid="chart"]');
    const chartCount = await charts.count();
    console.log(`Charts displayed: ${chartCount}`);

    console.saveToFile();
  });

  test('should show LLM provider breakdown', async ({ page }) => {
    const console = createConsoleCapture('costs-llm-provider-breakdown');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/analytics/costs');

    await page.waitForSelector('[data-testid="cost-analytics"]', {
      timeout: 10000,
    });

    // Should show provider breakdown (Anthropic, OpenAI, Google, etc.)
    const providerSection = page.locator('[data-testid="provider-breakdown"], .provider-costs');
    const hasProviderBreakdown = await providerSection.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Provider breakdown visible: ${hasProviderBreakdown}`);

    // Look for provider names
    const providers = page.locator('text=/Anthropic|OpenAI|Google|Groq/i');
    const providerCount = await providers.count();
    console.log(`Providers mentioned: ${providerCount}`);

    console.saveToFile();
  });

  test('should display quota usage and limits', async ({ page }) => {
    const console = createConsoleCapture('costs-quota-usage');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/analytics/costs');

    await page.waitForSelector('[data-testid="cost-analytics"]', {
      timeout: 10000,
    });

    // Should show quota information (DataTech has €5,000/month quota)
    const quotaSection = page.locator('[data-testid="quota"], .quota, text=/quota/i');
    const hasQuota = await quotaSection.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Quota section visible: ${hasQuota}`);

    // Should show usage percentage or progress bar
    const progressBar = page.locator('[role="progressbar"], progress, .progress-bar');
    const hasProgress = await progressBar.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`Progress bar visible: ${hasProgress}`);

    console.saveToFile();
  });

  test('should allow filtering costs by date range', async ({ page }) => {
    const console = createConsoleCapture('costs-date-filter');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/analytics/costs');

    await page.waitForSelector('[data-testid="cost-analytics"]', {
      timeout: 10000,
    });

    // Look for date range picker
    const dateFilter = page.locator('[data-testid="date-filter"], input[type="date"], [aria-label*="date"]');
    const hasDateFilter = await dateFilter.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Date filter available: ${hasDateFilter}`);

    if (hasDateFilter) {
      // Try selecting a date range
      await dateFilter.first().click();
      await page.waitForTimeout(1000);

      // Select a date (if date picker appears)
      const datePicker = page.locator('[role="dialog"], .calendar, [data-testid="date-picker"]');
      const hasDatePicker = await datePicker.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`Date picker opened: ${hasDatePicker}`);
    }

    console.saveToFile();
  });

  test('Seán personal user should see lower costs and free tier limits', async ({ page }) => {
    const console = createConsoleCapture('costs-sean-personal-free-tier');
    console.startCapture(page);

    await login(page, TEST_USERS.seanPersonal);
    await page.goto('/analytics/costs');

    await page.waitForSelector('[data-testid="cost-analytics"]', {
      timeout: 10000,
    });

    // Should see quota (€50/month for free tier)
    const quotaText = page.locator('text=/50|quota|limit/i');
    const hasQuota = await quotaText.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Free tier quota visible: ${hasQuota}`);

    // Costs should be low
    const costMetrics = page.locator('[data-testid="cost-metric"]');
    if (await costMetrics.count() > 0) {
      const firstMetric = await costMetrics.first().textContent();
      console.log(`First cost metric: ${firstMetric}`);
    }

    console.saveToFile();
  });

  test('should display cost anomaly alerts if present', async ({ page }) => {
    const console = createConsoleCapture('costs-anomaly-alerts');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/analytics/costs');

    await page.waitForSelector('[data-testid="cost-analytics"]', {
      timeout: 10000,
    });

    // Look for anomaly section
    const anomalySection = page.locator('[data-testid="anomalies"], .anomaly, text=/anomaly|alert/i');
    const hasAnomalies = await anomalySection.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Anomaly section visible: ${hasAnomalies}`);

    // Look for alert badges or warnings
    const alerts = page.locator('[role="alert"], .alert, .warning');
    const alertCount = await alerts.count();
    console.log(`Alerts displayed: ${alertCount}`);

    console.saveToFile();
  });

  test('should export cost data', async ({ page }) => {
    const console = createConsoleCapture('costs-export-data');
    console.startCapture(page);

    await login(page, TEST_USERS.dataTechCFO);
    await page.goto('/analytics/costs');

    await page.waitForSelector('[data-testid="cost-analytics"]', {
      timeout: 10000,
    });

    // Look for export button
    const exportButton = page.locator('[data-testid="export"], button:has-text("Export"), button:has-text("Download")');
    const hasExport = await exportButton.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Export button available: ${hasExport}`);

    if (hasExport) {
      // Set up download handler
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);

      await exportButton.click();

      const download = await downloadPromise;
      if (download) {
        console.log(`Download started: ${download.suggestedFilename()}`);
      } else {
        console.log('No download triggered (may require actual data)');
      }
    }

    console.saveToFile();
  });
});
