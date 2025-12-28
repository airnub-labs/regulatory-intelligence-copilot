/**
 * Egress Guard - PII and sensitive data sanitization for outbound data
 *
 * This module is the ONLY place where PII sanitization should happen for egress.
 * All data leaving the system (to LLMs, MCP tools, etc.) must pass through here.
 *
 * ## Context-Aware Sanitization
 *
 * Different contexts require different levels of sanitization:
 *
 * - **chat**: Full sanitization for user-facing chat (default)
 * - **calculation**: Conservative sanitization for sandbox/calculation output
 *   - Avoids false positives on regulatory references, version numbers, etc.
 * - **strict**: Most aggressive sanitization for high-security scenarios
 * - **off**: No sanitization (provider allowlist still enforced)
 *
 * ## Two-Layer Sanitization Approach
 *
 * We use two complementary methods to ensure thorough sanitization:
 *
 * ### Layer 1: @redactpii/node (ML-based)
 * - Uses machine learning to detect PII patterns
 * - Good at catching context-dependent PII (names, addresses)
 * - May miss some technical secrets (API keys, JWTs)
 *
 * ### Layer 2: Regex patterns (rule-based)
 * - Catches specific technical patterns (API keys, JWTs, etc.)
 * - More predictable and testable
 * - Complements ML detection for comprehensive coverage
 *
 * ## Usage
 *
 * ```typescript
 * // Sanitize with default context (chat)
 * const safe = sanitizeTextForEgress(userInput);
 *
 * // Sanitize with calculation context (fewer false positives)
 * const safeCalc = sanitizeTextForEgress(output, { context: 'calculation' });
 *
 * // Disable sanitization for specific use case
 * const raw = sanitizeTextForEgress(output, { context: 'off' });
 *
 * // Sanitize an object recursively
 * const safeObj = sanitizeObjectForEgress(userData, { context: 'calculation' });
 * ```
 *
 * ## Adding New Patterns
 *
 * To add a new sensitive pattern, add it to the appropriate pattern array:
 * ```typescript
 * { pattern: /your-regex/g, replacement: '[LABEL]', contexts: ['chat', 'strict'] }
 * ```
 */

import { Redactor } from '@redactpii/node';
import { createLogger, recordEgressGuardScan } from '@reg-copilot/reg-intel-observability';

const logger = createLogger('EgressGuard');

// Create a redactor instance for PII detection
const redactor = new Redactor();
const redactPii = (text: string): string => redactor.redact(text);

/**
 * Sanitization context - determines which patterns are applied
 */
export type SanitizationContext = 'chat' | 'calculation' | 'strict' | 'off';

/**
 * Options for sanitization functions
 */
export interface SanitizationOptions {
  /**
   * Context determines which pattern set to use:
   * - 'chat': Full sanitization (default)
   * - 'calculation': Conservative, avoids false positives on regulatory data
   * - 'strict': Most aggressive sanitization
   * - 'off': No sanitization
   */
  context?: SanitizationContext;

  /**
   * Whether to use ML-based detection (@redactpii/node)
   * Default: true for 'chat' and 'strict', false for 'calculation'
   */
  useMLDetection?: boolean;

  /**
   * Custom patterns to add (in addition to built-in patterns)
   */
  additionalPatterns?: SensitivePattern[];

  /**
   * Patterns to exclude by their replacement label
   * e.g., ['[IP_ADDRESS]', '[IBAN]'] to skip IP and IBAN detection
   */
  excludePatterns?: string[];

  /**
   * Scan type for metrics tracking
   * Helps understand where sanitization is being applied
   */
  scanType?: 'llm_request' | 'llm_response' | 'sandbox_output' | 'agent_output';
}

/**
 * Sensitive pattern definition
 */
export interface SensitivePattern {
  /** Regex pattern to match */
  pattern: RegExp;
  /** Replacement text */
  replacement: string;
  /** Which contexts this pattern applies to */
  contexts: SanitizationContext[];
  /** Description for documentation/logging */
  description?: string;
}

/**
 * Result of sanitization with audit information
 */
export interface SanitizationResult {
  /** Sanitized text */
  text: string;
  /** Whether any redaction was applied */
  redacted: boolean;
  /** List of redaction types applied */
  redactionTypes: string[];
  /** Original text length */
  originalLength: number;
  /** Sanitized text length */
  sanitizedLength: number;
}

/**
 * Regex patterns for detecting sensitive data
 *
 * Each pattern specifies which contexts it applies to:
 * - 'chat': User-facing chat (may have more false positives)
 * - 'calculation': Sandbox/calculation output (conservative)
 * - 'strict': High-security scenarios (aggressive)
 */
const SENSITIVE_PATTERNS: SensitivePattern[] = [
  // ============================================================================
  // HIGH CONFIDENCE PATTERNS (all contexts)
  // These patterns have very low false positive rates
  // ============================================================================

  // Email addresses - high confidence, applies to all contexts
  {
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: '[EMAIL]',
    contexts: ['chat', 'calculation', 'strict'],
    description: 'Email addresses',
  },

  // SSN (US) - exact format XXX-XX-XXXX with hyphens required
  {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[SSN]',
    contexts: ['chat', 'calculation', 'strict'],
    description: 'US Social Security Numbers',
  },

  // Credit card numbers - 16 digits in 4-4-4-4 format
  {
    pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    replacement: '[CREDIT_CARD]',
    contexts: ['chat', 'calculation', 'strict'],
    description: 'Credit card numbers',
  },

  // API keys - Stripe-style sk_live/sk_test patterns
  {
    pattern: /\bsk_live_[a-zA-Z0-9]{20,}\b/g,
    replacement: '[API_KEY]',
    contexts: ['chat', 'calculation', 'strict'],
    description: 'Stripe live API keys',
  },
  {
    pattern: /\bsk_test_[a-zA-Z0-9]{20,}\b/g,
    replacement: '[API_KEY]',
    contexts: ['chat', 'calculation', 'strict'],
    description: 'Stripe test API keys',
  },

  // JWT tokens - very specific format eyJ...eyJ...
  {
    pattern: /\beyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\b/g,
    replacement: '[JWT]',
    contexts: ['chat', 'calculation', 'strict'],
    description: 'JWT tokens',
  },

  // AWS access keys - AKIA followed by exactly 16 uppercase alphanumeric
  {
    pattern: /\bAKIA[A-Z0-9]{16}\b/g,
    replacement: '[AWS_ACCESS_KEY]',
    contexts: ['chat', 'calculation', 'strict'],
    description: 'AWS access keys',
  },

  // Database URLs with credentials - very specific format
  {
    pattern: /\b(?:postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@[^\s"']+/gi,
    replacement: '[DATABASE_URL]',
    contexts: ['chat', 'calculation', 'strict'],
    description: 'Database connection URLs with credentials',
  },

  // ============================================================================
  // MEDIUM CONFIDENCE PATTERNS (chat and strict only)
  // These may have some false positives, skip for calculation context
  // ============================================================================

  // Phone numbers (US format) - requires specific formatting
  {
    pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[PHONE]',
    contexts: ['chat', 'strict'],
    description: 'US phone numbers',
  },

  // Phone numbers (Irish format)
  {
    pattern: /\b(?:\+353|0)[\s-]?\d{2,3}[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g,
    replacement: '[PHONE]',
    contexts: ['chat', 'strict'],
    description: 'Irish phone numbers',
  },

  // PPSN (Irish) - 7 digits + 1-2 letters, but require word boundary
  // More specific: must not be preceded/followed by alphanumeric
  {
    pattern: /\b\d{7}[A-Z]{1,2}\b/g,
    replacement: '[PPSN]',
    contexts: ['chat', 'strict'],
    description: 'Irish Personal Public Service Numbers',
  },

  // IBAN - More specific pattern requiring proper structure
  // 2 letters (country) + 2 digits (check) + 4 alphanum (bank) + account
  {
    pattern: /\b[A-Z]{2}\d{2}[A-Z]{4}\d{7,25}\b/g,
    replacement: '[IBAN]',
    contexts: ['chat', 'strict'],
    description: 'International Bank Account Numbers',
  },

  // IP addresses - ONLY match valid IP ranges (0-255 per octet)
  // This prevents false positives on version numbers like 1.2.3.4
  {
    pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\b/g,
    replacement: '[IP_ADDRESS]',
    contexts: ['chat', 'strict'],
    description: 'IPv4 addresses (valid ranges only)',
  },

  // Generic API key patterns - require context
  {
    pattern: /\bapi[_-]?key\s*[:=]\s*['"]?[a-zA-Z0-9_-]{20,}['"]?/gi,
    replacement: 'api_key: [REDACTED]',
    contexts: ['chat', 'strict'],
    description: 'Generic API keys in assignment context',
  },

  // Passwords in common contexts
  {
    pattern: /\bpassword\s*[:=]\s*['"]?[^\s,}"']{8,}['"]?/gi,
    replacement: 'password: [REDACTED]',
    contexts: ['chat', 'strict'],
    description: 'Passwords in assignment context',
  },

  // Secret keys/tokens
  {
    pattern: /\b(?:SECRET|PRIVATE)[_-]?(?:KEY|TOKEN)\s*[:=]\s*['"]?[a-zA-Z0-9_-]{8,}['"]?/gi,
    replacement: '[SECRET_REDACTED]',
    contexts: ['chat', 'strict'],
    description: 'Secret keys/tokens in assignment context',
  },

  // AWS secret access key
  {
    pattern: /\baws[_-]?secret[_-]?access[_-]?key\s*[:=]\s*['"]?[^\s,}"']+['"]?/gi,
    replacement: 'aws_secret: [REDACTED]',
    contexts: ['chat', 'strict'],
    description: 'AWS secret access keys',
  },

  // ============================================================================
  // STRICT-ONLY PATTERNS
  // These have higher false positive rates, only for strict context
  // ============================================================================

  // Very broad IBAN pattern (may match regulatory codes)
  {
    pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g,
    replacement: '[IBAN_STRICT]',
    contexts: ['strict'],
    description: 'Broad IBAN pattern (strict mode only)',
  },

  // Any IP-like pattern (including version numbers)
  {
    pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    replacement: '[IP_STRICT]',
    contexts: ['strict'],
    description: 'Any IP-like pattern (strict mode only)',
  },
];

/**
 * Get patterns for a specific context
 */
function getPatternsForContext(
  context: SanitizationContext,
  options?: SanitizationOptions
): SensitivePattern[] {
  if (context === 'off') {
    return [];
  }

  let patterns = SENSITIVE_PATTERNS.filter(p => p.contexts.includes(context));

  // Add any additional patterns
  if (options?.additionalPatterns) {
    patterns = [...patterns, ...options.additionalPatterns.filter(p => p.contexts.includes(context))];
  }

  // Exclude specific patterns
  if (options?.excludePatterns && options.excludePatterns.length > 0) {
    patterns = patterns.filter(p => !options.excludePatterns!.includes(p.replacement));
  }

  return patterns;
}

/**
 * Determine if ML detection should be used for a context
 */
function shouldUseMLDetection(context: SanitizationContext, options?: SanitizationOptions): boolean {
  // Explicit override
  if (options?.useMLDetection !== undefined) {
    return options.useMLDetection;
  }

  // Default based on context
  switch (context) {
    case 'chat':
    case 'strict':
      return true;
    case 'calculation':
      return false; // ML detection can have false positives on numbers
    case 'off':
      return false;
  }
}

/**
 * Sanitize text for egress - removes PII and sensitive data
 *
 * @param text - Text to sanitize
 * @param options - Sanitization options including context
 * @returns Sanitized text
 */
export function sanitizeTextForEgress(
  text: string,
  options?: SanitizationOptions
): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const context = options?.context ?? 'chat';

  // If off, return unchanged
  if (context === 'off') {
    return text;
  }

  let sanitized = text;

  // Apply @redactpii/node first if enabled for this context
  if (shouldUseMLDetection(context, options)) {
    try {
      sanitized = redactPii(sanitized);
    } catch {
      // Continue with pattern-based redaction
    }
  }

  // Apply pattern-based redaction
  const patterns = getPatternsForContext(context, options);
  for (const { pattern, replacement } of patterns) {
    // Reset regex lastIndex to ensure fresh matching
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, replacement);
  }

  return sanitized;
}

/**
 * Sanitize text and return detailed result with audit information
 *
 * @param text - Text to sanitize
 * @param options - Sanitization options including context
 * @returns Sanitization result with audit trail
 */
export function sanitizeTextWithAudit(
  text: string,
  options?: SanitizationOptions
): SanitizationResult {
  if (!text || typeof text !== 'string') {
    return {
      text: '',
      redacted: false,
      redactionTypes: [],
      originalLength: 0,
      sanitizedLength: 0,
    };
  }

  const context = options?.context ?? 'chat';
  const redactionTypes: string[] = [];

  logger.debug({
    context,
    textLength: text.length,
    useMLDetection: shouldUseMLDetection(context, options),
    patternCount: getPatternsForContext(context, options).length,
  }, 'Starting PII sanitization');

  // If off, return unchanged
  if (context === 'off') {
    logger.debug('Sanitization context is OFF, skipping');
    return {
      text,
      redacted: false,
      redactionTypes: [],
      originalLength: text.length,
      sanitizedLength: text.length,
    };
  }

  let sanitized = text;

  // Apply @redactpii/node first if enabled
  if (shouldUseMLDetection(context, options)) {
    try {
      const mlSanitized = redactPii(sanitized);
      if (mlSanitized !== sanitized) {
        redactionTypes.push('[ML_REDACTION]');
        sanitized = mlSanitized;
        logger.debug({
          context,
          originalLength: text.length,
          sanitizedLength: sanitized.length,
        }, 'ML-based PII redaction applied');
      }
    } catch (error) {
      logger.debug({
        context,
        error: error instanceof Error ? error.message : String(error),
      }, 'ML-based PII redaction failed, continuing with pattern-based');
      // Continue with pattern-based redaction
    }
  }

  // Apply pattern-based redaction and track what was redacted
  const patterns = getPatternsForContext(context, options);
  for (const { pattern, replacement, description } of patterns) {
    pattern.lastIndex = 0;
    const beforePattern = sanitized;
    sanitized = sanitized.replace(pattern, replacement);
    if (sanitized !== beforePattern && !redactionTypes.includes(replacement)) {
      redactionTypes.push(replacement);
      logger.debug({
        context,
        replacement,
        description,
      }, 'Pattern-based redaction applied');
    }
  }

  const result = {
    text: sanitized,
    redacted: redactionTypes.length > 0,
    redactionTypes,
    originalLength: text.length,
    sanitizedLength: sanitized.length,
  };

  logger.debug({
    context,
    redacted: result.redacted,
    redactionTypes,
    originalLength: result.originalLength,
    sanitizedLength: result.sanitizedLength,
    reductionBytes: result.originalLength - result.sanitizedLength,
  }, 'PII sanitization completed');

  // Record metrics for egress guard operations
  if (options?.scanType) {
    recordEgressGuardScan({
      scanType: options.scanType,
      blocked: result.redacted,
      piiDetected: result.redacted,
      sensitiveDataTypes: result.redactionTypes,
    });
  }

  return result;
}

/**
 * Sanitize an object by recursively sanitizing all string values
 *
 * @param obj - Object to sanitize
 * @param options - Sanitization options including context
 * @returns Sanitized object
 */
export function sanitizeObjectForEgress<T>(
  obj: T,
  options?: SanitizationOptions
): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // If off, return unchanged
  if (options?.context === 'off') {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeTextForEgress(obj, options) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObjectForEgress(item, options)) as T;
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeObjectForEgress(value, options);
    }
    return result as T;
  }

  // Numbers, booleans, etc. pass through unchanged
  return obj;
}

/**
 * List of sensitive headers that should be completely removed or masked
 */
export const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
  'x-csrf-token',
  'x-xsrf-token',
  'proxy-authorization',
  'www-authenticate',
];

/**
 * Check if a header name is sensitive
 */
export function isSensitiveHeader(headerName: string): boolean {
  return SENSITIVE_HEADERS.includes(headerName.toLowerCase());
}

/**
 * Create a pre-configured sanitizer for a specific context
 * Useful for creating reusable sanitizers with fixed options
 */
export function createSanitizer(defaultOptions: SanitizationOptions) {
  return {
    sanitizeText: (text: string, overrideOptions?: Partial<SanitizationOptions>) =>
      sanitizeTextForEgress(text, { ...defaultOptions, ...overrideOptions }),

    sanitizeTextWithAudit: (text: string, overrideOptions?: Partial<SanitizationOptions>) =>
      sanitizeTextWithAudit(text, { ...defaultOptions, ...overrideOptions }),

    sanitizeObject: <T>(obj: T, overrideOptions?: Partial<SanitizationOptions>) =>
      sanitizeObjectForEgress(obj, { ...defaultOptions, ...overrideOptions }),
  };
}

/**
 * Pre-configured sanitizers for common contexts
 */
export const Sanitizers = {
  /** Full sanitization for user-facing chat */
  chat: createSanitizer({ context: 'chat' }),

  /** Conservative sanitization for sandbox/calculation output */
  calculation: createSanitizer({ context: 'calculation', useMLDetection: false }),

  /** Most aggressive sanitization */
  strict: createSanitizer({ context: 'strict' }),

  /** No sanitization (passthrough) */
  off: createSanitizer({ context: 'off' }),
};

// Export pattern definitions for testing/documentation
export { SENSITIVE_PATTERNS };
