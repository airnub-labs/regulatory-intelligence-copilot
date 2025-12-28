/**
 * Tests for LLM Client
 *
 * Tests the LLM client functionality including system prompts,
 * jurisdiction-aware prompt building, and LLM chat operations.
 */

import { describe, expect, it, beforeEach, vi, type MockedFunction } from 'vitest';

// Mock the mcpClient module
vi.mock('../mcpClient.js', () => ({
  callPerplexityMcp: vi.fn(),
}));

// Mock the prompts module
vi.mock('@reg-copilot/reg-intel-prompts', () => ({
  buildPromptWithAspects: vi.fn(),
}));

import {
  REGULATORY_COPILOT_SYSTEM_PROMPT,
  buildSystemPrompt,
  buildSystemPromptAsync,
  createLlmClient,
  buildRegulatoryPrompt,
} from './llmClient.js';
import { callPerplexityMcp } from '../mcpClient.js';
import { buildPromptWithAspects } from '@reg-copilot/reg-intel-prompts';

const mockCallPerplexityMcp = callPerplexityMcp as MockedFunction<typeof callPerplexityMcp>;
const mockBuildPromptWithAspects = buildPromptWithAspects as MockedFunction<typeof buildPromptWithAspects>;

describe('LLM Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('REGULATORY_COPILOT_SYSTEM_PROMPT', () => {
    it('contains the non-advice disclaimer', () => {
      expect(REGULATORY_COPILOT_SYSTEM_PROMPT).toContain('RESEARCH TOOL');
      expect(REGULATORY_COPILOT_SYSTEM_PROMPT).toContain('not a legal, tax, or welfare advisor');
    });

    it('contains important constraints section', () => {
      expect(REGULATORY_COPILOT_SYSTEM_PROMPT).toContain('IMPORTANT CONSTRAINTS');
      expect(REGULATORY_COPILOT_SYSTEM_PROMPT).toContain('NEVER give definitive advice');
    });

    it('encourages professional consultation', () => {
      expect(REGULATORY_COPILOT_SYSTEM_PROMPT).toContain('qualified professionals');
    });

    it('mentions hedging language requirements', () => {
      expect(REGULATORY_COPILOT_SYSTEM_PROMPT).toContain('hedging language');
      expect(REGULATORY_COPILOT_SYSTEM_PROMPT).toContain('appears to');
      expect(REGULATORY_COPILOT_SYSTEM_PROMPT).toContain('may apply');
    });

    it('includes guidance for response structure', () => {
      expect(REGULATORY_COPILOT_SYSTEM_PROMPT).toContain('When responding');
      expect(REGULATORY_COPILOT_SYSTEM_PROMPT).toContain('mutual exclusions');
      expect(REGULATORY_COPILOT_SYSTEM_PROMPT).toContain('lookback windows');
      expect(REGULATORY_COPILOT_SYSTEM_PROMPT).toContain('lock-in periods');
    });

    it('mentions jurisdiction awareness', () => {
      expect(REGULATORY_COPILOT_SYSTEM_PROMPT).toContain('jurisdiction');
    });
  });

  describe('buildSystemPrompt', () => {
    it('returns base prompt when no jurisdictions provided', () => {
      const result = buildSystemPrompt();
      expect(result).toBe(REGULATORY_COPILOT_SYSTEM_PROMPT);
    });

    it('returns base prompt when empty jurisdictions array provided', () => {
      const result = buildSystemPrompt([]);
      expect(result).toBe(REGULATORY_COPILOT_SYSTEM_PROMPT);
    });

    it('includes single jurisdiction context', () => {
      const result = buildSystemPrompt(['IE']);

      expect(result).toContain(REGULATORY_COPILOT_SYSTEM_PROMPT);
      expect(result).toContain('Jurisdiction Context');
      expect(result).toContain('primarily interested in rules from: IE');
    });

    it('includes multiple jurisdictions with cross-border context', () => {
      const result = buildSystemPrompt(['IE', 'MT', 'EU']);

      expect(result).toContain(REGULATORY_COPILOT_SYSTEM_PROMPT);
      expect(result).toContain('Jurisdiction Context');
      expect(result).toContain('multiple jurisdictions: IE, MT, EU');
      expect(result).toContain('cross-border interactions');
      expect(result).toContain('coordination rules');
    });

    it('handles two jurisdictions correctly', () => {
      const result = buildSystemPrompt(['IE', 'UK']);

      expect(result).toContain('IE, UK');
      expect(result).toContain('cross-border');
    });
  });

  describe('buildSystemPromptAsync', () => {
    it('calls buildPromptWithAspects with base prompt and empty options', async () => {
      mockBuildPromptWithAspects.mockResolvedValue('enhanced prompt');

      const result = await buildSystemPromptAsync();

      expect(mockBuildPromptWithAspects).toHaveBeenCalledWith(
        REGULATORY_COPILOT_SYSTEM_PROMPT,
        {}
      );
      expect(result).toBe('enhanced prompt');
    });

    it('passes options to buildPromptWithAspects', async () => {
      mockBuildPromptWithAspects.mockResolvedValue('jurisdiction-enhanced prompt');

      const options = {
        jurisdictions: ['IE', 'MT'],
        aspects: ['tax', 'social-welfare'],
      };

      const result = await buildSystemPromptAsync(options);

      expect(mockBuildPromptWithAspects).toHaveBeenCalledWith(
        REGULATORY_COPILOT_SYSTEM_PROMPT,
        options
      );
      expect(result).toBe('jurisdiction-enhanced prompt');
    });

    it('handles async errors from buildPromptWithAspects', async () => {
      mockBuildPromptWithAspects.mockRejectedValue(new Error('Aspect build failed'));

      await expect(buildSystemPromptAsync()).rejects.toThrow('Aspect build failed');
    });
  });

  describe('createLlmClient', () => {
    it('returns an LlmClient object with chat method', () => {
      const client = createLlmClient();

      expect(client).toBeDefined();
      expect(typeof client.chat).toBe('function');
    });

    describe('chat method', () => {
      it('calls Perplexity MCP with formatted query', async () => {
        mockCallPerplexityMcp.mockResolvedValue('LLM response about tax rules');

        const client = createLlmClient();
        const result = await client.chat({
          messages: [
            { role: 'user', content: 'What are the tax rules?' },
          ],
        });

        expect(mockCallPerplexityMcp).toHaveBeenCalledTimes(1);
        const query = mockCallPerplexityMcp.mock.calls[0][0];
        expect(query).toContain('System:');
        expect(query).toContain('User: What are the tax rules?');
        expect(result.content).toBe('LLM response about tax rules');
      });

      it('includes system prompt from messages when provided', async () => {
        mockCallPerplexityMcp.mockResolvedValue('Custom response');

        const client = createLlmClient();
        await client.chat({
          messages: [
            { role: 'system', content: 'Custom system prompt' },
            { role: 'user', content: 'Question?' },
          ],
        });

        const query = mockCallPerplexityMcp.mock.calls[0][0];
        expect(query).toContain('System: Custom system prompt');
      });

      it('uses default system prompt when none provided', async () => {
        mockCallPerplexityMcp.mockResolvedValue('Default response');

        const client = createLlmClient();
        await client.chat({
          messages: [
            { role: 'user', content: 'Question?' },
          ],
        });

        const query = mockCallPerplexityMcp.mock.calls[0][0];
        expect(query).toContain(REGULATORY_COPILOT_SYSTEM_PROMPT);
      });

      it('interleaves user and assistant messages in query', async () => {
        mockCallPerplexityMcp.mockResolvedValue('Continued response');

        const client = createLlmClient();
        await client.chat({
          messages: [
            { role: 'user', content: 'First question' },
            { role: 'assistant', content: 'First answer' },
            { role: 'user', content: 'Follow-up question' },
          ],
        });

        const query = mockCallPerplexityMcp.mock.calls[0][0];
        expect(query).toContain('User: First question');
        expect(query).toContain('Assistant: First answer');
        expect(query).toContain('User: Follow-up question');

        // Check order
        const firstQuestionIndex = query.indexOf('First question');
        const firstAnswerIndex = query.indexOf('First answer');
        const followUpIndex = query.indexOf('Follow-up question');
        expect(firstQuestionIndex).toBeLessThan(firstAnswerIndex);
        expect(firstAnswerIndex).toBeLessThan(followUpIndex);
      });

      it('handles non-string response from MCP', async () => {
        mockCallPerplexityMcp.mockResolvedValue({ data: 'complex', nested: true });

        const client = createLlmClient();
        const result = await client.chat({
          messages: [
            { role: 'user', content: 'Question' },
          ],
        });

        expect(result.content).toBe('{"data":"complex","nested":true}');
      });

      it('handles empty messages array', async () => {
        mockCallPerplexityMcp.mockResolvedValue('Response');

        const client = createLlmClient();
        const result = await client.chat({
          messages: [],
        });

        // Should use default system prompt
        const query = mockCallPerplexityMcp.mock.calls[0][0];
        expect(query).toContain(REGULATORY_COPILOT_SYSTEM_PROMPT);
        expect(result.content).toBe('Response');
      });

      it('propagates MCP errors', async () => {
        mockCallPerplexityMcp.mockRejectedValue(new Error('MCP gateway not configured'));

        const client = createLlmClient();

        await expect(
          client.chat({ messages: [{ role: 'user', content: 'Question' }] })
        ).rejects.toThrow('MCP gateway not configured');
      });
    });
  });

  describe('buildRegulatoryPrompt', () => {
    it('includes question and graph context', () => {
      const result = buildRegulatoryPrompt(
        'What tax reliefs are available?',
        'Node: CGT_RELIEF_123, Type: TaxRelief'
      );

      expect(result).toContain('What tax reliefs are available?');
      expect(result).toContain('Node: CGT_RELIEF_123');
      expect(result).toContain('Graph Context');
      expect(result).toContain('User Question');
    });

    it('includes agent context when provided', () => {
      const result = buildRegulatoryPrompt(
        'Question about pensions',
        'Graph data here',
        'Agent: GlobalRegulatoryComplianceAgent'
      );

      expect(result).toContain('Agent Context: Agent: GlobalRegulatoryComplianceAgent');
    });

    it('excludes agent context section when not provided', () => {
      const result = buildRegulatoryPrompt(
        'Question',
        'Graph data'
      );

      expect(result).not.toContain('Agent Context');
    });

    it('includes guidance reminders in the prompt', () => {
      const result = buildRegulatoryPrompt('Q', 'G');

      expect(result).toContain('mutual exclusions');
      expect(result).toContain('time-based constraints');
      expect(result).toContain('professional consultation');
      expect(result).toContain('specific rules/benefits/sections');
    });

    it('formats multi-line graph context correctly', () => {
      const graphContext = `
Node: TAX_RULE_1
  - Property: relief_amount = 1270
  - Connected: INCOME_THRESHOLD

Node: WELFARE_BENEFIT_2
  - Property: payment_frequency = weekly
      `.trim();

      const result = buildRegulatoryPrompt('Complex query', graphContext);

      expect(result).toContain('TAX_RULE_1');
      expect(result).toContain('relief_amount = 1270');
      expect(result).toContain('WELFARE_BENEFIT_2');
    });

    it('handles empty graph context', () => {
      const result = buildRegulatoryPrompt('Question', '');

      expect(result).toContain('Graph Context');
      expect(result).toContain('Question');
    });
  });

  describe('integration scenarios', () => {
    it('complete flow: build prompt -> create client -> chat', async () => {
      mockCallPerplexityMcp.mockResolvedValue(
        'Based on the graph context, the CGT retirement relief allows for relief on gains up to certain thresholds...'
      );

      // 1. Build jurisdiction-aware system prompt
      const systemPrompt = buildSystemPrompt(['IE']);
      expect(systemPrompt).toContain('IE');

      // 2. Build regulatory prompt with graph context
      const regulatoryPrompt = buildRegulatoryPrompt(
        'What is the CGT retirement relief threshold?',
        'Node: CGT_RETIREMENT_RELIEF, threshold: 750000',
        'IE Social Safety Net Agent'
      );

      // 3. Create client and chat
      const client = createLlmClient();
      const result = await client.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: regulatoryPrompt },
        ],
      });

      expect(result.content).toContain('CGT retirement relief');
    });

    it('handles conversation with history', async () => {
      mockCallPerplexityMcp.mockResolvedValue('Follow-up response about relief conditions');

      const client = createLlmClient();
      const result = await client.chat({
        messages: [
          { role: 'system', content: buildSystemPrompt(['IE']) },
          { role: 'user', content: 'What is CGT?' },
          { role: 'assistant', content: 'CGT stands for Capital Gains Tax...' },
          { role: 'user', content: 'What reliefs are available?' },
          { role: 'assistant', content: 'Several reliefs exist including retirement relief...' },
          { role: 'user', content: 'What are the conditions for retirement relief?' },
        ],
      });

      const query = mockCallPerplexityMcp.mock.calls[0][0];

      // Should include conversation history
      expect(query).toContain('What is CGT?');
      expect(query).toContain('Capital Gains Tax');
      expect(query).toContain('What reliefs are available?');
      expect(query).toContain('retirement relief');
      expect(query).toContain('conditions for retirement relief');

      expect(result.content).toBe('Follow-up response about relief conditions');
    });
  });
});
