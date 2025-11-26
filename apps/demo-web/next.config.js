const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@e2b/code-interpreter'],
  transpilePackages: ['@e2b-auditor/core'],
  turbopack: {
    root: path.join(__dirname, '..', '..'),
  },
}

module.exports = nextConfig
