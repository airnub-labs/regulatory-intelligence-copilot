/**
 * Local Memgraph MCP client for direct queries (not through E2B)
 *
 * This client connects directly to the memgraph-mcp Docker service
 * for querying the knowledge graph from chat.
 */

// Default URL for local memgraph-mcp service
const DEFAULT_MEMGRAPH_MCP_URL = process.env.MEMGRAPH_MCP_URL || 'http://localhost:8001';

interface MemgraphQueryResult {
  records: unknown[];
  error?: string;
}

/**
 * Execute a Cypher query against Memgraph via the local MCP service
 */
export async function queryMemgraphLocal(cypherQuery: string): Promise<MemgraphQueryResult> {
  const url = `${DEFAULT_MEMGRAPH_MCP_URL}/mcp/`;

  try {
    // Use JSON-RPC format for MCP
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'run_query',
          arguments: { query: cypherQuery },
        },
        id: Date.now(),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { records: [], error: `Memgraph query failed: ${response.status} - ${errorText}` };
    }

    const contentType = response.headers.get('content-type') || '';

    // Handle SSE response
    if (contentType.includes('text/event-stream')) {
      const text = await response.text();
      const lines = text.split('\n');
      let result: unknown = null;

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.result !== undefined) {
              result = data.result;
            } else if (data.content) {
              result = data.content;
            } else {
              result = data;
            }
          } catch {
            // Skip non-JSON lines
          }
        }
      }

      return { records: Array.isArray(result) ? result : [result] };
    }

    // Handle JSON response
    const jsonResponse = await response.json() as {
      result?: unknown;
      error?: { message?: string };
    };

    if (jsonResponse.error) {
      return { records: [], error: jsonResponse.error.message || 'Unknown error' };
    }

    const result = jsonResponse.result;
    return { records: Array.isArray(result) ? result : [result] };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { records: [], error: `Failed to query Memgraph: ${message}` };
  }
}

/**
 * Get the Memgraph schema via the local MCP service
 */
export async function getMemgraphSchemaLocal(): Promise<MemgraphQueryResult> {
  const url = `${DEFAULT_MEMGRAPH_MCP_URL}/mcp/`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'get_schema',
          arguments: {},
        },
        id: Date.now(),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { records: [], error: `Schema query failed: ${response.status} - ${errorText}` };
    }

    const contentType = response.headers.get('content-type') || '';

    // Handle SSE response
    if (contentType.includes('text/event-stream')) {
      const text = await response.text();
      const lines = text.split('\n');
      let result: unknown = null;

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.result !== undefined) {
              result = data.result;
            } else {
              result = data;
            }
          } catch {
            // Skip non-JSON lines
          }
        }
      }

      return { records: Array.isArray(result) ? result : [result] };
    }

    const jsonResponse = await response.json() as {
      result?: unknown;
      error?: { message?: string };
    };

    if (jsonResponse.error) {
      return { records: [], error: jsonResponse.error.message || 'Unknown error' };
    }

    const result = jsonResponse.result;
    return { records: Array.isArray(result) ? result : [result] };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { records: [], error: `Failed to get schema: ${message}` };
  }
}
