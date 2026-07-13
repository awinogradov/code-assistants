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
 *
 * It also rejects `Octokit.plugin(` — an action that plugs the retry plugin itself ends up
 * constructing `new RetryingOctokit(`, which the bare-client pattern never matches. That is
 * how code-review-cost-monitor's private `createRetryingOctokit` copy escaped both the guard
 * and the grep that was meant to find it (issue #454). The one legitimate `Octokit.plugin`
 * call lives in `createOctokit`, inside actions-core — outside the walked tree.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const actionsDir = join(repoRoot, ".github/actions");

// Each action installs its own node_modules, and the vendored Octokit sources are full of
// `new Octokit(` — walking into them would fail this test against our own dependencies.
const prunedDirs = new Set(["node_modules", "dist"]);

// Two ways to end up with a client actions-core does not own: construct it bare, or plug the
// retry plugin locally and construct the resulting class under any name.
const forbiddenConstruction: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /new\s+Octokit\s*\(/, reason: 'a bare "new Octokit" has no retry policy' },
  {
    pattern: /Octokit\.plugin\s*\(/,
    reason: 'a local "Octokit.plugin" duplicates the shared retry policy',
  },
];

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
  test("no action builds its own Octokit — all clients go through createOctokit", async () => {
    const sources = await collectSources(actionsDir);
    expect(sources.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const path of sources) {
      const content = await readFile(path, "utf8");
      for (const { pattern, reason } of forbiddenConstruction) {
        if (pattern.test(content)) {
          offenders.push(`${path.slice(repoRoot.length + 1)} — ${reason}`);
        }
      }
    }

    expect(
      offenders,
      `Build the client with createOctokit(token) from @code-assistants/actions-core/createOctokit, which owns the one retry policy:\n${offenders.map((offender) => `  - ${offender}`).join("\n")}`,
    ).toEqual([]);
  });
});
