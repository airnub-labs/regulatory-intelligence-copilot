import { Page, ConsoleMessage } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Enhanced Console Capture Utilities for E2E Tests
 *
 * Captures both browser console AND server-side console output for comprehensive debugging.
 *
 * Features:
 * - Browser console capture (log, info, warn, error, debug)
 * - Server-side console capture via /api/test/server-logs
 * - Page error and crash detection
 * - Network request/response logging
 * - Test markers for log correlation
 * - JSON + human-readable output formats
 */

export interface CapturedConsoleMessage {
  type: 'log' | 'info' | 'warn' | 'error' | 'debug';
  text: string;
  timestamp: string;
  location?: string;
  args?: string[];
  source?: 'browser' | 'server';
}

export interface CapturedNetworkRequest {
  url: string;
  method: string;
  status?: number;
  timestamp: string;
  duration?: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
}

export interface ServerLogEntry {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
  data?: unknown;
}

export class ConsoleCapture {
  private browserMessages: CapturedConsoleMessage[] = [];
  private serverMessages: CapturedConsoleMessage[] = [];
  private networkRequests: CapturedNetworkRequest[] = [];
  private testName: string;
  private outputDir: string;
  private baseUrl: string;
  private captureNetwork: boolean;
  private startTime: string;

  constructor(
    testName: string,
    options: {
      outputDir?: string;
      baseUrl?: string;
      captureNetwork?: boolean;
    } = {}
  ) {
    this.testName = testName;
    this.outputDir = options.outputDir || 'playwright-results/console';
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.captureNetwork = options.captureNetwork ?? true;
    this.startTime = new Date().toISOString();

    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Start capturing console messages from the browser
   */
  startCapture(page: Page): void {
    page.on('console', (msg: ConsoleMessage) => {
      this.browserMessages.push({
        type: msg.type() as CapturedConsoleMessage['type'],
        text: msg.text(),
        timestamp: new Date().toISOString(),
        location: msg.location().url,
        args: msg.args().map(arg => arg.toString()),
        source: 'browser',
      });
    });

    // Capture page errors
    page.on('pageerror', (error) => {
      this.browserMessages.push({
        type: 'error',
        text: `PAGE ERROR: ${error.message}\n${error.stack}`,
        timestamp: new Date().toISOString(),
        source: 'browser',
      });
    });

    // Capture uncaught exceptions
    page.on('crash', () => {
      this.browserMessages.push({
        type: 'error',
        text: 'PAGE CRASHED',
        timestamp: new Date().toISOString(),
        source: 'browser',
      });
    });

    // Capture network requests if enabled
    if (this.captureNetwork) {
      const requestTimings = new Map<string, number>();

      page.on('request', (request) => {
        requestTimings.set(request.url(), Date.now());
        this.networkRequests.push({
          url: request.url(),
          method: request.method(),
          timestamp: new Date().toISOString(),
          requestHeaders: request.headers(),
        });
      });

      page.on('response', (response) => {
        const request = response.request();
        const startTime = requestTimings.get(request.url());
        const duration = startTime ? Date.now() - startTime : undefined;

        // Update the network request with response info
        const existingRequest = this.networkRequests.find(
          (r) => r.url === request.url() && !r.status
        );
        if (existingRequest) {
          existingRequest.status = response.status();
          existingRequest.duration = duration;
          existingRequest.responseHeaders = response.headers();
        }
      });

      page.on('requestfailed', (request) => {
        this.browserMessages.push({
          type: 'error',
          text: `NETWORK REQUEST FAILED: ${request.url()} - ${request.failure()?.errorText}`,
          timestamp: new Date().toISOString(),
          source: 'browser',
        });
      });
    }
  }

  /**
   * Add a test marker to both browser console and server logs
   */
  async addTestMarker(page: Page, marker: string): Promise<void> {
    const timestamp = new Date().toISOString();

    // Add to browser console
    await page.evaluate((m) => {
      console.log(`[E2E TEST MARKER] ${m}`);
    }, marker);

    // Add to server logs
    try {
      await page.request.post(`${this.baseUrl}/api/test/server-logs`, {
        data: { marker, testName: this.testName },
      });
    } catch {
      // Server log endpoint may not be available
    }

    this.browserMessages.push({
      type: 'info',
      text: `[E2E TEST MARKER] ${marker}`,
      timestamp,
      source: 'browser',
    });
  }

  /**
   * Fetch server-side console logs
   */
  async fetchServerLogs(page: Page): Promise<ServerLogEntry[]> {
    try {
      const response = await page.request.get(`${this.baseUrl}/api/test/server-logs`);
      if (response.ok()) {
        const data = await response.json();
        return data.logs || [];
      }
    } catch {
      // Server log endpoint may not be available
    }
    return [];
  }

  /**
   * Clear server-side logs
   */
  async clearServerLogs(page: Page): Promise<void> {
    try {
      await page.request.delete(`${this.baseUrl}/api/test/server-logs`);
    } catch {
      // Server log endpoint may not be available
    }
  }

  /**
   * Sync server logs to local capture
   */
  async syncServerLogs(page: Page): Promise<void> {
    const serverLogs = await this.fetchServerLogs(page);
    this.serverMessages = serverLogs.map((log) => ({
      type: log.level,
      text: log.message,
      timestamp: log.timestamp,
      source: 'server' as const,
    }));
  }

  /**
   * Get all captured browser console messages
   */
  getBrowserMessages(): CapturedConsoleMessage[] {
    return this.browserMessages;
  }

  /**
   * Get all captured server console messages
   */
  getServerMessages(): CapturedConsoleMessage[] {
    return this.serverMessages;
  }

  /**
   * Get all captured messages (browser + server)
   */
  getAllMessages(): CapturedConsoleMessage[] {
    return [...this.browserMessages, ...this.serverMessages].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  /**
   * Get network requests
   */
  getNetworkRequests(): CapturedNetworkRequest[] {
    return this.networkRequests;
  }

  /**
   * Get messages filtered by type
   */
  getBrowserMessagesByType(type: CapturedConsoleMessage['type']): CapturedConsoleMessage[] {
    return this.browserMessages.filter(msg => msg.type === type);
  }

  /**
   * Get browser console errors
   */
  getBrowserErrors(): CapturedConsoleMessage[] {
    return this.getBrowserMessagesByType('error');
  }

  /**
   * Get server console errors
   */
  getServerErrors(): CapturedConsoleMessage[] {
    return this.serverMessages.filter(msg => msg.type === 'error');
  }

  /**
   * Get all errors (browser + server)
   */
  getAllErrors(): CapturedConsoleMessage[] {
    return [...this.getBrowserErrors(), ...this.getServerErrors()];
  }

  /**
   * Get browser console warnings
   */
  getBrowserWarnings(): CapturedConsoleMessage[] {
    return this.getBrowserMessagesByType('warn');
  }

  /**
   * Search browser console messages for specific text
   */
  searchBrowserMessages(searchText: string): CapturedConsoleMessage[] {
    return this.browserMessages.filter(msg =>
      msg.text.toLowerCase().includes(searchText.toLowerCase())
    );
  }

  /**
   * Search all messages for specific text
   */
  searchAllMessages(searchText: string): CapturedConsoleMessage[] {
    return this.getAllMessages().filter(msg =>
      msg.text.toLowerCase().includes(searchText.toLowerCase())
    );
  }

  /**
   * Search network requests
   */
  searchNetworkRequests(urlPattern: string): CapturedNetworkRequest[] {
    return this.networkRequests.filter(req =>
      req.url.toLowerCase().includes(urlPattern.toLowerCase())
    );
  }

  /**
   * Get failed network requests
   */
  getFailedRequests(): CapturedNetworkRequest[] {
    return this.networkRequests.filter(req => req.status && req.status >= 400);
  }

  /**
   * Save all captured console output to files
   */
  saveToFile(): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeTestName = this.testName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `${safeTestName}_${timestamp}`;

    // Save browser console
    const browserLogPath = path.join(this.outputDir, `${filename}_browser.json`);
    fs.writeFileSync(
      browserLogPath,
      JSON.stringify(this.browserMessages, null, 2),
      'utf-8'
    );

    // Save human-readable browser console
    const browserReadablePath = path.join(this.outputDir, `${filename}_browser.log`);
    const browserReadable = this.browserMessages
      .map(msg => `[${msg.timestamp}] [${msg.type.toUpperCase()}] ${msg.text}`)
      .join('\n');
    fs.writeFileSync(browserReadablePath, browserReadable, 'utf-8');

    // Save server console if available
    if (this.serverMessages.length > 0) {
      const serverLogPath = path.join(this.outputDir, `${filename}_server.json`);
      fs.writeFileSync(
        serverLogPath,
        JSON.stringify(this.serverMessages, null, 2),
        'utf-8'
      );

      const serverReadablePath = path.join(this.outputDir, `${filename}_server.log`);
      const serverReadable = this.serverMessages
        .map(msg => `[${msg.timestamp}] [${msg.type.toUpperCase()}] ${msg.text}`)
        .join('\n');
      fs.writeFileSync(serverReadablePath, serverReadable, 'utf-8');
    }

    // Save combined console
    const combinedPath = path.join(this.outputDir, `${filename}_combined.log`);
    const combinedReadable = this.getAllMessages()
      .map(msg => `[${msg.timestamp}] [${msg.source?.toUpperCase() || 'UNKNOWN'}] [${msg.type.toUpperCase()}] ${msg.text}`)
      .join('\n');
    fs.writeFileSync(combinedPath, combinedReadable, 'utf-8');

    // Save network requests if captured
    if (this.networkRequests.length > 0) {
      const networkPath = path.join(this.outputDir, `${filename}_network.json`);
      fs.writeFileSync(
        networkPath,
        JSON.stringify(this.networkRequests, null, 2),
        'utf-8'
      );
    }

    // Save error summary if there are errors
    const allErrors = this.getAllErrors();
    if (allErrors.length > 0) {
      const errorSummaryPath = path.join(this.outputDir, `${filename}_errors.log`);
      const errorSummary = [
        `=== ERROR SUMMARY FOR TEST: ${this.testName} ===`,
        `Test Start: ${this.startTime}`,
        `Total Errors: ${allErrors.length}`,
        `Browser Errors: ${this.getBrowserErrors().length}`,
        `Server Errors: ${this.getServerErrors().length}`,
        '',
        ...allErrors.map((err, idx) => `[Error ${idx + 1}] [${err.source?.toUpperCase() || 'UNKNOWN'}] ${err.text}`),
      ].join('\n');
      fs.writeFileSync(errorSummaryPath, errorSummary, 'utf-8');
    }

    // Save test summary
    const summaryPath = path.join(this.outputDir, `${filename}_summary.json`);
    fs.writeFileSync(
      summaryPath,
      JSON.stringify(
        {
          testName: this.testName,
          startTime: this.startTime,
          endTime: new Date().toISOString(),
          stats: this.getStats(),
          networkStats: {
            total: this.networkRequests.length,
            failed: this.getFailedRequests().length,
          },
        },
        null,
        2
      ),
      'utf-8'
    );
  }

  /**
   * Get statistics about captured messages
   */
  getStats(): {
    total: number;
    browser: {
      total: number;
      errors: number;
      warnings: number;
      logs: number;
      info: number;
      debug: number;
    };
    server: {
      total: number;
      errors: number;
      warnings: number;
    };
  } {
    return {
      total: this.browserMessages.length + this.serverMessages.length,
      browser: {
        total: this.browserMessages.length,
        errors: this.getBrowserMessagesByType('error').length,
        warnings: this.getBrowserMessagesByType('warn').length,
        logs: this.getBrowserMessagesByType('log').length,
        info: this.getBrowserMessagesByType('info').length,
        debug: this.getBrowserMessagesByType('debug').length,
      },
      server: {
        total: this.serverMessages.length,
        errors: this.serverMessages.filter(m => m.type === 'error').length,
        warnings: this.serverMessages.filter(m => m.type === 'warn').length,
      },
    };
  }

  /**
   * Assert no console errors were captured (browser only, with filters)
   */
  assertNoErrors(options: { ignoredPatterns?: string[] } = {}): void {
    const ignoredPatterns = options.ignoredPatterns || [
      'ResizeObserver',
      'favicon',
      'source map',
    ];

    const errors = this.getBrowserErrors().filter(err => {
      return !ignoredPatterns.some(pattern =>
        err.text.toLowerCase().includes(pattern.toLowerCase())
      );
    });

    if (errors.length > 0) {
      const errorMessages = errors.map(e => e.text).join('\n');
      throw new Error(`Console errors detected:\n${errorMessages}`);
    }
  }

  /**
   * Assert no console warnings were captured
   */
  assertNoWarnings(): void {
    const warnings = this.getBrowserWarnings();
    if (warnings.length > 0) {
      const warningMessages = warnings.map(w => w.text).join('\n');
      throw new Error(`Console warnings detected:\n${warningMessages}`);
    }
  }

  /**
   * Assert no failed network requests
   */
  assertNoFailedRequests(options: { ignoredStatusCodes?: number[] } = {}): void {
    const ignoredStatusCodes = options.ignoredStatusCodes || [];
    const failed = this.getFailedRequests().filter(
      req => !ignoredStatusCodes.includes(req.status!)
    );

    if (failed.length > 0) {
      const failedMessages = failed
        .map(r => `${r.method} ${r.url} - ${r.status}`)
        .join('\n');
      throw new Error(`Failed network requests:\n${failedMessages}`);
    }
  }

  /**
   * Clear all captured messages
   */
  clear(): void {
    this.browserMessages = [];
    this.serverMessages = [];
    this.networkRequests = [];
  }

  /**
   * Log a message to the capture (useful for test context)
   */
  log(message: string): void {
    const logLine = `[${new Date().toISOString()}] [TEST] ${message}`;
    this.browserMessages.push({
      type: 'info',
      text: logLine,
      timestamp: new Date().toISOString(),
      source: 'browser',
    });
    console.log(logLine);
  }
}

/**
 * Create a console capture instance for a test
 */
export function createConsoleCapture(
  testName: string,
  options?: {
    outputDir?: string;
    baseUrl?: string;
    captureNetwork?: boolean;
  }
): ConsoleCapture {
  return new ConsoleCapture(testName, options);
}
