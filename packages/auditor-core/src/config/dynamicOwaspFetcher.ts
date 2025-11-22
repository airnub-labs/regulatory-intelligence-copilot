/**
 * Dynamic OWASP Category Fetcher
 *
 * Fetches the latest OWASP Top 10 categories from external sources
 * using Perplexity for research and Groq for structuring.
 *
 * Features:
 * - Auto-fetches latest OWASP Top 10 (2021, 2023, etc.)
 * - Caches results with configurable TTL
 * - Falls back to hardcoded defaults on failure
 */

import { callPerplexityMcp, getMcpGatewayUrl } from '../mcpClient.js';
import { groqChat } from '../groqClient.js';
import type { OwaspCategory } from './owaspCategories.js';

// Cache configuration
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedOwaspData {
  categories: OwaspCategory[];
  version: string;
  fetchedAt: number;
}

let cachedData: CachedOwaspData | null = null;

/**
 * Default OWASP categories as fallback
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
 * Fetch the latest OWASP Top 10 from Perplexity
 */
async function fetchOwaspFromPerplexity(): Promise<string> {
  const query = `What is the current latest OWASP Top 10 Web Application Security Risks?

  Please provide:
  1. The version/year (e.g., 2021, 2023)
  2. All 10 categories with their official IDs (A01, A02, etc.)
  3. The full official title of each category
  4. Key security keywords associated with each category

  Format the response clearly with each category's ID, title, and associated keywords.`;

  return await callPerplexityMcp(query);
}

/**
 * Structure raw Perplexity response into OWASP categories using Groq
 */
async function structureOwaspWithGroq(perplexityResponse: string): Promise<{
  version: string;
  categories: Array<{
    id: string;
    title: string;
    keywords: string[];
  }>;
}> {
  const structuringPrompt = `Parse this OWASP Top 10 information and return a structured JSON response.

Input:
${perplexityResponse}

Return JSON in this exact format:
{
  "version": "2021",  // The year/version from the OWASP Top 10
  "categories": [
    {
      "id": "A01:2021",  // Category ID with year
      "title": "Broken Access Control",  // Official title
      "keywords": ["access control", "authorization", "privilege escalation"]  // 3-5 relevant security keywords
    }
    // ... all 10 categories
  ]
}

Important:
- Include all 10 categories
- Use the exact official OWASP titles
- Include practical security keywords that would appear in vulnerability descriptions
- Format IDs as "AXX:YYYY" where XX is the number and YYYY is the year`;

  const response = await groqChat({
    messages: [
      { role: 'system', content: 'You are a JSON parser. Return only valid JSON, no markdown code blocks or explanations.' },
      { role: 'user', content: structuringPrompt },
    ],
    temperature: 0.1,
  });

  // Parse the JSON response
  let jsonStr = response.content.trim();

  // Remove markdown code blocks if present
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  return JSON.parse(jsonStr);
}

/**
 * Convert structured data to OwaspCategory objects with regex patterns
 */
function convertToOwaspCategories(data: {
  version: string;
  categories: Array<{
    id: string;
    title: string;
    keywords: string[];
  }>;
}): OwaspCategory[] {
  return data.categories.map(cat => {
    // Create a regex pattern that matches the ID and title
    const idNum = cat.id.split(':')[0]; // e.g., "A01"
    const titleWords = cat.title.split(/\s+/).slice(0, 3).join('.*'); // First 3 words
    const patternStr = `${idNum}.*${titleWords}`;

    return {
      id: cat.id,
      title: cat.title,
      pattern: new RegExp(patternStr, 'gi'),
      keywords: cat.keywords.map(k => k.toLowerCase()),
    };
  });
}

/**
 * Check if cache is still valid
 */
function isCacheValid(): boolean {
  if (!cachedData) return false;
  return Date.now() - cachedData.fetchedAt < CACHE_TTL_MS;
}

/**
 * Fetch latest OWASP categories dynamically
 *
 * Uses Perplexity to research current OWASP Top 10,
 * Groq to structure the data, and caches the result.
 * Falls back to defaults on any failure.
 */
export async function fetchDynamicOwaspCategories(): Promise<{
  categories: OwaspCategory[];
  version: string;
  source: 'cache' | 'dynamic' | 'fallback';
}> {
  // Return cached data if valid
  if (isCacheValid() && cachedData) {
    return {
      categories: cachedData.categories,
      version: cachedData.version,
      source: 'cache',
    };
  }

  // Check if MCP gateway is configured
  if (!getMcpGatewayUrl()) {
    console.log('[OWASP] MCP gateway not configured, using fallback categories');
    return {
      categories: DEFAULT_OWASP_CATEGORIES,
      version: '2021',
      source: 'fallback',
    };
  }

  try {
    console.log('[OWASP] Fetching latest categories from Perplexity...');
    const perplexityResponse = await fetchOwaspFromPerplexity();

    console.log('[OWASP] Structuring data with Groq...');
    const structuredData = await structureOwaspWithGroq(perplexityResponse);

    const categories = convertToOwaspCategories(structuredData);

    // Update cache
    cachedData = {
      categories,
      version: structuredData.version,
      fetchedAt: Date.now(),
    };

    console.log(`[OWASP] Successfully fetched ${categories.length} categories (version ${structuredData.version})`);

    return {
      categories,
      version: structuredData.version,
      source: 'dynamic',
    };
  } catch (error) {
    console.error('[OWASP] Failed to fetch dynamic categories:', error);
    console.log('[OWASP] Falling back to default categories');

    return {
      categories: DEFAULT_OWASP_CATEGORIES,
      version: '2021',
      source: 'fallback',
    };
  }
}

/**
 * Get current OWASP categories (sync version using cache or defaults)
 */
export function getCurrentOwaspCategories(): OwaspCategory[] {
  if (cachedData) {
    return cachedData.categories;
  }
  return DEFAULT_OWASP_CATEGORIES;
}

/**
 * Get current OWASP version
 */
export function getCurrentOwaspVersion(): string {
  if (cachedData) {
    return cachedData.version;
  }
  return '2021';
}

/**
 * Clear the OWASP cache (useful for testing or forcing refresh)
 */
export function clearOwaspCache(): void {
  cachedData = null;
}

/**
 * Set cache TTL (in milliseconds)
 */
let customTtl = CACHE_TTL_MS;
export function setOwaspCacheTtl(ttlMs: number): void {
  customTtl = ttlMs;
}
