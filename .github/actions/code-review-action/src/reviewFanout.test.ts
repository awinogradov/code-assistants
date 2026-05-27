/**
 * Tests for reviewFanout.ts pure helpers.
 *
 * SDK-driven invocations (`runReviewFanout`, `runSubagent`) aren't covered here
 * because mocking the Agent SDK's streaming `query()` is brittle and the logic
 * inside those functions is a thin wrapper over the SDK. They're exercised by
 * the end-to-end review in CI.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  buildSubagentPrompt,
  detectStack,
  loadReviewAgents,
  parseAgentFrontmatter,
  splitFrontmatter,
} from "./reviewFanout.ts";

describe("splitFrontmatter", () => {
  test("extracts frontmatter and body", () => {
    const content = "---\nmodel: sonnet\n---\nbody content";
    expect(splitFrontmatter(content)).toEqual({ fm: "model: sonnet", body: "body content" });
  });

  test("returns empty frontmatter when no fence", () => {
    expect(splitFrontmatter("plain body")).toEqual({ fm: "", body: "plain body" });
  });

  test("returns empty frontmatter when closing fence is missing", () => {
    expect(splitFrontmatter("---\nmodel: sonnet\nno close")).toEqual({
      fm: "",
      body: "---\nmodel: sonnet\nno close",
    });
  });
});

describe("parseAgentFrontmatter", () => {
  test("extracts scalar model", () => {
    expect(parseAgentFrontmatter("model: sonnet")).toEqual({ model: "sonnet" });
  });

  test("strips quotes from scalar values", () => {
    expect(parseAgentFrontmatter('model: "haiku"')).toEqual({ model: "haiku" });
  });

  test("parses inline comma-separated tools", () => {
    expect(parseAgentFrontmatter("tools: Bash(gh *), Read")).toEqual({
      allowedTools: ["Bash(gh *)", "Read"],
    });
  });

  test("parses indented list tools", () => {
    const fm = "tools:\n  - Read\n  - Grep\n  - Bash(gh:*)";
    expect(parseAgentFrontmatter(fm)).toEqual({
      allowedTools: ["Read", "Grep", "Bash(gh:*)"],
    });
  });

  test("ignores unknown keys", () => {
    const fm = "name: pr:review:correctness\ndescription: foo\nmodel: sonnet";
    expect(parseAgentFrontmatter(fm)).toEqual({ model: "sonnet" });
  });

  test("handles frontmatter with both model and tools", () => {
    const fm = "model: sonnet\ntools: Bash(gh *)";
    expect(parseAgentFrontmatter(fm)).toEqual({
      model: "sonnet",
      allowedTools: ["Bash(gh *)"],
    });
  });
});

describe("buildSubagentPrompt", () => {
  test("embeds stack and diff in a deterministic template", () => {
    const prompt = buildSubagentPrompt("Python", "diff --git a/x b/x");
    expect(prompt).toBe("Stack: Python\n\nDiff:\n```diff\ndiff --git a/x b/x\n```");
  });
});

describe("detectStack", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "fanout-stack-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  test("reads agents.rules from package.json", async () => {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ agents: { rules: "Bun", language: "typescript" } }),
    );
    expect(await detectStack(dir)).toBe("Bun");
  });

  test("returns 'unknown' when package.json is missing", async () => {
    expect(await detectStack(dir)).toBe("unknown");
  });

  test("returns 'unknown' when agents.rules is absent", async () => {
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "pkg" }));
    expect(await detectStack(dir)).toBe("unknown");
  });

  test("returns 'unknown' when package.json is malformed", async () => {
    await writeFile(join(dir, "package.json"), "{ not json");
    expect(await detectStack(dir)).toBe("unknown");
  });
});

describe("loadReviewAgents", () => {
  let pluginDir: string;

  beforeEach(async () => {
    pluginDir = await mkdtemp(join(tmpdir(), "fanout-agents-"));
    await writeFile(join(pluginDir, "agents").concat("/.keep"), "").catch(() => {});
  });

  afterEach(async () => {
    await rm(pluginDir, { recursive: true });
  });

  async function seed(filename: string, content: string): Promise<void> {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(pluginDir, "agents"), { recursive: true });
    await writeFile(join(pluginDir, "agents", filename), content);
  }

  test("loads only pr:review:* files and parses frontmatter", async () => {
    await seed(
      "pr:review:correctness.md",
      "---\nname: pr:review:correctness\nmodel: sonnet\n---\ncorrectness body",
    );
    await seed(
      "pr:review:surface-naming.md",
      "---\nname: pr:review:surface-naming\nmodel: haiku\n---\nsurface body",
    );
    // Unrelated file must be filtered out
    await seed("pr:review.md", "should be excluded");
    await seed("other.md", "unrelated");

    const agents = await loadReviewAgents(pluginDir);
    const names = agents.map((a) => a.subagent_type).sort();

    expect(names).toEqual([
      "autopilot:pr:review:correctness",
      "autopilot:pr:review:surface-naming",
    ]);
    const correctness = agents.find((a) => a.subagent_type === "autopilot:pr:review:correctness");
    expect(correctness?.model).toBe("sonnet");
    expect(correctness?.body).toBe("correctness body");
  });

  test("propagates allowed tools when declared", async () => {
    await seed(
      "pr:review:rfc-compliance.md",
      "---\nname: pr:review:rfc-compliance\nmodel: sonnet\ntools: Bash(gh *)\n---\nbody",
    );
    const agents = await loadReviewAgents(pluginDir);
    expect(agents[0]?.allowedTools).toEqual(["Bash(gh *)"]);
  });

  test("leaves allowedTools undefined when frontmatter omits tools", async () => {
    await seed(
      "pr:review:correctness.md",
      "---\nname: pr:review:correctness\nmodel: sonnet\n---\nbody",
    );
    const agents = await loadReviewAgents(pluginDir);
    expect(agents[0]?.allowedTools).toBeUndefined();
  });
});
