import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const packages = [
  ["packages/domain", "@commerce-copilot/domain"],
  ["packages/contracts", "@commerce-copilot/contracts"],
  ["packages/application", "@commerce-copilot/application"],
  ["packages/connectors", "@commerce-copilot/connectors"],
  ["packages/agent", "@commerce-copilot/agent"],
  ["packages/ui", "@commerce-copilot/ui"],
];

for (const [relativeDirectory, packageName] of packages) {
  try {
    await execFileAsync(
      process.execPath,
      ["--input-type=module", "--eval", `await import(${JSON.stringify(packageName)});`],
      {
        cwd: resolve(repositoryRoot, relativeDirectory),
        windowsHide: true,
      },
    );
  } catch (error) {
    throw new Error(`Unable to import ${packageName} from ${relativeDirectory}`, { cause: error });
  }
}

console.log("workspace package imports verified");
