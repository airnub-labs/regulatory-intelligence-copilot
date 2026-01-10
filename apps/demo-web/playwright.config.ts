import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Regulatory Intelligence Copilot E2E Tests
 *
 * Tests all functionality with realistic seed data:
 * - DataTech Solutions (Enterprise tenant)
 * - Emerald Tax Consulting (Pro tenant)
 * - Seán O'Brien (Personal tenant)
 *
 * Captures:
 * - Browser console logs
 * - Server-side console output
 * - Network requests
 * - Screenshots on failure
 */

export default defineConfig({
  testDir: './e2e',

  // Maximum time one test can run (5 minutes for complex GraphRAG tests)
  timeout: 5 * 60 * 1000,

  // Expect timeout for assertions
  expect: {
    timeout: 10 * 1000, // 10 seconds
  },

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
    ['junit', { outputFile: 'playwright-results/junit.xml' }],
    ['json', { outputFile: 'playwright-results/results.json' }],
  ],

  // Shared settings for all projects
  use: {
    // Base URL for the application
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',

    // Collect trace when retrying the failed test
    trace: 'retain-on-failure',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',

    // Browser console logs
    launchOptions: {
      // Capture all console output
      args: [
        '--enable-logging=stderr',
        '--v=1',
      ],
    },
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Increase viewport for better graph visualization testing
        viewport: { width: 1920, height: 1080 },
      },
    },

    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1920, height: 1080 },
      },
    },

    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1920, height: 1080 },
      },
    },

    // Mobile viewports
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  // Run your local dev server before starting the tests
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe', // Capture server stdout
    stderr: 'pipe', // Capture server stderr
    timeout: 120 * 1000, // 2 minutes for server to start
  },
});
