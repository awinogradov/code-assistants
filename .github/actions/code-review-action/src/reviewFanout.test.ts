/**
 * Tests for reviewFanout.ts pure helpers.
 *
 * The SDK-driven `runReviewFanout` / `runSubagent` wrappers aren't covered here
 * (mocking the streaming `query()` is brittle), but `collectStructuredFindings`
 * takes a plain async iterable, so its parse/fail-open branches are tested below.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type pino from "pino";

import type { FanoutContext, FanoutStats, SubagentResult } from "./reviewFanout.ts";
import {
  buildFanoutStats,
  buildSubagentPrompt,
  collectStructuredFindings,
  detectStack,
  isFanoutWhollyFailed,
  loadReviewAgents,
  parseAgentFrontmatter,
  resolveModel,
  splitFrontmatter,
  toAgentReviews,
} from "./reviewFanout.ts";
import type { ReviewFinding } from "./reviewFindings.ts";

/** No-op logger satisfying the pino surface `logMessage` touches. */
const noopLog = {
  info() {},
  debug() {},
  warn() {},
  error() {},
  trace() {},
  fatal() {},
  child() {
    return noopLog;
  },
} as unknown as pino.Logger;

/** Yield the given messages as the SDK stream `collectStructuredFindings` consumes. */
async function* streamOf(...messages: unknown[]): AsyncGenerator<SDKMessage> {
  for (const message of messages) yield message as SDKMessage;
}

describe("buildFanoutStats", () => {
  const result = (
    duration_ms: number,
    error?: string,
    subagent_type = "autopilot:pr:review:correctness",
  ): SubagentResult => ({
    subagent_type,
    findings: [],
    duration_ms,
    error,
  });

  test("counts agents and failures", () => {
    const stats = buildFanoutStats([result(100), result(200, "boom"), result(150)], 250);
    expect(stats.agentCount).toBe(3);
    expect(stats.failedCount).toBe(1);
  });

  test("computes parallel speedup as sum(agent time) / wall time", () => {
    expect(buildFanoutStats([result(100), result(300)], 200).parallelSpeedup).toBe(2);
  });

  test("returns 0 speedup when no wall time elapsed", () => {
    expect(buildFanoutStats([result(100)], 0).parallelSpeedup).toBe(0);
  });

  test("surfaces the top 3 slowest agents (descending) keyed by bare category", () => {
    const stats = buildFanoutStats(
      [
        result(100, undefined, "autopilot:pr:review:standards"),
        result(400, undefined, "autopilot:pr:review:common-sense"),
        result(200, undefined, "autopilot:pr:review:testing"),
        result(300, undefined, "autopilot:pr:review:surface-testing"),
      ],
      400,
    );
    expect(stats.agentDurations).toEqual([
      { category: "common-sense", durationMs: 400 },
      { category: "surface-testing", durationMs: 300 },
      { category: "testing", durationMs: 200 },
    ]);
  });

  test("includes errored agents in the slowest list (a failing agent can be the long pole)", () => {
    const stats = buildFanoutStats(
      [
        result(400, "timed out", "autopilot:pr:review:common-sense"),
        result(100, undefined, "autopilot:pr:review:standards"),
      ],
      400,
    );
    expect(stats.agentDurations[0]).toEqual({ category: "common-sense", durationMs: 400 });
  });

  test("handles an empty result set", () => {
    expect(buildFanoutStats([], 100)).toEqual({
      agentCount: 0,
      failedCount: 0,
      parallelSpeedup: 0,
      agentDurations: [],
    });
  });
});

describe("toAgentReviews", () => {
  const finding: ReviewFinding = {
    severity: "blocker",
    file: "src/a.ts",
    line: 1,
    rule: null,
    title: "t",
    detail: "d",
  };

  test("drops errored agents and tags survivors with their bare category", () => {
    const reviews = toAgentReviews([
      { subagent_type: "autopilot:pr:review:correctness", findings: [finding], duration_ms: 10 },
      {
        subagent_type: "autopilot:pr:review:security",
        findings: [],
        duration_ms: 5,
        error: "boom",
      },
    ]);
    expect(reviews).toEqual([{ category: "correctness", findings: [finding] }]);
  });

  test("returns an empty list for no results", () => {
    expect(toAgentReviews([])).toEqual([]);
  });

  test("returns an empty list when every agent errored", () => {
    expect(
      toAgentReviews([
        {
          subagent_type: "autopilot:pr:review:correctness",
          findings: [],
          duration_ms: 5,
          error: "boom",
        },
        {
          subagent_type: "autopilot:pr:review:security",
          findings: [],
          duration_ms: 5,
          error: "boom",
        },
      ]),
    ).toEqual([]);
  });

  test("leaves a subagent_type without the review prefix unchanged as the category", () => {
    expect(toAgentReviews([{ subagent_type: "weird-name", findings: [], duration_ms: 1 }])).toEqual(
      [{ category: "weird-name", findings: [] }],
    );
  });
});

describe("collectStructuredFindings", () => {
  const validFinding: ReviewFinding = {
    severity: "blocker",
    file: "src/a.ts",
    line: 1,
    rule: "CHECK-BUG-001",
    title: "t",
    detail: "d",
  };

  // logResult (via logMessage) reads permission_denials.length, so the mock
  // result messages carry an empty array alongside the fields under test.
  const resultMessage = (fields: Record<string, unknown>): unknown => ({
    type: "result",
    permission_denials: [],
    ...fields,
  });

  test("returns parsed findings from a successful result", async () => {
    const result = await collectStructuredFindings(
      noopLog,
      streamOf(
        resultMessage({ subtype: "success", structured_output: { findings: [validFinding] } }),
      ),
    );
    expect(result).toEqual({ findings: [validFinding] });
  });

  test("skips the dimension when no result message arrives", async () => {
    const result = await collectStructuredFindings(noopLog, streamOf());
    expect(result.findings).toEqual([]);
    expect(result.error).toContain("No result message");
  });

  test("skips the dimension on a non-success result subtype", async () => {
    const result = await collectStructuredFindings(
      noopLog,
      streamOf(resultMessage({ subtype: "error_max_structured_output_retries" })),
    );
    expect(result.findings).toEqual([]);
    expect(result.error).toContain("error_max_structured_output_retries");
  });

  test("records the zod issues and raw payload on a schema mismatch", async () => {
    const result = await collectStructuredFindings(
      noopLog,
      streamOf(resultMessage({ subtype: "success", structured_output: { findings: "nope" } })),
    );
    expect(result.findings).toEqual([]);
    expect(result.error).toContain("findings");
    expect(result.raw).toBe(JSON.stringify({ findings: "nope" }));
  });

  test("recovers findings from the result text when structured_output is absent", async () => {
    const result = await collectStructuredFindings(
      noopLog,
      streamOf(
        resultMessage({ subtype: "success", result: JSON.stringify({ findings: [validFinding] }) }),
      ),
    );
    expect(result).toEqual({ findings: [validFinding] });
  });

  test("recovers a valid empty findings object from the result text", async () => {
    const result = await collectStructuredFindings(
      noopLog,
      streamOf(resultMessage({ subtype: "success", result: '{ "findings": [] }' })),
    );
    expect(result).toEqual({ findings: [] });
    expect(result.error).toBeUndefined();
  });

  test("strips a fenced code block around the result text", async () => {
    const fenced = ["```json", JSON.stringify({ findings: [validFinding] }), "```"].join("\n");
    const result = await collectStructuredFindings(
      noopLog,
      streamOf(resultMessage({ subtype: "success", result: fenced })),
    );
    expect(result).toEqual({ findings: [validFinding] });
  });

  test("prefers structured_output over the result text when both are present", async () => {
    const result = await collectStructuredFindings(
      noopLog,
      streamOf(
        resultMessage({
          subtype: "success",
          structured_output: { findings: [validFinding] },
          result: "not json",
        }),
      ),
    );
    expect(result).toEqual({ findings: [validFinding] });
  });

  test("skips the dimension when neither structured_output nor result text is valid JSON", async () => {
    const result = await collectStructuredFindings(
      noopLog,
      streamOf(resultMessage({ subtype: "success", result: "I could not complete the review." })),
    );
    expect(result.findings).toEqual([]);
    expect(result.error).toContain("did not match the findings schema");
    expect(result.raw).toBe("I could not complete the review.");
  });
});

describe("isFanoutWhollyFailed", () => {
  const stats = (agentCount: number, failedCount: number): FanoutStats => ({
    agentCount,
    failedCount,
    parallelSpeedup: 0,
    agentDurations: [],
  });

  test("true when every agent errored", () => {
    expect(isFanoutWhollyFailed(stats(12, 12))).toBe(true);
  });

  test("true for a single failed agent", () => {
    expect(isFanoutWhollyFailed(stats(1, 1))).toBe(true);
  });

  test("false when at least one agent succeeded", () => {
    expect(isFanoutWhollyFailed(stats(3, 1))).toBe(false);
  });

  test("false when no agents failed", () => {
    expect(isFanoutWhollyFailed(stats(3, 0))).toBe(false);
  });

  test("false for a single successful agent", () => {
    expect(isFanoutWhollyFailed(stats(1, 0))).toBe(false);
  });

  test("false when no agents ran", () => {
    expect(isFanoutWhollyFailed(stats(0, 0))).toBe(false);
  });
});

describe("resolveModel", () => {
  const ctx = (overrides: Record<string, string>) =>
    ({ modelOverrides: overrides, fallbackModel: "fallback-model" }) as unknown as FanoutContext;
  const agent = (subagent_type: string, model?: string) =>
    ({ subagent_type, model }) as Parameters<typeof resolveModel>[1];

  test("prefers a per-category override over the frontmatter model", () => {
    expect(resolveModel(ctx({ correctness: "opus" }), agent("autopilot:pr:review:correctness", "sonnet"))).toBe(
      "opus"
    );
  });

  test("falls back to the frontmatter model when no override matches", () => {
    expect(resolveModel(ctx({ testing: "opus" }), agent("autopilot:pr:review:correctness", "sonnet"))).toBe(
      "sonnet"
    );
  });

  test("falls back to the context model when neither override nor frontmatter is set", () => {
    expect(resolveModel(ctx({}), agent("autopilot:pr:review:correctness"))).toBe("fallback-model");
  });

  test("keys overrides by the bare category (autopilot:pr:review: stripped)", () => {
    expect(resolveModel(ctx({ "surface-naming": "haiku" }), agent("autopilot:pr:review:surface-naming", "sonnet"))).toBe(
      "haiku"
    );
  });
});

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
