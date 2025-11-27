/**
 * Sandbox Manager for Regulatory Intelligence Copilot
 *
 * Manages the lifecycle of E2B sandboxes and MCP gateway configuration.
 */

import { createLogger } from './logger.js';
import { createSandbox, runInSandbox, type SandboxHandle } from './e2bClient.js';
import { configureMcpGateway, isMcpGatewayConfigured } from './mcpClient.js';
import { logSandboxProbe } from './observability/sandboxProbeLogger.js';

let activeSandbox: SandboxHandle | null = null;
const logger = createLogger({ component: 'SandboxManager' });

export function hasActiveSandbox(): boolean {
  return activeSandbox !== null;
}

export function getActiveSandboxId(): string | null {
  return activeSandbox?.id ?? null;
}

async function configureGatewayFromSandbox(sandbox: SandboxHandle): Promise<void> {
  if (!isMcpGatewayConfigured()) {
    configureMcpGateway(sandbox.mcpUrl, sandbox.mcpToken);
  }
}

export async function ensureMcpGatewayConfigured(): Promise<void> {
  if (isMcpGatewayConfigured()) {
    return;
  }

  const sandbox = await getOrCreateActiveSandbox();
  configureMcpGateway(sandbox.mcpUrl, sandbox.mcpToken);
}

/**
 * Lazily create a sandbox and configure the MCP gateway once per process.
 */
export async function getOrCreateActiveSandbox(): Promise<SandboxHandle> {
  if (activeSandbox) {
    return activeSandbox;
  }

  const sandbox = await createSandbox();
  await configureGatewayFromSandbox(sandbox);
  activeSandbox = sandbox;
  return sandbox;
}

export interface SandboxStatus {
  sandboxId: string;
  mcpGatewayConfigured: boolean;
  mcpTokenPresent: boolean;
  mcpProcesses: string[];
  envFlags: {
    mcpReadOnly: boolean;
    memgraphUrlPresent: boolean;
    memgraphHost?: string;
    memgraphPort?: number;
    memgraphUserSet: boolean;
    memgraphPasswordSet: boolean;
    perplexityApiConfigured: boolean;
  };
  memgraphConnectivity: {
    reachable: boolean;
    error?: string;
    target?: {
      host: string;
      port: number;
    } | null;
  };
}

function buildSandboxProbeScript(): string {
  return `
    const net = require('node:net');
    const { execSync } = require('node:child_process');

    function parseMemgraphTarget(urlValue) {
      if (!urlValue) return null;
      try {
        const parsed = new URL(urlValue);
        return {
          host: parsed.hostname,
          port: parsed.port ? Number(parsed.port) : 7687,
        };
      } catch (error) {
        return { error: String(error) };
      }
    }

    async function checkMemgraph(target) {
      if (!target || target.error) {
        return { reachable: false, error: target?.error || 'Invalid MEMGRAPH_URL', target: null };
      }

      return await new Promise((resolve) => {
        const socket = net.createConnection(
          { host: target.host, port: target.port, timeout: 1500 },
          () => {
            socket.end();
            resolve({ reachable: true, target });
          }
        );

        socket.on('error', (error) => {
          socket.destroy();
          resolve({ reachable: false, error: error.message, target });
        });

        socket.on('timeout', () => {
          socket.destroy();
          resolve({ reachable: false, error: 'Connection timed out', target });
        });
      });
    }

    function getMcpProcesses() {
      try {
        const output = execSync("ps -eo pid,cmd | grep -E 'mcp' | grep -v grep", { encoding: 'utf8' });
        return output.split('\n').map((line) => line.trim()).filter(Boolean);
      } catch (error) {
        return [];
      }
    }

    const memgraphTarget = parseMemgraphTarget(process.env.MEMGRAPH_URL || '');

    const envFlags = {
      mcpReadOnly: (process.env.MCP_READ_ONLY || '').toLowerCase() === 'true',
      memgraphUrlPresent: Boolean(process.env.MEMGRAPH_URL),
      memgraphHost: memgraphTarget && !memgraphTarget.error ? memgraphTarget.host : undefined,
      memgraphPort: memgraphTarget && !memgraphTarget.error ? memgraphTarget.port : undefined,
      memgraphUserSet: Boolean(process.env.MEMGRAPH_USER),
      memgraphPasswordSet: Boolean(process.env.MEMGRAPH_PASSWORD),
      perplexityApiConfigured: Boolean(process.env.PERPLEXITY_API_KEY),
    };

    const memgraphConnectivity = await checkMemgraph(memgraphTarget);
    const mcpProcesses = getMcpProcesses();

    return { envFlags, memgraphConnectivity, mcpProcesses };
  `;
}

/**
 * Execute a minimal health probe inside the sandbox to check MCP/Memgraph readiness.
 */
export async function getSandboxStatus(): Promise<SandboxStatus> {
  const sandbox = await getOrCreateActiveSandbox();
  const probeResult = await runInSandbox<{
    envFlags: SandboxStatus['envFlags'];
    memgraphConnectivity: SandboxStatus['memgraphConnectivity'];
    mcpProcesses: SandboxStatus['mcpProcesses'];
  }>(sandbox, buildSandboxProbeScript());

  const status: SandboxStatus = {
    sandboxId: sandbox.id,
    mcpGatewayConfigured: isMcpGatewayConfigured(),
    mcpTokenPresent: Boolean(sandbox.mcpToken),
    ...probeResult,
  };

  await logSandboxProbe({
    sandboxId: status.sandboxId,
    mcpGatewayConfigured: status.mcpGatewayConfigured,
    memgraphReachable: status.memgraphConnectivity.reachable,
    memgraphTarget: status.memgraphConnectivity.target,
    envFlags: status.envFlags,
    mcpProcesses: status.mcpProcesses,
  });

  logger.info('Sandbox status probe completed', {
    sandboxId: status.sandboxId,
    memgraphReachable: status.memgraphConnectivity.reachable,
    mcpGatewayConfigured: status.mcpGatewayConfigured,
  });

  return status;
}

/**
 * Dispose of the active sandbox when necessary.
 */
export async function resetActiveSandbox(): Promise<void> {
  if (!activeSandbox) return;

  try {
    await activeSandbox.sandbox.kill();
  } finally {
    activeSandbox = null;
  }
}
