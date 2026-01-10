#!/usr/bin/env npx tsx
/**
 * Comprehensive E2E Test Runner
 *
 * Runs all Playwright tests with full console output capture from both
 * browser and server. Generates detailed reports and summaries.
 *
 * Usage:
 *   npx tsx scripts/run-e2e-tests.ts [options]
 *
 * Options:
 *   --suite=<name>     Run specific test suite (auth, chat, branch, graph, costs, team, flow)
 *   --browser=<name>   Run on specific browser (chromium, firefox, webkit)
 *   --headed           Run tests with browser visible
 *   --debug            Run tests in debug mode
 *   --trace            Capture traces for all tests
 *   --verbose          Show verbose output
 *   --report           Generate and open HTML report after tests
 *   --clean            Clean previous results before running
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const PROJECT_ROOT = path.resolve(__dirname, '..');
const RESULTS_DIR = path.join(PROJECT_ROOT, 'playwright-results');
const CONSOLE_DIR = path.join(RESULTS_DIR, 'console');
const SERVER_LOG_FILE = path.join(RESULTS_DIR, 'server-output.log');
const SUMMARY_FILE = path.join(RESULTS_DIR, 'test-summary.json');

// Test suites mapping
const TEST_SUITES: Record<string, string> = {
  auth: 'e2e/01-auth-login.spec.ts',
  chat: 'e2e/02-chat-graphrag.spec.ts',
  branch: 'e2e/03-conversation-branching.spec.ts',
  graph: 'e2e/04-graph-visualization.spec.ts',
  costs: 'e2e/05-cost-analytics.spec.ts',
  team: 'e2e/06-workspaces-team.spec.ts',
  flow: 'e2e/07-end-to-end-flow.spec.ts',
};

interface TestResult {
  suite: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  errors: string[];
}

interface RunOptions {
  suite?: string;
  browser?: string;
  headed?: boolean;
  debug?: boolean;
  trace?: boolean;
  verbose?: boolean;
  report?: boolean;
  clean?: boolean;
}

function parseArgs(): RunOptions {
  const args = process.argv.slice(2);
  const options: RunOptions = {};

  for (const arg of args) {
    if (arg.startsWith('--suite=')) {
      options.suite = arg.split('=')[1];
    } else if (arg.startsWith('--browser=')) {
      options.browser = arg.split('=')[1];
    } else if (arg === '--headed') {
      options.headed = true;
    } else if (arg === '--debug') {
      options.debug = true;
    } else if (arg === '--trace') {
      options.trace = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--report') {
      options.report = true;
    } else if (arg === '--clean') {
      options.clean = true;
    }
  }

  return options;
}

function ensureDirectories(): void {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONSOLE_DIR)) {
    fs.mkdirSync(CONSOLE_DIR, { recursive: true });
  }
}

function cleanResults(): void {
  console.log('Cleaning previous test results...');
  if (fs.existsSync(RESULTS_DIR)) {
    fs.rmSync(RESULTS_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.mkdirSync(CONSOLE_DIR, { recursive: true });
}

async function startDevServer(): Promise<ChildProcess> {
  console.log('Starting development server...');

  const serverLogStream = fs.createWriteStream(SERVER_LOG_FILE, { flags: 'a' });

  const server = spawn('pnpm', ['dev:test'], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      E2E_TEST_MODE: 'true',
      NODE_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  server.stdout?.on('data', (data: Buffer) => {
    const output = data.toString();
    serverLogStream.write(`[STDOUT] ${output}`);
    if (process.env.VERBOSE) {
      process.stdout.write(output);
    }
  });

  server.stderr?.on('data', (data: Buffer) => {
    const output = data.toString();
    serverLogStream.write(`[STDERR] ${output}`);
    if (process.env.VERBOSE) {
      process.stderr.write(output);
    }
  });

  // Wait for server to be ready
  console.log('Waiting for server to be ready...');
  await waitForServer('http://localhost:3000', 60000);
  console.log('Server is ready!');

  return server;
}

async function waitForServer(url: string, timeout: number): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 401 || response.status === 302) {
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Server did not start within ${timeout}ms`);
}

function buildPlaywrightArgs(options: RunOptions): string[] {
  const args: string[] = ['test'];

  if (options.suite && TEST_SUITES[options.suite]) {
    args.push(TEST_SUITES[options.suite]);
  }

  if (options.browser) {
    args.push(`--project=${options.browser}`);
  }

  if (options.headed) {
    args.push('--headed');
  }

  if (options.debug) {
    args.push('--debug');
  }

  if (options.trace) {
    args.push('--trace', 'on');
  }

  // Always use reporters
  args.push('--reporter=list,html,json');

  return args;
}

async function runPlaywrightTests(options: RunOptions): Promise<TestResult> {
  const args = buildPlaywrightArgs(options);
  const startTime = Date.now();

  console.log(`\nRunning Playwright tests...`);
  console.log(`Command: npx playwright ${args.join(' ')}`);

  return new Promise((resolve) => {
    const playwright = spawn('npx', ['playwright', ...args], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        E2E_TEST_MODE: 'true',
        PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(RESULTS_DIR, 'results.json'),
      },
      stdio: options.verbose ? 'inherit' : 'pipe',
      shell: true,
    });

    let output = '';

    if (!options.verbose) {
      playwright.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
        process.stdout.write('.');
      });

      playwright.stderr?.on('data', (data: Buffer) => {
        output += data.toString();
      });
    }

    playwright.on('close', (code) => {
      const duration = Date.now() - startTime;

      // Parse results from JSON file
      let passed = 0;
      let failed = 0;
      let skipped = 0;
      const errors: string[] = [];

      try {
        const resultsPath = path.join(RESULTS_DIR, 'results.json');
        if (fs.existsSync(resultsPath)) {
          const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
          if (results.suites) {
            for (const suite of results.suites) {
              for (const spec of suite.specs || []) {
                for (const test of spec.tests || []) {
                  if (test.status === 'expected' || test.status === 'passed') {
                    passed++;
                  } else if (test.status === 'unexpected' || test.status === 'failed') {
                    failed++;
                    if (test.results?.[0]?.error?.message) {
                      errors.push(`${spec.title}: ${test.results[0].error.message}`);
                    }
                  } else if (test.status === 'skipped') {
                    skipped++;
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.error('\nError parsing test results:', e);
      }

      resolve({
        suite: options.suite || 'all',
        passed,
        failed,
        skipped,
        duration,
        errors,
      });
    });
  });
}

function generateSummary(results: TestResult[], startTime: Date): void {
  const endTime = new Date();
  const totalDuration = endTime.getTime() - startTime.getTime();

  const summary = {
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    totalDuration,
    totalPassed: results.reduce((sum, r) => sum + r.passed, 0),
    totalFailed: results.reduce((sum, r) => sum + r.failed, 0),
    totalSkipped: results.reduce((sum, r) => sum + r.skipped, 0),
    results,
  };

  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Start Time: ${startTime.toISOString()}`);
  console.log(`End Time:   ${endTime.toISOString()}`);
  console.log(`Duration:   ${(totalDuration / 1000).toFixed(2)}s`);
  console.log('');
  console.log(`Passed:  ${summary.totalPassed}`);
  console.log(`Failed:  ${summary.totalFailed}`);
  console.log(`Skipped: ${summary.totalSkipped}`);
  console.log('='.repeat(60));

  if (summary.totalFailed > 0) {
    console.log('\nFAILED TESTS:');
    for (const result of results) {
      for (const error of result.errors) {
        console.log(`  - ${error}`);
      }
    }
  }

  console.log('\nResults saved to:');
  console.log(`  - ${SUMMARY_FILE}`);
  console.log(`  - ${path.join(RESULTS_DIR, 'results.json')}`);
  console.log(`  - ${CONSOLE_DIR}/`);
  console.log(`  - ${SERVER_LOG_FILE}`);
}

async function openReport(): Promise<void> {
  console.log('\nOpening HTML report...');
  return new Promise((resolve) => {
    const showReport = spawn('npx', ['playwright', 'show-report'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: true,
    });
    showReport.on('close', () => resolve());
  });
}

async function main(): Promise<void> {
  const options = parseArgs();
  const startTime = new Date();

  console.log('='.repeat(60));
  console.log('E2E Test Runner - Regulatory Intelligence Copilot');
  console.log('='.repeat(60));
  console.log(`Start Time: ${startTime.toISOString()}`);
  console.log(`Options: ${JSON.stringify(options)}`);
  console.log('');

  // Ensure directories exist
  ensureDirectories();

  // Clean if requested
  if (options.clean) {
    cleanResults();
  }

  let server: ChildProcess | null = null;

  try {
    // Check if server is already running
    let serverRunning = false;
    try {
      const response = await fetch('http://localhost:3000');
      serverRunning = response.ok || response.status === 401 || response.status === 302;
    } catch {
      serverRunning = false;
    }

    if (!serverRunning) {
      server = await startDevServer();
    } else {
      console.log('Development server already running.');
    }

    // Run tests
    const results = await runPlaywrightTests(options);

    // Generate summary
    generateSummary([results], startTime);

    // Open report if requested
    if (options.report) {
      await openReport();
    }

    // Exit with appropriate code
    process.exit(results.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\nTest runner error:', error);
    process.exit(1);
  } finally {
    // Cleanup server if we started it
    if (server) {
      console.log('\nStopping development server...');
      server.kill('SIGTERM');
    }
  }
}

main();
