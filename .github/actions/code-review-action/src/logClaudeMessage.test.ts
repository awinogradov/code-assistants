/**
 * Tests for scripts/logClaudeMessage.ts — truncation and per-message dispatch.
 * Captures log rows via a spy logger instead of reading stdout.
 */
import { describe, expect, test } from "bun:test";

import { logMessage, textTruncate, toolTruncate, truncate } from "./logClaudeMessage.ts";

interface LogRow {
  level: "info" | "debug";
  obj: Record<string, unknown>;
  msg: string;
}

function spyLogger(): { rows: LogRow[]; log: unknown } {
  const rows: LogRow[] = [];
  const record = (level: LogRow["level"]) => (obj: Record<string, unknown>, msg: string) => {
    rows.push({ level, obj, msg });
  };
  return {
    rows,
    log: { info: record("info"), debug: record("debug") },
  };
}

describe("truncate", () => {
  test("returns empty string for null/undefined", () => {
    expect(truncate(null, 100)).toBe("");
    expect(truncate(undefined, 100)).toBe("");
  });

  test("passes short strings through unchanged", () => {
    expect(truncate("hello", 100)).toBe("hello");
  });

  test("stringifies non-string values", () => {
    expect(truncate({ a: 1 }, 100)).toBe('{"a":1}');
  });

  test("cuts long strings with an ellipsis", () => {
    expect(truncate("abcdef", 3)).toBe("abc…");
  });

  test("leaves strings exactly at the limit unchanged", () => {
    expect(truncate("abc", 3)).toBe("abc");
  });

  test("exports the textTruncate and toolTruncate constants for callers", () => {
    expect(textTruncate).toBeGreaterThan(toolTruncate);
  });
});

describe("logMessage", () => {
  test("system init → single session_start info row", () => {
    const { rows, log } = spyLogger();
    logMessage(
      log as never,
      {
        type: "system",
        subtype: "init",
        session_id: "sess-1",
        model: "claude-sonnet-4-6",
        permissionMode: "bypassPermissions",
        cwd: "/tmp",
        tools: ["Read", "Bash"],
        mcp_servers: [{ name: "ctx", status: "ok" }],
      } as never
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.level).toBe("info");
    expect(rows[0]?.obj.event).toBe("session_start");
    expect(rows[0]?.obj.session_id).toBe("sess-1");
    expect(rows[0]?.obj.model).toBe("claude-sonnet-4-6");
    expect(rows[0]?.obj.parent_tool_use_id).toBe("root");
  });

  test("assistant tool_use block → tool_use info row with ids and input", () => {
    const { rows, log } = spyLogger();
    logMessage(
      log as never,
      {
        type: "assistant",
        session_id: "sess-1",
        parent_tool_use_id: null,
        message: {
          content: [{ type: "tool_use", id: "toolu_1", name: "Read", input: { file_path: "/x" } }],
          usage: null,
          model: "claude-sonnet-4-6",
        },
      } as never
    );

    const toolRow = rows.find((r) => r.obj.event === "tool_use");
    expect(toolRow?.level).toBe("info");
    expect(toolRow?.obj.tool_name).toBe("Read");
    expect(toolRow?.obj.tool_use_id).toBe("toolu_1");
    expect(toolRow?.obj.parent_tool_use_id).toBe("root");
    expect(toolRow?.obj.subagent_type).toBeUndefined();
    expect(toolRow?.obj.input).toContain("/x");
  });

  test("Task tool_use carries subagent_type", () => {
    const { rows, log } = spyLogger();
    logMessage(
      log as never,
      {
        type: "assistant",
        session_id: "sess-1",
        parent_tool_use_id: null,
        message: {
          content: [
            {
              type: "tool_use",
              id: "toolu_task",
              name: "Task",
              input: { subagent_type: "code-reviewer", prompt: "review" },
            },
          ],
          usage: null,
          model: "claude-sonnet-4-6",
        },
      } as never
    );

    const toolRow = rows.find((r) => r.obj.event === "tool_use");
    expect(toolRow?.obj.tool_name).toBe("Task");
    expect(toolRow?.obj.subagent_type).toBe("code-reviewer");
  });

  test("sub-agent assistant message retains parent_tool_use_id", () => {
    const { rows, log } = spyLogger();
    logMessage(
      log as never,
      {
        type: "assistant",
        session_id: "sess-1",
        parent_tool_use_id: "toolu_task",
        message: {
          content: [
            { type: "tool_use", id: "toolu_child", name: "Grep", input: { pattern: "foo" } },
          ],
          usage: null,
          model: "claude-sonnet-4-6",
        },
      } as never
    );

    const toolRow = rows.find((r) => r.obj.event === "tool_use");
    expect(toolRow?.obj.parent_tool_use_id).toBe("toolu_task");
    expect(toolRow?.obj.session_id).toBe("sess-1");
  });

  test("user tool_result → tool_result info row with is_error", () => {
    const { rows, log } = spyLogger();
    logMessage(
      log as never,
      {
        type: "user",
        session_id: "sess-1",
        parent_tool_use_id: "toolu_task",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_child",
              content: "file contents",
              is_error: false,
            },
          ],
        },
      } as never
    );

    const resultRow = rows.find((r) => r.obj.event === "tool_result");
    expect(resultRow?.level).toBe("info");
    expect(resultRow?.obj.tool_use_id).toBe("toolu_child");
    expect(resultRow?.obj.is_error).toBe(false);
    expect(resultRow?.obj.parent_tool_use_id).toBe("toolu_task");
  });

  test("result success → session_end info row with duration and cost", () => {
    const { rows, log } = spyLogger();
    logMessage(
      log as never,
      {
        type: "result",
        subtype: "success",
        session_id: "sess-1",
        duration_ms: 12345,
        duration_api_ms: 9999,
        num_turns: 7,
        total_cost_usd: 0.1234,
        usage: { input_tokens: 100, output_tokens: 200 },
        modelUsage: { "claude-sonnet-4-6": { input_tokens: 100 } },
        permission_denials: [],
        is_error: false,
        result: "done",
        stop_reason: "end_turn",
      } as never
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.level).toBe("info");
    expect(rows[0]?.obj.event).toBe("session_end");
    expect(rows[0]?.obj.subtype).toBe("success");
    expect(rows[0]?.obj.duration_ms).toBe(12345);
    expect(rows[0]?.obj.total_cost_usd).toBe(0.1234);
    expect(rows[0]?.obj.num_permission_denials).toBe(0);
    expect(rows[0]?.obj.errors).toBeUndefined();
  });

  test("result error → session_end row with errors array", () => {
    const { rows, log } = spyLogger();
    logMessage(
      log as never,
      {
        type: "result",
        subtype: "error_during_execution",
        session_id: "sess-1",
        duration_ms: 1000,
        duration_api_ms: 800,
        num_turns: 1,
        total_cost_usd: 0,
        usage: { input_tokens: 0, output_tokens: 0 },
        modelUsage: {},
        permission_denials: [],
        errors: ["boom"],
        is_error: true,
        stop_reason: null,
      } as never
    );

    expect(rows[0]?.obj.subtype).toBe("error_during_execution");
    expect(rows[0]?.obj.errors).toEqual(["boom"]);
  });

  test("thinking block goes to debug level", () => {
    const { rows, log } = spyLogger();
    logMessage(
      log as never,
      {
        type: "assistant",
        session_id: "sess-1",
        parent_tool_use_id: null,
        message: {
          content: [{ type: "thinking", thinking: "pondering", signature: "sig" }],
          usage: null,
          model: "claude-sonnet-4-6",
        },
      } as never
    );

    const thinkingRow = rows.find((r) => r.obj.event === "thinking");
    expect(thinkingRow?.level).toBe("debug");
    expect(thinkingRow?.obj.text).toBe("pondering");
  });

  test("assistant text block emits assistant_text debug row", () => {
    const { rows, log } = spyLogger();
    logMessage(
      log as never,
      {
        type: "assistant",
        session_id: "sess-1",
        parent_tool_use_id: null,
        message: {
          content: [{ type: "text", text: "hello from claude", citations: null }],
          usage: null,
          model: "claude-sonnet-4-6",
        },
      } as never
    );

    const textRow = rows.find((r) => r.obj.event === "assistant_text");
    expect(textRow?.level).toBe("debug");
    expect(textRow?.obj.text).toBe("hello from claude");
    expect(textRow?.obj.parent_tool_use_id).toBe("root");
  });

  test("non-null usage emits assistant_usage debug row with model", () => {
    const { rows, log } = spyLogger();
    logMessage(
      log as never,
      {
        type: "assistant",
        session_id: "sess-1",
        parent_tool_use_id: null,
        message: {
          content: [{ type: "text", text: "hi", citations: null }],
          usage: { input_tokens: 42, output_tokens: 7 },
          model: "claude-sonnet-4-6",
        },
      } as never
    );

    const usageRow = rows.find((r) => r.obj.event === "assistant_usage");
    expect(usageRow?.level).toBe("debug");
    expect(usageRow?.obj.model).toBe("claude-sonnet-4-6");
    expect(usageRow?.obj.usage).toEqual({ input_tokens: 42, output_tokens: 7 });
  });

  test("user message with string content emits no rows", () => {
    const { rows, log } = spyLogger();
    logMessage(
      log as never,
      {
        type: "user",
        session_id: "sess-1",
        parent_tool_use_id: null,
        message: { content: "just a plain string prompt" },
      } as never
    );

    expect(rows).toHaveLength(0);
  });

  test("unknown message type falls back to a debug row", () => {
    const { rows, log } = spyLogger();
    logMessage(log as never, { type: "status", session_id: "sess-1" } as never);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.level).toBe("debug");
    expect(rows[0]?.obj.event).toBe("message");
    expect(rows[0]?.obj.type).toBe("status");
  });
});
