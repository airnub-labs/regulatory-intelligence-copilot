/**
 * Integration tests for EgressGuard end-to-end flow
 *
 * These tests verify that PII is properly sanitized at all egress points:
 * 1. LLM responses (both streaming and non-streaming)
 * 2. Sandbox code execution output (stdout, stderr, results)
 * 3. The full flow through LlmRouter
 *
 * Additionally, tests verify that false positives are avoided:
 * - Version numbers should not be misidentified as IP addresses
 * - Regulatory reference codes should not be corrupted
 * - Calculation results should pass through unchanged
 *
 * Note: The @redactpii/node library uses uppercase labels like EMAIL_ADDRESS,
 * PHONE_NUMBER, etc., while our regex patterns use bracketed labels like [EMAIL].
 * Tests check that the original PII is removed, regardless of which sanitizer caught it.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  sanitizeTextForEgress,
  sanitizeObjectForEgress,
  sanitizeTextWithAudit,
  Sanitizers,
  type SanitizationContext,
} from '../egressGuard.js';
import {
  executeCode,
  executeAnalysis,
  type E2BSandbox,
  type E2BExecutionResult,
} from '../tools/codeExecutionTools.js';

describe('EgressGuard Integration', () => {
  describe('LLM Response Sanitization', () => {
    it('should sanitize email addresses in LLM responses', () => {
      const response = 'Please contact john.doe@example.com for more information.';
      const sanitized = sanitizeTextForEgress(response);
      expect(sanitized).not.toContain('john.doe@example.com');
      // Check that some form of redaction occurred (either EMAIL_ADDRESS or [EMAIL])
      expect(sanitized.includes('EMAIL') || sanitized.includes('[EMAIL]')).toBe(true);
    });

    it('should sanitize phone numbers in LLM responses', () => {
      const response = 'Call us at +1-555-123-4567 or 555.987.6543';
      const sanitized = sanitizeTextForEgress(response);
      expect(sanitized).not.toContain('555-123-4567');
      expect(sanitized).not.toContain('555.987.6543');
      // Check that some form of redaction occurred
      expect(sanitized.includes('PHONE') || sanitized.includes('[PHONE]')).toBe(true);
    });

    it('should sanitize SSN in LLM responses', () => {
      const response = 'Your SSN 123-45-6789 has been recorded.';
      const sanitized = sanitizeTextForEgress(response);
      expect(sanitized).not.toContain('123-45-6789');
      // Check that some form of redaction occurred
      expect(sanitized.includes('SOCIAL_SECURITY') || sanitized.includes('[SSN]')).toBe(true);
    });

    it('should sanitize Irish PPSN in LLM responses', () => {
      const response = 'Your PPSN is 1234567AB.';
      const sanitized = sanitizeTextForEgress(response);
      expect(sanitized).not.toContain('1234567AB');
      expect(sanitized.includes('[PPSN]')).toBe(true);
    });

    it('should sanitize credit card numbers in LLM responses', () => {
      const response = 'Your card 4111-2222-3333-4444 has been charged.';
      const sanitized = sanitizeTextForEgress(response);
      expect(sanitized).not.toContain('4111-2222-3333-4444');
      // Check that some form of redaction occurred
      expect(sanitized.includes('CREDIT_CARD') || sanitized.includes('[CREDIT_CARD]')).toBe(true);
    });

    it('should sanitize API keys in LLM responses', () => {
      // Use a fake key pattern that won't trigger GitHub push protection
      const fakeKey = 'sk_live_' + 'x'.repeat(24);
      const response = `Your API key is ${fakeKey}`;
      const sanitized = sanitizeTextForEgress(response);
      expect(sanitized).not.toContain(fakeKey);
      expect(sanitized.includes('[API_KEY]')).toBe(true);
    });

    it('should sanitize JWT tokens in LLM responses', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const response = `Your token is ${jwt}`;
      const sanitized = sanitizeTextForEgress(response);
      expect(sanitized).not.toContain(jwt);
      expect(sanitized.includes('[JWT]')).toBe(true);
    });

    it('should handle empty and null inputs gracefully', () => {
      expect(sanitizeTextForEgress('')).toBe('');
      expect(sanitizeTextForEgress(null as unknown as string)).toBe('');
      expect(sanitizeTextForEgress(undefined as unknown as string)).toBe('');
    });
  });

  describe('Object Sanitization', () => {
    it('should sanitize nested objects', () => {
      const obj = {
        user: {
          email: 'test@example.com',
          phone: '+1-555-123-4567',
          details: {
            ssn: '123-45-6789',
          },
        },
        metadata: {
          notes: 'Contact at user@domain.com',
        },
      };

      const sanitized = sanitizeObjectForEgress(obj);
      const sanitizedStr = JSON.stringify(sanitized);

      expect(sanitizedStr).not.toContain('test@example.com');
      expect(sanitizedStr).not.toContain('555-123-4567');
      expect(sanitizedStr).not.toContain('123-45-6789');
      expect(sanitizedStr).not.toContain('user@domain.com');
      // Check that redaction occurred
      expect(sanitizedStr.includes('EMAIL') || sanitizedStr.includes('[EMAIL]')).toBe(true);
    });

    it('should sanitize arrays', () => {
      const arr = [
        'Contact me at admin@test.com',
        { phone: '555-123-4567' },
        ['Another email: info@company.org'],
      ];

      const sanitized = sanitizeObjectForEgress(arr);
      const sanitizedStr = JSON.stringify(sanitized);

      expect(sanitizedStr).not.toContain('admin@test.com');
      expect(sanitizedStr).not.toContain('555-123-4567');
      expect(sanitizedStr).not.toContain('info@company.org');
    });

    it('should preserve non-string primitive values', () => {
      const obj = {
        count: 42,
        active: true,
        ratio: 3.14,
        nothing: null,
      };

      const sanitized = sanitizeObjectForEgress(obj);
      expect(sanitized).toEqual(obj);
    });
  });

  describe('Context-Aware Sanitization', () => {
    describe('Chat context (default)', () => {
      it('should apply full sanitization including IP addresses', () => {
        const content = 'Server at 192.168.1.100 is running';
        const sanitized = sanitizeTextForEgress(content, { context: 'chat' });
        expect(sanitized).not.toContain('192.168.1.100');
        expect(sanitized).toContain('[IP_ADDRESS]');
      });

      it('should sanitize phone numbers', () => {
        const content = 'Call 555-123-4567 for support';
        const sanitized = sanitizeTextForEgress(content, { context: 'chat' });
        expect(sanitized).not.toContain('555-123-4567');
      });

      it('should sanitize PPSN in chat context', () => {
        const content = 'PPSN: 1234567AB';
        const sanitized = sanitizeTextForEgress(content, { context: 'chat' });
        expect(sanitized).not.toContain('1234567AB');
        expect(sanitized).toContain('[PPSN]');
      });
    });

    describe('Calculation context (conservative)', () => {
      it('should NOT sanitize IP-like version numbers', () => {
        const content = 'Analysis completed with version 1.2.3.4';
        const sanitized = sanitizeTextForEgress(content, { context: 'calculation' });
        // In calculation mode, IP-like patterns are NOT sanitized
        expect(sanitized).toContain('1.2.3.4');
      });

      it('should NOT sanitize phone-like reference numbers', () => {
        const content = 'Reference ID: 555-123-4567';
        const sanitized = sanitizeTextForEgress(content, { context: 'calculation' });
        // In calculation mode, phone patterns are NOT sanitized
        expect(sanitized).toContain('555-123-4567');
      });

      it('should NOT sanitize PPSN-like codes in calculation context', () => {
        const content = 'Document reference: 1234567AB';
        const sanitized = sanitizeTextForEgress(content, { context: 'calculation' });
        // In calculation mode, PPSN patterns are NOT sanitized
        expect(sanitized).toContain('1234567AB');
      });

      it('should still sanitize high-confidence PII like emails', () => {
        const content = 'Contact admin@example.com for results';
        const sanitized = sanitizeTextForEgress(content, { context: 'calculation' });
        expect(sanitized).not.toContain('admin@example.com');
        expect(sanitized).toContain('[EMAIL]');
      });

      it('should still sanitize SSN even in calculation context', () => {
        const content = 'SSN: 123-45-6789';
        const sanitized = sanitizeTextForEgress(content, { context: 'calculation' });
        expect(sanitized).not.toContain('123-45-6789');
        expect(sanitized).toContain('[SSN]');
      });

      it('should still sanitize API keys in calculation context', () => {
        // Use a fake key pattern that won't trigger GitHub push protection
        const fakeKey = 'sk_live_' + 'y'.repeat(24);
        const content = `Key: ${fakeKey}`;
        const sanitized = sanitizeTextForEgress(content, { context: 'calculation' });
        expect(sanitized).not.toContain(fakeKey);
        expect(sanitized).toContain('[API_KEY]');
      });

      it('should NOT use ML detection in calculation context by default', () => {
        // ML detection is disabled by default in calculation mode
        // This prevents false positives on numbers and calculations
        const content = 'Analysis: John processed 1000 records';
        const sanitized = sanitizeTextForEgress(content, { context: 'calculation' });
        // "John" might be detected as a name by ML, but in calculation mode ML is off
        // The content should remain mostly unchanged (except for true PII patterns)
        expect(sanitized).toContain('1000');
      });
    });

    describe('Off context (no sanitization)', () => {
      it('should pass through content unchanged', () => {
        const content = 'Email: test@example.com, SSN: 123-45-6789, IP: 192.168.1.1';
        const sanitized = sanitizeTextForEgress(content, { context: 'off' });
        expect(sanitized).toBe(content);
      });

      it('should pass through objects unchanged', () => {
        const obj = { email: 'test@example.com', ssn: '123-45-6789' };
        const sanitized = sanitizeObjectForEgress(obj, { context: 'off' });
        expect(sanitized).toEqual(obj);
      });
    });

    describe('Strict context (aggressive)', () => {
      it('should sanitize broad IBAN-like patterns in strict mode', () => {
        // Use a pattern that looks like IBAN but doesn't match the strict chat IBAN format
        // Chat IBAN: [A-Z]{2}\d{2}[A-Z]{4}\d{7,25} - 2 letters + 2 digits + 4 LETTERS + 7-25 digits
        // Strict IBAN: [A-Z]{2}\d{2}[A-Z0-9]{4,30} - 2 letters + 2 digits + 4-30 ALPHANUMERIC

        // This pattern has letters in the account number part, so won't match chat IBAN but will match strict
        const content = 'Reference: DE89ABC1234567890';
        const sanitizedStrict = sanitizeTextForEgress(content, { context: 'strict' });
        const sanitizedChat = sanitizeTextForEgress(content, { context: 'chat' });

        // Strict mode catches the broad IBAN pattern
        expect(sanitizedStrict).not.toContain('DE89ABC1234567890');
        // Chat mode doesn't catch it (account part has letters mixed in)
        expect(sanitizedChat).toContain('DE89ABC1234567890');
      });

      it('should sanitize any IP-like pattern including versions', () => {
        const content = 'Version 1.2.3.4 is now available';
        const sanitizedStrict = sanitizeTextForEgress(content, { context: 'strict' });

        // Strict mode catches all IP-like patterns
        expect(sanitizedStrict).not.toContain('1.2.3.4');
      });
    });
  });

  describe('False Positive Prevention', () => {
    it('should NOT corrupt tax calculation results (numbers)', () => {
      const taxOutput = JSON.stringify({
        taxable_income: 45000,
        tax_owed: 9500.5, // JSON serializes 9500.50 as 9500.5
        effective_rate: 21.11,
      });
      const sanitized = sanitizeTextForEgress(taxOutput, { context: 'calculation' });
      expect(sanitized).toContain('45000');
      expect(sanitized).toContain('9500.5');
      expect(sanitized).toContain('21.11');
    });

    it('should NOT corrupt version numbers like 1.2.3.4', () => {
      const output = 'Library version: 1.2.3.4';
      const sanitized = sanitizeTextForEgress(output, { context: 'calculation' });
      expect(sanitized).toContain('1.2.3.4');
    });

    it('should NOT corrupt semantic versions', () => {
      const output = 'Using package@1.0.0-beta.2';
      const sanitized = sanitizeTextForEgress(output, { context: 'calculation' });
      expect(sanitized).toContain('1.0.0-beta.2');
    });

    it('should NOT corrupt regulatory reference codes', () => {
      const output = 'See regulation EU2020/1234 and directive UK22ABC456';
      const sanitized = sanitizeTextForEgress(output, { context: 'calculation' });
      expect(sanitized).toContain('EU2020/1234');
      // UK22ABC456 might look like IBAN in strict mode, but calculation mode should preserve it
      expect(sanitized).toContain('UK22ABC456');
    });

    it('should NOT corrupt legal document identifiers', () => {
      const output = 'Reference: S.I. No. 123/2024, Act 45 of 2023';
      const sanitized = sanitizeTextForEgress(output, { context: 'calculation' });
      expect(sanitized).toContain('123/2024');
      expect(sanitized).toContain('45 of 2023');
    });

    it('should NOT corrupt financial figures that look like phone numbers', () => {
      const output = 'Revenue: 555,123,4567 EUR';
      const sanitized = sanitizeTextForEgress(output, { context: 'calculation' });
      expect(sanitized).toContain('555,123,4567');
    });

    it('should preserve numeric object values', () => {
      const obj = {
        amount: 12345678,
        rate: 0.2125,
        year: 2024,
        code: 'REF-12345',
      };
      const sanitized = sanitizeObjectForEgress(obj, { context: 'calculation' });
      expect(sanitized.amount).toBe(12345678);
      expect(sanitized.rate).toBe(0.2125);
      expect(sanitized.year).toBe(2024);
      expect(sanitized.code).toBe('REF-12345');
    });
  });

  describe('Audit Trail', () => {
    it('should provide audit information when using sanitizeTextWithAudit', () => {
      const content = 'Contact john@example.com or call 555-123-4567';
      const result = sanitizeTextWithAudit(content, { context: 'chat' });

      expect(result.redacted).toBe(true);
      expect(result.redactionTypes.length).toBeGreaterThan(0);
      expect(result.originalLength).toBe(content.length);
      expect(result.sanitizedLength).toBeGreaterThan(0);
    });

    it('should indicate no redaction for clean content', () => {
      const content = 'This is a normal message about tax regulations';
      const result = sanitizeTextWithAudit(content, { context: 'calculation' });

      expect(result.redacted).toBe(false);
      expect(result.redactionTypes).toEqual([]);
      expect(result.text).toBe(content);
    });

    it('should list specific redaction types applied', () => {
      const content = 'Email: test@example.com, SSN: 123-45-6789';
      const result = sanitizeTextWithAudit(content, { context: 'chat' });

      // ML detection runs first and catches most PII, so we may see [ML_REDACTION]
      // or specific patterns like [SSN] and [EMAIL] depending on what ML misses
      expect(result.redacted).toBe(true);
      expect(result.redactionTypes.length).toBeGreaterThan(0);
      // Either ML caught it all, or specific patterns were applied
      expect(
        result.redactionTypes.some(t =>
          t.includes('[ML_REDACTION]') || t.includes('[SSN]') || t.includes('[EMAIL]')
        )
      ).toBe(true);
    });
  });

  describe('Pre-configured Sanitizers', () => {
    it('should provide chat sanitizer with full sanitization', () => {
      const content = 'Email: test@example.com, IP: 192.168.1.100';
      const sanitized = Sanitizers.chat.sanitizeText(content);
      expect(sanitized).not.toContain('test@example.com');
      expect(sanitized).not.toContain('192.168.1.100');
    });

    it('should provide calculation sanitizer with conservative sanitization', () => {
      const content = 'Version 1.2.3.4, Email: test@example.com';
      const sanitized = Sanitizers.calculation.sanitizeText(content);
      expect(sanitized).toContain('1.2.3.4'); // Preserved
      expect(sanitized).not.toContain('test@example.com'); // Still sanitized
    });

    it('should provide off sanitizer that passes through unchanged', () => {
      const content = 'Email: test@example.com, SSN: 123-45-6789';
      const sanitized = Sanitizers.off.sanitizeText(content);
      expect(sanitized).toBe(content);
    });

    it('should allow overriding options on pre-configured sanitizers', () => {
      // Start with calculation context but exclude email pattern
      const content = 'Email: test@example.com, SSN: 123-45-6789';
      const sanitized = Sanitizers.calculation.sanitizeText(content, {
        excludePatterns: ['[EMAIL]'],
      });
      // Email pattern excluded, but SSN still sanitized
      expect(sanitized).not.toContain('123-45-6789');
    });
  });

  describe('Sandbox Code Execution Sanitization', () => {
    let mockSandbox: E2BSandbox;

    beforeEach(() => {
      mockSandbox = {
        sandboxId: 'test-sandbox-123',
        runCode: vi.fn(),
        kill: vi.fn(),
      };
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should use calculation context by default for sandbox output', async () => {
      const mockResult: E2BExecutionResult = {
        logs: {
          stdout: ['Version 1.2.3.4 completed'],
          stderr: [],
        },
        results: [],
        exitCode: 0,
      };
      vi.mocked(mockSandbox.runCode).mockResolvedValue(mockResult);

      const result = await executeCode(
        { language: 'python', code: 'print("test")' },
        mockSandbox
      );

      // Default is calculation mode - version numbers should be preserved
      expect(result.stdout).toContain('1.2.3.4');
      expect(result.sanitizationMode).toBe('calculation');
    });

    it('should allow disabling sanitization for sandbox', async () => {
      const mockResult: E2BExecutionResult = {
        logs: {
          stdout: ['Email: test@example.com'],
          stderr: [],
        },
        results: [],
        exitCode: 0,
      };
      vi.mocked(mockSandbox.runCode).mockResolvedValue(mockResult);

      const result = await executeCode(
        { language: 'python', code: 'print("test")' },
        mockSandbox,
        undefined,
        { sanitization: 'off' }
      );

      // Off mode - content unchanged
      expect(result.stdout).toContain('test@example.com');
      expect(result.sanitizationMode).toBe('off');
    });

    it('should allow using chat sanitization for sandbox', async () => {
      const mockResult: E2BExecutionResult = {
        logs: {
          stdout: ['IP: 192.168.1.100'],
          stderr: [],
        },
        results: [],
        exitCode: 0,
      };
      vi.mocked(mockSandbox.runCode).mockResolvedValue(mockResult);

      const result = await executeCode(
        { language: 'python', code: 'print("test")' },
        mockSandbox,
        undefined,
        { sanitization: 'chat' }
      );

      // Chat mode - IP addresses should be sanitized
      expect(result.stdout).not.toContain('192.168.1.100');
      expect(result.stdout).toContain('[IP_ADDRESS]');
      expect(result.sanitizationMode).toBe('chat');
    });

    it('should sanitize stdout containing PII from code execution', async () => {
      const mockResult: E2BExecutionResult = {
        logs: {
          stdout: ['User email: test@example.com', 'Phone: 555-123-4567'],
          stderr: [],
        },
        results: [],
        exitCode: 0,
      };
      vi.mocked(mockSandbox.runCode).mockResolvedValue(mockResult);

      // Use chat mode for stricter sanitization
      const result = await executeCode(
        { language: 'python', code: 'print("test")' },
        mockSandbox,
        undefined,
        { sanitization: 'chat' }
      );

      expect(result.stdout).not.toContain('test@example.com');
      expect(result.stdout).not.toContain('555-123-4567');
    });

    it('should sanitize stderr containing PII from code execution', async () => {
      const mockResult: E2BExecutionResult = {
        logs: {
          stdout: [],
          stderr: ['Error: Invalid SSN 123-45-6789'],
        },
        results: [],
        exitCode: 1,
      };
      vi.mocked(mockSandbox.runCode).mockResolvedValue(mockResult);

      const result = await executeCode(
        { language: 'python', code: 'print("test")' },
        mockSandbox
      );

      expect(result.stderr).not.toContain('123-45-6789');
      // Check that redaction occurred
      expect(result.stderr.includes('SOCIAL_SECURITY') || result.stderr.includes('[SSN]')).toBe(true);
    });

    it('should sanitize error messages containing PII', async () => {
      const mockResult: E2BExecutionResult = {
        logs: {
          stdout: [],
          stderr: [],
        },
        results: [],
        exitCode: 1,
        error: 'Failed to process email test@example.com',
      };
      vi.mocked(mockSandbox.runCode).mockResolvedValue(mockResult);

      const result = await executeCode(
        { language: 'python', code: 'print("test")' },
        mockSandbox
      );

      expect(result.error).not.toContain('test@example.com');
      expect(result.error?.includes('EMAIL') || result.error?.includes('[EMAIL]')).toBe(true);
    });

    it('should sanitize exception messages containing PII', async () => {
      vi.mocked(mockSandbox.runCode).mockRejectedValue(
        new Error('Connection failed for user@domain.com')
      );

      const result = await executeCode(
        { language: 'python', code: 'print("test")' },
        mockSandbox
      );

      expect(result.success).toBe(false);
      expect(result.error).not.toContain('user@domain.com');
      expect(result.error?.includes('EMAIL') || result.error?.includes('[EMAIL]')).toBe(true);
    });
  });

  describe('Analysis Execution Sanitization', () => {
    let mockSandbox: E2BSandbox;

    beforeEach(() => {
      mockSandbox = {
        sandboxId: 'test-sandbox-456',
        runCode: vi.fn(),
        kill: vi.fn(),
      };
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should use calculation context by default for analysis', async () => {
      const output = JSON.stringify({
        result: 'success',
        version: '1.2.3.4',
        reference: 'REF-12345AB',
      });

      const mockResult: E2BExecutionResult = {
        logs: {
          stdout: [output],
          stderr: [],
        },
        results: [],
        exitCode: 0,
      };
      vi.mocked(mockSandbox.runCode).mockResolvedValue(mockResult);

      const result = await executeAnalysis(
        {
          analysisType: 'tax_calculation',
          parameters: { income: 50000 },
          outputFormat: 'json',
        },
        mockSandbox
      );

      // Calculation mode - preserve version-like and reference-like strings
      expect(result.stdout).toContain('1.2.3.4');
      expect(result.stdout).toContain('REF-12345AB');
      expect(result.sanitizationMode).toBe('calculation');
    });

    it('should sanitize analysis JSON output containing PII', async () => {
      const piiOutput = JSON.stringify({
        result: 'success',
        contact: 'admin@company.com',
        ssn: '123-45-6789',
      });

      const mockResult: E2BExecutionResult = {
        logs: {
          stdout: [piiOutput],
          stderr: [],
        },
        results: [],
        exitCode: 0,
      };
      vi.mocked(mockSandbox.runCode).mockResolvedValue(mockResult);

      const result = await executeAnalysis(
        {
          analysisType: 'tax_calculation',
          parameters: { income: 50000 },
          outputFormat: 'json',
        },
        mockSandbox
      );

      expect(result.stdout).not.toContain('admin@company.com');
      expect(result.stdout).not.toContain('123-45-6789');

      // Parsed output should also be sanitized
      if (result.parsedOutput) {
        const parsed = result.parsedOutput as Record<string, unknown>;
        expect(String(parsed.contact)).not.toContain('admin@company.com');
        expect(String(parsed.ssn)).toContain('[SSN]');
      }
    });

    it('should sanitize analysis results array containing PII', async () => {
      const mockResult: E2BExecutionResult = {
        logs: {
          stdout: ['{}'],
          stderr: [],
        },
        results: [
          { email: 'user@test.com' },
          { data: 'SSN: 123-45-6789' },
        ],
        exitCode: 0,
      };
      vi.mocked(mockSandbox.runCode).mockResolvedValue(mockResult);

      const result = await executeAnalysis(
        {
          analysisType: 'data_analysis',
          parameters: { dataset: [] },
          outputFormat: 'json',
        },
        mockSandbox
      );

      const resultStr = JSON.stringify(result.result);
      expect(resultStr).not.toContain('user@test.com');
      expect(resultStr).not.toContain('123-45-6789');
    });
  });

  describe('Edge Cases', () => {
    it('should not modify content without PII', () => {
      const safeContent = 'This is a normal message about tax regulations in Ireland.';
      const sanitized = sanitizeTextForEgress(safeContent);
      expect(sanitized).toBe(safeContent);
    });

    it('should handle multiple PII types in single string', () => {
      const multiPii = 'Contact john@example.com or call 555-123-4567. SSN: 123-45-6789';
      const sanitized = sanitizeTextForEgress(multiPii);

      expect(sanitized).not.toContain('john@example.com');
      expect(sanitized).not.toContain('555-123-4567');
      expect(sanitized).not.toContain('123-45-6789');
      // Check that redaction occurred for each type
      expect(sanitized.includes('EMAIL') || sanitized.includes('[EMAIL]')).toBe(true);
    });

    it('should handle valid IP addresses in chat context', () => {
      const content = 'Server IP: 192.168.1.100';
      const sanitized = sanitizeTextForEgress(content, { context: 'chat' });
      expect(sanitized).not.toContain('192.168.1.100');
      expect(sanitized.includes('[IP_ADDRESS]')).toBe(true);
    });

    it('should handle database URLs with credentials', () => {
      const content = 'Database: postgres://admin:secret123@localhost:5432/mydb';
      const sanitized = sanitizeTextForEgress(content);
      expect(sanitized).not.toContain('admin:secret123');
      expect(sanitized.includes('[DATABASE_URL]')).toBe(true);
    });

    it('should handle AWS access keys', () => {
      const content = 'AWS Key: AKIAIOSFODNN7EXAMPLE';
      const sanitized = sanitizeTextForEgress(content);
      expect(sanitized).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(sanitized.includes('[AWS_ACCESS_KEY]')).toBe(true);
    });

    it('should distinguish valid IPs from version numbers in chat mode', () => {
      // Valid IP (192.168.1.100) should be sanitized
      const validIp = 'Connect to 192.168.1.100';
      const sanitizedIp = sanitizeTextForEgress(validIp, { context: 'chat' });
      expect(sanitizedIp).not.toContain('192.168.1.100');

      // Invalid IP-like version (1.2.3.4) - our improved pattern checks IP ranges
      // 1.2.3.4 is actually a valid IP (all octets 0-255), so it WILL be sanitized in chat mode
      const version = 'Version 1.2.3.4';
      const sanitizedVersion = sanitizeTextForEgress(version, { context: 'chat' });
      // In chat mode, even valid-range IP-like patterns are sanitized
      expect(sanitizedVersion).not.toContain('1.2.3.4');

      // But in calculation mode, it's preserved
      const sanitizedCalc = sanitizeTextForEgress(version, { context: 'calculation' });
      expect(sanitizedCalc).toContain('1.2.3.4');
    });
  });

  describe('Pattern Exclusion', () => {
    it('should allow excluding specific patterns', () => {
      const content = 'IP: 192.168.1.100, Email: test@example.com';

      // Exclude IP pattern (disable ML to test regex exclusion)
      const sanitized = sanitizeTextForEgress(content, {
        context: 'chat',
        useMLDetection: false, // Disable ML to test regex exclusion
        excludePatterns: ['[IP_ADDRESS]'],
      });

      // IP should be preserved (excluded from sanitization)
      expect(sanitized).toContain('192.168.1.100');
      // Email should still be sanitized by regex
      expect(sanitized).not.toContain('test@example.com');
    });

    it('should allow excluding multiple patterns', () => {
      const content = 'IP: 192.168.1.100, Phone: 555-123-4567, Email: test@example.com';

      // Disable ML to test regex exclusion behavior
      const sanitized = sanitizeTextForEgress(content, {
        context: 'chat',
        useMLDetection: false, // Disable ML to test regex exclusion
        excludePatterns: ['[IP_ADDRESS]', '[PHONE]'],
      });

      expect(sanitized).toContain('192.168.1.100');
      expect(sanitized).toContain('555-123-4567');
      expect(sanitized).not.toContain('test@example.com');
    });
  });
});
