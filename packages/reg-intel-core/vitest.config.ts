import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      '@reg-copilot/reg-intel-llm': path.resolve(
        __dirname,
        '../reg-intel-llm/src/index.ts'
      ),
      '@reg-copilot/reg-intel-prompts': path.resolve(
        __dirname,
        '../reg-intel-prompts/src/index.ts'
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
      exclude: ['src/**/*.{test,spec}.ts', 'src/types.ts'],
    },
  },
});
