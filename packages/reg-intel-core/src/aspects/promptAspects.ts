/**
 * Prompt Building Aspects for Regulatory Intelligence Copilot
 *
 * Uses the aspect pattern to compose system prompts with reusable middleware.
 * This allows adding jurisdiction context, agent context, disclaimers, etc.
 * without modifying client code.
 */

import { applyAspects, type Aspect } from './applyAspects.js';
import { NON_ADVICE_DISCLAIMER } from '../constants.js';

/**
 * Prompt context that flows through aspects
 */
export interface PromptContext {
  basePrompt: string;
  jurisdictions?: string[];
  agentId?: string;
  agentDescription?: string;
  profile?: {
    personaType?: string;
    jurisdictions?: string[];
  };
  additionalContext?: string[];
}

/**
 * Result of prompt building
 */
export interface BuiltPrompt {
  systemPrompt: string;
  context: PromptContext;
}

/**
 * Prompt aspect type
 */
export type PromptAspect = Aspect<PromptContext, BuiltPrompt>;

/**
 * Base prompt builder - just returns the base prompt
 */
async function basePromptBuilder(ctx: PromptContext): Promise<BuiltPrompt> {
  return {
    systemPrompt: ctx.basePrompt,
    context: ctx,
  };
}

/**
 * Jurisdiction context aspect - adds jurisdiction information to the prompt
 */
export const jurisdictionAspect: PromptAspect = async (ctx, next) => {
  const result = await next(ctx);

  const jurisdictions = ctx.jurisdictions || ctx.profile?.jurisdictions;
  if (!jurisdictions || jurisdictions.length === 0) {
    return result;
  }

  const jurisdictionContext = jurisdictions.length === 1
    ? `The user is primarily interested in rules from: ${jurisdictions[0]}`
    : `The user is interested in rules from multiple jurisdictions: ${jurisdictions.join(', ')}. Pay attention to cross-border interactions and coordination rules.`;

  return {
    ...result,
    systemPrompt: `${result.systemPrompt}\n\nJurisdiction Context: ${jurisdictionContext}`,
  };
};

/**
 * Agent context aspect - adds agent-specific information
 */
export const agentContextAspect: PromptAspect = async (ctx, next) => {
  const result = await next(ctx);

  if (!ctx.agentId && !ctx.agentDescription) {
    return result;
  }

  const agentInfo = ctx.agentDescription || `Agent: ${ctx.agentId}`;

  return {
    ...result,
    systemPrompt: `${result.systemPrompt}\n\nAgent Context: ${agentInfo}`,
  };
};

/**
 * Profile context aspect - adds user profile information
 */
export const profileContextAspect: PromptAspect = async (ctx, next) => {
  const result = await next(ctx);

  if (!ctx.profile?.personaType) {
    return result;
  }

  const personaDescriptions: Record<string, string> = {
    'single-director': 'a single-director company owner',
    'self-employed': 'a self-employed individual',
    'investor': 'an investor',
    'paye-employee': 'a PAYE employee',
    'advisor': 'a professional advisor',
  };

  const personaDesc = personaDescriptions[ctx.profile.personaType] || ctx.profile.personaType;

  return {
    ...result,
    systemPrompt: `${result.systemPrompt}\n\nUser Profile: The user is ${personaDesc}.`,
  };
};

/**
 * Non-advice disclaimer aspect - ensures the disclaimer is always present
 */
export const disclaimerAspect: PromptAspect = async (ctx, next) => {
  const result = await next(ctx);

  // Check if disclaimer is already present
  if (result.systemPrompt.includes('RESEARCH TOOL') || result.systemPrompt.includes('not a legal')) {
    return result;
  }

  return {
    ...result,
    systemPrompt: `${result.systemPrompt}\n\nIMPORTANT: ${NON_ADVICE_DISCLAIMER}`,
  };
};

/**
 * Additional context aspect - adds any extra context strings
 */
export const additionalContextAspect: PromptAspect = async (ctx, next) => {
  const result = await next(ctx);

  if (!ctx.additionalContext || ctx.additionalContext.length === 0) {
    return result;
  }

  const additional = ctx.additionalContext.join('\n\n');

  return {
    ...result,
    systemPrompt: `${result.systemPrompt}\n\n${additional}`,
  };
};

/**
 * Create a prompt builder with the specified aspects
 */
export function createPromptBuilder(aspects: PromptAspect[] = []) {
  return applyAspects(basePromptBuilder, aspects);
}

/**
 * Default prompt builder with all standard aspects
 */
export const defaultPromptBuilder = createPromptBuilder([
  jurisdictionAspect,
  agentContextAspect,
  profileContextAspect,
  additionalContextAspect,
  // Note: disclaimerAspect not included by default since base prompts should include it
]);

/**
 * Build a system prompt using aspects
 */
export async function buildPromptWithAspects(
  basePrompt: string,
  options: Omit<PromptContext, 'basePrompt'> = {}
): Promise<string> {
  const result = await defaultPromptBuilder({
    basePrompt,
    ...options,
  });
  return result.systemPrompt;
}

/**
 * Create a custom prompt builder for specific use cases
 */
export function createCustomPromptBuilder(
  basePrompt: string,
  customAspects: PromptAspect[] = []
) {
  const builder = createPromptBuilder(customAspects);

  return async (options: Omit<PromptContext, 'basePrompt'> = {}) => {
    const result = await builder({
      basePrompt,
      ...options,
    });
    return result.systemPrompt;
  };
}
