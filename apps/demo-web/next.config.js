const path = require('path')
const webpack = require('webpack')

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    '@reg-copilot/reg-intel-core',
    '@reg-copilot/reg-intel-graph',
    '@reg-copilot/reg-intel-llm',
    '@reg-copilot/reg-intel-observability',
    'neo4j-driver',
    'pino',
    'thread-stream',
    'pino-pretty',
  ],
  transpilePackages: [
    '@e2b-auditor/core',
    '@reg-copilot/reg-intel-prompts',
    '@reg-copilot/reg-intel-conversations',
    '@reg-copilot/reg-intel-next-adapter'
  ],
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@reg-copilot/reg-intel-conversations': path.resolve(__dirname, '../..', 'packages/reg-intel-conversations'),
    }
    // Ignore test files in thread-stream and pino that require dev dependencies
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^tap$/,
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
