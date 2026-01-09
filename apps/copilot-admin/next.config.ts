import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "path";

// Import env to trigger build-time validation
import "./lib/env";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Set turbopack root to the monorepo root to avoid lockfile warning
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

export default withNextIntl(nextConfig);
