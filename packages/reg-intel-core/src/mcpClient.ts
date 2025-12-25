/**
 * MCP Client - communicates with E2B's built-in MCP Gateway for Perplexity and Memgraph tools
 */

import { createParser, type EventSourceMessage } from 'eventsource-parser';
import type { MCPCallParams, MCPCallResponse } from './types.js';
import { applyAspects, type Aspect } from '@reg-copilot/reg-intel-prompts';
import { sanitizeObjectForEgress } from '@reg-copilot/reg-intel-llm';
import {
  createLogger,
  injectTraceContextHeaders,
  requestContext,
  withSpan,
} from '@reg-copilot/reg-intel-observability';
import { trace } from '@opentelemetry/api';
import { SEMATTRS_HTTP_METHOD, SEMATTRS_HTTP_URL } from '@opentelemetry/semantic-conventions';

const logger = createLogger('McpClient', { component: 'mcp' });

// MCP Gateway configuration - set once from the active sandbox
let mcpGatewayUrl = '';
let mcpGatewayToken = '';
let mcpGatewaySandboxId: string | null = null;

function persistMcpGatewayConfig(url: string, token: string, sandboxId?: string): void {
  mcpGatewayUrl = url;
  mcpGatewayToken = token;
  mcpGatewaySandboxId = sandboxId ?? mcpGatewaySandboxId ?? null;
}

/**
 * Configure MCP client with gateway credentials from E2B sandbox
 */
export function configureMcpGateway(url: string, token: string, sandboxId?: string): void {
  // Avoid reconfiguring if the gateway is already initialized with the same values
  if (mcpGatewayUrl === url && mcpGatewayToken === token && mcpGatewaySandboxId === sandboxId) {
    return;
  }

  persistMcpGatewayConfig(url, token, sandboxId);
  logger.info(
    { event: 'mcp.gateway.configured', sandboxId: mcpGatewaySandboxId, url },
    'MCP gateway configured'
  );
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

export function getMcpGatewaySandboxId(): string | null {
  return mcpGatewaySandboxId;
}

/**
 * Base MCP call function using JSON-RPC format
 */
async function baseMcpCall(params: MCPCallParams): Promise<MCPCallResponse> {
  const sandboxId = mcpGatewaySandboxId ?? 'unknown';
  return withSpan(
    'egress.mcp.call',
    {
      'mcp.tool': params.toolName,
      'app.sandbox.id': sandboxId,
      'mcp.policy.sanitized': true,
      [SEMATTRS_HTTP_METHOD]: 'POST',
      [SEMATTRS_HTTP_URL]: mcpGatewayUrl,
    },
    async () => {
      const headers = new Headers({
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      });

      // Add bearer token if available (for E2B gateway)
      if (mcpGatewayToken) {
        headers.set('Authorization', `Bearer ${mcpGatewayToken}`);
      }

      injectTraceContextHeaders(headers);
      if (!headers.has('traceparent')) {
        const spanContext = trace.getActiveSpan()?.spanContext();
        if (spanContext) {
          headers.set(
            'traceparent',
            `00-${spanContext.traceId}-${spanContext.spanId}-01`
          );
        }
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
  );
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

  logger.info(
    {
      event: 'mcp.call.start',
      toolName: req.toolName,
      toolDisplayName,
      sandboxId: mcpGatewaySandboxId,
      ...requestContext.get(),
    },
    'Calling MCP tool'
  );

  try {
    const result = await next(req);
    const duration = Date.now() - start;
    logger.info(
      {
        event: 'mcp.call.finish',
        toolName: req.toolName,
        toolDisplayName,
        durationMs: duration,
        sandboxId: mcpGatewaySandboxId,
      },
      'MCP tool completed'
    );
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error(
      {
        event: 'mcp.call.error',
        toolName: req.toolName,
        toolDisplayName,
        durationMs: duration,
        sandboxId: mcpGatewaySandboxId,
        error: error instanceof Error ? error.message : String(error),
      },
      'MCP tool failed'
    );
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
