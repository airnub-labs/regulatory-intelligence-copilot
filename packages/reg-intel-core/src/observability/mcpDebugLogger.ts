import { appendFile, rename, stat } from 'node:fs/promises';

import { createLogger } from '../logger.js';
import { getContext } from './requestContext.js';

const debugLogger = createLogger({ component: 'MCPDebug' });

export const MCP_DEBUG_ENABLED = (process.env.MCP_DEBUG || '').toLowerCase() === 'true';
const MCP_DEBUG_LOG_PATH = process.env.MCP_DEBUG_LOG_PATH || '/tmp/mcp-debug.log';
const MCP_DEBUG_MAX_BYTES = Number.parseInt(process.env.MCP_DEBUG_MAX_BYTES ?? `${5 * 1024 * 1024}`, 10);
const MCP_DEBUG_MAX_FILES = Number.parseInt(process.env.MCP_DEBUG_MAX_FILES ?? '3', 10);

async function rotateIfNeeded(incomingBytes: number): Promise<void> {
  try {
    const stats = await stat(MCP_DEBUG_LOG_PATH);
    if (stats.size + incomingBytes <= MCP_DEBUG_MAX_BYTES) {
      return;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      debugLogger.warn('Failed to stat MCP debug log', { error });
      return;
    }
  }

  for (let index = MCP_DEBUG_MAX_FILES; index >= 1; index -= 1) {
    const source = index === 1 ? MCP_DEBUG_LOG_PATH : `${MCP_DEBUG_LOG_PATH}.${index - 1}`;
    const target = `${MCP_DEBUG_LOG_PATH}.${index}`;

    try {
      await rename(source, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        debugLogger.warn('Failed to rotate MCP debug log', { source, target, error });
      }
    }
  }
}

async function appendDebugLog(entry: Record<string, unknown>): Promise<void> {
  const serialized = JSON.stringify(entry);
  const serializedSize = Buffer.byteLength(serialized) + 1; // account for newline

  await rotateIfNeeded(serializedSize);
  try {
    await appendFile(MCP_DEBUG_LOG_PATH, `${serialized}\n`);
  } catch (error) {
    debugLogger.warn('Failed to append MCP debug log', { error });
  }
}

export async function logMcpDebug(payload: Record<string, unknown>): Promise<void> {
  if (!MCP_DEBUG_ENABLED) return;

  const { correlationId } = getContext();
  const timestampedPayload = {
    timestamp: new Date().toISOString(),
    correlationId,
    ...payload,
  };

  await appendDebugLog(timestampedPayload);
  debugLogger.debug('MCP debug event', timestampedPayload);
}
