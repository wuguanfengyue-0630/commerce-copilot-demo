import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "workspace",
          include: ["apps/**/*.{test,spec}.ts", "packages/**/*.{test,spec}.ts"],
          passWithNoTests: true,
        },
      },
    ],
  },
});
