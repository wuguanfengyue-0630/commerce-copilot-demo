import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDemoProcesses } from "./public-demo-processes.mjs";

const publicPort = process.env.PORT ?? "3000";
const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const processes = resolveDemoProcesses(rootDirectory, publicPort, process.execPath);

function startProcess(processDefinition) {
  return spawn(processDefinition.command, processDefinition.args, {
    cwd: processDefinition.cwd,
    stdio: "inherit",
    env: { ...process.env, ...processDefinition.env },
  });
}

const api = startProcess(processes.api);
const web = startProcess(processes.web);

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  api.kill("SIGTERM");
  web.kill("SIGTERM");
  process.exitCode = exitCode;
}

api.on("exit", (code) => stop(code ?? 1));
web.on("exit", (code) => stop(code ?? 1));
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
