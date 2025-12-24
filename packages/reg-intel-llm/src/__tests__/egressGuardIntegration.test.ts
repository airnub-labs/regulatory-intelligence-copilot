/**
 * Integration tests for EgressGuard end-to-end flow
 *
 * These tests verify that PII is properly sanitized at all egress points:
 * 1. LLM responses (both streaming and non-streaming)
 * 2. Sandbox code execution output (stdout, stderr, results)
 * 3. The full flow through LlmRouter
 *
 * Note: The @redactpii/node library uses uppercase labels like EMAIL_ADDRESS,
 * PHONE_NUMBER, etc., while our regex patterns use bracketed labels like [EMAIL].
 * Tests check that the original PII is removed, regardless of which sanitizer caught it.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { sanitizeTextForEgress, sanitizeObjectForEgress } from '../egressGuard.js';
import { executeCode, executeAnalysis, type E2BSandbox, type E2BExecutionResult } from '../tools/codeExecutionTools.js';

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
      const response = 'Your API key is sk_live_abcdefghijklmnopqrst';
      const sanitized = sanitizeTextForEgress(response);
      expect(sanitized).not.toContain('sk_live_abcdefghijklmnopqrst');
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

      const result = await executeCode(
        { language: 'python', code: 'print("test")' },
        mockSandbox
      );

      expect(result.stdout).not.toContain('test@example.com');
      expect(result.stdout).not.toContain('555-123-4567');
      // Check that redaction occurred
      expect(result.stdout.includes('EMAIL') || result.stdout.includes('[EMAIL]')).toBe(true);
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

    it('should sanitize analysis JSON output containing PII', async () => {
      const piiOutput = JSON.stringify({
        result: 'success',
        contact: 'admin@company.com',
        phone: '+1-555-987-6543',
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
      expect(result.stdout).not.toContain('555-987-6543');

      // Parsed output should also be sanitized
      if (result.parsedOutput) {
        const parsed = result.parsedOutput as Record<string, unknown>;
        const contactStr = String(parsed.contact);
        expect(contactStr.includes('EMAIL') || contactStr.includes('[EMAIL]')).toBe(true);
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

    it('should handle IP addresses', () => {
      const content = 'Server IP: 192.168.1.100';
      const sanitized = sanitizeTextForEgress(content);
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
  });
});
