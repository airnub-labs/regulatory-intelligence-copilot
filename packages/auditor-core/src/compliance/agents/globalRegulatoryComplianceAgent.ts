import type { Agent, AgentContext, AgentInput, AgentResult } from '../types.js';
import { SingleDirectorIESocialSafetyNetAgent } from './singleDirectorSocialSafetyNetAgent.js';

const fallbackAnswer =
  'I can help explore regulatory interactions across tax, welfare, pensions, CGT, and EU rules. Provide details about your scenario, and I will surface relevant rules from the graph. This is research support, not professional advice.';

export class GlobalRegulatoryComplianceAgent implements Agent {
  id = 'GlobalRegulatoryComplianceAgent';
  private singleDirectorAgent = new SingleDirectorIESocialSafetyNetAgent();

  async canHandle(_input: AgentInput): Promise<boolean> {
    return true;
  }

  async handle(input: AgentInput, ctx: AgentContext): Promise<AgentResult> {
    if (await this.singleDirectorAgent.canHandle(input)) {
      return this.singleDirectorAgent.handle(input, ctx);
    }

    const slice = await ctx.graphClient.getRulesForProfileAndJurisdiction(
      input.profile?.profileId,
      input.jurisdictions?.[0],
    );

    const answer = `${fallbackAnswer}\n\nGraph hints: ${slice.nodes
      .slice(0, 5)
      .map(node => node.properties?.title ?? node.id)
      .join(', ') || 'no nodes returned yet.'}`;

    return {
      answer,
      referencedNodes: slice.nodes.map(n => String(n.id)),
      uncertaintyLevel: slice.nodes.length === 0 ? 'high' : 'medium',
    } satisfies AgentResult;
  }
}
