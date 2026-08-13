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
 * What this CANNOT prove: that a session honours the contract at runtime. CI sees text
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
