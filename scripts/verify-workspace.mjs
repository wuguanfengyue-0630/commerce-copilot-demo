import { access } from "node:fs/promises";

const manifests = [
  "apps/api/package.json",
  "apps/web/package.json",
  "packages/domain/package.json",
  "packages/contracts/package.json",
  "packages/application/package.json",
  "packages/connectors/package.json",
  "packages/agent/package.json",
  "packages/ui/package.json",
];

for (const manifest of manifests) {
  await access(manifest);
}

console.log("workspace verified");
