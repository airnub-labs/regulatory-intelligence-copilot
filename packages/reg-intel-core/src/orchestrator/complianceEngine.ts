/**
 * Compliance Engine - Main orchestrator for regulatory intelligence queries
 *
 * Coordinates between:
 * - User requests (chat messages + profile context)
 * - Domain agents (via GlobalRegulatoryComplianceAgent)
 * - Infrastructure (LLM router, graph client, timeline engine, egress guard)
 *
 * This is the primary entry point for the regulatory intelligence copilot.
 */

import type {
  ChatMessage,
  UserProfile,
  AgentContext,
  AgentInput,
  GraphClient,
  TimelineEngine,
  EgressGuard,
  LlmClient,
} from '../types.js';
import { GlobalRegulatoryComplianceAgent } from '../agents/GlobalRegulatoryComplianceAgent.js';
import { NON_ADVICE_DISCLAIMER } from '../constants.js';
import { ComplianceError } from '../errors.js';

/**
 * Request to the compliance engine
 */
export interface ComplianceRequest {
  messages: ChatMessage[];
  profile?: UserProfile;
  tenantId?: string;
}

/**
 * Response from the compliance engine
 */
export interface ComplianceResponse {
  answer: string;
  referencedNodes: Array<{
    id: string;
    label: string;
    type: string;
  }>;
  agentUsed: string;
  jurisdictions: string[];
  uncertaintyLevel?: 'low' | 'medium' | 'high';
  followUps?: string[];
  disclaimer: string;
}

/**
 * Dependencies for ComplianceEngine
 */
export interface ComplianceEngineDeps {
  llmClient: LlmClient;
  graphClient: GraphClient;
  timelineEngine: TimelineEngine;
  egressGuard: EgressGuard;
}

/**
 * ComplianceEngine orchestrates regulatory intelligence queries
 */
export class ComplianceEngine {
  private deps: ComplianceEngineDeps;

  constructor(deps: ComplianceEngineDeps) {
    this.deps = deps;
  }

  /**
   * Handle a chat request and return a compliance response
   */
  async handleChat(request: ComplianceRequest): Promise<ComplianceResponse> {
    const { messages, profile } = request;

    if (!messages || messages.length === 0) {
      throw new ComplianceError('No messages provided');
    }

    // Get the last user message as the question
    const lastMessage = messages.filter(m => m.role === 'user').pop();
    if (!lastMessage) {
      throw new ComplianceError('No user message found');
    }

    // Build agent input
    const agentInput: AgentInput = {
      question: lastMessage.content,
      profile,
      conversationHistory: messages.slice(0, -1), // All messages except the last
      now: new Date(),
    };

    // Build agent context
    const agentContext: AgentContext = {
      graphClient: this.deps.graphClient,
      timeline: this.deps.timelineEngine,
      egressGuard: this.deps.egressGuard,
      llmClient: this.deps.llmClient,
      now: new Date(),
      profile,
    };

    // Use GlobalRegulatoryComplianceAgent to handle the request
    // It will route to specialized agents as needed
    const agentResult = await GlobalRegulatoryComplianceAgent.handle(
      agentInput,
      agentContext
    );

    // Build compliance response
    const jurisdictions = profile?.jurisdictions || ['IE'];

    return {
      answer: agentResult.answer,
      referencedNodes: agentResult.referencedNodes,
      agentUsed: agentResult.agentId,
      jurisdictions,
      uncertaintyLevel: agentResult.uncertaintyLevel,
      followUps: agentResult.followUps,
      disclaimer: NON_ADVICE_DISCLAIMER,
    };
  }
}

/**
 * Create a ComplianceEngine instance
 */
export function createComplianceEngine(deps: ComplianceEngineDeps): ComplianceEngine {
  return new ComplianceEngine(deps);
}
