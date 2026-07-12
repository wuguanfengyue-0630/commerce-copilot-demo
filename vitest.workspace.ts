import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: [
            "apps/api/**/*.test.{ts,tsx}",
            "apps/api/**/*.spec.{ts,tsx}",
            "packages/{agent,application,connectors,contracts,domain}/**/*.test.{ts,tsx}",
            "packages/{agent,application,connectors,contracts,domain}/**/*.spec.{ts,tsx}",
          ],
          passWithNoTests: true,
        },
      },
      {
        plugins: [react()],
        test: {
          name: "web-ui",
          environment: "jsdom",
          include: [
            "apps/web/**/*.test.{ts,tsx}",
            "apps/web/**/*.spec.{ts,tsx}",
            "packages/ui/**/*.test.{ts,tsx}",
            "packages/ui/**/*.spec.{ts,tsx}",
          ],
          passWithNoTests: true,
          setupFiles: ["./test/setup-web.ts"],
        },
      },
    ],
  },
});
