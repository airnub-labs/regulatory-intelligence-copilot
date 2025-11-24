export interface TimelineNode {
  label: string;
  window_days?: number;
  window_months?: number;
  window_years?: number;
  notes?: string;
}

export interface GraphNode {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  id?: string;
  type: string;
  properties?: Record<string, unknown>;
  source: string;
  target: string;
}

export interface GraphSlice {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ProfileContext {
  profileId?: string;
  tags?: string[];
  description?: string;
}

export interface AgentInput {
  messages: Array<{ role: string; content: string }>;
  profile?: ProfileContext;
  jurisdictions?: string[];
  referenceDate?: Date;
}

export interface AgentResult {
  answer: string;
  referencedNodes: string[];
  notes?: string[];
  uncertaintyLevel?: 'low' | 'medium' | 'high';
}

export interface AgentContext {
  graphClient: GraphClient;
  timeline: TimelineEngine;
  egressGuard: EgressGuard;
  llmClient?: LlmClient;
}

export interface Agent {
  id: string;
  canHandle(input: AgentInput): Promise<boolean>;
  handle(input: AgentInput, ctx: AgentContext): Promise<AgentResult>;
}

export interface GraphClient {
  getRulesForProfileAndJurisdiction(
    profileId: string | undefined,
    jurisdictionId: string | undefined,
    keyword?: string,
  ): Promise<GraphSlice>;
  getNeighbourhood(nodeId: string): Promise<GraphSlice>;
  getMutualExclusions(nodeId: string): Promise<GraphSlice>;
  getTimelines(nodeId: string): Promise<TimelineNode[]>;
  getCrossBorderSlice(jurisdictionIds: string[]): Promise<GraphSlice>;
}

export interface TimelineEngine {
  computeLookbackRange(timeline: TimelineNode, now: Date): LookbackResult;
  isWithinLookback(eventDate: Date, timeline: TimelineNode, now: Date): LookbackCheckResult;
  computeLockInEnd(triggerDate: Date, timeline: TimelineNode): LockInResult;
  isLockInActive(triggerDate: Date, timeline: TimelineNode, now: Date): LockInCheckResult;
}

export interface EgressGuard {
  redact<T>(input: T): T;
}

export interface LlmClient {
  generate(prompt: string): Promise<string>;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface LookbackResult {
  range: DateRange;
  description: string;
}

export interface LookbackCheckResult {
  within: boolean;
  range: DateRange;
  description: string;
}

export interface LockInResult {
  end: Date;
  description: string;
}

export interface LockInCheckResult {
  active: boolean;
  end: Date;
  description: string;
}
