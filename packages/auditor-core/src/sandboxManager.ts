import { createSandbox, runSampleApiInSandbox, type SandboxHandle } from './e2bClient.js';
import { configureMcpGateway, isMcpGatewayConfigured } from './mcpClient.js';

let activeSandbox: SandboxHandle | null = null;
const startedSampleApis = new Set<string>();

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

/**
 * Ensure the sample API is running inside the active sandbox. The server is
 * started at most once per sandbox to avoid port conflicts.
 */
export async function ensureSampleApiRunning(): Promise<SandboxHandle> {
  const sandbox = await getOrCreateActiveSandbox();

  if (!startedSampleApis.has(sandbox.id)) {
    await runSampleApiInSandbox(sandbox);
    startedSampleApis.add(sandbox.id);
  }

  return sandbox;
}

/**
 * Dispose of the active sandbox when absolutely necessary. Avoid using this
 * during normal operation so Memgraph data stays available for the graph view.
 */
export async function resetActiveSandbox(): Promise<void> {
  if (!activeSandbox) return;

  try {
    await activeSandbox.sandbox.kill();
  } finally {
    activeSandbox = null;
    startedSampleApis.clear();
  }
}
