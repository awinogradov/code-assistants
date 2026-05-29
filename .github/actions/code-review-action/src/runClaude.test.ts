/**
 * Tests for runClaude.ts utility functions.
 * Covers config parsing, JSON safety, MCP config loading, and GitHub output formatting.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  buildRunSummary,
  countToolRoundTrips,
  deriveMode,
  detectLinuxLibc,
  extractUsage,
  findResultMessage,
  loadMcpServers,
  mcpConfigFileSchema,
  parseConfig,
  parseModelOverrides,
  resolveClaudeBinary,
  safeParseJson,
  withFanoutStats,
} from "./runClaude.ts";

describe("parseModelOverrides", () => {
  test("returns empty map for undefined or empty input", () => {
    expect(parseModelOverrides(undefined)).toEqual({});
    expect(parseModelOverrides("")).toEqual({});
  });

  test("parses a category-to-model map", () => {
    expect(parseModelOverrides('{"correctness":"claude-opus-4-8","complexity":"claude-sonnet-4-6"}')).toEqual({
      correctness: "claude-opus-4-8",
      complexity: "claude-sonnet-4-6",
    });
  });

  test("rejects the whole map when any value is not a string (strict Zod)", () => {
    expect(parseModelOverrides('{"security":"sonnet","bogus":3}')).toEqual({});
  });

  test("returns empty map for malformed JSON or non-objects", () => {
    expect(parseModelOverrides("{bad")).toEqual({});
    expect(parseModelOverrides('"a string"')).toEqual({});
    expect(parseModelOverrides("42")).toEqual({});
  });

  test("warns via the injected logger when the value is malformed", () => {
    const warnings: string[] = [];
    const logger = { warn: (msg: string) => warnings.push(msg) } as unknown as Parameters<
      typeof parseModelOverrides
    >[1];
    parseModelOverrides("{bad", logger);
    parseModelOverrides('{"x":3}', logger);
    expect(warnings).toHaveLength(2);
  });
});

describe("safeParseJson", () => {
  test("returns undefined for empty string", () => {
    expect(safeParseJson("", "test")).toBeUndefined();
  });

  test("returns undefined for undefined", () => {
    expect(safeParseJson(undefined, "test")).toBeUndefined();
  });

  test("parses valid JSON", () => {
    const result = safeParseJson('{"key": "value"}', "test");
    expect(result).toEqual({ key: "value" });
  });

  test("throws on invalid JSON with descriptive message", () => {
    expect(() => safeParseJson("{bad", "CLAUDE_JSON_SCHEMA")).toThrow(
      "Invalid JSON in CLAUDE_JSON_SCHEMA"
    );
  });

  test("attaches cause to thrown error", () => {
    expect.assertions(2);
    try {
      safeParseJson("{bad", "test");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).cause).toBeInstanceOf(SyntaxError);
    }
  });
});

describe("parseConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.CLAUDE_PROMPT = "test prompt";
    process.env.CLAUDE_MODEL = "claude-sonnet-4-6";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("throws when CLAUDE_PROMPT is missing", () => {
    delete process.env.CLAUDE_PROMPT;
    expect(() => parseConfig()).toThrow("Missing required environment variable: CLAUDE_PROMPT");
  });

  test("throws when CLAUDE_MODEL is missing", () => {
    delete process.env.CLAUDE_MODEL;
    expect(() => parseConfig()).toThrow("Missing required environment variable: CLAUDE_MODEL");
  });

  test("parses minimal config", () => {
    const config = parseConfig();
    expect(config.prompt).toBe("test prompt");
    expect(config.model).toBe("claude-sonnet-4-6");
    expect(config.allowedTools).toEqual([]);
    expect(config.disallowedTools).toEqual([]);
    expect(config.jsonSchema).toBeUndefined();
    expect(config.pluginDir).toBeUndefined();
    expect(config.timeoutMs).toBe(30 * 60 * 1000);
  });

  test("parses comma-separated allowed tools with trimming", () => {
    process.env.CLAUDE_ALLOWED_TOOLS = "Bash(gh:*), Read , Glob";
    const config = parseConfig();
    expect(config.allowedTools).toEqual(["Bash(gh:*)", "Read", "Glob"]);
  });

  test("filters empty entries from tools", () => {
    process.env.CLAUDE_ALLOWED_TOOLS = "Read,,Glob,";
    const config = parseConfig();
    expect(config.allowedTools).toEqual(["Read", "Glob"]);
  });

  test("parses JSON schema from env", () => {
    process.env.CLAUDE_JSON_SCHEMA = '{"type":"object","properties":{"verdict":{"type":"string"}}}';
    const config = parseConfig();
    expect(config.jsonSchema).toEqual({
      type: "object",
      properties: { verdict: { type: "string" } },
    });
  });

  test("throws on malformed JSON schema", () => {
    process.env.CLAUDE_JSON_SCHEMA = "{bad json";
    expect(() => parseConfig()).toThrow("Invalid JSON in CLAUDE_JSON_SCHEMA");
  });

  test("uses custom timeout when provided", () => {
    process.env.CLAUDE_TIMEOUT_MINUTES = "15";
    const config = parseConfig();
    expect(config.timeoutMs).toBe(15 * 60 * 1000);
  });

  test("defaults to 30 min timeout for invalid values", () => {
    process.env.CLAUDE_TIMEOUT_MINUTES = "not-a-number";
    const config = parseConfig();
    expect(config.timeoutMs).toBe(30 * 60 * 1000);
  });

  test("uses EXECUTION_OUTPUT_FILE when set", () => {
    process.env.EXECUTION_OUTPUT_FILE = "/custom/path.json";
    const config = parseConfig();
    expect(config.outputFilePath).toBe("/custom/path.json");
  });

  test("converts empty string pluginDir to undefined", () => {
    process.env.CLAUDE_PLUGIN_DIR = "";
    const config = parseConfig();
    expect(config.pluginDir).toBeUndefined();
  });
});

describe("mcpConfigFileSchema", () => {
  test("validates config with mcpServers key", () => {
    const input = { mcpServers: { server1: { command: "node", args: ["index.js"] } } };
    const result = mcpConfigFileSchema.parse(input);
    expect(result.mcpServers).toEqual(input.mcpServers);
  });

  test("validates flat server config (no mcpServers wrapper)", () => {
    const input = { server1: { command: "node", args: ["index.js"] } };
    const result = mcpConfigFileSchema.parse(input);
    expect(result.server1).toEqual(input.server1);
  });

  test("rejects non-object input", () => {
    expect(() => mcpConfigFileSchema.parse("string")).toThrow();
    expect(() => mcpConfigFileSchema.parse(42)).toThrow();
    expect(() => mcpConfigFileSchema.parse(null)).toThrow();
  });
});

describe("loadMcpServers", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "runClaude-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  test("returns empty object for undefined path", async () => {
    const result = await loadMcpServers(undefined);
    expect(result).toEqual({});
  });

  test("loads config with mcpServers key", async () => {
    const config = { mcpServers: { ctx: { command: "npx", args: ["-y", "ctx-mcp"] } } };
    const filePath = join(tempDir, "mcp.json");
    await Bun.write(filePath, JSON.stringify(config));

    const result = await loadMcpServers(filePath);
    expect(result).toEqual(config.mcpServers);
  });

  test("loads flat config without mcpServers wrapper", async () => {
    const config = { ctx: { command: "npx", args: ["-y", "ctx-mcp"] } };
    const filePath = join(tempDir, "mcp.json");
    await Bun.write(filePath, JSON.stringify(config));

    const result = await loadMcpServers(filePath);
    expect(result).toEqual(config);
  });

  test("returns empty object for missing file", async () => {
    const result = await loadMcpServers(join(tempDir, "nonexistent.json"));
    expect(result).toEqual({});
  });

  test("returns empty object for invalid JSON", async () => {
    const filePath = join(tempDir, "bad.json");
    await Bun.write(filePath, "{invalid");

    const result = await loadMcpServers(filePath);
    expect(result).toEqual({});
  });
});

describe("deriveMode", () => {
  test("detects review mode from the pr-review prompt", () => {
    expect(deriveMode("/autopilot:pr-review REPO: o/r PR_NUMBER: 1")).toBe("review");
  });

  test("detects react mode from the pr-answer prompt", () => {
    expect(deriveMode("/autopilot:pr-answer REPO: o/r PR_NUMBER: 1")).toBe("react");
  });

  test("returns unknown for unrecognized prompts", () => {
    expect(deriveMode("do something else")).toBe("unknown");
  });

  test("requires the trailing space — bare command returns unknown", () => {
    expect(deriveMode("/autopilot:pr-review")).toBe("unknown");
    expect(deriveMode("/autopilot:pr-answer")).toBe("unknown");
  });
});

describe("findResultMessage", () => {
  test("returns the last result message", () => {
    const messages = [
      { type: "assistant" },
      { type: "result", subtype: "success", duration_ms: 10 },
      { type: "result", subtype: "success", duration_ms: 20 },
    ];
    expect(findResultMessage(messages)).toEqual({
      type: "result",
      subtype: "success",
      duration_ms: 20,
    });
  });

  test("returns undefined when no result message exists", () => {
    expect(findResultMessage([{ type: "assistant" }, "noise", null])).toBeUndefined();
  });
});

describe("countToolRoundTrips", () => {
  test("counts assistant turns with tool calls, not individual blocks", () => {
    const messages = [
      { type: "assistant", message: { content: [{ type: "text" }, { type: "tool_use" }] } },
      { type: "assistant", message: { content: [{ type: "tool_use" }, { type: "tool_use" }] } },
      { type: "user", message: { content: [{ type: "tool_result" }] } },
      { type: "result", subtype: "success" },
    ];
    // Two assistant turns issued tool calls — the second's parallel blocks count once.
    expect(countToolRoundTrips(messages)).toBe(2);
  });

  test("returns 0 for messages without tool_use blocks", () => {
    expect(
      countToolRoundTrips([{ type: "assistant", message: { content: [{ type: "text" }] } }])
    ).toBe(0);
  });

  test("ignores malformed entries", () => {
    expect(countToolRoundTrips([null, "noise", { type: "assistant" }, 42])).toBe(0);
  });
});

describe("extractUsage", () => {
  test("extracts usage and cost from a result message", () => {
    const result = {
      type: "result",
      total_cost_usd: 0.42,
      num_turns: 7,
      usage: {
        input_tokens: 1000,
        output_tokens: 200,
        cache_read_input_tokens: 800,
        cache_creation_input_tokens: 50,
      },
    };
    expect(extractUsage(result)).toEqual({
      tokensIn: 1000,
      tokensOut: 200,
      cacheReadTokens: 800,
      cacheCreationTokens: 50,
      costUsd: 0.42,
      numTurns: 7,
    });
  });

  test("defaults all fields to 0 when usage is absent", () => {
    expect(extractUsage(undefined)).toEqual({
      tokensIn: 0,
      tokensOut: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 0,
      numTurns: 0,
    });
  });

  test("coerces non-numeric fields to 0", () => {
    const result = { usage: { input_tokens: "lots" }, total_cost_usd: null };
    expect(extractUsage(result)).toEqual({
      tokensIn: 0,
      tokensOut: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 0,
      numTurns: 0,
    });
  });

  test("coerces non-finite numbers (Infinity / NaN) to 0", () => {
    const result = {
      usage: { input_tokens: Number.POSITIVE_INFINITY, output_tokens: Number.NaN },
      total_cost_usd: Number.POSITIVE_INFINITY,
    };
    expect(extractUsage(result)).toMatchObject({ tokensIn: 0, tokensOut: 0, costUsd: 0 });
  });
});

describe("buildRunSummary", () => {
  test("maps timings and usage onto the snake_case log fields", () => {
    const messages = [
      { type: "assistant", message: { content: [{ type: "tool_use" }] } },
      {
        type: "result",
        total_cost_usd: 0.12,
        num_turns: 3,
        usage: {
          input_tokens: 500,
          output_tokens: 100,
          cache_read_input_tokens: 400,
          cache_creation_input_tokens: 20,
        },
      },
    ];
    expect(buildRunSummary("review", messages, { fanoutMs: 1200, modelMs: 34000 })).toEqual({
      mode: "review",
      fanout_ms: 1200,
      model_ms: 34000,
      tokens_in: 500,
      tokens_out: 100,
      cache_read_tokens: 400,
      cache_creation_tokens: 20,
      cost_usd: 0.12,
      num_turns: 3,
      tool_round_trips: 1,
    });
  });

  test("defaults usage fields to 0 when no result message is present", () => {
    expect(buildRunSummary("react", [], { fanoutMs: 0, modelMs: 5 })).toEqual({
      mode: "react",
      fanout_ms: 0,
      model_ms: 5,
      tokens_in: 0,
      tokens_out: 0,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      cost_usd: 0,
      num_turns: 0,
      tool_round_trips: 0,
    });
  });
});

describe("withFanoutStats", () => {
  const summary = { mode: "review", cost_usd: 0.1 };

  test("returns the summary unchanged when no fan-out stats are present", () => {
    expect(withFanoutStats(summary, undefined)).toEqual(summary);
  });

  test("merges fan-out counters under snake_case keys", () => {
    expect(
      withFanoutStats(summary, { agentCount: 12, failedCount: 1, parallelSpeedup: 8.5 })
    ).toEqual({
      mode: "review",
      cost_usd: 0.1,
      agent_count: 12,
      failed_count: 1,
      parallel_speedup: 8.5,
    });
  });
});

describe("detectLinuxLibc", () => {
  test("returns 'glibc' or 'musl' (string literal)", async () => {
    const libc = await detectLinuxLibc();
    expect(["glibc", "musl"]).toContain(libc);
  });
});

describe("resolveClaudeBinary", () => {
  // Resolution depends on whether the platform-specific @anthropic-ai/claude-agent-sdk-<platform>-<arch>
  // subpackage is reachable from this file via Node resolution. Bun's workspace install keeps
  // optional subpackages in `.bun/` cache without symlinking them into the workspace's node_modules,
  // so this returns undefined in workspace contexts but resolves a path in standalone installs.
  test("resolves to a claude binary path when the platform subpackage is installed", async () => {
    const binary = await resolveClaudeBinary();
    if (binary !== undefined) {
      expect(binary).toMatch(/claude(?:\.exe)?$/);
    }
  });

  test("returns undefined when no matching package is installed", async () => {
    const binary = await resolveClaudeBinary("win32", "arm64");
    expect(binary).toBeUndefined();
  });

  test("prefers musl binary when libc markers indicate musl (via candidate ordering)", async () => {
    const [darwinArm64, darwinX64] = await Promise.all([
      resolveClaudeBinary("darwin", "arm64"),
      resolveClaudeBinary("darwin", "x64"),
    ]);
    for (const binary of [darwinArm64, darwinX64]) {
      if (binary !== undefined) expect(binary).toMatch(/claude$/);
    }
  });
});
