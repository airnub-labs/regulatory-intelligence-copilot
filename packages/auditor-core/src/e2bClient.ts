/**
 * E2B sandbox client for creating and managing sandboxes
 * Uses E2B's built-in MCP gateway for tool access
 *
 * E2B MCP Architecture:
 * - E2B provides a batteries-included MCP gateway inside sandboxes
 * - Tools are configured during sandbox creation via the `mcp` option
 * - Gateway uses stdio transport internally, exposed via HTTP with bearer auth
 * - Use getMcpUrl()/getMcpToken() to get gateway credentials
 *
 * Docker Hub MCP Servers:
 * - Configure with: 'server-name': { apiKey: '...' }
 * - E2B pulls the pre-built MCP server from Docker Hub
 * - Example: Perplexity uses 'perplexity-ask' from Docker Hub
 *
 * Custom MCP Servers (from GitHub):
 * - Configure with: 'github/owner/repo': { installCmd, runCmd }
 * - E2B clones the repo, runs installCmd, then starts with runCmd
 * - Server must use stdio transport
 * - Example: Memgraph uses 'github/memgraph/ai-toolkit' (mcp-memgraph)
 */

import { Sandbox } from '@e2b/code-interpreter';
import { DEFAULT_SANDBOX_TIMEOUT_MS, LOG_PREFIX } from './constants.js';
import { SandboxError } from './errors.js';

export interface SandboxHandle {
  sandbox: Sandbox;
  id: string;
  mcpUrl: string;
  mcpToken: string;
}

// MCP configuration types following E2B patterns
// Docker Hub MCP servers: just pass credentials (e.g., apiKey)
// Custom MCP servers: use installCmd/runCmd pattern
interface DockerHubMCPConfig {
  apiKey?: string;
  [key: string]: string | undefined;
}

interface CustomMCPServerConfig {
  runCmd: string;
  installCmd?: string;
}

type MCPConfig = {
  [key: string]: DockerHubMCPConfig | CustomMCPServerConfig;
};

/**
 * Get MCP gateway credentials from sandbox
 *
 * Tries standard API first, then beta API. Throws if E2B MCP gateway is not available.
 */
async function getMcpCredentials(sandbox: Sandbox): Promise<{ mcpUrl: string; mcpToken: string }> {
  // Cast to access potential MCP methods (may be in beta or standard API)
  const sbx = sandbox as unknown as Record<string, unknown>;

  // Try standard API first
  if (typeof sbx.getMcpUrl === 'function' && typeof sbx.getMcpToken === 'function') {
    const url = (sbx.getMcpUrl as () => string)();
    const token = await (sbx.getMcpToken as () => Promise<string>)();
    return { mcpUrl: url, mcpToken: token };
  }

  // Fall back to beta API
  if (typeof sbx.betaGetMcpUrl === 'function' && typeof sbx.betaGetMcpToken === 'function') {
    const url = (sbx.betaGetMcpUrl as () => string)();
    const token = await (sbx.betaGetMcpToken as () => Promise<string>)();
    return { mcpUrl: url, mcpToken: token };
  }

  throw new SandboxError(
    'E2B MCP gateway methods not available. Ensure you are using an E2B sandbox with MCP support enabled.'
  );
}

/**
 * Create a new E2B sandbox with MCP gateway configured
 *
 * @param options - Optional configuration overrides
 * @returns SandboxHandle with gateway credentials
 */
export async function createSandbox(options?: {
  timeoutMs?: number;
}): Promise<SandboxHandle> {
  const mcpConfig: MCPConfig = {};

  // Configure Perplexity MCP using Docker Hub MCP server
  // Docker Hub: https://hub.docker.com/mcp/server/perplexity-ask
  // E2B docs: https://e2b.dev/docs/mcp
  if (process.env.PERPLEXITY_API_KEY) {
    mcpConfig['perplexity-ask'] = {
      apiKey: process.env.PERPLEXITY_API_KEY,
    };
  }

  // Configure Memgraph MCP using custom server pattern from GitHub
  // Repo: https://github.com/memgraph/ai-toolkit/tree/main/integrations/mcp-memgraph
  // E2B clones the repo, installs, and runs with stdio transport
  if (process.env.MEMGRAPH_HOST) {
    mcpConfig['github/memgraph/ai-toolkit'] = {
      installCmd: 'cd integrations/mcp-memgraph && pip install .',
      runCmd: 'MCP_TRANSPORT=stdio mcp-memgraph',
    };
  }

  // Create sandbox with MCP configuration
  const sandbox = await Sandbox.create({
    timeoutMs: options?.timeoutMs || DEFAULT_SANDBOX_TIMEOUT_MS,
    // Pass environment variables to sandbox
    envs: {
      PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY || '',
      // Memgraph MCP expects MEMGRAPH_URL in bolt:// format
      MEMGRAPH_URL: process.env.MEMGRAPH_HOST
        ? `bolt://${process.env.MEMGRAPH_HOST}:${process.env.MEMGRAPH_PORT || '7687'}`
        : '',
      MEMGRAPH_USER: process.env.MEMGRAPH_USER || 'memgraph',
      MEMGRAPH_PASSWORD: process.env.MEMGRAPH_PASSWORD || '',
      MCP_READ_ONLY: process.env.MCP_READ_ONLY || 'false',
    },
    // MCP gateway configuration
    ...(Object.keys(mcpConfig).length > 0 && { mcp: mcpConfig }),
  });

  // Get MCP gateway credentials
  // API may be getMcpUrl/getMcpToken or betaGetMcpUrl/betaGetMcpToken
  const { mcpUrl, mcpToken } = await getMcpCredentials(sandbox);

  console.log(`${LOG_PREFIX.e2b} Sandbox created: ${sandbox.sandboxId}`);
  console.log(`${LOG_PREFIX.e2b} MCP Gateway URL: ${mcpUrl}`);
  console.log(`${LOG_PREFIX.e2b} MCP Token available: ${mcpToken ? 'yes' : 'no'}`);

  return {
    sandbox,
    id: sandbox.sandboxId,
    mcpUrl,
    mcpToken,
  };
}

/**
 * Run sample API server inside the sandbox
 */
export async function runSampleApiInSandbox(handle: SandboxHandle): Promise<void> {
  const { sandbox } = handle;

  // Sample API server code
  const sampleApiCode = `
const http = require('http');

const app = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost:3001');
  const pathname = url.pathname;
  const method = req.method;

  res.setHeader('Content-Type', 'application/json');

  // GET /health-perfect - Fully compliant endpoint
  if (method === 'GET' && pathname === '/health-perfect') {
    res.statusCode = 200;
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }));
    return;
  }

  // GET /user-leaky - Leaks PII
  if (method === 'GET' && pathname === '/user-leaky') {
    res.statusCode = 200;
    res.end(JSON.stringify({
      id: 12345,
      email: 'john.doe@example.com',
      name: 'John Doe',
      ssn: '123-45-6789',
      creditCardNumber: '4111-1111-1111-1111',
      password: 'hashed_but_still_exposed_p@ssw0rd123',
      internalUserId: 'usr_internal_abc123xyz',
      apiKey: 'sk_live_abcdef123456789',
      phoneNumber: '+1-555-123-4567'
    }));
    return;
  }

  // GET /debug-error - Exposes stack traces
  if (method === 'GET' && pathname === '/debug-error') {
    try {
      const obj = null;
      obj.nonExistentMethod();
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
        stack: error.stack,
        debugInfo: {
          nodeVersion: process.version,
          platform: process.platform,
          env: {
            DATABASE_URL: 'postgres://admin:secret@localhost:5432/mydb',
            SECRET_KEY: 'super_secret_key_12345'
          }
        }
      }));
    }
    return;
  }

  // POST /items-injection - Injection vulnerability
  if (method === 'POST' && pathname === '/items-injection') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const unsafeQuery = \`SELECT * FROM items WHERE name = '\${data.name}' AND \${data.query}\`;
        res.statusCode = 200;
        res.end(JSON.stringify({
          message: 'Item processed',
          generatedQuery: unsafeQuery,
          input: data
        }));
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // GET /cors-wildcard - CORS misconfiguration
  if (method === 'GET' && pathname === '/cors-wildcard') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', 'Authorization, X-Api-Key');
    res.statusCode = 200;
    res.end(JSON.stringify({
      data: 'Sensitive data with wildcard CORS',
      internalToken: 'tok_internal_xyz789'
    }));
    return;
  }

  // 404 for unknown routes
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
});

app.listen(3001, () => {
  console.log('Sample API running on port 3001');
});
`;

  await sandbox.runCode(sampleApiCode);

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));
}

/**
 * Run code inside the sandbox and return result
 */
export async function runInSandbox<T>(
  handle: SandboxHandle,
  code: string
): Promise<T> {
  const { sandbox } = handle;
  const result = await sandbox.runCode(code);

  if (result.error) {
    throw new Error(`Sandbox execution error: ${result.error.name}: ${result.error.value}`);
  }

  // Parse the last result
  if (result.results && result.results.length > 0) {
    const lastResult = result.results[result.results.length - 1];
    if (lastResult.text) {
      try {
        return JSON.parse(lastResult.text) as T;
      } catch {
        return lastResult.text as T;
      }
    }
  }

  return undefined as T;
}

/**
 * Cleanup sandbox
 */
export async function closeSandbox(handle: SandboxHandle): Promise<void> {
  await handle.sandbox.kill();
}
