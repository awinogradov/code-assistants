#!/usr/bin/env node
/**
 * Idempotent on-demand dependency installer for the pdf:create renderer.
 *
 * Runs `npm install --omit=dev` only when the install marker is absent, so the
 * first render bootstraps the renderer's pinned dependencies and every later
 * render is instant and offline-capable. Run from the renderer directory:
 *
 *   node install-check.mjs
 *
 * Because it resolves its own directory from import.meta.url, it works whether
 * the skill runs as the autopilot plugin or is copied standalone into
 * ~/.claude/skills/.
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const marker = join(here, "node_modules", ".pdf-create-ok");
const rendererEntry = join(here, "node_modules", "@react-pdf", "renderer", "package.json");

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor > 22) {
  console.warn(
    `pdf:create: Node ${process.versions.node} detected. @react-pdf/renderer is most tested on Node 18-22; ` +
      `use the repo .nvmrc (22) if you hit rendering issues.`,
  );
}

if (existsSync(marker) && existsSync(rendererEntry)) {
  process.exit(0);
}

console.error("pdf:create: installing renderer dependencies (one-time, ~30s)...");
try {
  execFileSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--prefer-offline"], {
    cwd: here,
    stdio: "inherit",
  });
} catch {
  console.error(
    "pdf:create: dependency install failed. Ensure Node and npm are on PATH and you have " +
      "network access for the first run.",
  );
  process.exit(1);
}

writeFileSync(marker, "ok\n");
process.exit(0);
