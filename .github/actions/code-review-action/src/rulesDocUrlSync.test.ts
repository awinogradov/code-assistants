/**
 * Guards the single canonical pr:review SKILL.md URL that the review and answer
 * skills build every `CHECK-*` rule link from. The URL is single-sourced to the
 * action's `rules_doc_url` input default: the skills receive it at runtime via
 * `RULES_DOC_URL` and no longer hardcode a copy. So this asserts the action default
 * still points at the pr:review SKILL.md (a typo there would break every rule link
 * in a review) and that both skills keep documenting the action input as the one
 * canonical copy, rather than reintroducing a drift-prone duplicate.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");
const reviewSkill = join(repoRoot, "claude-plugins/autopilot/skills/pr:review/SKILL.md");
const answerSkill = join(repoRoot, "claude-plugins/autopilot/skills/pr:answer/SKILL.md");

const canonicalCopyPhrase = "`rules_doc_url` input default is the one canonical copy";

describe("rules_doc_url single source", () => {
  test("action default points at the canonical pr:review SKILL.md", async () => {
    const actionYml = await readFile(join(actionDir, "action.yml"), "utf8");
    const actionDefault = /rules_doc_url:[\s\S]*?default:\s*"([^"]+)"/.exec(actionYml)?.[1];
    expect(actionDefault).toContain("/pr%3Areview/SKILL.md");
  });

  test("review and answer skills single-source the URL from the action input", async () => {
    for (const skill of [reviewSkill, answerSkill]) {
      const content = await readFile(skill, "utf8");
      expect(content).toContain(canonicalCopyPhrase);
    }
  });
});
