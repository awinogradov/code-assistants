/**
 * Tests for ruleUrls.ts — rule-code → GitHub-link resolution by anchor templating.
 */
import { describe, expect, test } from "bun:test";

import { linkRuleCodes, rulesDocUrl } from "./ruleUrls.ts";

describe("linkRuleCodes", () => {
  const base = "https://example.com/rules.md";

  test("links a single bare code to the base-url anchor", () => {
    expect(linkRuleCodes("retries duplicate [CHECK-BUG-002]", base)).toBe(
      "retries duplicate [CHECK-BUG-002](https://example.com/rules.md#CHECK-BUG-002)"
    );
  });

  test("links a merged bare-code group, preserving the nested form", () => {
    expect(linkRuleCodes("dup [CHECK-BUG-002, CHECK-AI-002]", base)).toBe(
      "dup [[CHECK-BUG-002](https://example.com/rules.md#CHECK-BUG-002), [CHECK-AI-002](https://example.com/rules.md#CHECK-AI-002)]"
    );
  });

  test("defaults to the consolidated skill anchor when no base url is passed", () => {
    expect(linkRuleCodes("x [CHECK-SEC-001]")).toBe(`x [CHECK-SEC-001](${rulesDocUrl}#CHECK-SEC-001)`);
  });

  test("does not double-link already-linked codes", () => {
    const already = "x [CHECK-BUG-002](https://example.com/rules.md#CHECK-BUG-002)";
    expect(linkRuleCodes(already, base)).toBe(already);
  });

  test("ignores brackets that are not rule-code groups", () => {
    expect(linkRuleCodes("see [the docs](https://x) and [a note]", base)).toBe(
      "see [the docs](https://x) and [a note]"
    );
  });
});

describe("rulesDocUrl", () => {
  test("points at the consolidated pr:review skill with a percent-encoded colon", () => {
    expect(rulesDocUrl).toBe(
      "https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/skills/pr%3Areview/SKILL.md"
    );
  });
});
