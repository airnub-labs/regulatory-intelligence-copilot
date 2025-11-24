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
} from '../types.js';
import { LOG_PREFIX, NON_ADVICE_DISCLAIMER } from '../constants.js';
import { REGULATORY_COPILOT_SYSTEM_PROMPT } from '../llm/llmClient.js';
import { SingleDirector_IE_SocialSafetyNet_Agent } from './SingleDirector_IE_SocialSafetyNet_Agent.js';

const AGENT_ID = 'GlobalRegulatoryComplianceAgent';
const AGENT_NAME = 'Global Regulatory Compliance Agent';

/**
 * Registry of available domain agents
 */
const DOMAIN_AGENTS: Agent[] = [
  SingleDirector_IE_SocialSafetyNet_Agent,
  // Future agents will be added here:
  // IE_CGT_Investor_Agent,
  // IE_RnD_TaxCredit_Agent,
  // EU_Law_Agent,
];

/**
 * Global agent system prompt
 */
const GLOBAL_SYSTEM_PROMPT = `${REGULATORY_COPILOT_SYSTEM_PROMPT}

You are the Global Regulatory Compliance Agent, providing an integrated view across:
- Irish tax law (Corporation Tax, CGT, VAT)
- Social welfare benefits and PRSI
- Pensions (State, occupational, personal)
- EU regulations affecting Ireland

When answering:
1. Consider how different regulatory domains interact
2. Identify potential conflicts or synergies between rules
3. Highlight cross-cutting concerns (e.g., tax implications of welfare claims)
4. Recommend which specific area the user might want to explore further`;

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
    console.log(`${LOG_PREFIX.agent} ${AGENT_ID} processing request`);

    // Try to find a specialized domain agent
    for (const agent of DOMAIN_AGENTS) {
      try {
        const canHandle = await agent.canHandle(input);
        if (canHandle) {
          console.log(`${LOG_PREFIX.agent} Delegating to ${agent.id}`);
          return agent.handle(input, ctx);
        }
      } catch (error) {
        console.log(`${LOG_PREFIX.agent} Error checking ${agent.id}:`, error);
      }
    }

    // No specialized agent matched, handle globally
    console.log(`${LOG_PREFIX.agent} No specialized agent matched, handling globally`);

    // Get cross-border context if multiple jurisdictions
    const jurisdictions = input.profile?.jurisdictions || ['IE'];
    let graphContext = { nodes: [], edges: [] };

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
      console.log(`${LOG_PREFIX.agent} Graph query error:`, error);
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

    // Call LLM
    const response = await ctx.llmClient.chat({
      messages: [
        { role: 'system', content: GLOBAL_SYSTEM_PROMPT },
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
};

/**
 * Get profile tag ID from input
 */
function getProfileTagId(input: AgentInput): string {
  const personaType = input.profile?.personaType;

  switch (personaType) {
    case 'single-director':
      return 'PROFILE_SINGLE_DIRECTOR_IE';
    case 'self-employed':
      return 'PROFILE_SELF_EMPLOYED_IE';
    case 'investor':
      return 'PROFILE_INVESTOR_IE';
    case 'paye-employee':
      return 'PROFILE_PAYE_EMPLOYEE_IE';
    case 'advisor':
      return 'PROFILE_ADVISOR_IE';
    default:
      return 'PROFILE_GENERAL_IE';
  }
}

/**
 * Create the compliance orchestrator
 */
export function createComplianceOrchestrator() {
  return GlobalRegulatoryComplianceAgent;
}
