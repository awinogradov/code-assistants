import { describe, expect, test } from "bun:test";

import { rewriteBody, toPortableSlug, transformSkillFile, type RewriteContext } from "./transformSkill.ts";

const ctx: RewriteContext = {
  skillDirs: new Map([
    ["pr:review", "autopilot-pr-review"],
    ["shared-rules", "autopilot-shared-rules"],
    ["run", "autopilot-run"],
    ["gather-context", "autopilot-gather-context"],
  ]),
  agentDirs: new Map([["digest-branch-diff", "autopilot-digest-branch-diff"]]),
  claudeOnly: new Map([["plan", "plan-mode gate"]]),
};

describe("toPortableSlug", () => {
  test("rewrites `:` separators and adds the autopilot prefix", () => {
    expect(toPortableSlug("pr:review")).toBe("autopilot-pr-review");
    expect(toPortableSlug("plan")).toBe("autopilot-plan");
  });
});

describe("rewriteBody", () => {
  test("rewrites sibling-skill links to exported directory names", () => {
    const out = rewriteBody(
      "Read [snapshot](../shared-rules/references/repomix-snapshot.md) first.",
      "skills/gather-context/SKILL.md",
      ctx,
    );
    expect(out).toBe("Read [snapshot](../autopilot-shared-rules/references/repomix-snapshot.md) first.");
  });

  test("preserves anchors on rewritten links", () => {
    const out = rewriteBody("See [run](../run/SKILL.md#phase-5).", "skills/gather-context/SKILL.md", ctx);
    expect(out).toBe("See [run](../autopilot-run/SKILL.md#phase-5).");
  });

  test("keeps intra-skill relative links stable from references files", () => {
    const out = rewriteBody("Per [rule codes](../SKILL.md#25-rule-codes).", "skills/pr:review/references/checks.md", ctx);
    expect(out).toBe("Per [rule codes](../SKILL.md#25-rule-codes).");
  });

  test("rewrites agent links to the converted agent-skill directory", () => {
    const out = rewriteBody(
      "Launch [digest-branch-diff](../../agents/digest-branch-diff.md).",
      "skills/gather-context/SKILL.md",
      ctx,
    );
    expect(out).toBe("Launch [digest-branch-diff](../autopilot-digest-branch-diff/SKILL.md).");
  });

  test("rewrites links into Claude-only skills to the GitHub source", () => {
    const out = rewriteBody("Execute [the pipeline](../plan/references/pipeline.md).", "skills/run/SKILL.md", ctx);
    expect(out).toBe(
      "Execute [the pipeline](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/skills/plan/references/pipeline.md).",
    );
  });

  test("rewrites links escaping the export to the GitHub source", () => {
    const out = rewriteBody("Uses [the helper](../../lib/linear/fetch-issue.mjs).", "skills/gather-context/SKILL.md", ctx);
    expect(out).toBe(
      "Uses [the helper](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/lib/linear/fetch-issue.mjs).",
    );
  });

  test("leaves absolute URLs and bare anchors untouched", () => {
    const body = "See [docs](https://example.com/x.md) and [Phase 2](#phase-2).";
    expect(rewriteBody(body, "skills/run/SKILL.md", ctx)).toBe(body);
  });

  test("rewrites Skill() invocation tokens, backticked or not", () => {
    expect(rewriteBody("invoke `Skill(autopilot:commits-create)` now", "skills/run/SKILL.md", ctx)).toBe(
      "invoke `autopilot-commits-create` now",
    );
    expect(rewriteBody("invoke Skill(autopilot:commits:create) now", "skills/run/SKILL.md", ctx)).toBe(
      "invoke `autopilot-commits-create` now",
    );
  });
});

describe("transformSkillFile", () => {
  test("reduces frontmatter to the portable name and description", () => {
    const raw = [
      "---",
      "name: pr:review",
      "description: Review a pull request",
      'argument-hint: "[pr-number]"',
      "allowed-tools:",
      "  - Bash(gh *)",
      "model: opus",
      "---",
      "",
      "Body here.",
      "",
    ].join("\n");
    const out = transformSkillFile(raw, "skills/pr:review/SKILL.md", ctx);
    expect(out).toContain("name: autopilot-pr-review");
    expect(out).toContain("description: Review a pull request");
    expect(out).not.toContain("allowed-tools");
    expect(out).not.toContain("argument-hint");
    expect(out).not.toContain("model:");
    expect(out).toContain("Body here.");
  });
});
