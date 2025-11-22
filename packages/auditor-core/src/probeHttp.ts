/**
 * HTTP probing module - runs inside E2B sandbox to probe endpoints
 */

import type { SandboxHandle } from './e2bClient.js';
import type { RawHttpExchange } from './types.js';
import { runInSandbox } from './e2bClient.js';

// Endpoints to probe
const ENDPOINTS = [
  { method: 'GET', path: '/health-perfect' },
  { method: 'GET', path: '/user-leaky' },
  { method: 'GET', path: '/debug-error' },
  { method: 'POST', path: '/items-injection', body: { name: "test'; DROP TABLE users;--", query: "1=1" } },
  { method: 'GET', path: '/cors-wildcard' },
];

/**
 * Probe sample API endpoints inside the sandbox
 */
export async function probeSampleApi(handle: SandboxHandle): Promise<RawHttpExchange[]> {
  console.log(`[Probe] Testing ${ENDPOINTS.length} endpoints inside sandbox...`);
  ENDPOINTS.forEach(ep => console.log(`[Probe]   → ${ep.method} ${ep.path}`));
  const probeCode = `
    const results = [];
    const baseUrl = 'http://localhost:3001';

    const endpoints = ${JSON.stringify(ENDPOINTS)};

    for (const endpoint of endpoints) {
      try {
        const url = baseUrl + endpoint.path;
        const options = {
          method: endpoint.method,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'E2B-RFC-Auditor/1.0',
          },
        };

        if (endpoint.body) {
          options.body = JSON.stringify(endpoint.body);
        }

        const response = await fetch(url, options);
        const responseBody = await response.text();
        const responseHeaders = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        results.push({
          request: {
            method: endpoint.method,
            url: url,
            httpVersion: '1.1',
            headers: options.headers,
            body: endpoint.body ? JSON.stringify(endpoint.body) : '',
          },
          response: {
            httpVersion: '1.1',
            statusCode: response.status,
            statusMessage: response.statusText,
            headers: responseHeaders,
            body: responseBody,
          },
        });
      } catch (error) {
        results.push({
          request: {
            method: endpoint.method,
            url: 'http://localhost:3001' + endpoint.path,
            httpVersion: '1.1',
            headers: {},
            body: '',
          },
          response: {
            httpVersion: '1.1',
            statusCode: 0,
            statusMessage: 'Error: ' + error.message,
            headers: {},
            body: '',
          },
        });
      }
    }

    return results;
  `;

  const results = await runInSandbox<RawHttpExchange[]>(handle, probeCode);
  return results || [];
}

/**
 * Probe a single endpoint
 */
export async function probeSingleEndpoint(
  handle: SandboxHandle,
  method: string,
  path: string,
  body?: unknown
): Promise<RawHttpExchange> {
  const probeCode = `
    const url = 'http://localhost:3001${path}';
    const options = {
      method: '${method}',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'E2B-RFC-Auditor/1.0',
      },
    };

    ${body ? `options.body = JSON.stringify(${JSON.stringify(body)});` : ''}

    const response = await fetch(url, options);
    const responseBody = await response.text();
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      request: {
        method: '${method}',
        url: url,
        httpVersion: '1.1',
        headers: options.headers,
        body: ${body ? JSON.stringify(JSON.stringify(body)) : "''"},
      },
      response: {
        httpVersion: '1.1',
        statusCode: response.status,
        statusMessage: response.statusText,
        headers: responseHeaders,
        body: responseBody,
      },
    };
  `;

  return runInSandbox<RawHttpExchange>(handle, probeCode);
}
