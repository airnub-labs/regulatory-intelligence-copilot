/**
 * MCP Gateway for Local Development
 *
 * This gateway serves as a fallback when the E2B built-in MCP gateway is not available.
 * It routes HTTP requests to MCP tool servers running as Docker services.
 *
 * In production with E2B sandboxes:
 * - Perplexity MCP is configured via `mcp: { perplexity: { apiKey } }` during sandbox creation
 * - E2B handles the gateway internally using stdio transport
 * - Use getMcpUrl()/getMcpToken() to get E2B gateway credentials
 *
 * For local development:
 * - Perplexity and Memgraph MCPs run as HTTP services in Docker
 * - This gateway routes tool calls to those services
 *
 * Memgraph Note:
 * - Memgraph runs as a persistent Docker service (not inside E2B sandbox)
 * - This allows the knowledge graph to persist across audit sessions
 * - Always accessed via this gateway, even when using E2B for other tools
 */

import express from 'express';

const app = express();
const PORT = process.env.PORT || 8080;

// MCP server URLs
const MEMGRAPH_MCP_URL = process.env.MEMGRAPH_MCP_URL || 'http://memgraph-mcp:8000/mcp/';
const PERPLEXITY_MCP_URL = process.env.PERPLEXITY_MCP_URL || 'http://perplexity-mcp:3000';

// Request size limit
app.use(express.json({ limit: '1mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[Gateway] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Tool routing configuration
const TOOL_ROUTES = {
  // Memgraph tools - for knowledge graph operations
  'memgraph_mcp.run_query': { server: 'memgraph', tool: 'run_query' },
  'memgraph_mcp.get_schema': { server: 'memgraph', tool: 'get_schema' },

  // Perplexity tools - matching official mcp/perplexity-ask image
  'perplexity_mcp.search': { server: 'perplexity', tool: 'perplexity_search' },
  'perplexity_mcp.perplexity_search': { server: 'perplexity', tool: 'perplexity_search' },
  'perplexity.perplexity_ask': { server: 'perplexity', tool: 'perplexity_ask' },
  'perplexity.perplexity_search': { server: 'perplexity', tool: 'perplexity_search' },
  'perplexity.perplexity_research': { server: 'perplexity', tool: 'perplexity_research' },

  // Direct tool names (E2B gateway compatibility)
  'perplexity_ask': { server: 'perplexity', tool: 'perplexity_ask' },
  'perplexity_search': { server: 'perplexity', tool: 'perplexity_search' },
  'perplexity_research': { server: 'perplexity', tool: 'perplexity_research' },
};

// Get server URL for a route
function getServerUrl(server) {
  switch (server) {
    case 'memgraph':
      return MEMGRAPH_MCP_URL;
    case 'perplexity':
      return PERPLEXITY_MCP_URL;
    default:
      return null;
  }
}

// Route MCP tool calls to appropriate servers
app.post('/tools/:toolName', async (req, res) => {
  const { toolName } = req.params;
  const params = req.body;

  // Validate request body
  if (!params || typeof params !== 'object') {
    return res.status(400).json({
      error: 'Invalid request body',
      message: 'Request body must be a JSON object'
    });
  }

  try {
    // Look up route in configuration
    let route = TOOL_ROUTES[toolName];

    // Handle dynamic tool names (e.g., memgraph_mcp.custom_query)
    if (!route) {
      if (toolName.startsWith('memgraph_mcp.')) {
        route = { server: 'memgraph', tool: toolName.replace('memgraph_mcp.', '') };
      } else if (toolName.startsWith('perplexity_mcp.')) {
        route = { server: 'perplexity', tool: toolName.replace('perplexity_mcp.', '') };
      } else if (toolName.startsWith('perplexity.')) {
        route = { server: 'perplexity', tool: toolName.replace('perplexity.', '') };
      }
    }

    if (!route) {
      console.error(`[Gateway] Unknown tool: ${toolName}`);
      return res.status(400).json({
        error: 'Unknown tool',
        message: `Tool '${toolName}' is not registered. Available prefixes: memgraph_mcp.*, perplexity_mcp.*, perplexity.*`
      });
    }

    const serverUrl = getServerUrl(route.server);
    if (!serverUrl) {
      return res.status(500).json({
        error: 'Server configuration error',
        message: `No URL configured for server '${route.server}'`
      });
    }

    const targetUrl = `${serverUrl}/tools/${route.tool}`;
    console.log(`[Gateway] Routing ${toolName} -> ${targetUrl}`);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Gateway-Request-Id': `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Gateway] Tool error: ${response.status} - ${errorText}`);
      return res.status(response.status).json({
        error: `Tool execution failed`,
        message: errorText,
        tool: toolName
      });
    }

    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error(`[Gateway] Error calling ${toolName}:`, error);
    res.status(500).json({
      error: 'Gateway error',
      message: error.message,
      tool: toolName
    });
  }
});

// List available tools
app.get('/tools', (req, res) => {
  const tools = Object.keys(TOOL_ROUTES).map(name => ({
    name,
    server: TOOL_ROUTES[name].server,
    tool: TOOL_ROUTES[name].tool
  }));
  res.json({ tools });
});

// Health check
app.get('/health', async (req, res) => {
  const checks = {
    gateway: 'healthy',
    memgraph_mcp: 'unknown',
    perplexity_mcp: 'unknown'
  };

  // Check Memgraph MCP
  try {
    const memResponse = await fetch(`${MEMGRAPH_MCP_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });
    checks.memgraph_mcp = memResponse.ok ? 'healthy' : 'unhealthy';
  } catch {
    checks.memgraph_mcp = 'unavailable';
  }

  // Check Perplexity MCP
  try {
    const pplxResponse = await fetch(`${PERPLEXITY_MCP_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });
    checks.perplexity_mcp = pplxResponse.ok ? 'healthy' : 'unhealthy';
  } catch {
    checks.perplexity_mcp = 'unavailable';
  }

  const allHealthy = Object.values(checks).every(s => s === 'healthy');
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    checks
  });
});

app.listen(PORT, () => {
  console.log(`[Gateway] MCP Gateway running on port ${PORT}`);
  console.log(`[Gateway] Memgraph MCP: ${MEMGRAPH_MCP_URL}`);
  console.log(`[Gateway] Perplexity MCP: ${PERPLEXITY_MCP_URL}`);
});
