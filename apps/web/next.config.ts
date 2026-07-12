import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { apiRewritesFor } from "./src/config/api-rewrites.ts";

const nextConfig: NextConfig = {
  transpilePackages: ["@commerce-copilot/ui", "@commerce-copilot/contracts"],
  turbopack: {
    root: fileURLToPath(new URL("../..", import.meta.url)),
  },
  async rewrites() {
    return apiRewritesFor(process.env.NODE_ENV);
  },
};

export default nextConfig;
