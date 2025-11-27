import { createLogger } from '../logger.js';
import { createDebugFileLogger } from './debugFileLogger.js';
import { getContext } from './requestContext.js';

const logger = createLogger({ component: 'SandboxProbe' });

const SANDBOX_PROBE_DEBUG = (process.env.SANDBOX_PROBE_DEBUG ?? 'true').toLowerCase() !== 'false';
const SANDBOX_PROBE_LOG_PATH = process.env.SANDBOX_PROBE_LOG_PATH || '/tmp/sandbox-probe.log';
const SANDBOX_PROBE_MAX_BYTES = Number.parseInt(process.env.SANDBOX_PROBE_MAX_BYTES ?? `${5 * 1024 * 1024}`, 10);
const SANDBOX_PROBE_MAX_FILES = Number.parseInt(process.env.SANDBOX_PROBE_MAX_FILES ?? '3', 10);

const debugFileLogger = createDebugFileLogger({
  path: SANDBOX_PROBE_LOG_PATH,
  maxBytes: SANDBOX_PROBE_MAX_BYTES,
  maxFiles: SANDBOX_PROBE_MAX_FILES,
  component: 'SandboxProbeFile',
});

export async function logSandboxProbe(payload: Record<string, unknown>): Promise<void> {
  if (!SANDBOX_PROBE_DEBUG) return;

  const { correlationId } = getContext();
  const entry = {
    timestamp: new Date().toISOString(),
    correlationId,
    ...payload,
  };

  await debugFileLogger.append(entry);
  logger.info('Sandbox probe recorded', { correlationId, probeKeys: Object.keys(payload) });
}
