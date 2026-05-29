/**
 * Guards that the canonical pr:review SKILL.md URL stays in sync across the three
 * places it is duplicated: the action's `rules_doc_url` input default, and the
 * `RULES_DOC_URL` fallback documented in the pr:review and pr:answer skills. The
 * skills build every `CHECK-*` rule link from this URL, so silent drift between
 * the copies would break the links in a review without any other signal.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");
const reviewSkill = join(repoRoot, "claude-plugins/autopilot/skills/pr:review/SKILL.md");
const answerSkill = join(repoRoot, "claude-plugins/autopilot/skills/pr:answer/SKILL.md");

/** Extract the first capture group of `pattern` from the file at `path`. */
async function extract(path: string, pattern: RegExp): Promise<string | undefined> {
  const content = await readFile(path, "utf8");
  return pattern.exec(content)?.[1];
}

describe("rules_doc_url sync", () => {
  test("action default and both skill fallbacks point at the same URL", async () => {
    const actionDefault = await extract(
      join(actionDir, "action.yml"),
      /rules_doc_url:[\s\S]*?default:\s*"([^"]+)"/
    );
    const reviewFallback = await extract(reviewSkill, /RULES_DOC_URL[\s\S]*?fall back to `([^`]+)`/);
    const answerFallback = await extract(answerSkill, /RULES_DOC_URL[\s\S]*?fall back to `([^`]+)`/);

    // Sanity-check extraction grabbed the URL (not undefined / a different default),
    // otherwise the equality assertions below could pass on two `undefined`s.
    expect(actionDefault).toContain("/pr%3Areview/SKILL.md");
    expect(reviewFallback).toBe(actionDefault);
    expect(answerFallback).toBe(actionDefault);
  });
});
