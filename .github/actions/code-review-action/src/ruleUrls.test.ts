/**
 * Tests for ruleUrls.ts — deterministic rule-code → GitHub-link resolution.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { buildRuleUrlMap, linkRuleCodes, slugifyHeading } from "./ruleUrls.ts";

describe("slugifyHeading", () => {
  test("strips the marker, lowercases, drops punctuation, hyphenates", () => {
    expect(slugifyHeading("### B. Concurrency and Async Issues")).toBe(
      "b-concurrency-and-async-issues"
    );
  });

  test("collapses repeated hyphens and trims", () => {
    expect(slugifyHeading("###   A — Code  Reuse ")).toBe("a-code-reuse");
  });
});

describe("linkRuleCodes", () => {
  const map = new Map([
    ["CHECK-BUG-002", "https://example.com/bug#b"],
    ["CHECK-AI-002", "https://example.com/ai#a"],
  ]);

  test("links a single bare code", () => {
    expect(linkRuleCodes("retries duplicate [CHECK-BUG-002]", map)).toBe(
      "retries duplicate [CHECK-BUG-002](https://example.com/bug#b)"
    );
  });

  test("links a merged bare-code group, preserving the nested form", () => {
    expect(linkRuleCodes("dup [CHECK-BUG-002, CHECK-AI-002]", map)).toBe(
      "dup [[CHECK-BUG-002](https://example.com/bug#b), [CHECK-AI-002](https://example.com/ai#a)]"
    );
  });

  test("leaves unknown codes bare", () => {
    expect(linkRuleCodes("x [CHECK-XYZ-999]", map)).toBe("x [CHECK-XYZ-999]");
  });

  test("does not double-link already-linked codes", () => {
    const already = "x [CHECK-BUG-002](https://example.com/bug#b)";
    expect(linkRuleCodes(already, map)).toBe(already);
  });

  test("ignores brackets that are not rule-code groups", () => {
    expect(linkRuleCodes("see [the docs](https://x) and [a note]", map)).toBe(
      "see [the docs](https://x) and [a note]"
    );
  });

  test("links known codes and leaves unknown ones bare within a merged group", () => {
    expect(linkRuleCodes("mix [CHECK-BUG-002, CHECK-XYZ-999]", map)).toBe(
      "mix [[CHECK-BUG-002](https://example.com/bug#b), [CHECK-XYZ-999]]"
    );
  });
});

describe("buildRuleUrlMap", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ruleurls-"));
    await Bun.write(
      join(dir, "pr:review:correctness.md"),
      "### A. Logic Errors\n**CHECK-BUG-001: Wrong variable** — Severity: blocker\n\n### B. Concurrency and Async Issues\n**CHECK-BUG-002: Shared mutable state** — Severity: blocker\n"
    );
    // A second pr:review agent file — codes from all files should be collected.
    await Bun.write(
      join(dir, "pr:review:security.md"),
      "### A. Secrets and Credentials\n**CHECK-SEC-001: Hardcoded secret** — Severity: blocker\n"
    );
    // A non-matching file should be ignored.
    await Bun.write(join(dir, "other.md"), "**CHECK-ZZZ-001: nope**\n");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  test("maps codes to anchored GitHub URLs from the owning section", async () => {
    const map = await buildRuleUrlMap(dir);
    expect(map.get("CHECK-BUG-001")).toBe(
      "https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/pr%3Areview%3Acorrectness.md#a-logic-errors"
    );
    expect(map.get("CHECK-BUG-002")).toBe(
      "https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/pr%3Areview%3Acorrectness.md#b-concurrency-and-async-issues"
    );
  });

  test("collects codes across multiple pr:review files", async () => {
    const map = await buildRuleUrlMap(dir);
    expect(map.get("CHECK-SEC-001")).toBe(
      "https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/pr%3Areview%3Asecurity.md#a-secrets-and-credentials"
    );
    expect(map.has("CHECK-BUG-001")).toBe(true);
  });

  test("ignores files that are not pr:review agents", async () => {
    const map = await buildRuleUrlMap(dir);
    expect(map.has("CHECK-ZZZ-001")).toBe(false);
  });

  test("returns an empty map for an unreadable directory", async () => {
    const map = await buildRuleUrlMap(join(dir, "does-not-exist"));
    expect(map.size).toBe(0);
  });
});
