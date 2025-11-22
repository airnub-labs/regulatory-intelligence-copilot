/**
 * OWASP Top 10 category definitions
 *
 * This module provides both static defaults and dynamic fetching of OWASP categories.
 * The dynamic fetcher uses Perplexity + Groq to always get the latest OWASP Top 10.
 *
 * @see https://owasp.org/Top10/
 */

import {
  fetchDynamicOwaspCategories,
  getCurrentOwaspCategories,
  getCurrentOwaspVersion,
  clearOwaspCache,
  setOwaspCacheTtl,
} from './dynamicOwaspFetcher.js';

export interface OwaspCategory {
  /** OWASP category ID (e.g., 'A01:2021') */
  id: string;
  /** Human-readable title */
  title: string;
  /** Regex pattern to detect mentions in text */
  pattern: RegExp;
  /** Alternative keywords that indicate this category */
  keywords: string[];
}

/**
 * Default OWASP Top 10:2021 categories (fallback)
 */
const DEFAULT_OWASP_CATEGORIES: OwaspCategory[] = [
  {
    id: 'A01:2021',
    title: 'Broken Access Control',
    pattern: /A01.*Broken Access Control/gi,
    keywords: ['access control', 'authorization', 'privilege escalation'],
  },
  {
    id: 'A02:2021',
    title: 'Cryptographic Failures',
    pattern: /A02.*Cryptographic Failures/gi,
    keywords: ['cryptographic', 'encryption', 'sensitive data', 'pii', 'data exposure'],
  },
  {
    id: 'A03:2021',
    title: 'Injection',
    pattern: /A03.*Injection/gi,
    keywords: ['injection', 'sql injection', 'xss', 'command injection'],
  },
  {
    id: 'A04:2021',
    title: 'Insecure Design',
    pattern: /A04.*Insecure Design/gi,
    keywords: ['insecure design', 'threat modeling', 'secure design'],
  },
  {
    id: 'A05:2021',
    title: 'Security Misconfiguration',
    pattern: /A05.*Security Misconfiguration/gi,
    keywords: ['misconfiguration', 'cors', 'cross-origin', 'default credentials'],
  },
  {
    id: 'A06:2021',
    title: 'Vulnerable and Outdated Components',
    pattern: /A06.*Vulnerable.*Components/gi,
    keywords: ['vulnerable components', 'outdated', 'dependencies'],
  },
  {
    id: 'A07:2021',
    title: 'Identification and Authentication Failures',
    pattern: /A07.*Authentication/gi,
    keywords: ['authentication', 'session', 'credential', 'identity'],
  },
  {
    id: 'A08:2021',
    title: 'Software and Data Integrity Failures',
    pattern: /A08.*Software.*Data Integrity/gi,
    keywords: ['integrity', 'deserialization', 'ci/cd'],
  },
  {
    id: 'A09:2021',
    title: 'Security Logging and Monitoring Failures',
    pattern: /A09.*Security Logging/gi,
    keywords: ['logging', 'monitoring', 'audit trail'],
  },
  {
    id: 'A10:2021',
    title: 'Server-Side Request Forgery',
    pattern: /A10.*Server-Side Request Forgery/gi,
    keywords: ['ssrf', 'server-side request forgery'],
  },
];

/**
 * Get OWASP categories (uses cached dynamic data or defaults)
 *
 * This is a synchronous getter that returns currently loaded categories.
 * For initial load or refresh, use initializeOwaspCategories() or refreshOwaspCategories().
 */
export function getOwaspCategories(): OwaspCategory[] {
  return getCurrentOwaspCategories();
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use getOwaspCategories() for dynamic categories
 */
export const OWASP_CATEGORIES: OwaspCategory[] = DEFAULT_OWASP_CATEGORIES;

/**
 * Initialize OWASP categories by fetching the latest from external sources
 *
 * Should be called once at application startup or when MCP gateway is configured.
 * Returns the fetched categories and their version.
 */
export async function initializeOwaspCategories(): Promise<{
  categories: OwaspCategory[];
  version: string;
  source: 'cache' | 'dynamic' | 'fallback';
}> {
  return fetchDynamicOwaspCategories();
}

/**
 * Refresh OWASP categories (clears cache and fetches fresh data)
 */
export async function refreshOwaspCategories(): Promise<{
  categories: OwaspCategory[];
  version: string;
  source: 'cache' | 'dynamic' | 'fallback';
}> {
  clearOwaspCache();
  return fetchDynamicOwaspCategories();
}

/**
 * Get current OWASP version
 */
export function getOwaspVersion(): string {
  return getCurrentOwaspVersion();
}

/**
 * Configure OWASP cache TTL
 */
export function configureOwaspCacheTtl(ttlMs: number): void {
  setOwaspCacheTtl(ttlMs);
}

// Re-export cache utilities
export { clearOwaspCache };

/**
 * Find OWASP category by ID
 */
export function findOwaspCategoryById(id: string): OwaspCategory | undefined {
  return getOwaspCategories().find(cat => cat.id === id);
}

/**
 * Find OWASP categories by keyword match
 */
export function findOwaspCategoriesByKeyword(text: string): OwaspCategory[] {
  const lowerText = text.toLowerCase();
  return getOwaspCategories().filter(cat =>
    cat.keywords.some(keyword => lowerText.includes(keyword))
  );
}

/**
 * Check if text matches any OWASP category pattern
 */
export function matchOwaspCategories(text: string): OwaspCategory[] {
  return getOwaspCategories().filter(cat => cat.pattern.test(text));
}
