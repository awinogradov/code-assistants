/**
 * Guards the rule that `createOctokit` exists to enforce: every action client is built
 * through it, never with a bare `new Octokit`. A bare client carries no retry policy, so
 * a single transient GitHub 5xx fails the whole job with no recovery path — auto-label
 * red-checked a PR four times over that, surviving three reruns and a dependabot recreate
 * (issue #450). The retry plugin lives in `createOctokit`, so bypassing it silently opts
 * an action out of the fix.
 *
 * The check covers doc comments too, not just code: the auto-label bug propagated through
 * a stale `@example` in `githubApi.ts` that showed the bare form for a contributor to copy.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const actionsDir = join(repoRoot, ".github/actions");

// Each action installs its own node_modules, and the vendored Octokit sources are full of
// `new Octokit(` — walking into them would fail this test against our own dependencies.
const prunedDirs = new Set(["node_modules", "dist"]);

const bareOctokit = /new\s+Octokit\s*\(/;

async function collectSources(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!prunedDirs.has(entry.name)) {
        files.push(...(await collectSources(path)));
      }
      continue;
    }
    // Tests may legitimately construct a client; only shipped action code is bound by the rule.
    if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(path);
    }
  }

  return files;
}

describe("octokit construction", () => {
  test("no action builds a bare Octokit — all clients go through createOctokit", async () => {
    const sources = await collectSources(actionsDir);
    expect(sources.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const path of sources) {
      const content = await readFile(path, "utf8");
      if (bareOctokit.test(content)) {
        offenders.push(path.slice(repoRoot.length + 1));
      }
    }

    expect(
      offenders,
      `Build the client with createOctokit(token) from @code-assistants/actions-core/createOctokit — a bare "new Octokit" has no retry policy and dies on a transient GitHub 5xx:\n${offenders.map((file) => `  - ${file}`).join("\n")}`,
    ).toEqual([]);
  });
});
