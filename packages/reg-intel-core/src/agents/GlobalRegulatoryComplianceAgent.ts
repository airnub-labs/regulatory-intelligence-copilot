/**
 * Global Regulatory Compliance Agent
 *
 * The meta-agent that orchestrates domain-specific agents and handles
 * cross-cutting regulatory questions. This is the default entry point
 * for all regulatory queries.
 */

import type {
  Agent,
  AgentInput,
  AgentContext,
  AgentResult,
  AgentStreamResult,
  GraphContext,
  LlmStreamChunk,
} from '../types.js';
import { LOG_PREFIX, NON_ADVICE_DISCLAIMER, DEFAULT_JURISDICTION } from '../constants.js';
import { REGULATORY_COPILOT_SYSTEM_PROMPT } from '../llm/llmClient.js';
import { buildPromptWithAspects } from '@reg-copilot/reg-intel-prompts';
import { SingleDirector_IE_SocialSafetyNet_Agent } from './SingleDirector_IE_SocialSafetyNet_Agent.js';
import { createLogger, recordAgentSelection } from '@reg-copilot/reg-intel-observability';

const AGENT_ID = 'GlobalRegulatoryComplianceAgent';
const AGENT_NAME = 'Global Regulatory Compliance Agent';
const logger = createLogger(AGENT_ID, { component: 'Agent' });

/**
 * Registry of available domain agents
 */
const DOMAIN_AGENTS: Agent[] = [
  SingleDirector_IE_SocialSafetyNet_Agent,
  // Future agents will be added here:
  // IE_CGT_Investor_Agent,
  // IE_RnD_TaxCredit_Agent,
  // MT_Tax_Agent,
  // EU_Law_Agent,
];

/**
 * Global agent additional context
 */
const GLOBAL_AGENT_CONTEXT = `You are the Global Regulatory Compliance Agent, providing an integrated view across:
- Tax law (Corporation Tax, CGT, VAT, income tax)
- Social welfare benefits and contributions
- Pensions (State, occupational, personal)
- EU regulations and cross-border coordination

When answering:
1. Consider how different regulatory domains interact
2. Identify potential conflicts or synergies between rules
3. Highlight cross-cutting concerns (e.g., tax implications of welfare claims)
4. Recommend which specific area the user might want to explore further
5. Consider jurisdiction-specific rules and cross-border implications`;

/**
 * Build global agent system prompt with jurisdiction context using aspects
 */
async function buildGlobalSystemPrompt(
  jurisdictions: string[],
  profile?: AgentInput['profile']
): Promise<string> {
  return buildPromptWithAspects(REGULATORY_COPILOT_SYSTEM_PROMPT, {
    jurisdictions,
    agentId: AGENT_ID,
    agentDescription: GLOBAL_AGENT_CONTEXT,
    profile,
  });
}

/**
 * Global Regulatory Compliance Agent
 */
export const GlobalRegulatoryComplianceAgent: Agent = {
  id: AGENT_ID,
  name: AGENT_NAME,
  description: 'Orchestrates domain agents and handles cross-cutting regulatory questions',

  async canHandle(_input: AgentInput): Promise<boolean> {
    // Global agent can handle anything
    return true;
  },

  async handle(input: AgentInput, ctx: AgentContext): Promise<AgentResult> {
    logger.info({
      event: 'handle.start',
      jurisdictions: input.profile?.jurisdictions || [DEFAULT_JURISDICTION],
      personaType: input.profile?.personaType,
    });

    // Try to find a specialized domain agent
    for (const agent of DOMAIN_AGENTS) {
      try {
        const canHandle = await agent.canHandle(input);
        if (canHandle) {
          logger.info({ event: 'delegate.agent', agentId: agent.id });

          // Record agent selection metric
          recordAgentSelection({
            agentType: 'domain',
            agentName: agent.id,
            domain: agent.id.includes('SocialSafetyNet') ? 'social-welfare' : 'unknown',
            jurisdiction: input.profile?.jurisdictions?.[0] || DEFAULT_JURISDICTION,
          });

          return agent.handle(input, ctx);
        }
      } catch (error) {
        logger.error({ event: 'delegate.error', agentId: agent.id, err: error });
      }
    }

    // No specialized agent matched, handle globally
    logger.info({ event: 'handle.global' });

    // Record global agent selection metric
    recordAgentSelection({
      agentType: 'global',
      agentName: AGENT_ID,
      jurisdiction: input.profile?.jurisdictions?.[0] || DEFAULT_JURISDICTION,
    });

    // Get cross-border context if multiple jurisdictions
    const jurisdictions = input.profile?.jurisdictions || [DEFAULT_JURISDICTION];
    let graphContext: GraphContext = { nodes: [], edges: [] };
    const warnings: string[] = [];

    try {
      if (jurisdictions.length > 1) {
        graphContext = await ctx.graphClient.getCrossBorderSlice(jurisdictions);
      } else {
        // Just get general rules for the main jurisdiction
        graphContext = await ctx.graphClient.getRulesForProfileAndJurisdiction(
          getProfileTagId(input),
          jurisdictions[0],
          undefined
        );
      }
    } catch (error) {
      logger.error({ event: 'graph.error', err: error });
      warnings.push(
        'Memgraph (regulatory graph) is unreachable, so relationship context may be missing in this answer.'
      );
    }

    // Format context
    const contextSummary = graphContext.nodes.length > 0
      ? `Found ${graphContext.nodes.length} relevant rules and ${graphContext.edges.length} relationships.`
      : 'No specific rules found in the graph. Response based on general knowledge.';

    // Build prompt
    const prompt = `User Question: ${input.question}

Graph Context: ${contextSummary}
${graphContext.nodes.slice(0, 5).map(n => `- ${n.label} (${n.type})`).join('\n')}

Please provide a comprehensive response considering all relevant regulatory domains.`;

    // Build system prompt using aspects
    const systemPrompt = await buildGlobalSystemPrompt(jurisdictions, input.profile);

    // Call LLM with jurisdiction-aware prompt
    const response = await ctx.llmClient.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        ...(input.conversationHistory || []),
        { role: 'user', content: prompt },
      ],
    });

    // Build result
    const referencedNodes = graphContext.nodes.slice(0, 10).map(n => ({
      id: n.id,
      label: n.label,
      type: n.type,
    }));

    return {
      answer: response.content,
      referencedNodes,
      warnings: warnings.length ? warnings : undefined,
      uncertaintyLevel: graphContext.nodes.length > 0 ? 'medium' : 'high',
      agentId: AGENT_ID,
      notes: graphContext.nodes.length === 0
        ? ['No specific rules found in graph; consider asking about a more specific topic']
        : undefined,
      followUps: [
        'Would you like me to focus on a specific area (tax, welfare, pensions)?',
        'Are there specific benefits or reliefs you want to explore?',
        'Do you need information about time constraints or deadlines?',
      ],
    };
  },

  async handleStream(input: AgentInput, ctx: AgentContext): Promise<AgentStreamResult> {
    logger.info({
      event: 'handleStream.start',
      jurisdictions: input.profile?.jurisdictions || [DEFAULT_JURISDICTION],
      personaType: input.profile?.personaType,
    });

    const wrapAsStream = (result: AgentResult): AgentStreamResult => {
      async function* stream(): AsyncGenerator<LlmStreamChunk> {
        if (result.answer) {
          yield { type: 'text', delta: result.answer };
        }
        yield { type: 'done' };
      }

      return {
        agentId: result.agentId,
        referencedNodes: result.referencedNodes,
        warnings: result.warnings,
        uncertaintyLevel: result.uncertaintyLevel,
        followUps: result.followUps,
        stream: stream(),
      } satisfies AgentStreamResult;
    };

    const isAsyncIterable = (value: unknown): value is AsyncIterable<LlmStreamChunk> =>
      !!value && typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function';

    // Try to find a specialized domain agent with streaming support
    for (const agent of DOMAIN_AGENTS) {
      try {
        const canHandle = await agent.canHandle(input);
        if (canHandle && agent.handleStream) {
          logger.info({ event: 'delegate.agent.streaming', agentId: agent.id });
          const streamed = await agent.handleStream(input, ctx);
          if (isAsyncIterable(streamed.stream)) {
            return streamed;
          }
        }
        if (canHandle) {
          const fallbackResult = await agent.handle(input, ctx);
          return wrapAsStream(fallbackResult);
        }
      } catch (error) {
        logger.error({ event: 'delegate.error', agentId: agent.id, err: error });
      }
    }

    // No specialized agent matched, handle globally with streaming
    logger.info({ event: 'handleStream.global' });

    // Get cross-border context if multiple jurisdictions
    const jurisdictions = input.profile?.jurisdictions || [DEFAULT_JURISDICTION];
    let graphContext: GraphContext = { nodes: [], edges: [] };
    const warnings: string[] = [];

    try {
      if (jurisdictions.length > 1) {
        graphContext = await ctx.graphClient.getCrossBorderSlice(jurisdictions);
      } else {
        // Just get general rules for the main jurisdiction
        graphContext = await ctx.graphClient.getRulesForProfileAndJurisdiction(
          getProfileTagId(input),
          jurisdictions[0],
          undefined
        );
      }
    } catch (error) {
      logger.error({ event: 'graph.error', err: error });
      warnings.push(
        'Memgraph (regulatory graph) is unreachable, so relationship context may be missing in this answer.'
      );
    }

    // Format context
    const contextSummary = graphContext.nodes.length > 0
      ? `Found ${graphContext.nodes.length} relevant rules and ${graphContext.edges.length} relationships.`
      : 'No specific rules found in the graph. Response based on general knowledge.';

    // Build prompt
    const prompt = `User Question: ${input.question}

Graph Context: ${contextSummary}
${graphContext.nodes.slice(0, 5).map(n => `- ${n.label} (${n.type})`).join('\n')}

Please provide a comprehensive response considering all relevant regulatory domains.`;

    // Build system prompt using aspects
    const systemPrompt = await buildGlobalSystemPrompt(jurisdictions, input.profile);

    // Build referenced nodes metadata
    const referencedNodes = graphContext.nodes.slice(0, 10).map(n => ({
      id: n.id,
      label: n.label,
      type: n.type,
    }));

    if (ctx.llmClient.streamChat) {
      const stream = ctx.llmClient.streamChat({
        messages: [
          { role: 'system', content: systemPrompt },
          ...(input.conversationHistory || []),
          { role: 'user', content: prompt },
        ],
      });

      if (isAsyncIterable(stream)) {
        return {
          agentId: AGENT_ID,
          referencedNodes,
          warnings: warnings.length ? warnings : undefined,
          uncertaintyLevel: graphContext.nodes.length > 0 ? 'medium' : 'high',
          followUps: [
            'Would you like me to focus on a specific area (tax, welfare, pensions)?',
            'Are there specific benefits or reliefs you want to explore?',
            'Do you need information about time constraints or deadlines?',
          ],
          stream,
        };
      }
    }

    // Fallback to non-streaming path and wrap result
    const nonStreamingResult = await this.handle(input, ctx);
    return wrapAsStream(nonStreamingResult);
  },
};

/**
 * Get profile tag ID from input
 * Uses jurisdiction from profile or defaults to DEFAULT_JURISDICTION
 */
function getProfileTagId(input: AgentInput): string {
  const personaType = input.profile?.personaType;
  const jurisdiction = input.profile?.jurisdictions?.[0] || DEFAULT_JURISDICTION;

  const baseProfile = (() => {
    switch (personaType) {
      case 'single-director':
        return 'PROFILE_SINGLE_DIRECTOR';
      case 'self-employed':
        return 'PROFILE_SELF_EMPLOYED';
      case 'investor':
        return 'PROFILE_INVESTOR';
      case 'paye-employee':
        return 'PROFILE_PAYE_EMPLOYEE';
      case 'advisor':
        return 'PROFILE_ADVISOR';
      default:
        return 'PROFILE_GENERAL';
    }
  })();

  return `${baseProfile}_${jurisdiction}`;
}

/**
 * Create the compliance orchestrator
 */
export function createComplianceOrchestrator() {
  return GlobalRegulatoryComplianceAgent;
}
