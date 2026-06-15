/**
 * Run Claude Code via Agent SDK for PR review and comment reaction.
 * Replaces anthropics/claude-code-action with direct SDK invocation.
 *
 * Streams messages from the SDK query, writes an execution file,
 * and sets GitHub Action outputs (structured_output, execution_file).
 *
 * @example
 * CLAUDE_PROMPT="..." CLAUDE_MODEL="claude-sonnet-4-6" bun run scripts/runClaude.ts
 *
 * @see https://docs.anthropic.com/en/docs/agent-sdk/typescript - Agent SDK reference
 */
import { access, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import pino from "pino";
import { z } from "zod";

import { setOutput } from "./actionsOutput.ts";
import { logMessage } from "./logClaudeMessage.ts";

/** Duration above which a Claude session is considered long-running (triggers artifact upload). */
const longRunMs = 5 * 60 * 1000;

/** Slash-command prefixes that select the run mode. The trailing space is load-bearing. */
const reviewCommand = "/autopilot:pr-review ";
const reactCommand = "/autopilot:pr-answer ";

/** Create pino logger configured per platform logging standard. */
async function createLogger(): Promise<pino.Logger> {
  const { version } = (await Bun.file(`${import.meta.dirname}/../package.json`).json()) as {
    version: string;
  };

  return pino(
    {
      name: "runClaude",
      level: process.env.LOG_LEVEL ?? "info",
      timestamp: () => `,"timestamp":"${new Date().toISOString().replace(/Z$/, "000Z")}"`,
      messageKey: "event",
      formatters: {
        level: (label) => ({ level: label === "warn" ? "warning" : label }),
      },
      base: { version },
      mixin() {
        // Extract callsite from stack trace (skip Error, mixin, pino internals).
        // Named fn:  "    at parseConfig (/path/to/runClaude.ts:86:5)"  → [_, "parseConfig", "/path/to/runClaude.ts", "86"]
        // Anonymous: "    at /path/to/runClaude.ts:160:3"                → [_, "/path/to/runClaude.ts", "160"]
        const stack = new Error().stack ?? "";
        const callerLine = stack.split("\n")[3] ?? "";
        const match =
          callerLine.match(/at (\S+) \((.+):(\d+):\d+\)/) ?? callerLine.match(/at (.+):(\d+):\d+/);

        if (match?.[3]) {
          return { func_name: match[1], filename: match[2], lineno: Number(match[3]) };
        }
        if (match?.[2]) {
          return { func_name: "<anonymous>", filename: match[1], lineno: Number(match[2]) };
        }
        return {};
      },
    },
    // Synchronous stdout so no trace lines are lost on abort / 30-min timeout.
    pino.destination({ sync: true })
  );
}

/** Zod schema for MCP server configuration files */
export const mcpConfigFileSchema = z
  .object({
    mcpServers: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  })
  .catchall(z.record(z.string(), z.unknown()));

/** Configuration parsed from environment variables */
export interface RunClaudeConfig {
  prompt: string;
  model: string;
  allowedTools: string[];
  disallowedTools: string[];
  jsonSchema: Record<string, unknown> | undefined;
  pluginDir: string | undefined;
  mcpConfigPath: string | undefined;
  settingsJson: string | undefined;
  outputFilePath: string;
  timeoutMs: number;
}

/**
 * Parse JSON safely with descriptive error messages.
 * Returns undefined if the input is empty or falsy.
 */
export function safeParseJson(
  value: string | undefined,
  label: string
): Record<string, unknown> | undefined {
  if (!value) return undefined;

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}`, { cause: error });
  }
}

/** Parse and validate required environment variables. */
export function parseConfig(): RunClaudeConfig {
  const prompt = process.env.CLAUDE_PROMPT;
  const model = process.env.CLAUDE_MODEL;
  if (!prompt) {
    throw new Error("Missing required environment variable: CLAUDE_PROMPT");
  }
  if (!model) {
    throw new Error("Missing required environment variable: CLAUDE_MODEL");
  }

  const rawTimeout = Number(process.env.CLAUDE_TIMEOUT_MINUTES);
  const timeoutMinutes = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 30;

  return {
    prompt,
    model,
    allowedTools:
      process.env.CLAUDE_ALLOWED_TOOLS?.split(",")
        .map((t) => t.trim())
        .filter(Boolean) ?? [],
    disallowedTools:
      process.env.CLAUDE_DISALLOWED_TOOLS?.split(",")
        .map((t) => t.trim())
        .filter(Boolean) ?? [],
    jsonSchema: safeParseJson(process.env.CLAUDE_JSON_SCHEMA, "CLAUDE_JSON_SCHEMA"),
    pluginDir: process.env.CLAUDE_PLUGIN_DIR || undefined,
    mcpConfigPath: process.env.CLAUDE_MCP_CONFIG || undefined,
    settingsJson: process.env.CLAUDE_SETTINGS || undefined,
    outputFilePath:
      process.env.EXECUTION_OUTPUT_FILE ??
      `${process.env.RUNNER_TEMP ?? "/tmp"}/claude-execution-output.json`,
    timeoutMs: timeoutMinutes * 60 * 1000,
  };
}

/**
 * Load and validate additional MCP server configuration from a JSON file.
 * Uses Zod to validate the external input at the system boundary.
 */
export async function loadMcpServers(
  configPath: string | undefined
): Promise<Record<string, McpServerConfig>> {
  if (!configPath) return {};

  try {
    const raw: unknown = await Bun.file(configPath).json();
    const parsed = mcpConfigFileSchema.parse(raw);
    return (parsed.mcpServers ?? parsed) as Record<string, McpServerConfig>;
  } catch (error) {
    log?.warn({ config_path: configPath, error }, "Couldn't load MCP config.");
    return {};
  }
}

/**
 * Write Claude Code settings to a temporary directory.
 * Uses $RUNNER_TEMP to avoid polluting the runner's home directory.
 */
async function writeSettings(settingsJson: string | undefined): Promise<string[]> {
  if (!settingsJson) return ["project"];

  const dir = `${process.env.RUNNER_TEMP ?? "/tmp"}/.claude`;
  await mkdir(dir, { recursive: true });
  await Bun.write(`${dir}/settings.json`, settingsJson);

  process.env.CLAUDE_CONFIG_DIR = dir;
  return ["user", "project"];
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect the host libc on Linux. Uses filesystem markers because
 * `process.report.getReport()` under Bun is unreliable (Bun itself is a
 * statically-linked musl binary and reports no glibc version even on glibc
 * hosts, which misleads the SDK's built-in detection).
 */
export async function detectLinuxLibc(): Promise<"musl" | "glibc"> {
  const muslMarkers = [
    "/etc/alpine-release",
    "/lib/ld-musl-x86_64.so.1",
    "/lib/ld-musl-aarch64.so.1",
  ];
  const matches = await Promise.all(muslMarkers.map(pathExists));
  return matches.some(Boolean) ? "musl" : "glibc";
}

function linuxCandidates(arch: string, libc: "musl" | "glibc"): string[] {
  const glibc = `@anthropic-ai/claude-agent-sdk-linux-${arch}`;
  const musl = `${glibc}-musl`;
  return libc === "musl" ? [musl, glibc] : [glibc, musl];
}

async function tryResolveBinary(pkg: string, binary: string): Promise<string | undefined> {
  const require = createRequire(import.meta.url);
  try {
    const packageJson = require.resolve(`${pkg}/package.json`);
    const binPath = join(packageJson, "..", binary);
    if (await pathExists(binPath)) return binPath;
  } catch {
    // Standard resolution failed — fall through to the Bun isolated-install lookup.
  }

  // Bun's isolated linker keeps optional platform subpackages in `.bun/` without
  // symlinking them into the consumer's node_modules. Locate the cache via the
  // already-resolvable SDK package and compute the flat path directly.
  try {
    const sdkPkgPath = require.resolve("@anthropic-ai/claude-agent-sdk/package.json");
    const bunRoot = join(sdkPkgPath, "..", "..", "..", "..", "..");
    const { version } = (await Bun.file(sdkPkgPath).json()) as { version: string };
    const flatName = pkg.replace("/", "+");
    const candidate = join(bunRoot, `${flatName}@${version}`, "node_modules", pkg, binary);
    return (await pathExists(candidate)) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the bundled Claude Code native binary for the current platform.
 *
 * The SDK's built-in resolver tries the musl variant first on Linux. On Bun +
 * glibc hosts (e.g. GitHub Actions Ubuntu runners), Bun ignores the npm
 * `libc` field and installs both optional platform packages, so the SDK
 * resolves the musl binary successfully but fails to spawn it (the kernel
 * reports ENOENT because `/lib/ld-musl-*.so.1` is absent). Explicitly picking
 * the variant matching the host libc avoids that failure.
 *
 * @returns Absolute path to the `claude` binary, or `undefined` if none matches.
 */
export async function resolveClaudeBinary(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): Promise<string | undefined> {
  const binary = platform === "win32" ? "claude.exe" : "claude";
  const candidates =
    platform === "linux"
      ? linuxCandidates(arch, await detectLinuxLibc())
      : [`@anthropic-ai/claude-agent-sdk-${platform}-${arch}`];

  for (const pkg of candidates) {
    const binPath = await tryResolveBinary(pkg, binary);
    if (binPath) return binPath;
  }
  return undefined;
}

/**
 * Build the environment handed to the Agent SDK's spawned Claude Code process.
 *
 * Pins the auth vars to strings (the SDK's `env` is `Record<string, string>`) and
 * makes a custom Anthropic host opt-in. GitHub renders an unset optional action
 * input as `""`, and a blank `ANTHROPIC_BASE_URL` would override the SDK default
 * with a blank host — so blank `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` are
 * dropped here rather than forwarded, and set values are trimmed. `ANTHROPIC_API_KEY`
 * (x-api-key) and `ANTHROPIC_AUTH_TOKEN` (bearer) are mutually exclusive, so setting
 * both fails fast here instead of as a downstream API 400.
 *
 * @param env - Source environment, typically `process.env`.
 * @returns The env object for `query({ options: { env } })`.
 * @throws If both `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` are non-blank.
 */
export function buildSdkEnv(env: Record<string, string | undefined>): Record<string, string> {
  const baseUrl = env.ANTHROPIC_BASE_URL?.trim() ?? "";
  const authToken = env.ANTHROPIC_AUTH_TOKEN?.trim() ?? "";
  if ((env.ANTHROPIC_API_KEY ?? "").trim() !== "" && authToken !== "") {
    throw new Error(
      "Set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN, not both — the Anthropic API rejects requests carrying both."
    );
  }

  // Re-add the host/token below only when non-blank, so an unset optional input
  // (rendered as "") never reaches the SDK as a host override.
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (key === "ANTHROPIC_BASE_URL" || key === "ANTHROPIC_AUTH_TOKEN") continue;
    result[key] = value;
  }

  result.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY ?? "";
  result.CLAUDE_CODE_OAUTH_TOKEN = env.CLAUDE_CODE_OAUTH_TOKEN ?? "";
  result.GH_TOKEN = env.GH_TOKEN ?? "";
  if (baseUrl !== "") result.ANTHROPIC_BASE_URL = baseUrl;
  if (authToken !== "") result.ANTHROPIC_AUTH_TOKEN = authToken;

  return result;
}

let log: pino.Logger | undefined;

/** Run Claude Code and write outputs. Exported for visibility, called from main guard. */
async function run(): Promise<void> {
  log = await createLogger();
  const config = parseConfig();
  const settingSources = await writeSettings(config.settingsJson);
  const mcpServers = await loadMcpServers(config.mcpConfigPath);

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), config.timeoutMs);

  const pathToClaudeCodeExecutable = await resolveClaudeBinary();

  log.debug(
    {
      model: config.model,
      timeout_min: config.timeoutMs / 60_000,
      claude_binary: pathToClaudeCodeExecutable,
    },
    "Starting Claude execution."
  );

  const messages: unknown[] = [];

  const q = query({
    prompt: config.prompt,
    options: {
      model: config.model,
      allowedTools: config.allowedTools,
      // Claude has Bash(gh:*) for reading PR data but must not post reviews/comments
      // directly — submitReview.ts / reactToComment.ts own the submission pipeline.
      disallowedTools: config.disallowedTools,
      outputFormat: config.jsonSchema
        ? { type: "json_schema" as const, schema: config.jsonSchema }
        : undefined,
      plugins: config.pluginDir ? [{ type: "local" as const, path: config.pluginDir }] : [],
      mcpServers,
      permissionMode: "bypassPermissions" as const,
      allowDangerouslySkipPermissions: true,
      settingSources: settingSources as ("user" | "project")[],
      systemPrompt: { type: "preset" as const, preset: "claude_code" as const },
      pathToClaudeCodeExecutable,
      abortController,
      env: buildSdkEnv(process.env),
    },
  });

  const queryStart = performance.now();
  for await (const message of q) {
    logMessage(log, message);
    messages.push(message);
  }
  const modelMs = Math.round(performance.now() - queryStart);

  // Prevent the 30min timer from keeping the event loop alive after completion
  clearTimeout(timeout);

  // Emit the run summary (log + step output) BEFORE emitOutputs, which may
  // process.exit(1) on a non-success result — keeping the footer data available
  // to the separate submitReview step even on a failed run.
  const summary = buildRunSummary(resolveRunMode(config.prompt), messages, { modelMs }, config.model);
  log.info(summary, "Run summary.");
  await setOutput("run_summary", JSON.stringify(summary));

  await writeExecutionFile(log, config.outputFilePath, messages);
  await emitOutputs(log, config.outputFilePath, messages);
}

/** Write the collected SDK messages to the execution output file and log the result. */
async function writeExecutionFile(
  log: pino.Logger,
  outputFilePath: string,
  messages: unknown[]
): Promise<void> {
  await Bun.write(outputFilePath, JSON.stringify(messages));
  log.info(
    { output_file_path: outputFilePath, message_count: messages.length },
    "Execution file written."
  );
}

/** Derive the run mode from the prompt, for the instrumentation summary. */
export function deriveMode(prompt: string): "review" | "react" | "unknown" {
  if (prompt.includes(reviewCommand)) return "review";
  if (prompt.includes(reactCommand)) return "react";
  return "unknown";
}

/**
 * Resolve the run-summary mode. An explicit `CLAUDE_RUN_MODE` env wins over the
 * prompt-derived mode so callers that run a one-shot whose prompt carries no
 * slash-command marker — e.g. the preflight skip-path explain step — can label
 * their footer (`preflight`) instead of falling through to `unknown`. An empty
 * value falls back to {@link deriveMode}.
 */
export function resolveRunMode(prompt: string): string {
  return process.env.CLAUDE_RUN_MODE || deriveMode(prompt);
}

/** Find the final SDK `result` message in the collected stream. */
export function findResultMessage(messages: unknown[]): Record<string, unknown> | undefined {
  return messages.findLast(
    (m): m is Record<string, unknown> =>
      typeof m === "object" && m !== null && (m as Record<string, unknown>).type === "result"
  );
}

/**
 * Extract the model that actually ran from the SDK `system`/`init` message,
 * or `undefined` when the stream ended before init so the caller can fall
 * back to the configured model.
 */
function findInitModel(messages: unknown[]): string | undefined {
  const init = messages.find(
    (m): m is Record<string, unknown> =>
      typeof m === "object" &&
      m !== null &&
      (m as Record<string, unknown>).type === "system" &&
      (m as Record<string, unknown>).subtype === "init"
  );
  return typeof init?.model === "string" ? init.model : undefined;
}

/** True when an assistant message content array holds at least one `tool_use` block. */
function hasToolUseBlock(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  return content.some(
    (block) =>
      typeof block === "object" &&
      block !== null &&
      (block as Record<string, unknown>).type === "tool_use"
  );
}

/**
 * Count assistant turns that issued at least one tool call — i.e. model→tool
 * round-trips. A single turn with several parallel `tool_use` blocks counts once.
 */
export function countToolRoundTrips(messages: unknown[]): number {
  let count = 0;
  for (const message of messages) {
    if (typeof message !== "object" || message === null) continue;
    const record = message as Record<string, unknown>;
    if (record.type !== "assistant") continue;
    if (hasToolUseBlock((record.message as { content?: unknown } | undefined)?.content)) count += 1;
  }
  return count;
}

/** Token and cost usage extracted from the SDK `result` message. */
export interface UsageSummary {
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  numTurns: number;
}

/** Extract usage/cost fields from the SDK `result` message, defaulting absent values to 0. */
export function extractUsage(resultMessage: Record<string, unknown> | undefined): UsageSummary {
  const usage = (resultMessage?.usage ?? {}) as Record<string, unknown>;
  const toNumber = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;

  const cacheReadTokens = toNumber(usage.cache_read_input_tokens);
  const cacheCreationTokens = toNumber(usage.cache_creation_input_tokens);

  return {
    // Total input the model consumed: fresh + cache-read + cache-creation. Reading
    // only `input_tokens` reports the tiny uncached residual (an implausible ~9
    // under heavy prompt caching); the breakdown stays in the cache fields below.
    tokensIn: toNumber(usage.input_tokens) + cacheReadTokens + cacheCreationTokens,
    tokensOut: toNumber(usage.output_tokens),
    cacheReadTokens,
    cacheCreationTokens,
    costUsd: toNumber(resultMessage?.total_cost_usd),
    numTurns: toNumber(resultMessage?.num_turns),
  };
}

/** Wall-clock timings (ms) for the instrumented phases of a run. */
export interface PhaseTimings {
  modelMs: number;
}

/**
 * Build the structured per-run summary: mode, model, phase timings, token
 * usage, cost, and tool round-trips. Returns the snake_case-keyed object that
 * is logged as a single line — separated from logging so the field mapping is
 * unit-testable. The model comes from the SDK init message (what actually
 * ran), with the configured model as the fallback.
 */
export function buildRunSummary(
  mode: string,
  messages: unknown[],
  timings: PhaseTimings,
  fallbackModel: string
): Record<string, number | string> {
  const usage = extractUsage(findResultMessage(messages));

  return {
    mode,
    model: findInitModel(messages) ?? fallbackModel,
    model_ms: timings.modelMs,
    tokens_in: usage.tokensIn,
    tokens_out: usage.tokensOut,
    cache_read_tokens: usage.cacheReadTokens,
    cache_creation_tokens: usage.cacheCreationTokens,
    cost_usd: usage.costUsd,
    num_turns: usage.numTurns,
    tool_round_trips: countToolRoundTrips(messages),
  };
}

/**
 * Emit GitHub Actions outputs from the collected messages, flag long-running
 * sessions, and exit non-zero when the final result subtype isn't "success".
 */
async function emitOutputs(
  log: pino.Logger,
  outputFilePath: string,
  messages: unknown[]
): Promise<void> {
  const resultMessage = findResultMessage(messages);

  const structuredOutput = resultMessage?.structured_output;
  const conclusion = (resultMessage?.subtype as string) ?? "error";
  const durationMs = Number(resultMessage?.duration_ms ?? 0);

  await setOutput("execution_file", outputFilePath);
  if (structuredOutput !== undefined && structuredOutput !== null) {
    await setOutput("structured_output", JSON.stringify(structuredOutput));
  }
  if (durationMs > longRunMs) {
    await setOutput("long_run", "true");
    log.info(
      { duration_ms: durationMs, threshold_ms: longRunMs },
      "Long-running Claude session detected."
    );
  }

  if (conclusion !== "success") {
    const errors = Array.isArray(resultMessage?.errors)
      ? (resultMessage.errors as string[]).join(", ")
      : "No result message";
    log.error({ conclusion, errors }, "Couldn't execute Claude: non-success result.");
    process.exit(1);
  }

  log.info("Claude execution completed.");
}

/** Write an empty execution file as fallback on fatal error. */
async function writeEmptyExecutionFile(): Promise<void> {
  const outputPath =
    process.env.EXECUTION_OUTPUT_FILE ??
    `${process.env.RUNNER_TEMP ?? "/tmp"}/claude-execution-output.json`;

  await Bun.write(outputPath, "[]");
  await setOutput("execution_file", outputPath);
}

/** Handle fatal error: log, write empty execution file, exit. */
async function handleFatalError(error: unknown): Promise<never> {
  const errorMessage = error instanceof Error ? error.message : String(error);
  log?.error({ error: errorMessage }, "Couldn't run Claude: unexpected error.");
  if (!log) console.error(`Couldn't run Claude: ${errorMessage}`);

  await writeEmptyExecutionFile().catch(() => {});
  process.exit(1);
}

// Only execute when run directly, not when imported for testing
if (import.meta.main) {
  try {
    await run();
  } catch (error) {
    await handleFatalError(error);
  }
}
