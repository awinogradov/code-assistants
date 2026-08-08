import { describe, expect, test } from "bun:test";

import { transformAgentFile } from "./transformAgent.ts";
import type { RewriteContext } from "./transformSkill.ts";

const ctx: RewriteContext = {
  skillDirs: new Map([["shared-rules", "autopilot-shared-rules"]]),
  agentDirs: new Map([["digest-branch-diff", "autopilot-digest-branch-diff"]]),
  claudeOnly: new Map(),
};

const raw = [
  "---",
  "name: digest-branch-diff",
  "description: Summarize a branch diff",
  "tools: Bash",
  "model: haiku",
  "---",
  "",
  "Read [the block](../skills/shared-rules/references/agent-json-output.md) and summarize.",
  "",
].join("\n");

describe("transformAgentFile", () => {
  test("produces portable frontmatter without Claude-only keys", () => {
    const out = transformAgentFile(raw, "agents/digest-branch-diff.md", ctx);
    expect(out).toContain("name: autopilot-digest-branch-diff");
    expect(out).toContain("description: Summarize a branch diff");
    expect(out).not.toContain("tools:");
    expect(out).not.toContain("model:");
  });

  test("prepends the subagent provenance note", () => {
    const out = transformAgentFile(raw, "agents/digest-branch-diff.md", ctx);
    expect(out).toContain("> Derived from the autopilot `digest-branch-diff` subagent.");
  });

  test("rewrites body links relative to the converted skill directory", () => {
    const out = transformAgentFile(raw, "agents/digest-branch-diff.md", ctx);
    expect(out).toContain("](../autopilot-shared-rules/references/agent-json-output.md)");
  });
});
