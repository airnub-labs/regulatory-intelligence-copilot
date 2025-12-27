/**
 * Sandbox Manager for Regulatory Intelligence Copilot
 *
 * Manages the lifecycle of E2B sandboxes and MCP gateway configuration.
 */

import { createSandbox, type SandboxHandle } from './e2bClient.js';
import { configureMcpGateway, isMcpGatewayConfigured } from './mcpClient.js';
import { createLogger, withSpan } from '@reg-copilot/reg-intel-observability';

const logger = createLogger('SandboxManager', { component: 'Sandbox' });

let activeSandbox: SandboxHandle | null = null;

export function hasActiveSandbox(): boolean {
  return activeSandbox !== null;
}

export function getActiveSandboxId(): string | null {
  return activeSandbox?.id ?? null;
}

async function configureGatewayFromSandbox(sandbox: SandboxHandle): Promise<void> {
  if (!isMcpGatewayConfigured()) {
    logger.debug({
      sandboxId: sandbox.id,
      mcpUrl: sandbox.mcpUrl,
      hasToken: Boolean(sandbox.mcpToken),
    }, 'Configuring MCP gateway from sandbox');
    configureMcpGateway(sandbox.mcpUrl, sandbox.mcpToken, sandbox.id);
  } else {
    logger.debug({
      sandboxId: sandbox.id,
    }, 'MCP gateway already configured, skipping');
  }
}

export async function ensureMcpGatewayConfigured(): Promise<void> {
  return withSpan(
    'sandbox_manager.ensure_gateway',
    {},
    async () => {
      if (isMcpGatewayConfigured()) {
        logger.debug('MCP gateway already configured');
        return;
      }

      logger.debug('MCP gateway not configured, creating sandbox');
      const sandbox = await getOrCreateActiveSandbox();
      configureMcpGateway(sandbox.mcpUrl, sandbox.mcpToken, sandbox.id);
      logger.debug({
        sandboxId: sandbox.id,
      }, 'MCP gateway configured');
    }
  );
}

/**
 * Lazily create a sandbox and configure the MCP gateway once per process.
 */
export async function getOrCreateActiveSandbox(): Promise<SandboxHandle> {
  return withSpan(
    'sandbox_manager.get_or_create',
    {
      'app.sandbox.has_active': Boolean(activeSandbox),
    },
    async () => {
      if (activeSandbox) {
        logger.debug({
          sandboxId: activeSandbox.id,
        }, 'Reusing existing active sandbox');
        return activeSandbox;
      }

      logger.debug('No active sandbox, creating new one');
      const sandbox = await createSandbox();
      await configureGatewayFromSandbox(sandbox);
      activeSandbox = sandbox;

      logger.debug({
        sandboxId: sandbox.id,
        mcpUrl: sandbox.mcpUrl,
      }, 'Created and configured new active sandbox');

      return sandbox;
    }
  );
}

/**
 * Dispose of the active sandbox when necessary.
 */
export async function resetActiveSandbox(): Promise<void> {
  return withSpan(
    'sandbox_manager.reset',
    {
      'app.sandbox.has_active': Boolean(activeSandbox),
    },
    async () => {
      if (!activeSandbox) {
        logger.debug('No active sandbox to reset');
        return;
      }

      const sandboxId = activeSandbox.id;
      logger.debug({
        sandboxId,
      }, 'Resetting active sandbox');

      try {
        await activeSandbox.sandbox.kill();
        logger.debug({
          sandboxId,
        }, 'Active sandbox killed successfully');
      } catch (error) {
        logger.debug({
          sandboxId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Failed to kill active sandbox');
      } finally {
        activeSandbox = null;
        logger.debug('Active sandbox reference cleared');
      }
    }
  );
}
