import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolveDemoProcesses } from "./public-demo-processes.mjs";

test("starts both production servers directly with Node", () => {
  const root = path.resolve("C:/commerce-copilot");

  assert.deepEqual(resolveDemoProcesses(root, "3100", "node"), {
    api: {
      command: "node",
      args: ["dist/main.js"],
      cwd: path.join(root, "apps/api"),
      env: { HOST: "127.0.0.1", PORT: "4000", NODE_ENV: "production" },
    },
    web: {
      command: "node",
      args: ["node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3100"],
      cwd: path.join(root, "apps/web"),
      env: { NODE_ENV: "production" },
    },
  });
});
