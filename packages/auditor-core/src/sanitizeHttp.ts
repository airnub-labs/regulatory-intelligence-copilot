/**
 * HTTP sanitization module - converts RawHttpExchange to SanitizedHttpExchange
 */

import type { RawHttpExchange, SanitizedHttpExchange } from './types.js';
import { sanitizeTextForEgress, isSensitiveHeader } from './aspects/egressGuard.js';

/**
 * Detect body content type
 */
function detectBodyKind(body: string, contentType?: string): SanitizedHttpExchange['request']['bodyKind'] {
  if (!body || body.trim() === '') {
    return 'empty';
  }

  const ct = contentType?.toLowerCase() || '';

  if (ct.includes('application/json') || body.trim().startsWith('{') || body.trim().startsWith('[')) {
    try {
      JSON.parse(body);
      return 'json';
    } catch {
      // Not valid JSON
    }
  }

  if (ct.includes('text/html') || body.includes('<html') || body.includes('<!DOCTYPE')) {
    return 'html';
  }

  if (ct.includes('text/') || /^[\x20-\x7E\s]+$/.test(body.slice(0, 1000))) {
    return 'text';
  }

  return 'unknown';
}

/**
 * Normalize URL by templating path segments that look like IDs
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Replace numeric segments with {id}
    const pathSegments = parsed.pathname.split('/').map(segment => {
      // UUID pattern
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
        return '{uuid}';
      }
      // Numeric ID
      if (/^\d+$/.test(segment)) {
        return '{id}';
      }
      // Alphanumeric ID (common patterns)
      if (/^[a-zA-Z]{2,4}_[a-zA-Z0-9]{10,}$/.test(segment)) {
        return '{resourceId}';
      }
      return segment;
    });

    parsed.pathname = pathSegments.join('/');

    // Return just the path without host for internal APIs
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}

/**
 * Create a safe body preview
 */
function createBodyPreview(body: string, maxLength: number = 200): string {
  if (!body || body.trim() === '') {
    return '';
  }

  // Truncate first
  let preview = body.slice(0, maxLength);
  if (body.length > maxLength) {
    preview += '...';
  }

  // Sanitize PII
  return sanitizeTextForEgress(preview);
}

/**
 * Sanitize a single HTTP exchange
 */
export function sanitizeHttpExchange(raw: RawHttpExchange): SanitizedHttpExchange {
  const requestContentType = raw.request.headers['content-type'] || raw.request.headers['Content-Type'];
  const responseContentType = raw.response.headers['content-type'] || raw.response.headers['Content-Type'];

  // Get non-sensitive header names only
  const requestHeaderNames = Object.keys(raw.request.headers)
    .filter(name => !isSensitiveHeader(name));

  const responseHeaderNames = Object.keys(raw.response.headers)
    .filter(name => !isSensitiveHeader(name));

  return {
    request: {
      method: raw.request.method,
      urlTemplate: normalizeUrl(raw.request.url),
      httpVersion: raw.request.httpVersion,
      headerNames: requestHeaderNames,
      bodyKind: detectBodyKind(raw.request.body, requestContentType),
      bodyPreview: createBodyPreview(raw.request.body),
    },
    response: {
      httpVersion: raw.response.httpVersion,
      statusCode: raw.response.statusCode,
      statusMessage: raw.response.statusMessage,
      headerNames: responseHeaderNames,
      bodyKind: detectBodyKind(raw.response.body, responseContentType),
      bodyPreview: createBodyPreview(raw.response.body),
    },
  };
}

/**
 * Sanitize multiple HTTP exchanges
 */
export function sanitizeHttpExchanges(raw: RawHttpExchange[]): SanitizedHttpExchange[] {
  console.log(`[Sanitize] Processing ${raw.length} exchanges through egress guard...`);
  console.log('[Sanitize] Redacting PII: SSNs, credit cards, API keys, passwords, emails...');
  const result = raw.map(sanitizeHttpExchange);
  console.log(`[Sanitize] ${result.length} exchanges sanitized - safe for external APIs`);
  return result;
}
