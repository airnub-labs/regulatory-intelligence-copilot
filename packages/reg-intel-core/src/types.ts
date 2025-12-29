/**
 * Core types for Regulatory Intelligence Copilot
 *
 * This module defines the shared interfaces used across the compliance system
 * including agents, graph operations, timeline engine, and egress guard.
 */

// =============================================================================
// Graph Schema Types (v0.2)
// =============================================================================

/**
 * Jurisdiction node representing a country or legal order
 */
export interface Jurisdiction {
  id: string;
  name: string;
  type: 'COUNTRY' | 'SUPRANATIONAL' | 'CROWN_DEPENDENCY';
  notes?: string;
}

/**
 * Timeline node for lookback/lock-in periods
 */
export interface Timeline {
  id: string;
  label: string;
  window_days?: number;
  window_months?: number;
  window_years?: number;
  notes?: string;
}

/**
 * Profile tag for user personas
 */
export interface ProfileTag {
  id: string;
  label: string;
  description?: string;
}

/**
 * Graph node representing any regulatory entity
 */
export interface GraphNode {
  id: string;
  label: string;
  type:
    | 'Statute'
    | 'Section'
    | 'Benefit'
    | 'Relief'
    | 'Condition'
    | 'Timeline'
    | 'Case'
    | 'Guidance'
    | 'EURegulation'
    | 'EUDirective'
    | 'ProfileTag'
    | 'Jurisdiction'
    | 'Update'
    | 'Concept'
    | 'Label'
    | 'Region'
    | 'Agreement'
    | 'Treaty'
    | 'Regime'
    | 'Community'
    | 'ChangeEvent'
    | 'Obligation'
    | 'Threshold'
    | 'Rate'
    | 'Form'
    | 'PRSIClass'
    | 'LifeEvent';
  properties: Record<string, unknown>;
}

/**
 * Graph edge representing a relationship
 */
export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  properties?: Record<string, unknown>;
}

/**
 * Graph context for agent reasoning
 */
export interface GraphContext {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// =============================================================================
// User Profile Types
// =============================================================================

export const PROFILE_IDS = [
  'self-employed',
  'single-director',
  'paye-employee',
  'investor',
  'advisor',
] as const;

export type ProfileId = (typeof PROFILE_IDS)[number];

/**
 * User profile for context filtering
 *
 * Note on naming: This interface uses 'personaType' for the profile identifier,
 * while API/filter contexts may use 'profileType' or 'profileId'. All refer to
 * the same ProfileId concept (e.g., 'self-employed', 'single-director').
 */
export interface UserProfile {
  /**
   * Profile/persona type identifier (e.g., 'self-employed', 'investor').
   * Naming note: Called 'personaType' here, but may be 'profileType' or 'profileId' in other contexts.
   */
  personaType: ProfileId;
  /** Jurisdictions relevant to this user (e.g., ['IE', 'UK']) */
  jurisdictions: string[];
  /** Optional age band for age-specific rules */
  ageBand?: '18-25' | '26-35' | '36-45' | '46-55' | '56-65' | '65+';
  /** Whether user operates a company (relevant for company tax rules) */
  hasCompany?: boolean;
  /** Irish PRSI class if applicable (e.g., 'A', 'S') */
  prsiClass?: string;
}

// =============================================================================
// Agent Types
// =============================================================================

/**
 * Input to an agent
 */
export interface AgentInput {
  question: string;
  profile?: UserProfile;
  conversationHistory?: ChatMessage[];
  now?: Date;
}

/**
 * Context provided to agents for reasoning
 */
export interface AgentContext {
  graphClient: GraphClient;
  timeline: TimelineEngine;
  egressGuard: EgressGuard;
  llmClient: LlmClient;
  now: Date;
  profile?: UserProfile;
}

/**
 * Result returned by an agent
 */
export interface AgentResult {
  answer: string;
  referencedNodes: Array<{
    id: string;
    label: string;
    type: string;
  }>;
  notes?: string[];
  warnings?: string[];
  uncertaintyLevel?: 'low' | 'medium' | 'high';
  followUps?: string[];
  agentId: string;
}

/**
 * Streaming chunk from LLM
 */
export type LlmStreamChunk =
  | { type: 'text'; delta: string }
  | {
    type: 'tool';
    name: string;
    argsJson: unknown;
    toolName?: string;
    arguments?: unknown;
    payload?: unknown;
  }
  | { type: 'error'; error: Error }
  | {
    type: 'done';
    followUps?: string[];
    referencedNodes?: string[];
    disclaimer?: string;
  };

/**
 * Streaming result from an agent
 * Contains metadata immediately, then streams the LLM response
 */
export interface AgentStreamResult {
  agentId: string;
  referencedNodes: Array<{
    id: string;
    label: string;
    type: string;
  }>;
  warnings?: string[];
  uncertaintyLevel?: 'low' | 'medium' | 'high';
  followUps?: string[];
  stream: AsyncIterable<LlmStreamChunk>;
}

/**
 * Agent interface that all domain agents must implement
 */
export interface Agent {
  id: string;
  name: string;
  description: string;
  canHandle(input: AgentInput): Promise<boolean>;
  handle(input: AgentInput, ctx: AgentContext): Promise<AgentResult>;
  handleStream?(input: AgentInput, ctx: AgentContext): Promise<AgentStreamResult>;
}

// =============================================================================
// Graph Client Types
// =============================================================================

/**
 * Graph client interface for Memgraph operations
 */
export interface GraphClient {
  /**
   * Get rules matching profile and jurisdiction with optional keyword
   */
  getRulesForProfileAndJurisdiction(
    profileId: string,
    jurisdictionId: string,
    keyword?: string
  ): Promise<GraphContext>;

  /**
   * Get neighbourhood of a node (1-2 hops)
   */
  getNeighbourhood(nodeId: string): Promise<GraphContext>;

  /**
   * Get mutual exclusions for a node
   */
  getMutualExclusions(nodeId: string): Promise<GraphNode[]>;

  /**
   * Get timeline constraints for a node
   */
  getTimelines(nodeId: string): Promise<Timeline[]>;

  /**
   * Get cross-border slice for multiple jurisdictions
   */
  getCrossBorderSlice(jurisdictionIds: string[]): Promise<GraphContext>;

  /**
   * Execute raw Cypher query
   */
  executeCypher(query: string, params?: Record<string, unknown>): Promise<unknown>;
}

// =============================================================================
// Timeline Engine Types
// =============================================================================

/**
 * Date range result
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Result of lookback computation
 */
export interface LookbackResult {
  range: DateRange;
  description: string;
}

/**
 * Result of lookback check
 */
export interface LookbackCheckResult {
  within: boolean;
  range: DateRange;
  description: string;
}

/**
 * Result of lock-in computation
 */
export interface LockInResult {
  end: Date;
  description: string;
}

/**
 * Result of lock-in check
 */
export interface LockInCheckResult {
  active: boolean;
  end: Date;
  description: string;
}

/**
 * Timeline engine interface
 */
export interface TimelineEngine {
  computeLookbackRange(timeline: Timeline, now: Date): LookbackResult;
  isWithinLookback(eventDate: Date, timeline: Timeline, now: Date): LookbackCheckResult;
  computeLockInEnd(triggerDate: Date, timeline: Timeline): LockInResult;
  isLockInActive(triggerDate: Date, timeline: Timeline, now: Date): LockInCheckResult;
}

// =============================================================================
// Egress Guard Types
// =============================================================================

/**
 * Redacted payload with metadata
 */
export interface RedactedPayload {
  content: unknown;
  redactionCount: number;
  redactedTypes: string[];
}

/**
 * Egress guard interface
 */
export interface EgressGuard {
  redact(input: unknown): RedactedPayload;
  redactText(text: string): string;
}

// =============================================================================
// LLM Client Types
// =============================================================================

/**
 * Chat message
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * LLM chat request
 */
export interface LlmChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: Array<Record<string, unknown>>;
  toolChoice?: 'auto' | 'required' | { type: string; function: { name: string } };
}

/**
 * LLM chat response
 */
export interface LlmChatResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * LLM client interface
 */
export interface LlmClient {
  chat(request: LlmChatRequest): Promise<LlmChatResponse>;
  streamChat?(request: LlmChatRequest): AsyncIterable<LlmStreamChunk>;
}

// =============================================================================
// MCP Types
// =============================================================================

/**
 * MCP call parameters
 */
export interface MCPCallParams {
  toolName: string;
  params: Record<string, unknown>;
}

/**
 * MCP call response
 */
export interface MCPCallResponse {
  result: unknown;
  error?: string;
}

// =============================================================================
// Orchestrator Types
// =============================================================================

/**
 * Compliance request to the orchestrator
 */
export interface ComplianceRequest {
  messages: ChatMessage[];
  profile?: UserProfile;
  jurisdictions?: string[];
}

/**
 * Compliance response from the orchestrator
 */
export interface ComplianceResponse {
  answer: string;
  referencedNodes: Array<{
    id: string;
    label: string;
    type: string;
  }>;
  agentUsed: string;
  uncertaintyLevel?: 'low' | 'medium' | 'high';
  followUps?: string[];
  disclaimer: string;
}
