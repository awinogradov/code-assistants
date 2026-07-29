/**
 * Guards the shared instruction blocks that live in
 * claude-plugins/autopilot/skills/shared-rules/references/. Each block is the single
 * source of truth for text several skills or agents need; consumers read the block at
 * runtime instead of carrying a copy (see sharedRulesInvocation.test.ts for that half).
 *
 * Two runtimes can read nothing at all, so they keep a literal inlined copy:
 * releaseNotesPrompt.ts is passed to the Anthropic API as a raw system prompt with no
 * tools, and the structured-output agents declare restrictive `tools` lists (expert-review
 * declares `tools: []`). Those copies are still single-sourced — this test asserts each is
 * byte-identical to its canonical block.
 *
 * Replaces referenceFormattingSync.test.ts, which guarded only the reference-formatting
 * block across ~25 inlined copies. RFC-0001 remains canonical for that one block: the
 * reference file is asserted equal to the RFC's own sentinel block, so the RFC cannot
 * silently degrade into a third mutable copy.
 *
 * Vacuous-pass defences, both deliberate: every extracted block must be non-empty and
 * above a minimum length (a missing sentinel would otherwise extract "" and compare
 * equal to another ""), and the retained-copy matrix is explicit test data rather than a
 * glob, so a dropped or newly added inlined copy fails loudly instead of shrinking the
 * matrix in silence.
 */
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { describe, expect, test } from "bun:test";

const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");
const referencesDir = join(
  repoRoot,
  "claude-plugins/autopilot/skills/shared-rules/references",
);
const rfcPath = join(repoRoot, "rfc/0001-reference-formatting.md");
const agentsDir = join(repoRoot, "claude-plugins/autopilot/agents");
const releasePrompt = join(
  repoRoot,
  ".github/actions/release-action/src/releaseNotesPrompt.ts",
);

/** Shortest a real block can be; anything smaller means the extraction went wrong. */
const minBlockLength = 80;

/** Reference file → the sentinel name delimiting its canonical block. */
const blockSentinels: Record<string, string> = {
  "reference-formatting.md": "ref-format",
  "askuserquestion-format.md": "auq-format",
  "repomix-snapshot.md": "repomix-snapshot",
  "agent-json-output.md": "agent-json",
  "linear-mcp-access.md": "linear-mcp",
  "pr-title-grammar.md": "pr-title-grammar",
  "pr-body-grammar.md": "pr-body-grammar",
};

/**
 * Every place a block is still inlined because the runtime cannot read a file.
 * Explicit on purpose — see the vacuous-pass note in the file header.
 */
const retainedCopies: { block: string; file: string; unescapeBackticks?: boolean }[] = [
  // Raw Anthropic API system prompt: no Claude Code SDK, therefore no tools at all.
  { block: "reference-formatting.md", file: releasePrompt, unescapeBackticks: true },
  // Structured-output agents: each declares its own `tools`, and expert-review declares [].
  ...[
    "digest-branch-diff.md",
    "digest-repo-standards.md",
    "expert-review.md",
    "resolve-alert-context.md",
    "resolve-assignees.md",
    "resolve-issue-context.md",
    "search-codebase-todos.md",
  ].map((name) => ({ block: "agent-json-output.md", file: join(agentsDir, name) })),
];

/** Extract the named sentinel-delimited block from `content`, trimmed; null when absent. */
function extractBlock(content: string, sentinel: string): string | null {
  const pattern = new RegExp(
    `<!-- ${sentinel}:start -->([\\s\\S]*?)<!-- ${sentinel}:end -->`,
  );
  return pattern.exec(content)?.[1].trim() ?? null;
}

const canonical = new Map<string, string>();
for (const [file, sentinel] of Object.entries(blockSentinels)) {
  const block = extractBlock(await readFile(join(referencesDir, file), "utf8"), sentinel);
  if (block) canonical.set(file, block);
}

describe("shared block canonicals", () => {
  test("every reference file on disk is registered", async () => {
    const onDisk = (await readdir(referencesDir)).filter((f) => f.endsWith(".md")).sort();
    expect(onDisk).toEqual(Object.keys(blockSentinels).sort());
  });

  test.each(Object.keys(blockSentinels))("%s exposes a substantial block", (file) => {
    const block = canonical.get(file);
    expect(block).not.toBeNull();
    expect(block).toBeDefined();
    expect(block!.length).toBeGreaterThan(minBlockLength);
  });

  test("RFC-0001 stays canonical for the reference-formatting block", async () => {
    const fromRfc = extractBlock(await readFile(rfcPath, "utf8"), "ref-format");
    expect(fromRfc).not.toBeNull();
    expect(fromRfc!.length).toBeGreaterThan(minBlockLength);
    expect(canonical.get("reference-formatting.md")).toBe(fromRfc!);
  });
});

describe("retained inlined copies", () => {
  test.each(retainedCopies.map((c) => [basename(c.file), c] as const))(
    "%s inlines its block verbatim",
    async (_name, copy) => {
      const raw = await readFile(copy.file, "utf8");
      // Inside a template literal the block's backticks are escaped as \` in source.
      const source = copy.unescapeBackticks ? raw.replaceAll("\\`", "`") : raw;
      const sentinel = blockSentinels[copy.block];
      const inlined = extractBlock(source, sentinel);
      expect(inlined).not.toBeNull();
      expect(inlined).toBe(canonical.get(copy.block)!);
    },
  );

  test("no agent carries the JSON block without being registered", async () => {
    const registered = new Set(
      retainedCopies.filter((c) => c.block === "agent-json-output.md").map((c) => basename(c.file)),
    );
    const carrying: string[] = [];
    for (const name of await readdir(agentsDir)) {
      if (!name.endsWith(".md")) continue;
      const raw = await readFile(join(agentsDir, name), "utf8");
      if (raw.includes("Output ONLY a single JSON object")) carrying.push(name);
    }
    expect(carrying.sort()).toEqual([...registered].sort());
  });
});
