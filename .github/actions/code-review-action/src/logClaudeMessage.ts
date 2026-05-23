/**
 * Per-message structured logging for the Claude Agent SDK stream.
 *
 * Dispatches on `SDKMessage.type` and emits pino log rows that always carry
 * `parent_tool_use_id` ("root" when null) and `session_id`, so trace lines
 * from the ~12 parallel sub-agents spawned by `/autopilot:pr-review` remain
 * filterable when the whole stream is interleaved into one GitHub step log.
 *
 * @example
 * for await (const message of q) {
 *   logMessage(log, message);
 *   messages.push(message);
 * }
 *
 * @see https://docs.anthropic.com/en/docs/agent-sdk/typescript - SDKMessage shape
 */
import type {
  SDKAssistantMessage,
  SDKMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type pino from "pino";

/** Max length for assistant text / thinking preview in debug logs. */
export const textTruncate = 2048;

/** Max length for tool input / tool result preview in info logs. */
export const toolTruncate = 512;

/**
 * Shrink a value to a readable preview bounded by `max` characters.
 *
 * Strings pass through; anything else is JSON-stringified. Excess length is
 * cut with a trailing ellipsis so consumers see the truncation unambiguously.
 */
export function truncate(value: unknown, max: number): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

interface BaseContext {
  parent_tool_use_id: string;
  session_id: string | undefined;
}

function baseContext(message: SDKMessage): BaseContext {
  const parent = "parent_tool_use_id" in message ? message.parent_tool_use_id : null;
  const session = "session_id" in message ? message.session_id : undefined;
  return {
    parent_tool_use_id: parent ?? "root",
    session_id: session,
  };
}

interface BlockLike {
  type?: string;
}

function blockType(block: unknown): string | undefined {
  if (typeof block !== "object" || block === null) return undefined;
  const t = (block as BlockLike).type;
  return typeof t === "string" ? t : undefined;
}

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

interface TextBlock {
  type: "text";
  text: string;
}

interface ThinkingBlock {
  type: "thinking";
  thinking: string;
}

interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content?: unknown;
  is_error?: boolean;
}

function logToolUse(log: pino.Logger, ctx: BaseContext, block: ToolUseBlock): void {
  const input =
    typeof block.input === "object" && block.input !== null
      ? (block.input as Record<string, unknown>)
      : null;
  const subagentType =
    block.name === "Task" && input && typeof input.subagent_type === "string"
      ? input.subagent_type
      : undefined;
  log.info(
    {
      ...ctx,
      event: "tool_use",
      tool_name: block.name,
      tool_use_id: block.id,
      subagent_type: subagentType,
      input: truncate(block.input, toolTruncate),
    },
    `Tool call: ${block.name}`
  );
}

function logAssistant(log: pino.Logger, message: SDKAssistantMessage): void {
  const ctx = baseContext(message);
  for (const block of message.message.content ?? []) {
    const type = blockType(block);
    if (type === "tool_use") {
      logToolUse(log, ctx, block as ToolUseBlock);
    } else if (type === "thinking") {
      const { thinking } = block as ThinkingBlock;
      log.debug(
        { ...ctx, event: "thinking", text: truncate(thinking, textTruncate) },
        "Assistant thinking."
      );
    } else if (type === "text") {
      const { text } = block as TextBlock;
      log.debug(
        { ...ctx, event: "assistant_text", text: truncate(text, textTruncate) },
        "Assistant text."
      );
    }
  }
  const { usage, model } = message.message;
  if (usage) {
    log.debug({ ...ctx, event: "assistant_usage", usage, model }, "Assistant usage.");
  }
}

function logUser(log: pino.Logger, message: SDKUserMessage): void {
  const ctx = baseContext(message);
  const { content } = message.message;
  if (typeof content === "string") return;
  for (const block of content ?? []) {
    if (blockType(block) !== "tool_result") continue;
    const result = block as ToolResultBlock;
    log.info(
      {
        ...ctx,
        event: "tool_result",
        tool_use_id: result.tool_use_id,
        is_error: result.is_error ?? false,
        content: truncate(result.content, toolTruncate),
      },
      "Tool result received."
    );
  }
}

function logSystemInit(log: pino.Logger, message: SDKSystemMessage): void {
  log.info(
    {
      parent_tool_use_id: "root",
      session_id: message.session_id,
      event: "session_start",
      model: message.model,
      permission_mode: message.permissionMode,
      cwd: message.cwd,
      tool_count: message.tools.length,
      mcp_server_count: message.mcp_servers.length,
    },
    "Claude session started."
  );
}

function logResult(log: pino.Logger, message: SDKResultMessage): void {
  const errors = message.subtype === "success" ? undefined : message.errors;
  log.info(
    {
      parent_tool_use_id: "root",
      session_id: message.session_id,
      event: "session_end",
      subtype: message.subtype,
      duration_ms: message.duration_ms,
      duration_api_ms: message.duration_api_ms,
      num_turns: message.num_turns,
      total_cost_usd: message.total_cost_usd,
      usage: message.usage,
      model_usage: message.modelUsage,
      num_permission_denials: message.permission_denials.length,
      errors,
    },
    "Claude session ended."
  );
}

/**
 * Dispatch a single SDK message to structured pino logs.
 *
 * Every emitted row carries `parent_tool_use_id` (defaulting to `"root"` when
 * the SDK returns null) and `session_id`, so trace lines from all parallel
 * sub-agents stay attributable when interleaved.
 */
export function logMessage(log: pino.Logger, message: SDKMessage): void {
  if (message.type === "assistant") {
    logAssistant(log, message);
    return;
  }
  if (message.type === "user") {
    logUser(log, message);
    return;
  }
  if (message.type === "result") {
    logResult(log, message);
    return;
  }
  if (message.type === "system" && "subtype" in message && message.subtype === "init") {
    logSystemInit(log, message);
    return;
  }
  const ctx = baseContext(message);
  log.debug({ ...ctx, event: "message", type: message.type }, "Stream message.");
}
