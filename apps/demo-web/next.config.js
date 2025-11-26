/** @type {import('next').NextConfig} */
const nextConfig = {
  // Exclude E2B and server-only packages from being bundled
  serverExternalPackages: ['@e2b/code-interpreter', 'e2b'],

  // Enable system TLS certificates for Google Fonts and external requests
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },

  // Configure webpack to exclude Node.js modules from client bundles
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Exclude Node.js built-ins and E2B from client bundles
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        path: false,
        os: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
        child_process: false,
      };

      // Exclude E2B-related modules from client bundle
      config.externals = [
        ...(config.externals || []),
        '@e2b/code-interpreter',
        'e2b',
        'tar',
        'glob',
      ];
    }
    return config;
  },
}

module.exports = nextConfig
