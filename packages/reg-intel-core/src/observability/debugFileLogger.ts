import { appendFile, rename, stat } from 'node:fs/promises';

import { createLogger } from '../logger.js';

interface DebugFileLoggerConfig {
  path: string;
  maxBytes: number;
  maxFiles: number;
  component: string;
}

interface DebugFileLogger {
  append(entry: Record<string, unknown>): Promise<void>;
}

export function createDebugFileLogger(config: DebugFileLoggerConfig): DebugFileLogger {
  const logger = createLogger({ component: config.component });

  const rotateIfNeeded = async (incomingBytes: number): Promise<void> => {
    try {
      const stats = await stat(config.path);
      if (stats.size + incomingBytes <= config.maxBytes) {
        return;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('Failed to stat debug log', { error });
        return;
      }
    }

    for (let index = config.maxFiles; index >= 1; index -= 1) {
      const source = index === 1 ? config.path : `${config.path}.${index - 1}`;
      const target = `${config.path}.${index}`;

      try {
        await rename(source, target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.warn('Failed to rotate debug log', { source, target, error });
        }
      }
    }
  };

  const append = async (entry: Record<string, unknown>): Promise<void> => {
    const serialized = JSON.stringify(entry);
    const serializedSize = Buffer.byteLength(serialized) + 1; // newline

    await rotateIfNeeded(serializedSize);
    try {
      await appendFile(config.path, `${serialized}\n`);
    } catch (error) {
      logger.warn('Failed to append debug log', { error });
    }
  };

  return { append };
}
