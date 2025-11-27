import { getContext } from './observability/requestContext.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  childWithContext(additionalFields?: Record<string, unknown>): Logger;
}

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

function shouldLog(level: LogLevel): boolean {
  const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
  const minIndex = LOG_LEVELS.indexOf(LOG_LEVELS.includes(envLevel) ? envLevel : 'info');
  const levelIndex = LOG_LEVELS.indexOf(level);
  return levelIndex >= minIndex;
}

function serializePayload(
  level: LogLevel,
  message: string,
  meta: Record<string, unknown>
): string {
  const context = getContext();
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
    ...normalizeMeta(meta),
  };
  return JSON.stringify(payload);
}

function normalizeMeta(meta: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => {
      if (value instanceof Error) {
        return [key, { name: value.name, message: value.message, stack: value.stack }];
      }
      return [key, value];
    })
  );
}

export function createLogger(baseFields: Record<string, unknown> = {}): Logger {
  const log = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    if (!shouldLog(level)) return;

    const serialized = serializePayload(level, message, { ...baseFields, ...(meta || {}) });
    if (level === 'error') {
      console.error(serialized);
    } else if (level === 'warn') {
      console.warn(serialized);
    } else {
      console.log(serialized);
    }
  };

  const childWithContext = (additionalFields?: Record<string, unknown>): Logger =>
    createLogger({ ...baseFields, ...getContext(), ...(additionalFields || {}) });

  return {
    debug: (message, meta) => log('debug', message, meta),
    info: (message, meta) => log('info', message, meta),
    warn: (message, meta) => log('warn', message, meta),
    error: (message, meta) => log('error', message, meta),
    childWithContext,
  };
}
