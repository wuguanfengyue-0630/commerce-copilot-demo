import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const manifests = [
  ["apps/api/package.json", "@commerce-copilot/api"],
  ["apps/web/package.json", "@commerce-copilot/web"],
  ["packages/domain/package.json", "@commerce-copilot/domain"],
  ["packages/contracts/package.json", "@commerce-copilot/contracts"],
  ["packages/application/package.json", "@commerce-copilot/application"],
  ["packages/connectors/package.json", "@commerce-copilot/connectors"],
  ["packages/agent/package.json", "@commerce-copilot/agent"],
  ["packages/ui/package.json", "@commerce-copilot/ui"],
];

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

export async function verifyWorkspace(root = repositoryRoot) {
  for (const [relativePath, expectedName] of manifests) {
    const manifestPath = resolve(root, relativePath);
    await access(manifestPath);

    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in ${manifestPath}`, { cause: error });
      }

      throw error;
    }

    if (manifest?.name !== expectedName) {
      throw new Error(
        `${manifestPath} has an unexpected package name: expected ${expectedName}, received ${String(manifest?.name)}`,
      );
    }
  }
}

const isDirectRun =
  process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(scriptPath);

if (isDirectRun) {
  await verifyWorkspace();
  console.log("workspace verified");
}
