/**
 * Guards the Graphify read-only boundary, added for issue #626: a production run
 * (wefortis/fortune-os#945) had an implementation agent run `graphify update .`
 * mid-feature-branch — because the synced repository rules instructed it to — and commit
 * an 11.8k-line graph refresh that was ~97% of the PR diff. The committed graph is a
 * read-only context snapshot of the default branch; where a consumer regenerates it at
 * all, a post-merge workflow owns that, never an agent run.
 *
 * Three surfaces carry the boundary, and this file fails if any regresses:
 *
 * 1. The `graphify-readonly` nested sentinel inside the repomix-snapshot shared block
 *    (claude-plugins/autopilot/skills/shared-rules/references/repomix-snapshot.md) —
 *    immutability, the lag caveat, the exhaustive read-only command set, the named
 *    mutating subcommands with the `graphify-out/**` catch-all, and the override of
 *    stale synced rules during the sync-vs-plugin rollout skew. Extracted through its
 *    sentinel and asserted substantial first — the vacuous-pass defence
 *    contextSourceContract.test.ts and graphifyRefinementContract.test.ts both state.
 * 2. The four stack rule templates under rules/ — the update instruction must never
 *    return. Scoped to rules/ only, never the repo's synced AGENTS.md copy, which lags
 *    until the next upstream sync and would flap CI between merge and sync.
 * 3. Every SKILL.md under claude-plugins/ — a strict allowlist over the Bash grant
 *    surface: any `Bash(graphify …)` rule outside the enumerated read-only set fails,
 *    wildcard or not. The scan defends itself against a glob or restructure making it
 *    iterate nothing: the twelve known granting skills are explicit test data, each
 *    asserted found and carrying the exact read-only set.
 *
 * The allowed and forbidden command names are transcribed from graphify v0.9.x; the
 * allowlist is the load-bearing defence, so a new mutating subcommand added to the CLI
 * later is still denied by omission. What this CANNOT prove: that a session honours the
 * boundary at runtime, or that a downstream repository's synced AGENTS.md has caught up
 * — CI sees text in this repository, nothing more. Runtime evidence is the absence of
 * graph-refresh commits in agent PRs after rollout.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

// Depth mirrors graphifyRefinementContract.test.ts in this directory — a move of the
// action updates both in lockstep.
const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");

const blockPath = join(
  repoRoot,
  "claude-plugins/autopilot/skills/shared-rules/references/repomix-snapshot.md",
);

/** The rule files synced to consumer repositories; each carries the same Graphify bullet. */
const rulesPaths = [
  "rules/Bun.md",
  "rules/Bun+React+Tailwind.md",
  "rules/NodeJS+React.md",
  "rules/NodeJS+React+Tailwind.md",
].map((relative) => join(repoRoot, relative));

/** Shortest the boundary statement can be; anything smaller means extraction went wrong. */
const minBlockLength = 80;

/**
 * The exhaustive Bash grant surface for Graphify. Any `Bash(graphify …)` rule outside
 * this set — the old wildcard included — is a mutation-capable grant and fails the scan.
 * `Bash(command -v graphify)` is the availability check and does not match the prefix.
 */
const readOnlyGrants = [
  "Bash(graphify query *)",
  "Bash(graphify path *)",
  "Bash(graphify explain *)",
  "Bash(graphify affected *)",
  "Bash(graphify --help)",
];

/** The read-only command surface the sentinel must enumerate as exhaustive. */
const readOnlyCommands = [
  "graphify query",
  "graphify path",
  "graphify explain",
  "graphify affected",
  "graphify --help",
  "command -v graphify",
];

/**
 * The mutating subcommands the sentinel must name, backticked as they appear in prose.
 * Naming the real commands keeps the prohibition unambiguous for the agent reading it;
 * the `graphify-out/**` catch-all covers what enumeration misses.
 */
const mutatingSubcommands = [
  "`update`",
  "`extract`",
  "`watch`",
  "`cluster-only`",
  "`label`",
  "`save-result`",
  "`reflect`",
];

/** The twelve skills that granted `Bash(graphify *)` before #626 — the scan's floor. */
const grantingSkills = [
  "explore",
  "gather-context",
  "issue-create",
  "linear-create",
  "linear-plan",
  "linear-run",
  "plan",
  "pr-answer",
  "pr-resolve",
  "pr-review",
  "run",
  "run-primed",
];

/** Read a file, failing with its absolute path rather than a bare ENOENT at module load. */
async function readContract(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (cause) {
    throw new Error(`Cannot read contract file: ${path}`, { cause });
  }
}

/** Extract the named sentinel-delimited block from `content`, trimmed; null when absent. */
function extractBlock(content: string, sentinel: string): string | null {
  const pattern = new RegExp(`<!-- ${sentinel}:start -->([\\s\\S]*?)<!-- ${sentinel}:end -->`);
  return pattern.exec(content)?.[1].trim() ?? null;
}

/** The `**Graphify**` bullet, normalized for whitespace so wrapping is not a difference. */
function extractGraphifyBullet(content: string): string | null {
  const bullet = /^\s*-\s+\*\*Graphify\*\*[\s\S]*?(?=\n\s*-\s+\*\*|\n\n)/m.exec(content);
  return bullet?.[0].replace(/\s+/g, " ").trim() ?? null;
}

const skillEntries = (await readdir(join(repoRoot, "claude-plugins"), { recursive: true }))
  .filter((entry) => entry.endsWith("SKILL.md"))
  .map((entry) => join(repoRoot, "claude-plugins", entry));

const [blockSource, ...rulesSources] = await Promise.all([
  readContract(blockPath),
  ...rulesPaths.map(readContract),
]);

const skillSources = new Map(
  await Promise.all(
    skillEntries.map(async (path) => [path, await readContract(path)] as const),
  ),
);

const readonly = extractBlock(blockSource, "graphify-readonly");

describe("graphify read-only sentinel", () => {
  test("the nested sentinel block exists and is substantial", () => {
    expect(readonly).not.toBeNull();
    expect(readonly?.length ?? 0).toBeGreaterThan(minBlockLength);
  });

  test("it lives inside the repomix-snapshot block it constrains", () => {
    const outer = extractBlock(blockSource, "repomix-snapshot");
    expect(outer).not.toBeNull();
    expect(outer).toContain("graphify-readonly:start");
  });

  test("the committed graph is read-only and may lag behind the branch", () => {
    expect(readonly).toContain("read-only");
    expect(readonly).toContain("may lag");
  });

  test.each(readOnlyCommands)("the exhaustive read-only surface includes %s", (command) => {
    expect(readonly).toContain(command);
  });

  test("the read-only surface is framed as exhaustive", () => {
    expect(readonly).toContain("exhaustive");
  });

  test.each(mutatingSubcommands)("the prohibition names %s", (subcommand) => {
    expect(readonly).toContain(subcommand);
  });

  test("anything else writing the graph is caught by the graphify-out/** catch-all", () => {
    expect(readonly).toContain("`graphify-out/**`");
  });

  test("the boundary overrides stale synced rules during rollout skew", () => {
    expect(readonly).toContain("still instruct");
  });

  test("a missing or broken graph falls through, never regenerates", () => {
    expect(readonly).toContain("never regenerate");
  });
});

describe("stack rule templates", () => {
  test.each(rulesPaths)("%s carries no update instruction", (path) => {
    const source = rulesSources[rulesPaths.indexOf(path)];
    expect(source).not.toContain("graphify update");
  });

  test.each(rulesPaths)("%s states the read-only boundary in its Graphify bullet", (path) => {
    const bullet = extractGraphifyBullet(rulesSources[rulesPaths.indexOf(path)]);
    expect(bullet).not.toBeNull();
    expect(bullet).toContain("read-only");
    expect(bullet).toContain("never regenerate");
  });
});

describe("skill grant allowlist", () => {
  test("the scan found the known granting skills, so it cannot pass vacuously", () => {
    expect(skillEntries.length).toBeGreaterThanOrEqual(grantingSkills.length);
  });

  test.each(grantingSkills)("skill %s carries exactly the read-only grant set", (skill) => {
    const path = join(repoRoot, "claude-plugins/autopilot/skills", skill, "SKILL.md");
    const source = skillSources.get(path);
    expect(source).toBeDefined();
    for (const grant of readOnlyGrants) expect(source).toContain(grant);
  });

  test("no SKILL.md grants Bash(graphify …) outside the read-only set", () => {
    for (const [path, source] of skillSources) {
      for (const rule of source.match(/Bash\(graphify[^)]*\)/g) ?? []) {
        expect(readOnlyGrants, `${path} grants ${rule}`).toContain(rule);
      }
    }
  });
});
