const SENSITIVE_PATTERNS = [
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL]' },
  { pattern: /(\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, replacement: '[PHONE]' },
  { pattern: /(\+353|0)[\s-]?\d{2,3}[\s-]?\d{3,4}[\s-]?\d{3,4}/g, replacement: '[PHONE]' },
  { pattern: /\d{3}-\d{2}-\d{4}/g, replacement: '[SSN]' },
  { pattern: /\d{7}[A-Z]{1,2}/g, replacement: '[PPSN]' },
  { pattern: /[A-Z]{2}\d{2}[A-Z0-9]{4,30}/g, replacement: '[IBAN]' },
  { pattern: /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g, replacement: '[CREDIT_CARD]' },
  { pattern: /sk_live_[a-zA-Z0-9]+/g, replacement: '[API_KEY]' },
  { pattern: /sk_test_[a-zA-Z0-9]+/g, replacement: '[API_KEY]' },
  { pattern: /api[_-]?key['":\s]*[a-zA-Z0-9_-]{20,}/gi, replacement: '[API_KEY]' },
  { pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, replacement: '[JWT]' },
  { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '[IP_ADDRESS]' },
  { pattern: /password['":\s]*[^\s,}"']+/gi, replacement: 'password: [REDACTED]' },
  { pattern: /(?:postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@[^\s"']+/gi, replacement: '[DATABASE_URL]' },
  { pattern: /(?:SECRET|PRIVATE)[_-]?(?:KEY|TOKEN)?['":\s]*[a-zA-Z0-9_-]{8,}/gi, replacement: '[SECRET_REDACTED]' },
  { pattern: /AKIA[A-Z0-9]{16}/g, replacement: '[AWS_ACCESS_KEY]' },
  { pattern: /aws[_-]?secret[_-]?access[_-]?key['":\s]*[^\s,}"']+/gi, replacement: 'aws_secret: [REDACTED]' },
];

export function sanitizeTextForEgress(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return SENSITIVE_PATTERNS.reduce(
    (sanitized, { pattern, replacement }) => sanitized.replace(pattern, replacement),
    text
  );
}

export function sanitizeObjectForEgress<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeTextForEgress(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObjectForEgress(item)) as T;
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeObjectForEgress(value);
    }
    return result as T;
  }

  return obj;
}
