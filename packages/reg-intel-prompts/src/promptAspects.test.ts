import { describe, it, expect } from 'vitest';
import {
  jurisdictionAspect,
  agentContextAspect,
  profileContextAspect,
  disclaimerAspect,
  additionalContextAspect,
  conversationContextAspect,
  createPromptBuilder,
  defaultPromptBuilder,
  buildPromptWithAspects,
  createCustomPromptBuilder,
  type PromptContext,
  type BuiltPrompt,
} from './promptAspects.js';
import { NON_ADVICE_DISCLAIMER } from './constants.js';

describe('jurisdictionAspect', () => {
  const mockNext = async (ctx: PromptContext): Promise<BuiltPrompt> => ({
    systemPrompt: ctx.basePrompt,
    context: ctx,
  });

  it('should add single jurisdiction context', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
      jurisdictions: ['UK'],
    };

    const result = await jurisdictionAspect(ctx, mockNext);

    expect(result.systemPrompt).toContain('Base prompt');
    expect(result.systemPrompt).toContain('Jurisdiction Context');
    expect(result.systemPrompt).toContain('The user is primarily interested in rules from: UK');
  });

  it('should add multiple jurisdictions context', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
      jurisdictions: ['UK', 'EU', 'US'],
    };

    const result = await jurisdictionAspect(ctx, mockNext);

    expect(result.systemPrompt).toContain('multiple jurisdictions: UK, EU, US');
    expect(result.systemPrompt).toContain('cross-border interactions');
  });

  it('should use profile jurisdictions if direct jurisdictions not provided', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
      profile: {
        jurisdictions: ['UK', 'Ireland'],
      },
    };

    const result = await jurisdictionAspect(ctx, mockNext);

    expect(result.systemPrompt).toContain('UK, Ireland');
  });

  it('should prefer direct jurisdictions over profile jurisdictions', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
      jurisdictions: ['UK'],
      profile: {
        jurisdictions: ['US'],
      },
    };

    const result = await jurisdictionAspect(ctx, mockNext);

    expect(result.systemPrompt).toContain('UK');
    expect(result.systemPrompt).not.toContain('US');
  });

  it('should return unmodified result when no jurisdictions', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
    };

    const result = await jurisdictionAspect(ctx, mockNext);

    expect(result.systemPrompt).toBe('Base prompt');
    expect(result.systemPrompt).not.toContain('Jurisdiction Context');
  });

  it('should return unmodified result when jurisdictions is empty array', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
      jurisdictions: [],
    };

    const result = await jurisdictionAspect(ctx, mockNext);

    expect(result.systemPrompt).toBe('Base prompt');
  });
});

describe('agentContextAspect', () => {
  const mockNext = async (ctx: PromptContext): Promise<BuiltPrompt> => ({
    systemPrompt: ctx.basePrompt,
    context: ctx,
  });

  it('should add agent context with agentId', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
      agentId: 'compliance-agent',
    };

    const result = await agentContextAspect(ctx, mockNext);

    expect(result.systemPrompt).toContain('Agent Context: Agent: compliance-agent');
  });

  it('should prefer agentDescription over agentId', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
      agentId: 'compliance-agent',
      agentDescription: 'Compliance analysis specialist',
    };

    const result = await agentContextAspect(ctx, mockNext);

    expect(result.systemPrompt).toContain('Agent Context: Compliance analysis specialist');
    expect(result.systemPrompt).not.toContain('compliance-agent');
  });

  it('should return unmodified result when no agent info', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
    };

    const result = await agentContextAspect(ctx, mockNext);

    expect(result.systemPrompt).toBe('Base prompt');
    expect(result.systemPrompt).not.toContain('Agent Context');
  });
});

describe('profileContextAspect', () => {
  const mockNext = async (ctx: PromptContext): Promise<BuiltPrompt> => ({
    systemPrompt: ctx.basePrompt,
    context: ctx,
  });

  it('should add profile context for known persona types', async () => {
    const personaTypes = [
      { type: 'single-director', expected: 'a single-director company owner' },
      { type: 'self-employed', expected: 'a self-employed individual' },
      { type: 'investor', expected: 'an investor' },
      { type: 'paye-employee', expected: 'a PAYE employee' },
      { type: 'advisor', expected: 'a professional advisor' },
    ];

    for (const { type, expected } of personaTypes) {
      const ctx: PromptContext = {
        basePrompt: 'Base prompt',
        profile: { personaType: type },
      };

      const result = await profileContextAspect(ctx, mockNext);

      expect(result.systemPrompt).toContain(`User Profile: The user is ${expected}.`);
    }
  });

  it('should use raw personaType for unknown types', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
      profile: { personaType: 'custom-role' },
    };

    const result = await profileContextAspect(ctx, mockNext);

    expect(result.systemPrompt).toContain('User Profile: The user is custom-role.');
  });

  it('should return unmodified result when no profile', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
    };

    const result = await profileContextAspect(ctx, mockNext);

    expect(result.systemPrompt).toBe('Base prompt');
  });

  it('should return unmodified result when profile exists but no personaType', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
      profile: { jurisdictions: ['UK'] },
    };

    const result = await profileContextAspect(ctx, mockNext);

    expect(result.systemPrompt).toBe('Base prompt');
  });
});

describe('disclaimerAspect', () => {
  const mockNext = async (ctx: PromptContext): Promise<BuiltPrompt> => ({
    systemPrompt: ctx.basePrompt,
    context: ctx,
  });

  it('should add disclaimer to prompt', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
    };

    const result = await disclaimerAspect(ctx, mockNext);

    expect(result.systemPrompt).toContain('IMPORTANT:');
    expect(result.systemPrompt).toContain(NON_ADVICE_DISCLAIMER);
  });

  it('should not add disclaimer if "RESEARCH TOOL" already present', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt. This is a RESEARCH TOOL only.',
    };

    const result = await disclaimerAspect(ctx, mockNext);

    // Should not add the disclaimer again
    expect(result.systemPrompt).toBe('Base prompt. This is a RESEARCH TOOL only.');
    expect(result.systemPrompt).not.toContain('IMPORTANT:');
  });

  it('should not add disclaimer if "not a legal" already present', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt. This is not a legal advice tool.',
    };

    const result = await disclaimerAspect(ctx, mockNext);

    expect(result.systemPrompt).toBe('Base prompt. This is not a legal advice tool.');
    expect(result.systemPrompt).not.toContain('IMPORTANT:');
  });
});

describe('additionalContextAspect', () => {
  const mockNext = async (ctx: PromptContext): Promise<BuiltPrompt> => ({
    systemPrompt: ctx.basePrompt,
    context: ctx,
  });

  it('should add additional context strings', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
      additionalContext: ['Context line 1', 'Context line 2'],
    };

    const result = await additionalContextAspect(ctx, mockNext);

    expect(result.systemPrompt).toContain('Context line 1');
    expect(result.systemPrompt).toContain('Context line 2');
  });

  it('should join multiple context strings with double newlines', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
      additionalContext: ['First', 'Second', 'Third'],
    };

    const result = await additionalContextAspect(ctx, mockNext);

    expect(result.systemPrompt).toContain('First\n\nSecond\n\nThird');
  });

  it('should return unmodified result when no additional context', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
    };

    const result = await additionalContextAspect(ctx, mockNext);

    expect(result.systemPrompt).toBe('Base prompt');
  });

  it('should return unmodified result when additionalContext is empty array', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
      additionalContext: [],
    };

    const result = await additionalContextAspect(ctx, mockNext);

    expect(result.systemPrompt).toBe('Base prompt');
  });
});

describe('conversationContextAspect', () => {
  const mockNext = async (ctx: PromptContext): Promise<BuiltPrompt> => ({
    systemPrompt: ctx.basePrompt,
    context: ctx,
  });

  it('should add conversation context summary', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
      conversationContextSummary: 'Discussion about tax rules',
    };

    const result = await conversationContextAspect(ctx, mockNext);

    expect(result.systemPrompt).toContain('Conversation Context: Discussion about tax rules');
  });

  it('should add conversation context nodes', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
      conversationContextNodes: [
        { label: 'PAYE', type: 'tax-concept' },
        { label: 'VAT', type: 'tax-concept' },
      ],
    };

    const result = await conversationContextAspect(ctx, mockNext);

    expect(result.systemPrompt).toContain('Active graph concepts:');
    expect(result.systemPrompt).toContain('PAYE (tax-concept)');
    expect(result.systemPrompt).toContain('VAT (tax-concept)');
  });

  it('should handle nodes without type', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
      conversationContextNodes: [
        { label: 'Concept1' },
        { label: 'Concept2', type: 'regulation' },
      ],
    };

    const result = await conversationContextAspect(ctx, mockNext);

    expect(result.systemPrompt).toContain('Concept1; Concept2 (regulation)');
  });

  it('should combine summary and nodes', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
      conversationContextSummary: 'Tax discussion',
      conversationContextNodes: [{ label: 'PAYE' }],
    };

    const result = await conversationContextAspect(ctx, mockNext);

    expect(result.systemPrompt).toContain('Tax discussion');
    expect(result.systemPrompt).toContain('Active graph concepts: PAYE');
  });

  it('should trim summary whitespace', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
      conversationContextSummary: '  Discussion with spaces  ',
    };

    const result = await conversationContextAspect(ctx, mockNext);

    expect(result.systemPrompt).toContain('Discussion with spaces');
    // The summary itself should be trimmed
    expect(result.systemPrompt).not.toContain('  Discussion with spaces  ');
  });

  it('should return unmodified result when no conversation context', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
    };

    const result = await conversationContextAspect(ctx, mockNext);

    expect(result.systemPrompt).toBe('Base prompt');
  });

  it('should return unmodified result when summary is empty and no nodes', async () => {
    const ctx: PromptContext = {
      basePrompt: 'Base prompt',
      conversationContextSummary: '   ',
      conversationContextNodes: [],
    };

    const result = await conversationContextAspect(ctx, mockNext);

    expect(result.systemPrompt).toBe('Base prompt');
  });
});

describe('createPromptBuilder', () => {
  it('should create a builder with no aspects', async () => {
    const builder = createPromptBuilder([]);
    const result = await builder({ basePrompt: 'Test prompt' });

    expect(result.systemPrompt).toBe('Test prompt');
  });

  it('should create a builder with aspects', async () => {
    const builder = createPromptBuilder([jurisdictionAspect, agentContextAspect]);
    const result = await builder({
      basePrompt: 'Test',
      jurisdictions: ['UK'],
      agentId: 'test-agent',
    });

    expect(result.systemPrompt).toContain('Test');
    expect(result.systemPrompt).toContain('Jurisdiction Context');
    expect(result.systemPrompt).toContain('Agent Context');
  });

  it('should apply aspects in correct order', async () => {
    const builder = createPromptBuilder([jurisdictionAspect, agentContextAspect]);
    const result = await builder({
      basePrompt: 'Base',
      jurisdictions: ['UK'],
      agentId: 'agent1',
    });

    const jurisdictionIndex = result.systemPrompt.indexOf('Jurisdiction Context');
    const agentIndex = result.systemPrompt.indexOf('Agent Context');

    // Both aspects should be present
    expect(jurisdictionIndex).toBeGreaterThan(-1);
    expect(agentIndex).toBeGreaterThan(-1);

    // Agent aspect is applied after jurisdiction aspect (innermost),
    // so it appears first in the output (closest to base prompt)
    expect(agentIndex).toBeLessThan(jurisdictionIndex);
  });
});

describe('defaultPromptBuilder', () => {
  it('should build prompt with all standard aspects', async () => {
    const result = await defaultPromptBuilder({
      basePrompt: 'Base',
      jurisdictions: ['UK'],
      agentId: 'agent1',
      profile: { personaType: 'investor' },
      additionalContext: ['Extra info'],
    });

    expect(result.systemPrompt).toContain('Base');
    expect(result.systemPrompt).toContain('Jurisdiction Context');
    expect(result.systemPrompt).toContain('Agent Context');
    expect(result.systemPrompt).toContain('User Profile');
    expect(result.systemPrompt).toContain('Extra info');
  });

  it('should not include disclaimer by default', async () => {
    const result = await defaultPromptBuilder({
      basePrompt: 'Base',
    });

    expect(result.systemPrompt).not.toContain('IMPORTANT:');
    expect(result.systemPrompt).not.toContain(NON_ADVICE_DISCLAIMER);
  });
});

describe('buildPromptWithAspects', () => {
  it('should build prompt with default aspects', async () => {
    const prompt = await buildPromptWithAspects('Base prompt', {
      jurisdictions: ['UK'],
    });

    expect(prompt).toContain('Base prompt');
    expect(prompt).toContain('Jurisdiction Context');
  });

  it('should include disclaimer when requested', async () => {
    const prompt = await buildPromptWithAspects('Base prompt', {
      includeDisclaimer: true,
    });

    expect(prompt).toContain('IMPORTANT:');
    expect(prompt).toContain(NON_ADVICE_DISCLAIMER);
  });

  it('should not include disclaimer when not requested', async () => {
    const prompt = await buildPromptWithAspects('Base prompt', {
      includeDisclaimer: false,
    });

    expect(prompt).not.toContain('IMPORTANT:');
  });

  it('should handle all options together', async () => {
    const prompt = await buildPromptWithAspects('Base', {
      jurisdictions: ['UK', 'EU'],
      agentId: 'test-agent',
      profile: { personaType: 'advisor' },
      additionalContext: ['Line 1', 'Line 2'],
      includeDisclaimer: true,
    });

    expect(prompt).toContain('Base');
    expect(prompt).toContain('UK, EU');
    expect(prompt).toContain('test-agent');
    expect(prompt).toContain('professional advisor');
    expect(prompt).toContain('Line 1');
    expect(prompt).toContain('Line 2');
    expect(prompt).toContain(NON_ADVICE_DISCLAIMER);
  });
});

describe('createCustomPromptBuilder', () => {
  it('should create custom builder with no aspects', async () => {
    const customBuilder = createCustomPromptBuilder('Custom base', []);
    const prompt = await customBuilder();

    expect(prompt).toBe('Custom base');
  });

  it('should create custom builder with specific aspects', async () => {
    const customBuilder = createCustomPromptBuilder('Custom base', [
      jurisdictionAspect,
      disclaimerAspect,
    ]);

    const prompt = await customBuilder({
      jurisdictions: ['US'],
    });

    expect(prompt).toContain('Custom base');
    expect(prompt).toContain('US');
    expect(prompt).toContain(NON_ADVICE_DISCLAIMER);
  });

  it('should allow options to be passed', async () => {
    const customBuilder = createCustomPromptBuilder('Base', [agentContextAspect]);

    const prompt1 = await customBuilder({ agentId: 'agent1' });
    const prompt2 = await customBuilder({ agentId: 'agent2' });

    expect(prompt1).toContain('agent1');
    expect(prompt2).toContain('agent2');
  });

  it('should use empty options by default', async () => {
    const customBuilder = createCustomPromptBuilder('Base', [jurisdictionAspect]);

    const prompt = await customBuilder();

    expect(prompt).toBe('Base');
  });
});

describe('aspect composition and order', () => {
  it('should apply multiple aspects in correct order', async () => {
    const builder = createPromptBuilder([
      jurisdictionAspect,
      agentContextAspect,
      profileContextAspect,
      additionalContextAspect,
    ]);

    const result = await builder({
      basePrompt: 'START',
      jurisdictions: ['UK'],
      agentId: 'agent1',
      profile: { personaType: 'investor' },
      additionalContext: ['END'],
    });

    // Check the order in the output
    const prompt = result.systemPrompt;
    const indices = {
      start: prompt.indexOf('START'),
      jurisdiction: prompt.indexOf('Jurisdiction Context'),
      agent: prompt.indexOf('Agent Context'),
      profile: prompt.indexOf('User Profile'),
      end: prompt.indexOf('END'),
    };

    // Aspects are applied innermost-last
    // So the order in the output is: START, END, profile, agent, jurisdiction
    // (additionalContext is innermost, so appears closest to base)
    expect(indices.start).toBeLessThan(indices.end);
    expect(indices.end).toBeLessThan(indices.profile);
    expect(indices.profile).toBeLessThan(indices.agent);
    expect(indices.agent).toBeLessThan(indices.jurisdiction);
  });

  it('should preserve context through aspect chain', async () => {
    const builder = createPromptBuilder([jurisdictionAspect, agentContextAspect]);

    const context: PromptContext = {
      basePrompt: 'Base',
      jurisdictions: ['UK'],
      agentId: 'test',
    };

    const result = await builder(context);

    expect(result.context).toEqual(context);
  });
});
