/**
 * Guards the Graphify query-refinement discipline inside the repomix-snapshot shared block
 * (claude-plugins/autopilot/skills/shared-rules/references/repomix-snapshot.md), added for
 * issue #587: a truncated or over-broad graph answer is not a finished lookup, so the tier
 * must classify the response, refine it with a narrower graph operation before any
 * context-gathering file read, end at a bounded shortlist, and close with a
 * `graphify-trace:` line whose fields are defined rather than suggestive.
 *
 * The discipline carries its OWN nested sentinel (`graphify-refinement`) inside the outer
 * block. That is load-bearing, not decoration: the outer block already contains the words
 * "truncated" (in the fallback reason `truncated-or-unreadable`), "error", and "empty", so
 * a whole-block substring check for the four response classes would pass before the
 * discipline was ever written. Extracting the inner sentinel makes those assertions mean
 * what they say.
 *
 * Response classes and trace fields are explicit test data, one assertion per token, so
 * dropping a class or a field fails loudly instead of shrinking the contract silently. The
 * block is asserted present before anything else — the vacuous-pass defence
 * contextSourceContract.test.ts and sharedBlockSync.test.ts both state: a missing sentinel
 * would otherwise extract nothing and pass every substring check on "".
 *
 * What this CANNOT prove, in two directions:
 *   - Downstream: that a session honours the discipline at runtime. CI sees text in a file,
 *     nothing more. Runtime evidence comes from the post-merge canary recorded on the
 *     issue — the first planning run in a graphify-enabled repository reports its
 *     `graphify-trace:` values and post-selection direct-read count against the #587
 *     baseline (one query, zero refinements, full traversal fallback).
 *   - Upstream: that the transcribed CLI surface still matches the tool. The truncation
 *     marker and the flag names are transcribed from graphify v0.9.32; if graphify renames
 *     them, every assertion here still passes while the contract points agents at strings
 *     the CLI no longer emits. A graphify upgrade must re-verify the marker by hand.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

// Depth mirrors contextSourceContract.test.ts in this directory — a move of the
// action updates both in lockstep.
const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");

const blockPath = join(
  repoRoot,
  "claude-plugins/autopilot/skills/shared-rules/references/repomix-snapshot.md",
);
const gatherContextPath = join(repoRoot, "claude-plugins/autopilot/skills/gather-context/SKILL.md");
const packDocPath = join(repoRoot, "docs/09-repomix-pack.md");

/** The rule files synced to consumer repositories; each carries the same Graphify bullet. */
const rulesPaths = [
  "rules/Bun.md",
  "rules/Bun+React+Tailwind.md",
  "rules/NodeJS+React.md",
  "rules/NodeJS+React+Tailwind.md",
].map((relative) => join(repoRoot, relative));

/** Shortest the discipline can be; anything smaller means the extraction went wrong. */
const minBlockLength = 80;

/**
 * The four response classes a graph query can land in. Every one needs a stated handling
 * rule, because the gap issue #587 reports is a truncated answer being treated as focused.
 */
const responseClasses = ["focused", "truncated", "empty", "error"];

/** The `graphify-trace:` fields. A trace missing one cannot be compared between runs. */
const traceFields = ["queries=", "truncated=", "shortlist=", "outside-reads="];

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

const [blockSource, gatherContext, packDoc, ...rulesSources] = await Promise.all([
  readContract(blockPath),
  readContract(gatherContextPath),
  readContract(packDocPath),
  ...rulesPaths.map(readContract),
]);

const refinement = extractBlock(blockSource, "graphify-refinement");

describe("graphify refinement discipline", () => {
  test("the nested sentinel block exists and is substantial", () => {
    expect(refinement).not.toBeNull();
    expect(refinement?.length ?? 0).toBeGreaterThan(minBlockLength);
  });

  test("it lives inside the repomix-snapshot block it refines", () => {
    const outer = extractBlock(blockSource, "repomix-snapshot");
    expect(outer).not.toBeNull();
    expect(outer).toContain("graphify-refinement:start");
  });

  test.each(responseClasses)("a %s response has a stated handling rule", (responseClass) => {
    expect(refinement).toContain(responseClass);
  });

  test("truncation is detected by the marker graphify prints", () => {
    expect(refinement).toContain("[!] TRUNCATED");
  });

  test("a truncated answer is refined before ordinary file traversal", () => {
    expect(refinement).toContain("before any context-gathering file read");
  });

  test("raising the budget cannot stand in for narrowing", () => {
    expect(refinement).toContain("never the sole response");
  });

  test("refinement is bounded and the shortlist is bounded", () => {
    expect(refinement).toContain("at most three");
    expect(refinement).toContain("at most ten");
  });

  test("reads during the pass are limited to the shortlist", () => {
    expect(refinement).toContain("context-fallback:");
  });

  test("an exhausted tier hands over to exactly one successor source", () => {
    expect(refinement).toContain("superseding graphify");
  });

  test.each(traceFields)("the trace records %s", (field) => {
    expect(refinement).toContain(field);
  });

  test("a trace that skipped refinement reads as a violation", () => {
    expect(refinement).toContain("`truncated=yes` with `queries=1`");
  });
});

describe("consumers record the shortlist", () => {
  test("gather-context carries the shortlist into the Context Map", () => {
    expect(gatherContext).toContain("graphify-trace:");
    expect(gatherContext).toContain("shortlist");
  });

  test("the repomix-pack doc documents the discipline", () => {
    expect(packDoc).toContain("graphify-trace:");
  });

  test("the four synced rule files carry one identical Graphify bullet", () => {
    const bullets = rulesSources.map(extractGraphifyBullet);
    for (const bullet of bullets) expect(bullet).not.toBeNull();
    expect(new Set(bullets).size).toBe(1);
    expect(bullets[0]).toContain("narrower");
  });
});
