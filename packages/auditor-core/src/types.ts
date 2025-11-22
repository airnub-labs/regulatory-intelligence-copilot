// Raw HTTP exchange captured inside the sandbox
export interface RawHttpExchange {
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: Record<string, string>;
    body: string;
  };
  response: {
    httpVersion: string;
    statusCode: number;
    statusMessage: string;
    headers: Record<string, string>;
    body: string;
  };
}

// Sanitized HTTP exchange safe for egress
export interface SanitizedHttpExchange {
  request: {
    method: string;
    urlTemplate: string;
    httpVersion: string;
    headerNames: string[];
    bodyKind: 'json' | 'text' | 'html' | 'binary' | 'unknown' | 'empty';
    bodyPreview: string;
  };
  response: {
    httpVersion: string;
    statusCode: number;
    statusMessage: string;
    headerNames: string[];
    bodyKind: 'json' | 'text' | 'html' | 'binary' | 'unknown' | 'empty';
    bodyPreview: string;
  };
}

// Enriched spec from Perplexity MCP
export interface EnrichedSpec {
  type: 'rfc' | 'owasp';
  id: string;
  title: string;
  sections?: string[];
  relationships?: Array<{
    type: string;
    targetId: string;
  }>;
  version?: string;
}

// Graph context from Memgraph
export interface GraphContext {
  nodes: Array<{
    id: string;
    type: 'rfc' | 'owasp' | 'section' | 'concept';
    properties: Record<string, string>;
  }>;
  edges: Array<{
    source: string;
    target: string;
    type: string;
  }>;
}

// Discovery context for spec lookup
export interface DiscoveryContext {
  sanitizedExchanges: SanitizedHttpExchange[];
  userQuestion?: string;
}

// Compliance finding per endpoint
export interface EndpointFinding {
  endpoint: string;
  method: string;
  status: 'compliant' | 'warning' | 'critical';
  issues: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    rfcReferences: string[];
    owaspReferences: string[];
  }>;
  suggestions: string[];
  sourceLocation?: {
    file: string;
    startLine: number;
    endLine: number;
    repoUrl?: string;
  };
}

// Full compliance report
export interface ComplianceReport {
  summary: string;
  overallHealth: 'healthy' | 'degraded' | 'critical';
  endpoints: EndpointFinding[];
  rfcsCited: string[];
  owaspCited: string[];
  graphContext?: GraphContext;
  timestamp: string;
}

// MCP call parameters
export interface MCPCallParams {
  toolName: string;
  params: Record<string, unknown>;
}

// MCP call response
export interface MCPCallResponse {
  result: unknown;
  error?: string;
}

// Groq chat message
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Groq chat request
export interface GroqChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

// Groq chat response
export interface GroqChatResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
