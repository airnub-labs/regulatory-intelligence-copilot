import { ensureMcpGatewayConfigured } from '../sandboxManager.js';
import { MemgraphGraphClient } from './graphClient.js';
import { BasicTimelineEngine } from './timelineEngine.js';
import { BasicEgressGuard } from './egressGuard.js';
import { GlobalRegulatoryComplianceAgent } from './agents/globalRegulatoryComplianceAgent.js';
import type { AgentInput, AgentResult } from './types.js';

export interface OrchestratedResult extends AgentResult {
  agentId: string;
}

export async function runRegulatoryAnalysis(input: AgentInput): Promise<OrchestratedResult> {
  await ensureMcpGatewayConfigured();

  const agent = new GlobalRegulatoryComplianceAgent();
  const ctx = {
    graphClient: new MemgraphGraphClient(),
    timeline: new BasicTimelineEngine(),
    egressGuard: new BasicEgressGuard(),
  };

  const result = await agent.handle(input, ctx);
  return { ...result, agentId: agent.id };
}
