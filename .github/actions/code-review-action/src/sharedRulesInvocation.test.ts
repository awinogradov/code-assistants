/**
 * Guards the runtime half of the shared-rules mechanism: every autopilot skill must
 * point at the shared block it needs, and must no longer carry a copy of it.
 *
 * Discovery is the load-bearing property, inherited from the referenceFormattingSync
 * test this replaces: the skill list comes from readdir, not a hardcoded array, so a
 * newly added skill cannot ship without a reference-formatting directive. Opting a skill
 * out requires naming it in `noRefDirective` with a reason, which is reviewable.
 *
 * What this CANNOT prove: that the model actually reads the block at runtime. CI sees
 * text in a file, nothing more — the same limit prBodyReferenceFormatting.test.ts states
 * for its own presence guard. Runtime evidence comes from the dry-run recorded on the PR.
 *
 * Directives are written as markdown links, so linkResolution.test.ts independently
 * verifies each target exists; the assertion here is that the path is present and names a
 * real reference file, which catches a renamed block before it breaks every call site.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");
const skillsDir = join(repoRoot, "claude-plugins/autopilot/skills");
const referencesDir = join(skillsDir, "shared-rules/references");

/** Skills that legitimately carry no reference-formatting directive. */
const noRefDirective = new Set([
  // Owns the canonical blocks; pointing at itself would be circular.
  "shared-rules",
]);

/**
 * A distinctive phrase from each relocated block. Presence in a consumer means the
 * inlined copy came back — matching on a phrase rather than the whole block catches
 * partial leftovers too.
 */
const removedBlockPhrases: Record<string, string> = {
  "reference-formatting": "Backticks suppress GitHub autolinking",
  "askuserquestion-format": "renders as raw text",
  "askuserquestion-contract": "Copy the full preview string literally into every option",
  "repomix-snapshot": "fall back to `mcp__repomix__pack_codebase` with",
  "issue-body-grammar": "each section answers exactly one question",
  "linear-mcp-access": "never bind a generic tool name",
  "peer-cli-delegation": "zero bytes of stdout",
  "git-history-policy": "Recovering from a base-branch merge",
  "pr-title-grammar": "Release keyword is required, capitalized exactly as shown",
  "pr-body-grammar": "DO NOT use `**Release Notes:**` (capital",
};

const skillDirs = (await readdir(skillsDir, { withFileTypes: true }))
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

async function readSkill(name: string): Promise<string> {
  return readFile(join(skillsDir, name, "SKILL.md"), "utf8");
}

/** Every `../shared-rules/references/<file>.md` path a skill points at. */
function directiveTargets(content: string): string[] {
  return [...content.matchAll(/(?:\.\.\/)+shared-rules\/references\/([\w-]+\.md)/g)].map(
    (m) => m[1],
  );
}

describe("shared-rules invocation", () => {
  test("skills are discovered, not hardcoded", () => {
    expect(skillDirs.length).toBeGreaterThan(20);
    expect(skillDirs).toContain("shared-rules");
  });

  test.each(skillDirs.filter((n) => !noRefDirective.has(n)))(
    "%s directs the reader to the reference-formatting block",
    async (name) => {
      expect(await readSkill(name)).toContain(
        "shared-rules/references/reference-formatting.md",
      );
    },
  );

  test.each(skillDirs)("%s only points at reference files that exist", async (name) => {
    const available = new Set(await readdir(referencesDir));
    for (const target of directiveTargets(await readSkill(name))) {
      expect(available).toContain(target);
    }
  });

  test.each(skillDirs.filter((n) => n !== "shared-rules"))(
    "%s carries no re-inlined block text",
    async (name) => {
      const content = await readSkill(name);
      for (const [block, phrase] of Object.entries(removedBlockPhrases)) {
        expect(`${name}:${block}:${content.includes(phrase)}`).toBe(
          `${name}:${block}:false`,
        );
      }
    },
  );
});
