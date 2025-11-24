/**
 * Single Director Ireland Social Safety Net Agent
 *
 * Handles compliance questions for single-director company owners in Ireland,
 * focusing on social welfare entitlements, PRSI obligations, and interactions
 * between company director status and welfare benefits.
 */

import type {
  Agent,
  AgentInput,
  AgentContext,
  AgentResult,
  GraphContext,
  Timeline,
} from '../types.js';
import { LOG_PREFIX, NON_ADVICE_DISCLAIMER } from '../constants.js';
import { REGULATORY_COPILOT_SYSTEM_PROMPT } from '../llm/llmClient.js';
import { buildPromptWithAspects } from '../aspects/promptAspects.js';
import { computeLookbackRange, computeLockInEnd } from '../timeline/timelineEngine.js';

const AGENT_ID = 'SingleDirector_IE_SocialSafetyNet_Agent';
const AGENT_NAME = 'Single Director Ireland Social Safety Net Agent';

/**
 * Keywords that indicate this agent should handle the question
 */
const TRIGGER_KEYWORDS = [
  'single director',
  'sole director',
  'company director',
  'ltd company',
  'limited company',
  'class s',
  'prsi class s',
  'self-employed prsi',
  'jobseeker',
  'illness benefit',
  'treatment benefit',
  'state pension',
  'contributory pension',
  'welfare entitlement',
  'social welfare',
  'dsp',
  'social safety net',
  'safety net',
];

/**
 * Agent-specific context to append to base prompt
 */
const AGENT_CONTEXT = `You are specifically focused on:
- Single-director company structures in Ireland
- PRSI Class S contributions and entitlements
- Social welfare benefits available to self-employed/directors
- Interactions between company director status and benefit eligibility
- Lookback windows for contribution requirements
- Mutual exclusions between different benefits

Common topics:
- Jobseeker's Benefit (Self-Employed)
- Illness Benefit for Class S contributors
- Treatment Benefit eligibility
- Maternity/Paternity Benefit
- State Pension (Contributory)
- Invalidity Pension

Remember: Single directors often pay Class S PRSI, which has different entitlements than Class A (PAYE employees).`;

/**
 * Build system prompt with aspects for this agent
 */
async function buildAgentSystemPrompt(
  jurisdictions: string[],
  profile?: AgentInput['profile']
): Promise<string> {
  return buildPromptWithAspects(REGULATORY_COPILOT_SYSTEM_PROMPT, {
    jurisdictions,
    agentId: AGENT_ID,
    agentDescription: AGENT_CONTEXT,
    profile,
  });
}

/**
 * Timeline calculation data for a benefit
 */
interface TimelineCalculations {
  benefitId: string;
  lookbackRanges: Array<{ timeline: Timeline; description: string }>;
  lockInPeriods: Array<{ timeline: Timeline; description: string }>;
}

/**
 * Format graph context for LLM consumption, including timeline calculations
 */
function formatGraphContext(
  context: GraphContext,
  timelineCalculations?: TimelineCalculations[]
): string {
  if (context.nodes.length === 0) {
    return 'No relevant rules found in the graph. The response will be based on general knowledge, which may be incomplete or outdated.';
  }

  const sections: string[] = [];

  // Group nodes by type
  const benefits = context.nodes.filter(n => n.type === 'Benefit');
  const conditions = context.nodes.filter(n => n.type === 'Condition');
  const timelines = context.nodes.filter(n => n.type === 'Timeline');
  const sections_ = context.nodes.filter(n => n.type === 'Section');

  if (benefits.length > 0) {
    sections.push('Benefits:\n' + benefits.map(b =>
      `- ${b.label} (${b.id}): ${b.properties.short_summary || 'No summary available'}`
    ).join('\n'));
  }

  if (conditions.length > 0) {
    sections.push('Conditions:\n' + conditions.map(c =>
      `- ${c.label} (${c.id}): ${c.properties.description || 'No description'}`
    ).join('\n'));
  }

  if (timelines.length > 0) {
    sections.push('Time Constraints:\n' + timelines.map(t => {
      const props = t.properties;
      const window = [
        props.window_years ? `${props.window_years}y` : '',
        props.window_months ? `${props.window_months}m` : '',
        props.window_days ? `${props.window_days}d` : '',
      ].filter(Boolean).join(' ') || 'unspecified';
      return `- ${t.label} (${t.id}): ${window}`;
    }).join('\n'));
  }

  // Add timeline calculations if available
  if (timelineCalculations && timelineCalculations.length > 0) {
    const calcSections: string[] = [];

    for (const calc of timelineCalculations) {
      const benefit = benefits.find(b => b.id === calc.benefitId);
      if (!benefit) continue;

      const calcLines: string[] = [`\nFor ${benefit.label}:`];

      if (calc.lookbackRanges.length > 0) {
        calcLines.push('  Lookback Windows:');
        for (const { timeline, description } of calc.lookbackRanges) {
          calcLines.push(`  - ${timeline.label}: ${description}`);
        }
      }

      if (calc.lockInPeriods.length > 0) {
        calcLines.push('  Lock-in Periods:');
        for (const { timeline, description } of calc.lockInPeriods) {
          calcLines.push(`  - ${timeline.label}: ${description}`);
        }
      }

      calcSections.push(calcLines.join('\n'));
    }

    if (calcSections.length > 0) {
      sections.push('Timeline Calculations (as of today):\n' + calcSections.join('\n'));
    }
  }

  if (sections_.length > 0) {
    sections.push('Statutory Sections:\n' + sections_.map(s =>
      `- ${s.label} (${s.id}): ${s.properties.title || 'No title'}`
    ).join('\n'));
  }

  // Add relationship information
  if (context.edges.length > 0) {
    const exclusions = context.edges.filter(e =>
      e.type === 'EXCLUDES' || e.type === 'MUTUALLY_EXCLUSIVE_WITH'
    );
    const requirements = context.edges.filter(e => e.type === 'REQUIRES');
    const lookbacks = context.edges.filter(e => e.type === 'LOOKBACK_WINDOW');

    if (exclusions.length > 0) {
      sections.push('Mutual Exclusions:\n' + exclusions.map(e =>
        `- ${e.source} ${e.type} ${e.target}`
      ).join('\n'));
    }

    if (requirements.length > 0) {
      sections.push('Requirements:\n' + requirements.map(e =>
        `- ${e.source} REQUIRES ${e.target}`
      ).join('\n'));
    }

    if (lookbacks.length > 0) {
      sections.push('Lookback Windows:\n' + lookbacks.map(e =>
        `- ${e.source} has LOOKBACK_WINDOW ${e.target}`
      ).join('\n'));
    }
  }

  return sections.join('\n\n');
}

/**
 * Single Director Ireland Social Safety Net Agent
 */
export const SingleDirector_IE_SocialSafetyNet_Agent: Agent = {
  id: AGENT_ID,
  name: AGENT_NAME,
  description: 'Handles social welfare and benefit questions for single-director company owners in Ireland',

  async canHandle(input: AgentInput): Promise<boolean> {
    const questionLower = input.question.toLowerCase();

    // Check for trigger keywords
    const hasKeyword = TRIGGER_KEYWORDS.some(kw => questionLower.includes(kw));

    // Check profile
    const matchesProfile = input.profile?.personaType === 'single-director' ||
      (input.profile?.hasCompany && input.profile?.prsiClass === 'S');

    return hasKeyword || Boolean(matchesProfile);
  },

  async handle(input: AgentInput, ctx: AgentContext): Promise<AgentResult> {
    console.log(`${LOG_PREFIX.agent} ${AGENT_ID} handling question`);

    // Get profile tag ID
    const profileId = input.profile?.personaType === 'single-director'
      ? 'PROFILE_SINGLE_DIRECTOR_IE'
      : 'PROFILE_SELF_EMPLOYED_IE';

    // Query graph for relevant rules
    let graphContext: GraphContext = { nodes: [], edges: [] };

    try {
      // Get rules for profile and jurisdiction
      graphContext = await ctx.graphClient.getRulesForProfileAndJurisdiction(
        profileId,
        'IE',
        extractKeywords(input.question)
      );

      // If we found nodes, expand their neighbourhoods for related rules
      if (graphContext.nodes.length > 0) {
        for (const node of graphContext.nodes.slice(0, 3)) {
          const neighbourhood = await ctx.graphClient.getNeighbourhood(node.id);
          // Merge results
          graphContext.nodes.push(...neighbourhood.nodes);
          graphContext.edges.push(...neighbourhood.edges);
        }
      }
    } catch (error) {
      console.log(`${LOG_PREFIX.agent} Graph query error:`, error);
    }

    // Deduplicate nodes
    const seenNodes = new Set<string>();
    graphContext.nodes = graphContext.nodes.filter(n => {
      if (seenNodes.has(n.id)) return false;
      seenNodes.add(n.id);
      return true;
    });

    // Compute timeline calculations for benefits
    const timelineCalculations: TimelineCalculations[] = [];
    const benefits = graphContext.nodes.filter(n => n.type === 'Benefit');
    const now = new Date();

    for (const benefit of benefits) {
      try {
        // Fetch timeline constraints for this benefit
        const timelines = await ctx.graphClient.getTimelines(benefit.id);

        if (timelines.length > 0) {
          const lookbackRanges: Array<{ timeline: Timeline; description: string }> = [];
          const lockInPeriods: Array<{ timeline: Timeline; description: string }> = [];

          for (const timeline of timelines) {
            // Check if this is a lookback window (most common)
            // Lookback windows are typically used for contribution requirements
            const lookbackResult = computeLookbackRange(timeline, now);
            lookbackRanges.push({
              timeline,
              description: lookbackResult.description,
            });

            // Also compute lock-in period (less common, but important for tax reliefs)
            // Use an example trigger date of today for demonstration
            const lockInResult = computeLockInEnd(now, timeline);
            lockInPeriods.push({
              timeline,
              description: lockInResult.description,
            });
          }

          timelineCalculations.push({
            benefitId: benefit.id,
            lookbackRanges,
            lockInPeriods,
          });
        }
      } catch (error) {
        console.log(`${LOG_PREFIX.agent} Timeline calculation error for ${benefit.id}:`, error);
      }
    }

    // Format context for LLM with timeline calculations
    const formattedContext = formatGraphContext(graphContext, timelineCalculations);

    // Build system prompt using aspects
    const jurisdictions = input.profile?.jurisdictions || ['IE'];
    const systemPrompt = await buildAgentSystemPrompt(jurisdictions, input.profile);

    // Build user prompt
    const userPrompt = `User Question: ${input.question}

Profile Context: Single-director company owner in Ireland, likely Class S PRSI contributor

Graph Context:
${formattedContext}

Please provide a research-based response that:
1. Explains relevant rules and benefits from the graph context
2. Highlights lookback windows, mutual exclusions, and conditions
3. Notes any uncertainties or gaps in the data
4. Encourages professional verification`;

    // Call LLM
    const response = await ctx.llmClient.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        ...(input.conversationHistory || []),
        { role: 'user', content: userPrompt },
      ],
    });

    // Build result
    const referencedNodes = graphContext.nodes.slice(0, 10).map(n => ({
      id: n.id,
      label: n.label,
      type: n.type,
    }));

    // Determine uncertainty level
    let uncertaintyLevel: 'low' | 'medium' | 'high' = 'medium';
    if (graphContext.nodes.length === 0) {
      uncertaintyLevel = 'high';
    } else if (graphContext.nodes.length > 5 && graphContext.edges.length > 3) {
      uncertaintyLevel = 'low';
    }

    return {
      answer: response.content,
      referencedNodes,
      uncertaintyLevel,
      agentId: AGENT_ID,
      notes: graphContext.nodes.length === 0
        ? ['Graph context was sparse; response may be based on general knowledge']
        : undefined,
      followUps: [
        'What PRSI contributions are needed for this benefit?',
        'Are there any time limits or waiting periods?',
        'What other benefits might be affected by this claim?',
      ],
    };
  },
};

/**
 * Extract potential keywords from question
 */
function extractKeywords(question: string): string | undefined {
  const words = question.toLowerCase().split(/\s+/);
  const keywords = words.filter(w =>
    w.length > 4 &&
    !['would', 'could', 'should', 'about', 'which', 'where', 'there'].includes(w)
  );
  return keywords[0];
}
