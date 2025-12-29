import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const resolveModule = (specifier: string) =>
  path.dirname(require.resolve(`${specifier}/package.json`));

export default defineConfig({
  resolve: {
    alias: {
      '@reg-copilot/reg-intel-observability': path.resolve(
        __dirname,
        '../reg-intel-observability/src/index.ts'
      ),
      '@opentelemetry/context-async-hooks': resolveModule(
        '@opentelemetry/context-async-hooks'
      ),
      '@opentelemetry/sdk-trace-base': resolveModule('@opentelemetry/sdk-trace-base'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/**/__tests__/**', 'src/seeds/**'],
    },
    testTimeout: 30000, // 30 seconds for integration tests
    hookTimeout: 30000,
  },
});
