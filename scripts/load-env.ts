/**
 * Environment Variable Loader for Scripts
 *
 * Loads environment variables from .env files with the correct priority:
 * 1. .env.local (local overrides - NOT committed to git)
 * 2. .env (defaults - committed to git)
 *
 * This matches Next.js environment loading behavior.
 *
 * Usage:
 *   import { loadEnv } from './load-env.js';
 *   loadEnv();
 */

import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Load environment variables from .env files
 * Priority: .env.local > .env
 */
export function loadEnv(): void {
  const rootDir = resolve(__dirname, '..');

  // Load .env (defaults)
  const envPath = resolve(rootDir, '.env');
  if (existsSync(envPath)) {
    config({ path: envPath });
    console.log('✓ Loaded environment from .env');
  }

  // Load .env.local (overrides - takes precedence)
  const envLocalPath = resolve(rootDir, '.env.local');
  if (existsSync(envLocalPath)) {
    config({ path: envLocalPath, override: true });
    console.log('✓ Loaded environment from .env.local (overrides)');
  }

  // If neither file exists, warn but continue
  if (!existsSync(envPath) && !existsSync(envLocalPath)) {
    console.warn('⚠ No .env or .env.local file found - using system environment variables');
  }
}
