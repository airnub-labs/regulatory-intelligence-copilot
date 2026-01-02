const path = require('path')
const webpack = require('webpack')

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    '@reg-copilot/reg-intel-core',
    '@reg-copilot/reg-intel-graph',
    'neo4j-driver',
    'pino',
    'thread-stream',
    'pino-pretty',
    '@opentelemetry/api',
    '@opentelemetry/context-async-hooks',
    '@opentelemetry/exporter-metrics-otlp-http',
    '@opentelemetry/exporter-trace-otlp-http',
    '@opentelemetry/instrumentation',
    '@opentelemetry/instrumentation-fs',
    '@opentelemetry/instrumentation-http',
    '@opentelemetry/instrumentation-undici',
    '@opentelemetry/resources',
    '@opentelemetry/sdk-logs',
    '@opentelemetry/sdk-metrics',
    '@opentelemetry/sdk-node',
    '@opentelemetry/sdk-trace-base',
    '@opentelemetry/semantic-conventions',
    // OpenTelemetry instrumentation dependencies (required for module hooking)
    'import-in-the-middle',
    'require-in-the-middle',
  ],
  transpilePackages: [
    '@e2b-auditor/core',
    '@reg-copilot/reg-intel-prompts',
    '@reg-copilot/reg-intel-conversations',
    '@reg-copilot/reg-intel-next-adapter',
    '@reg-copilot/reg-intel-observability',
    '@reg-copilot/reg-intel-llm',
    '@reg-copilot/reg-intel-cache'
  ],
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },
  turbopack: {
    root: path.resolve(__dirname, '../..'),
    resolveAlias: {
      '@reg-copilot/reg-intel-cache': path.resolve(__dirname, '../..', 'packages/reg-intel-cache'),
      '@reg-copilot/reg-intel-conversations': path.resolve(
        __dirname,
        '../..',
        'packages/reg-intel-conversations',
      ),
    },
  },
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@reg-copilot/reg-intel-conversations': path.resolve(__dirname, '../..', 'packages/reg-intel-conversations'),
      '@reg-copilot/reg-intel-cache': path.resolve(__dirname, '../..', 'packages/reg-intel-cache'),
    }
    // Ignore test files in thread-stream and pino that require dev dependencies
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^tap$/,
      }),
      // Make ioredis optional - it's a runtime-only dependency for Redis caching
      new webpack.IgnorePlugin({
        resourceRegExp: /^ioredis$/,
        contextRegExp: /distributedValidationCache/,
      })
    );
    if (!isServer) {
      // Don't bundle Node.js modules in the client bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
      };
    }
    return config;
  },
}

module.exports = nextConfig
