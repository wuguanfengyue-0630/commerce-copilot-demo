import path from "node:path";

export function resolveDemoProcesses(rootDirectory, publicPort, nodeExecutable) {
  return {
    api: {
      command: nodeExecutable,
      args: ["dist/main.js"],
      cwd: path.join(rootDirectory, "apps/api"),
      env: { HOST: "127.0.0.1", PORT: "4000", NODE_ENV: "production" },
    },
    web: {
      command: nodeExecutable,
      args: ["node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", publicPort],
      cwd: path.join(rootDirectory, "apps/web"),
      env: { NODE_ENV: "production" },
    },
  };
}
