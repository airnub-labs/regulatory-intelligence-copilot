import { createLogger } from '../logger.js';
import { createDebugFileLogger } from './debugFileLogger.js';
import { getContext } from './requestContext.js';

const debugLogger = createLogger({ component: 'MCPDebug' });

export const MCP_DEBUG_ENABLED = (process.env.MCP_DEBUG || '').toLowerCase() === 'true';
const MCP_DEBUG_LOG_PATH = process.env.MCP_DEBUG_LOG_PATH || '/tmp/mcp-debug.log';
const MCP_DEBUG_MAX_BYTES = Number.parseInt(process.env.MCP_DEBUG_MAX_BYTES ?? `${5 * 1024 * 1024}`, 10);
const MCP_DEBUG_MAX_FILES = Number.parseInt(process.env.MCP_DEBUG_MAX_FILES ?? '3', 10);

const debugFileLogger = createDebugFileLogger({
  path: MCP_DEBUG_LOG_PATH,
  maxBytes: MCP_DEBUG_MAX_BYTES,
  maxFiles: MCP_DEBUG_MAX_FILES,
  component: 'MCPDebugFile',
});

export async function logMcpDebug(payload: Record<string, unknown>): Promise<void> {
  if (!MCP_DEBUG_ENABLED) return;

  const { correlationId } = getContext();
  const timestampedPayload = {
    timestamp: new Date().toISOString(),
    correlationId,
    ...payload,
  };

  await debugFileLogger.append(timestampedPayload);
  debugLogger.debug('MCP debug event', timestampedPayload);
}
