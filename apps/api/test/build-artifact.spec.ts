import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));

describe("API production build", () => {
  it("cleans stale output and excludes tests and specs", () => {
    const distDirectory = fileURLToPath(new URL("../dist", import.meta.url));
    mkdirSync(distDirectory, { recursive: true });
    writeFileSync(fileURLToPath(new URL("../dist/stale.txt", import.meta.url)), "stale");

    const command =
      process.platform === "win32"
        ? { file: "cmd.exe", args: ["/d", "/s", "/c", "pnpm --filter @commerce-copilot/api build"] }
        : { file: "pnpm", args: ["--filter", "@commerce-copilot/api", "build"] };
    execFileSync(command.file, command.args, {
      cwd: workspaceRoot,
      stdio: "pipe",
    });

    const artifacts = readdirSync(distDirectory, { recursive: true }).map(String);
    expect(artifacts).not.toContain("stale.txt");
    expect(artifacts.filter((path) => /(?:^|[\\/])(?:test|.*\.spec\.)/.test(path))).toEqual([]);
    expect(artifacts).toContain("main.js");
  }, 15_000);
});
