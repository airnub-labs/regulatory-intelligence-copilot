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
      '@reg-copilot/reg-intel-conversations': path.resolve(
        __dirname,
        '../reg-intel-conversations/src/index.ts'
      ),
      '@reg-copilot/reg-intel-core': path.resolve(
        __dirname,
        '../reg-intel-core/src/index.ts'
      ),
      '@reg-copilot/reg-intel-llm': path.resolve(
        __dirname,
        '../reg-intel-llm/src/index.ts'
      ),
      '@reg-copilot/reg-intel-observability': path.resolve(
        __dirname,
        '../reg-intel-observability/src/index.ts'
      ),
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
      exclude: ['src/**/*.{test,spec}.ts', 'src/types.ts', 'src/index.ts'],
    },
  },
});
