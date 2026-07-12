import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { apiRewritesFor } from "./src/config/api-rewrites.ts";
import { legacyIndexRedirects } from "./src/config/legacy-redirects.ts";

const nextConfig: NextConfig = {
  transpilePackages: ["@commerce-copilot/ui", "@commerce-copilot/contracts"],
  turbopack: {
    root: fileURLToPath(new URL("../..", import.meta.url)),
  },
  async rewrites() {
    return apiRewritesFor(process.env.NODE_ENV);
  },
  async redirects() {
    return legacyIndexRedirects();
  },
};

export default nextConfig;
