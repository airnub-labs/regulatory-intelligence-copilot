/**
 * MCP Client - communicates with E2B's built-in MCP Gateway for Perplexity and Memgraph tools
 */

import type { MCPCallParams, MCPCallResponse } from './types.js';
import { applyAspects, type Aspect } from './aspects/applyAspects.js';
import { sanitizeObjectForEgress } from './aspects/egressGuard.js';

// MCP Gateway configuration - must be set via configureMcpGateway() from E2B sandbox
let mcpGatewayUrl = '';
let mcpGatewayToken = '';

/**
 * Configure MCP client with gateway credentials from E2B sandbox
 */
export function configureMcpGateway(url: string, token: string): void {
  mcpGatewayUrl = url;
  mcpGatewayToken = token;
}

/**
 * Get current MCP gateway URL
 */
export function getMcpGatewayUrl(): string {
  return mcpGatewayUrl;
}

/**
 * Base MCP call function
 */
async function baseMcpCall(params: MCPCallParams): Promise<MCPCallResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add bearer token if available (for E2B gateway)
  if (mcpGatewayToken) {
    headers['Authorization'] = `Bearer ${mcpGatewayToken}`;
  }

  const response = await fetch(`${mcpGatewayUrl}/tools/${params.toolName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params.params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      result: null,
      error: `MCP call failed: ${response.status} - ${errorText}`,
    };
  }

  const result = await response.json();
  return { result };
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

  try {
    const result = await next(req);
    const duration = Date.now() - start;
    console.log(`[MCP] ${req.toolName} completed in ${duration}ms`);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`[MCP] ${req.toolName} failed after ${duration}ms`);
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
    throw new Error('MCP gateway not configured. Call configureMcpGateway() with E2B sandbox credentials first.');
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
    throw new Error('MCP gateway not configured. Call configureMcpGateway() with E2B sandbox credentials first.');
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
    throw new Error('MCP gateway not configured. Call configureMcpGateway() with E2B sandbox credentials first.');
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
