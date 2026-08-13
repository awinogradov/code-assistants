/**
 * Guards the exclusive-source read contract inside the repomix-snapshot shared block
 * (claude-plugins/autopilot/skills/shared-rules/references/repomix-snapshot.md), added for
 * issue #582: a context holder selects exactly one source from the ordered chain, records
 * the selection as a `context-source:` trace line, and reads outside it only with a
 * machine-readable `context-fallback: <reason> <path>` line whose reason comes from a
 * fixed six-token taxonomy. Also holds the one consumer whose local text used to
 * contradict the contract — the digest-repo-standards agent's blanket "Do NOT rely on a
 * packed snapshot" rule — to its replacement, an explicit recorded default-tools
 * selection.
 *
 * The taxonomy tokens are explicit test data, one assertion per token, so dropping a
 * reason from the block fails loudly instead of shrinking the taxonomy silently. The
 * block is extracted through its sentinels and asserted non-empty first, mirroring the
 * vacuous-pass defence in sharedBlockSync.test.ts — a missing sentinel would otherwise
 * extract nothing and pass every substring check on "".
 *
 * Issue #586 adds the enforcement half. The block binds every context holder, but a
 * contract nothing checks is the failure it was written for: a production linear-run
 * finished its whole pre-implementation pass with zero graphify and zero repomix calls
 * in a repository that had both. Two links close that loop, and each fails silently
 * without a guard:
 *
 * 1. gather-context carries the selection into the Context Map's `**Snapshot**` field.
 *    That field is the ONLY thing a caller receives, so a selection recorded anywhere
 *    else is invisible to the skill expected to act on it.
 * 2. linear-run treats a missing selection as fatal, in both plan modes. The audited
 *    failure was a stored-plan run, so binding only the fresh-plan path would leave the
 *    reported bug reachable.
 *
 * This file does run in CI: `.github/workflows/test.yml` runs `bun run test` on every
 * pull request to `main`, unfiltered by path, and this action's own `test` script is
 * `bun test`. Deleting a guarded phrase therefore fails the Test check rather than
 * relying on a reviewer to notice.
 *
 * What that CANNOT prove: that a session honours the contract at runtime. CI sees text
 * in a file, nothing more — the same limit sharedRulesInvocation.test.ts states for its
 * own presence checks. Runtime evidence comes from the post-merge canary recorded on the
 * issue: post-selection direct-read counts compared against the audited baseline.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

// Depth mirrors sharedBlockSync.test.ts in this directory — a move of the
// action updates both in lockstep.
const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");
const blockPath = join(
  repoRoot,
  "claude-plugins/autopilot/skills/shared-rules/references/repomix-snapshot.md",
);
const digestAgentPath = join(
  repoRoot,
  "claude-plugins/autopilot/agents/digest-repo-standards.md",
);
const skillsDir = join(repoRoot, "claude-plugins/autopilot/skills");

/** Shortest the contract block can be; anything smaller means the extraction went wrong. */
const minBlockLength = 80;

/**
 * The six machine-readable fallback reasons. Every direct read outside the selected
 * source must cite exactly one of these; the block must name them all.
 */
const fallbackReasons = [
  "absent-or-excluded",
  "truncated-or-unreadable",
  "stale-snapshot",
  "byte-verification",
  "generated-or-untracked",
  "post-snapshot-mutation",
];

/** Extract the named sentinel-delimited block from `content`, trimmed; null when absent. */
function extractBlock(content: string, sentinel: string): string | null {
  const pattern = new RegExp(
    `<!-- ${sentinel}:start -->([\\s\\S]*?)<!-- ${sentinel}:end -->`,
  );
  return pattern.exec(content)?.[1].trim() ?? null;
}

const block = extractBlock(await readFile(blockPath, "utf8"), "repomix-snapshot");

const [gatherContext, linearRun] = await Promise.all(
  ["gather-context", "linear-run"].map((name) =>
    readFile(join(skillsDir, name, "SKILL.md"), "utf8"),
  ),
);

/**
 * The Context Map template's `**Snapshot**` row. It is the only channel by which a
 * selection reaches a calling skill, so it is extracted rather than substring-matched —
 * a `context-source:` mention elsewhere in the file would not propagate anything.
 */
const snapshotField =
  gatherContext.split("\n").find((line) => line.startsWith("**Snapshot** —")) ?? "";

/** The literal stop linear-run emits when the fan-out came back with no selection. */
const missingSelection =
  "Context phase failed on <LINEAR-ID>: gather-context returned no context-source selection.";

/** Both plan modes must be bound; the audited failure was a stored-plan run. */
const planModes = ["stored-plan", "fresh-plan"];

/**
 * Anchor for the no-rediscovery obligation. Anchored rather than scoped to a phase
 * heading because both mode names already appear throughout Phase 5 — a phase-wide
 * search would pass without the obligation being written at all.
 */
const boundsBothModes = "**The selected source bounds both modes.**";

describe("exclusive-source read contract", () => {
  test("the sentinel block exists and is substantial", () => {
    expect(block).not.toBeNull();
    expect(block!.length).toBeGreaterThan(minBlockLength);
  });

  test("selection is exclusive and recorded as a trace line", () => {
    expect(block).toContain("exactly one source");
    expect(block).toContain("context-source:");
  });

  test("reading outside the selected source requires a recorded reason", () => {
    expect(block).toContain("context-fallback:");
  });

  test.each(fallbackReasons)("the fallback taxonomy names %s", (reason) => {
    expect(block).toContain(reason);
  });

  test("oversized packs stay bounded instead of triggering rediscovery", () => {
    expect(block).toContain("never a full-range read");
    expect(block).toContain("Pack size is never a valid reason to fall back");
  });

  test("the pack_codebase fallback marker phrase survives the rewrite", () => {
    // sharedRulesInvocation.test.ts pins this exact phrase as the block's
    // removed-text marker; rewording it there and here must happen together.
    expect(block).toContain("fall back to `mcp__repomix__pack_codebase` with");
  });
});

describe("digest-repo-standards conforms to the contract", () => {
  test("the blanket packed-snapshot ban is replaced by a recorded selection", async () => {
    const agent = await readFile(digestAgentPath, "utf8");
    expect(agent).not.toContain("Do NOT rely on a packed snapshot");
    expect(agent).toContain("context-source: default");
  });
});

describe("gather-context propagates the selection", () => {
  test("the Snapshot field exists in the Context Map template", () => {
    expect(snapshotField.length).toBeGreaterThan(0);
  });

  test("the Snapshot field carries the recorded trace line", () => {
    expect(snapshotField).toContain("context-source:");
  });

  test("the pre-contract wording no longer names a tier the block cannot record", () => {
    // "live tools" predates the contract and has no `context-source:` form, so a caller
    // reading it back could not tell which tier was selected or why.
    expect(snapshotField).not.toContain("live tools");
  });
});

describe("linear-run enforces the selection", () => {
  test("it reads the shared block instead of paraphrasing the contract", () => {
    expect(linearRun).toContain("shared-rules/references/repomix-snapshot.md");
  });

  test("a missing selection fails the context phase", () => {
    expect(linearRun).toContain(missingSelection);
  });

  test("the gate is fatal, unlike a recorded digest failure", () => {
    const [, gate = ""] = linearRun.split(missingSelection);
    expect(gate).toContain("fatal");
    expect(gate).toContain("digestError");
  });

  test("the no-rediscovery obligation is present", () => {
    expect(linearRun).toContain(boundsBothModes);
  });

  test.each(planModes)("the no-rediscovery obligation binds %s mode", (mode) => {
    const obligation = linearRun.split(boundsBothModes)[1]?.split("\n\n")[0] ?? "";
    expect(`${mode}: ${obligation.includes(`\`${mode}\``)}`).toBe(`${mode}: true`);
  });
});
