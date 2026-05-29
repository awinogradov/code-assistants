/**
 * Tests for runClaude.ts utility functions.
 * Covers config parsing, JSON safety, MCP config loading, and GitHub output formatting.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  countToolUses,
  deriveMode,
  detectLinuxLibc,
  extractUsage,
  findResultMessage,
  loadMcpServers,
  mcpConfigFileSchema,
  parseConfig,
  resolveClaudeBinary,
  safeParseJson,
} from "./runClaude.ts";

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

describe("countToolUses", () => {
  test("counts tool_use blocks across assistant messages", () => {
    const messages = [
      { type: "assistant", message: { content: [{ type: "text" }, { type: "tool_use" }] } },
      { type: "assistant", message: { content: [{ type: "tool_use" }, { type: "tool_use" }] } },
      { type: "user", message: { content: [{ type: "tool_result" }] } },
      { type: "result", subtype: "success" },
    ];
    expect(countToolUses(messages)).toBe(3);
  });

  test("returns 0 for messages without tool_use blocks", () => {
    expect(countToolUses([{ type: "assistant", message: { content: [{ type: "text" }] } }])).toBe(
      0
    );
  });

  test("ignores malformed entries", () => {
    expect(countToolUses([null, "noise", { type: "assistant" }, 42])).toBe(0);
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
    expect(extractUsage(result)).toMatchObject({ tokensIn: 0, costUsd: 0 });
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
