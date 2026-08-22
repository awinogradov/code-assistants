/**
 * Guards the review-context-bundle contract (issue #605) across its three
 * holders: the schema (`reviewContextBundle.ts`), the action wiring
 * (`action.yml`), and the pr-review skill prose (SKILL.md §1.0). Each lives in
 * a different file, and any one drifting silently defeats the bundle — a skill
 * that rediscovers anyway, a prompt that never passes the path, or a version
 * gate checking a number the schema no longer exports.
 *
 * Mirrors contextSourceContract.test.ts: the guarded documents are asserted
 * non-empty first (vacuous-pass defence — a moved file would otherwise pass
 * every substring check on ""), and the fallback-reason taxonomy is explicit
 * test data, one assertion per token, so dropping a reason fails loudly.
 *
 * Like that file, this proves text, not runtime behavior: runtime evidence is
 * the `context_builder` block in the run-summary footer (fallback rate and
 * follow-up counts per run) compared against issue #605's production baseline.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { bundleVersion } from "./reviewContextBundle.ts";

// Depth mirrors sharedBlockSync.test.ts in this directory — a move of the
// action updates both in lockstep.
const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");
const skillPath = join(repoRoot, "claude-plugins/autopilot/skills/pr-review/SKILL.md");
const actionYmlPath = join(actionDir, "action.yml");

/** Shortest either guarded document can plausibly be. */
const minDocLength = 1000;

/** The machine-readable fallback reasons §1.0 names; runClaude counts the marker. */
const fallbackReasons = ["absent", "unreadable", "invalid-json", "invalid-version"];

const skill = await readFile(skillPath, "utf8");
const actionYml = await readFile(actionYmlPath, "utf8");

describe("review-context-bundle contract", () => {
  test("both guarded documents exist and are substantial", () => {
    expect(skill.length).toBeGreaterThan(minDocLength);
    expect(actionYml.length).toBeGreaterThan(minDocLength);
  });

  test("the skill gates consumption on the version the schema exports", () => {
    expect(skill).toContain("### 1.0 Consume the Context Bundle");
    expect(skill).toContain(`\`version\` field equals \`${bundleVersion}\``);
  });

  test("the bundle substitutes data acquisition only, with both paths sharing §1.3", () => {
    expect(skill).toContain("substitutes for data acquisition only");
    expect(skill).toContain("This decision procedure is the same on both data paths");
  });

  test("follow-ups are budgeted and trace-recorded", () => {
    expect(skill).toContain("bundle-followup:");
    expect(skill).toContain("3 per session");
  });

  test("the fallback is trace-recorded with the full reason taxonomy", () => {
    expect(skill).toContain("bundle-fallback:");
  });

  test.each(fallbackReasons)("the fallback taxonomy names %s", (reason) => {
    expect(skill).toContain(reason);
  });

  test("the legacy discovery sections survive as the fallback path", () => {
    expect(skill).toContain("### 1.1 PR Context");
    expect(skill).toContain("### 1.2 Load Context via Sub-Agents");
    expect(skill).toContain(
      "run [§1.1](#11-pr-context)–[§1.2](#12-load-context-via-sub-agents) unchanged",
    );
  });

  test("action.yml passes the bundle path in the review prompt", () => {
    expect(actionYml).toContain("CONTEXT_BUNDLE: ${{ steps.bundle.outputs.path }}");
  });

  test("action.yml runs the builder step and threads its telemetry into the session", () => {
    expect(actionYml).toContain("id: bundle");
    expect(actionYml).toContain("src/buildReviewContext.ts");
    expect(actionYml).toContain("BUNDLE_TELEMETRY: ${{ steps.bundle.outputs.telemetry }}");
  });
});
