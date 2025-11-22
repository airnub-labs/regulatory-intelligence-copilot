/**
 * MCP Client - communicates with E2B's built-in MCP Gateway for Perplexity and Memgraph tools
 */

import { createParser, type EventSourceMessage } from 'eventsource-parser';
import type { MCPCallParams, MCPCallResponse } from './types.js';
import { applyAspects, type Aspect } from './aspects/applyAspects.js';
import { sanitizeObjectForEgress } from './aspects/egressGuard.js';

// MCP Gateway configuration - set once from the active sandbox
let mcpGatewayUrl = '';
let mcpGatewayToken = '';

function persistMcpGatewayConfig(url: string, token: string): void {
  mcpGatewayUrl = url;
  mcpGatewayToken = token;
}

/**
 * Configure MCP client with gateway credentials from E2B sandbox
 */
export function configureMcpGateway(url: string, token: string): void {
  // Avoid reconfiguring if the gateway is already initialized with the same values
  if (mcpGatewayUrl === url && mcpGatewayToken === token) {
    return;
  }

  persistMcpGatewayConfig(url, token);
  console.log('[MCP] Gateway configured - Perplexity and Memgraph tools available');
}

/**
 * Check whether the MCP gateway is currently configured.
 */
export function isMcpGatewayConfigured(): boolean {
  return Boolean(mcpGatewayUrl);
}

/**
 * Get current MCP gateway URL
 */
export function getMcpGatewayUrl(): string {
  return mcpGatewayUrl;
}

/**
 * Base MCP call function using JSON-RPC format
 */
async function baseMcpCall(params: MCPCallParams): Promise<MCPCallResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };

  // Add bearer token if available (for E2B gateway)
  if (mcpGatewayToken) {
    headers['Authorization'] = `Bearer ${mcpGatewayToken}`;
  }

  // MCP uses JSON-RPC 2.0 format
  const jsonRpcRequest = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: params.toolName,
      arguments: params.params,
    },
    id: Date.now(),
  };

  const response = await fetch(mcpGatewayUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(jsonRpcRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      result: null,
      error: `MCP call failed: ${response.status} - ${errorText}`,
    };
  }

  const contentType = response.headers.get('content-type') || '';

  // Handle SSE response using eventsource-parser
  if (contentType.includes('text/event-stream')) {
    const text = await response.text();
    let result: unknown = null;

    const parser = createParser({
      onEvent: (event: EventSourceMessage) => {
        if (event.data) {
          try {
            const data = JSON.parse(event.data);
            // Look for the result in the SSE data
            if (data.result !== undefined) {
              result = data.result;
            } else if (data.content) {
              result = data.content;
            } else {
              result = data;
            }
          } catch {
            // Skip non-JSON data
          }
        }
      },
    });

    parser.feed(text);

    return { result };
  }

  // Handle JSON response
  const jsonRpcResponse = await response.json() as {
    result?: unknown;
    error?: { message?: string; code?: number };
  };

  if (jsonRpcResponse.error) {
    return {
      result: null,
      error: `MCP error: ${jsonRpcResponse.error.message || JSON.stringify(jsonRpcResponse.error)}`,
    };
  }

  return { result: jsonRpcResponse.result };
}

/**
 * MCP sanitization aspect - sanitizes outbound content
 */
const mcpSanitizationAspect: Aspect<MCPCallParams, MCPCallResponse> = async (req, next) => {
  // Sanitize params before sending
  const sanitizedParams: MCPCallParams = {
    toolName: req.toolName,
    params: sanitizeObjectForEgress(req.params),
  };

  return next(sanitizedParams);
};

/**
 * MCP logging aspect - logs tool calls without exposing payloads
 */
const mcpLoggingAspect: Aspect<MCPCallParams, MCPCallResponse> = async (req, next) => {
  const start = Date.now();

  // Friendly names for demo visibility
  const toolDisplayName = req.toolName.includes('perplexity')
    ? 'Perplexity (spec discovery)'
    : req.toolName.includes('memgraph')
      ? 'Memgraph (knowledge graph)'
      : req.toolName;

  console.log(`[MCP] Calling ${toolDisplayName}...`);

  try {
    const result = await next(req);
    const duration = Date.now() - start;
    console.log(`[MCP] ${toolDisplayName} completed in ${duration}ms`);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`[MCP] ${toolDisplayName} failed after ${duration}ms`);
    throw error;
  }
};

/**
 * Aspect-wrapped MCP call
 */
export const mcpCall = applyAspects(baseMcpCall, [
  mcpLoggingAspect,
  mcpSanitizationAspect,
]);

/**
 * Call Perplexity MCP for spec discovery
 * Uses perplexity_ask tool from E2B's built-in MCP gateway
 */
export async function callPerplexityMcp(query: string): Promise<string> {
  if (!mcpGatewayUrl) {
    throw new Error('MCP gateway not configured. Run an audit to initialize the E2B sandbox.');
  }

  const response = await mcpCall({
    toolName: 'perplexity.perplexity_ask',
    params: { query },
  });

  if (response.error) {
    throw new Error(response.error);
  }

  return response.result as string;
}

/**
 * Call Memgraph MCP to run a Cypher query
 */
export async function callMemgraphMcp(cypherQuery: string): Promise<unknown> {
  if (!mcpGatewayUrl) {
    throw new Error('MCP gateway not configured. Run an audit to initialize the E2B sandbox.');
  }

  const response = await mcpCall({
    toolName: 'memgraph_mcp.run_query',
    params: { query: cypherQuery },
  });

  if (response.error) {
    throw new Error(response.error);
  }

  return response.result;
}

/**
 * Get Memgraph schema
 */
export async function getMemgraphSchema(): Promise<unknown> {
  if (!mcpGatewayUrl) {
    throw new Error('MCP gateway not configured. Run an audit to initialize the E2B sandbox.');
  }

  const response = await mcpCall({
    toolName: 'memgraph_mcp.get_schema',
    params: {},
  });

  if (response.error) {
    throw new Error(response.error);
  }

  return response.result;
}
