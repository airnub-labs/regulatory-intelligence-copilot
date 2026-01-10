/**
 * Server Console Capture API for E2E Tests
 *
 * This endpoint allows E2E tests to capture server-side console output.
 * Only available in test/development environments.
 *
 * Usage:
 * - GET /api/test/server-logs - Get captured logs
 * - DELETE /api/test/server-logs - Clear captured logs
 */

import { NextResponse } from 'next/server';

// In-memory log storage (only for test environment)
const serverLogs: Array<{
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
  data?: unknown;
}> = [];

// Maximum logs to keep in memory
const MAX_LOGS = 1000;

// Intercept console methods to capture server output
// Only in test environment to avoid production impact
if (process.env.NODE_ENV !== 'production' && process.env.E2E_TEST_MODE === 'true') {
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  const captureLog = (level: keyof typeof originalConsole) => {
    return (...args: unknown[]) => {
      // Call original
      originalConsole[level](...args);

      // Capture log
      const message = args
        .map(arg => {
          if (typeof arg === 'string') return arg;
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        })
        .join(' ');

      serverLogs.push({
        level,
        message,
        timestamp: new Date().toISOString(),
        data: args.length > 1 ? args.slice(1) : undefined,
      });

      // Trim if too many logs
      if (serverLogs.length > MAX_LOGS) {
        serverLogs.splice(0, serverLogs.length - MAX_LOGS);
      }
    };
  };

  // Override console methods
  console.log = captureLog('log');
  console.info = captureLog('info');
  console.warn = captureLog('warn');
  console.error = captureLog('error');
  console.debug = captureLog('debug');
}

export async function GET() {
  // Only allow in test/development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 403 }
    );
  }

  const response = {
    logs: [...serverLogs],
    count: serverLogs.length,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(response);
}

export async function DELETE() {
  // Only allow in test/development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 403 }
    );
  }

  const clearedCount = serverLogs.length;
  serverLogs.length = 0;

  return NextResponse.json({
    cleared: clearedCount,
    timestamp: new Date().toISOString(),
  });
}

// POST - Allow tests to add markers to the log
export async function POST(request: Request) {
  // Only allow in test/development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { marker, testName } = body;

  serverLogs.push({
    level: 'info',
    message: `[E2E TEST MARKER] ${marker || 'Test marker'} - Test: ${testName || 'Unknown'}`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    success: true,
    marker,
    timestamp: new Date().toISOString(),
  });
}
