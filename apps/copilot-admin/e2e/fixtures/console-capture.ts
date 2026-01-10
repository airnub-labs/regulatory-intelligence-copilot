/**
 * Console capture utilities for Copilot Admin E2E tests
 *
 * Captures browser console output and network requests for debugging.
 */

import type { Page, ConsoleMessage, Request, Response } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export interface CapturedConsoleMessage {
  type: string;
  text: string;
  location?: string;
  timestamp: string;
}

export interface CapturedNetworkRequest {
  url: string;
  method: string;
  status?: number;
  timing?: number;
  timestamp: string;
  resourceType: string;
  failure?: string;
}

export class ConsoleCapture {
  private testName: string;
  private consoleMessages: CapturedConsoleMessage[] = [];
  private networkRequests: CapturedNetworkRequest[] = [];
  private customLogs: string[] = [];
  private startTime: number = Date.now();

  constructor(testName: string) {
    this.testName = testName;
  }

  /**
   * Start capturing console output from the page
   */
  startCapture(page: Page): void {
    this.startTime = Date.now();
    this.consoleMessages = [];
    this.networkRequests = [];
    this.customLogs = [];

    // Capture console messages
    page.on('console', (message: ConsoleMessage) => {
      this.consoleMessages.push({
        type: message.type(),
        text: message.text(),
        location: message.location()?.url,
        timestamp: new Date().toISOString(),
      });
    });

    // Capture network requests
    page.on('request', (request: Request) => {
      this.networkRequests.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        timestamp: new Date().toISOString(),
      });
    });

    // Capture network responses
    page.on('response', (response: Response) => {
      const request = response.request();
      const existingRequest = this.networkRequests.find(
        (r) => r.url === request.url() && r.method === request.method() && !r.status
      );
      if (existingRequest) {
        existingRequest.status = response.status();
        existingRequest.timing = Date.now() - this.startTime;
      }
    });

    // Capture request failures
    page.on('requestfailed', (request: Request) => {
      const existingRequest = this.networkRequests.find(
        (r) => r.url === request.url() && r.method === request.method() && !r.status
      );
      if (existingRequest) {
        existingRequest.failure = request.failure()?.errorText || 'Unknown failure';
      }
    });
  }

  /**
   * Add a custom log entry
   */
  log(message: string): void {
    this.customLogs.push(`[${new Date().toISOString()}] ${message}`);
  }

  /**
   * Get all console errors
   */
  getErrors(): CapturedConsoleMessage[] {
    return this.consoleMessages.filter((m) => m.type === 'error');
  }

  /**
   * Get all console warnings
   */
  getWarnings(): CapturedConsoleMessage[] {
    return this.consoleMessages.filter((m) => m.type === 'warning');
  }

  /**
   * Get failed network requests
   */
  getFailedRequests(): CapturedNetworkRequest[] {
    return this.networkRequests.filter(
      (r) => r.failure || (r.status && r.status >= 400)
    );
  }

  /**
   * Get API requests (fetch/XHR)
   */
  getApiRequests(): CapturedNetworkRequest[] {
    return this.networkRequests.filter(
      (r) => r.resourceType === 'fetch' || r.resourceType === 'xhr'
    );
  }

  /**
   * Save captured data to file for debugging
   */
  saveToFile(): void {
    const resultsDir = path.join(process.cwd(), 'playwright-results', 'console');

    // Ensure directory exists
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    const filename = `${this.testName.replace(/[^a-zA-Z0-9-_]/g, '_')}-${Date.now()}.json`;
    const filepath = path.join(resultsDir, filename);

    const data = {
      testName: this.testName,
      startTime: new Date(this.startTime).toISOString(),
      endTime: new Date().toISOString(),
      duration: Date.now() - this.startTime,
      consoleMessages: this.consoleMessages,
      networkRequests: this.networkRequests,
      customLogs: this.customLogs,
      summary: {
        totalConsoleMessages: this.consoleMessages.length,
        errors: this.getErrors().length,
        warnings: this.getWarnings().length,
        totalNetworkRequests: this.networkRequests.length,
        failedRequests: this.getFailedRequests().length,
        apiRequests: this.getApiRequests().length,
      },
    };

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`Console capture saved to: ${filepath}`);
  }

  /**
   * Get summary of captured data
   */
  getSummary(): {
    errors: number;
    warnings: number;
    failedRequests: number;
    apiCalls: number;
  } {
    return {
      errors: this.getErrors().length,
      warnings: this.getWarnings().length,
      failedRequests: this.getFailedRequests().length,
      apiCalls: this.getApiRequests().length,
    };
  }

  /**
   * Check if there are any console errors (useful for assertions)
   */
  hasErrors(): boolean {
    return this.getErrors().length > 0;
  }

  /**
   * Get all captured console messages
   */
  getMessages(): CapturedConsoleMessage[] {
    return [...this.consoleMessages];
  }

  /**
   * Get all captured network requests
   */
  getRequests(): CapturedNetworkRequest[] {
    return [...this.networkRequests];
  }

  /**
   * Get all custom logs
   */
  getLogs(): string[] {
    return [...this.customLogs];
  }
}

/**
 * Factory function to create a new ConsoleCapture instance
 */
export function createConsoleCapture(testName: string): ConsoleCapture {
  return new ConsoleCapture(testName);
}
