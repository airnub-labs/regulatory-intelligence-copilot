/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@e2b/code-interpreter'],
  transpilePackages: ['@e2b-auditor/core'],
}

module.exports = nextConfig
