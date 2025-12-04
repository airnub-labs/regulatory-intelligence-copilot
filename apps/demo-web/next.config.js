const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    '@reg-copilot/reg-intel-core',
    '@reg-copilot/reg-intel-graph',
    '@reg-copilot/reg-intel-llm',
    'neo4j-driver'
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
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@reg-copilot/reg-intel-conversations': path.resolve(__dirname, '../..', 'packages/reg-intel-conversations'),
    }
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
