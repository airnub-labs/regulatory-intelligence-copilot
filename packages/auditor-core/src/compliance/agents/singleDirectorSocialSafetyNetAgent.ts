import type {
  Agent,
  AgentContext,
  AgentInput,
  AgentResult,
  GraphNode,
  TimelineNode,
} from '../types.js';

function buildContextSummary(nodes: GraphNode[], timelines: TimelineNode[]): string {
  const nodeLines = nodes.slice(0, 10).map(node => {
    const label = node.labels[0] ?? 'Rule';
    const title = (node.properties?.title as string | undefined) || (node.properties?.name as string | undefined);
    return `- ${label}: ${title ?? node.id}`;
  });

  const timelineLines = timelines.map(t => `- Timeline ${t.label || ''}: window ${[
    t.window_years ? `${t.window_years}y` : null,
    t.window_months ? `${t.window_months}m` : null,
    t.window_days ? `${t.window_days}d` : null,
  ].filter(Boolean).join(' ') || 'unspecified'}`);

  return [...nodeLines, ...timelineLines].join('\n');
}

export class SingleDirectorIESocialSafetyNetAgent implements Agent {
  id = 'SingleDirector_IE_SocialSafetyNet_Agent';

  async canHandle(input: AgentInput): Promise<boolean> {
    const last = input.messages[input.messages.length - 1]?.content.toLowerCase() || '';
    return last.includes('prsi') || last.includes('welfare') || last.includes('jobseeker') || last.includes('illness');
  }

  async handle(input: AgentInput, ctx: AgentContext): Promise<AgentResult> {
    const profileId = input.profile?.profileId ?? 'single_director_ie';
    const jurisdiction = input.jurisdictions?.[0] ?? 'ie';
    const keyword = extractKeyword(input.messages);

    const slice = await ctx.graphClient.getRulesForProfileAndJurisdiction(profileId, jurisdiction, keyword);
    const timelines = await this.collectTimelines(slice.nodes, ctx);

    const contextSummary = buildContextSummary(slice.nodes, timelines);
    const disclaimer = 'This is regulatory research, not professional advice. Please confirm details with Revenue or DSP.';
    const answer = `I focused on Irish social safety net rules relevant to a single director.\n\n${contextSummary || 'No graph data was available from Memgraph yet.'}\n\n${disclaimer}`;

    return {
      answer,
      referencedNodes: slice.nodes.map(n => String(n.id)),
      notes: timelines.map(t => t.label || 'Timeline constraint'),
      uncertaintyLevel: slice.nodes.length === 0 ? 'high' : 'medium',
    } satisfies AgentResult;
  }

  private async collectTimelines(nodes: GraphNode[], ctx: AgentContext): Promise<TimelineNode[]> {
    const timelines: TimelineNode[] = [];
    for (const node of nodes) {
      const nodeTimelines = await ctx.graphClient.getTimelines(String(node.id));
      timelines.push(...nodeTimelines);
    }
    return timelines;
  }
}

function extractKeyword(messages: AgentInput['messages']): string | undefined {
  const last = messages[messages.length - 1];
  if (!last) return undefined;
  const tokens = last.content.split(/\s+/).filter(word => word.length > 5);
  return tokens[0];
}
