/**
 * E2B sandbox client for creating and managing sandboxes
 * Uses E2B's built-in MCP gateway for tool access
 */

import { Sandbox } from '@e2b/code-interpreter';
import { DEFAULT_SANDBOX_TIMEOUT_MS } from './constants.js';
import { SandboxError } from './errors.js';
import { createLogger } from '@reg-copilot/reg-intel-observability';

const logger = createLogger('E2BSandboxClient', { component: 'Sandbox' });

export interface SandboxHandle {
  sandbox: Sandbox;
  id: string;
  mcpUrl: string;
  mcpToken: string;
}

// MCP configuration types
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
 */
async function getMcpCredentials(sandbox: Sandbox): Promise<{ mcpUrl: string; mcpToken: string }> {
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
 */
export async function createSandbox(options?: {
  timeoutMs?: number;
}): Promise<SandboxHandle> {
  const mcpConfig: MCPConfig = {};

  // Configure Perplexity MCP using Docker Hub MCP server
  if (process.env.PERPLEXITY_API_KEY) {
    mcpConfig['perplexity-ask'] = {
      apiKey: process.env.PERPLEXITY_API_KEY,
    };
  }

  // Configure Memgraph MCP using custom server pattern from GitHub
  if (process.env.MEMGRAPH_HOST) {
    mcpConfig['github/memgraph/ai-toolkit'] = {
      installCmd: 'cd integrations/mcp-memgraph && pip install .',
      runCmd: 'MCP_TRANSPORT=stdio mcp-memgraph',
    };
  }

  // Create sandbox with MCP configuration
  const sandbox = await Sandbox.create({
    timeoutMs: options?.timeoutMs || DEFAULT_SANDBOX_TIMEOUT_MS,
    envs: {
      PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY || '',
      MEMGRAPH_URL: process.env.MEMGRAPH_HOST
        ? `bolt://${process.env.MEMGRAPH_HOST}:${process.env.MEMGRAPH_PORT || '7687'}`
        : '',
      MEMGRAPH_USER:
        process.env.MEMGRAPH_USERNAME || process.env.MEMGRAPH_USER || 'memgraph',
      MEMGRAPH_USERNAME:
        process.env.MEMGRAPH_USERNAME || process.env.MEMGRAPH_USER || 'memgraph',
      MEMGRAPH_PASSWORD: process.env.MEMGRAPH_PASSWORD || '',
      MCP_READ_ONLY: process.env.MCP_READ_ONLY || 'false',
    },
    ...(Object.keys(mcpConfig).length > 0 && { mcp: mcpConfig }),
  });

  const { mcpUrl, mcpToken } = await getMcpCredentials(sandbox);

  logger.info({ event: 'sandbox.created', sandboxId: sandbox.sandboxId });
  logger.info({ event: 'sandbox.mcp.gateway', mcpUrl });
  logger.info({ event: 'sandbox.mcp.token.available', available: Boolean(mcpToken) });

  return {
    sandbox,
    id: sandbox.sandboxId,
    mcpUrl,
    mcpToken,
  };
}

/**
 * Run JavaScript code inside the sandbox and return result
 */
export async function runInSandbox<T>(
  handle: SandboxHandle,
  code: string
): Promise<T> {
  const { sandbox } = handle;

  const wrappedCode = `
    (async () => {
      ${code}
    })().then(result => {
      if (result !== undefined) {
        process.stdout.write(JSON.stringify(result));
      }
    }).catch(err => {
      process.stderr.write('Error: ' + err.message);
      process.exit(1);
    });
  `;

  const scriptPath = `/tmp/script-${Date.now()}.js`;
  await sandbox.files.write(scriptPath, wrappedCode);

  const result = await sandbox.commands.run(`node ${scriptPath}`);

  logger.info(
    {
      event: 'sandbox.command.result',
      sandboxId: handle.id,
      exitCode: result.exitCode,
      stdoutBytes: result.stdout?.length ?? 0,
      stderrBytes: result.stderr?.length ?? 0,
    },
    'Sandbox command completed'
  );

  if (result.exitCode !== 0) {
    throw new Error(`Sandbox execution error: ${result.stderr || 'Unknown error'}`);
  }

  const output = result.stdout.trim();
  if (output) {
    try {
      return JSON.parse(output) as T;
    } catch {
      return output as T;
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
