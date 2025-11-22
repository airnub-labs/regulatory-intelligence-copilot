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
 * Empty array - categories must be fetched dynamically via initializeOwaspCategories()
 * This ensures we always use the latest OWASP data and never stale hardcoded values.
 */
const EMPTY_CATEGORIES: OwaspCategory[] = [];

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
 * @deprecated Use getOwaspCategories() after calling initializeOwaspCategories()
 */
export const OWASP_CATEGORIES: OwaspCategory[] = EMPTY_CATEGORIES;

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
