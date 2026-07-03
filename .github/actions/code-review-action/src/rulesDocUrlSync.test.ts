/**
 * Guards the single canonical pr:review SKILL.md URL that the review and answer
 * skills build every `CHECK-*` rule link from. The URL is single-sourced to the
 * action's `rules_doc_url` input default: the skills receive it at runtime via
 * `RULES_DOC_URL` and no longer hardcode a copy. So this asserts the action default
 * still points at the pr:review SKILL.md (a typo there would break every rule link
 * in a review) and that both skills keep documenting the action input as the one
 * canonical copy, rather than reintroducing a drift-prone duplicate.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");
const skillsDir = join(repoRoot, "claude-plugins/autopilot/skills");
const reviewSkill = join(skillsDir, "pr:review/SKILL.md");
const answerSkill = join(skillsDir, "pr:answer/SKILL.md");

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

  // GitHub renders the `<a id="CHECK-…">` anchors in pr:review SKILL.md as
  // lowercase `user-content-…` ids and URL-fragment lookup is case-sensitive,
  // so a prescribed `#CHECK-…` fragment lands at the top of the file instead of
  // the rule (observed in wefortis/fortune-os#120). Every skill must prescribe
  // the fragment as the rule code lowercased (`#check-bug-002`, `#<code>`).
  test("no skill prescribes an uppercase rule-link fragment", async () => {
    const offenders: string[] = [];
    for (const dir of await readdir(skillsDir)) {
      const content = await readFile(join(skillsDir, dir, "SKILL.md"), "utf8").catch(() => "");
      const fragments = content.match(/#(?:check-[a-z0-9<>-]+|<code[0-9]*>)/gi) ?? [];
      offenders.push(...fragments.filter((f) => f !== f.toLowerCase()).map((f) => `${dir}: ${f}`));
    }
    expect(offenders).toEqual([]);
  });
});
