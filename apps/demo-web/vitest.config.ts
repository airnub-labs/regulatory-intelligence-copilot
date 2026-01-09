import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@reg-copilot/reg-intel-conversations': path.resolve(
        __dirname,
        '../../packages/reg-intel-conversations/src/index.ts'
      ),
      '@reg-copilot/reg-intel-observability': path.resolve(
        __dirname,
        '../../packages/reg-intel-observability/src/index.ts'
      ),
      '@reg-copilot/reg-intel-ui': path.resolve(
        __dirname,
        '../../packages/reg-intel-ui/src/index.ts'
      ),
      '@reg-copilot/reg-intel-next-adapter': path.resolve(
        __dirname,
        '../../packages/reg-intel-next-adapter/src/index.ts'
      ),
      '@reg-copilot/reg-intel-core': path.resolve(
        __dirname,
        '../../packages/reg-intel-core/src/index.ts'
      ),
      '@opentelemetry/api': path.resolve(
        __dirname,
        '../../packages/reg-intel-observability/node_modules/@opentelemetry/api'
      ),
      '@opentelemetry/context-async-hooks': path.resolve(
        __dirname,
        '../../packages/reg-intel-observability/node_modules/@opentelemetry/context-async-hooks'
      ),
      '@opentelemetry/sdk-trace-base': path.resolve(
        __dirname,
        '../../packages/reg-intel-observability/node_modules/@opentelemetry/sdk-trace-base'
      ),
    },
  },
});
