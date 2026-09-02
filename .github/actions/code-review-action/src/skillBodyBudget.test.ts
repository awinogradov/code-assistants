/**
 * Guards the size of every autopilot `SKILL.md`, because a skill body is charged per turn.
 *
 * Invoking a skill injects its whole `SKILL.md` into the conversation, and that text is
 * re-charged as input on every subsequent request in the session. Cost is therefore
 * `body size × invocations × turns resident`, which is why the chain-plumbing skills —
 * loaded once per commit, per PR, per review cycle — dominated session token usage even
 * when much larger bodies (`pr-review` at ~56 KB) cost nothing at all.
 *
 * The budgets below are the sizes after that cleanup plus modest headroom. They are a
 * regression tripwire, not a target: a skill is free to sit well under its budget, and
 * growth that earns its keep is a budget bump in the same commit, reviewed like any other
 * change.
 *
 * What this CANNOT prove, in the spirit of the limit `sharedRulesInvocation.test.ts`
 * states for its own presence guard: that a shrunken body actually costs less at runtime.
 * Moving a section into `references/` only saves tokens when a typical invocation does not
 * read it back, and CI sees file sizes rather than what the model read. A body that halved
 * by relocating text every run then loads via `Read` is strictly worse and still passes
 * here. The design rules that make an extraction sound live in
 * `docs/19-skill-token-budget.md`; this test only stops the bodies growing again.
 *
 * Vacuous-pass defences, both deliberate: discovery comes from the filesystem via
 * `walkMarkdown`, so a newly added skill is guarded without editing a test, and a skill
 * with no budget entry fails loudly rather than being silently skipped.
 */
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { describe, expect, test } from "bun:test";

import { walkMarkdown } from "./markdownFiles.ts";

const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");
const skillsDir = join(repoRoot, "claude-plugins/autopilot/skills");

/**
 * Maximum bytes for each skill's `SKILL.md`.
 *
 * `pr-review` is the deliberate outlier: it runs inside `code-review-action` on a PR and
 * never loads into an interactive session, so its size costs one CI request rather than
 * every turn of a user's session.
 */
const budgets: Record<string, number> = {
  "ascii-schemas": 8500,
  "ask-codex": 5500,
  "ask-gemini": 5500,
  "branch-create": 19000,
  "commits-create": 17000,
  "commits-restructure": 9500,
  "dependabot-resolve": 5500,
  explore: 13000,
  "gather-context": 15000,
  "issue-create": 17000,
  "issue-run": 9000,
  "linear-create": 10500,
  "linear-plan": 20000,
  "linear-run": 21000,
  "pdf-create": 10000,
  plan: 15000,
  "pr-answer": 11000,
  "pr-create": 15500,
  "pr-monitor": 18000,
  "pr-resolve": 17000,
  "pr-review": 58000,
  "pr-update": 10000,
  "pr-validate": 4500,
  "preflight-check": 11000,
  run: 18000,
  "run-primed": 15000,
  "shared-rules": 5000,
  "todo-cleanup": 9000,
};

/** Every discovered `SKILL.md`, as `[skillName, absolutePath]`. */
const skillFiles = (await walkMarkdown(skillsDir))
  .filter((file) => basename(file) === "SKILL.md")
  .map((file): [string, string] => [basename(dirname(file)), file])
  .sort(([a], [b]) => a.localeCompare(b));

describe("skill body budget", () => {
  test("skills are discovered from the filesystem, not hardcoded", () => {
    expect(skillFiles.length).toBeGreaterThan(20);
    expect(skillFiles.map(([name]) => name)).toContain("preflight-check");
  });

  test.each(skillFiles)("%s has a budget entry", (name) => {
    // A new skill must declare a budget; defaulting one would let it ship unguarded.
    expect(Object.hasOwn(budgets, name)).toBe(true);
  });

  test.each(skillFiles)("%s is within its budget", async (name, file) => {
    const budget = budgets[name];
    if (budget === undefined) return; // reported by the entry test above
    const bytes = Buffer.byteLength(await readFile(file, "utf8"), "utf8");
    // Compare through a labelled string so a failure names the skill and both numbers.
    expect(`${name}: ${bytes <= budget ? "within" : `${bytes} > ${budget}`}`).toBe(
      `${name}: within`,
    );
  });

  test("no budget entry names a skill that no longer exists", () => {
    const discovered = new Set(skillFiles.map(([name]) => name));
    expect(Object.keys(budgets).filter((name) => !discovered.has(name))).toEqual([]);
  });
});
