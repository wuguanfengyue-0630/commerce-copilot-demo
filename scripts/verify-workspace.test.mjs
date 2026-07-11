import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const verifierPath = fileURLToPath(new URL("./verify-workspace.mjs", import.meta.url));
const verifierModule = await import("./verify-workspace.mjs");

const packages = [
  ["apps/api/package.json", "@commerce-copilot/api"],
  ["apps/web/package.json", "@commerce-copilot/web"],
  ["packages/domain/package.json", "@commerce-copilot/domain"],
  ["packages/contracts/package.json", "@commerce-copilot/contracts"],
  ["packages/application/package.json", "@commerce-copilot/application"],
  ["packages/connectors/package.json", "@commerce-copilot/connectors"],
  ["packages/agent/package.json", "@commerce-copilot/agent"],
  ["packages/ui/package.json", "@commerce-copilot/ui"],
];

async function createWorkspaceFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "commerce-copilot-workspace-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  for (const [relativePath, name] of packages) {
    const manifestPath = join(root, relativePath);
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify({ name })}\n`, "utf8");
  }

  return root;
}

function getVerifier() {
  assert.equal(typeof verifierModule.verifyWorkspace, "function");
  return verifierModule.verifyWorkspace;
}

test("CLI resolves the repository independently of the calling cwd", async () => {
  let stdout = "";

  await assert.doesNotReject(async () => {
    ({ stdout } = await execFileAsync(process.execPath, [verifierPath], { cwd: tmpdir() }));
  });

  assert.match(stdout, /workspace verified/);
});

test("rejects a workspace manifest with an unexpected package name", async (t) => {
  const root = await createWorkspaceFixture(t);
  const manifestPath = join(root, "apps/api/package.json");
  await writeFile(manifestPath, `${JSON.stringify({ name: "@commerce-copilot/wrong" })}\n`, "utf8");

  const verifyWorkspace = getVerifier();
  await assert.rejects(
    () => verifyWorkspace(root),
    /apps[\\/]api[\\/]package\.json.*expected @commerce-copilot\/api.*received @commerce-copilot\/wrong/i,
  );
});

test("rejects invalid workspace manifest JSON", async (t) => {
  const root = await createWorkspaceFixture(t);
  await writeFile(join(root, "apps/api/package.json"), "{\n", "utf8");

  const verifyWorkspace = getVerifier();
  await assert.rejects(
    () => verifyWorkspace(root),
    /invalid JSON.*apps[\\/]api[\\/]package\.json/i,
  );
});
