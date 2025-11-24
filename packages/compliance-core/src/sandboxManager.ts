/**
 * Sandbox Manager for Regulatory Intelligence Copilot
 *
 * Manages the lifecycle of E2B sandboxes and MCP gateway configuration.
 */

import { createSandbox, type SandboxHandle } from './e2bClient.js';
import { configureMcpGateway, isMcpGatewayConfigured } from './mcpClient.js';

let activeSandbox: SandboxHandle | null = null;

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
