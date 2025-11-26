/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    '@e2b/code-interpreter',
    '@reg-copilot/reg-intel-core',
    '@reg-copilot/reg-intel-graph',
    '@reg-copilot/reg-intel-llm',
    'neo4j-driver'
  ],
  transpilePackages: [
    '@e2b-auditor/core',
    '@reg-copilot/reg-intel-prompts',
    '@reg-copilot/reg-intel-next-adapter'
  ],
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },
  webpack: (config, { isServer }) => {
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
