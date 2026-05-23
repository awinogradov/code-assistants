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
import { randomUUID } from "node:crypto";
import { access, appendFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import pino from "pino";
import { z } from "zod";

import { logMessage } from "./logClaudeMessage.ts";
import { runReviewFanout, type FanoutContext } from "./reviewFanout.ts";

/** Duration above which a Claude session is considered long-running (triggers artifact upload). */
const longRunMs = 5 * 60 * 1000;

/** Create pino logger configured per platform logging standard. */
async function createLogger(): Promise<pino.Logger> {
  const version = (await Bun.file(`${import.meta.dirname}/../version`).text()).trim();

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

/** Set a GitHub Actions output variable using heredoc delimiter for multi-line safety. */
export async function setOutput(key: string, value: string): Promise<void> {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) return;

  const delimiter = `EOF_${randomUUID().replaceAll("-", "")}`;
  await appendFile(outputFile, `${key}<<${delimiter}\n${value}\n${delimiter}\n`);
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
    return (await pathExists(binPath)) ? binPath : undefined;
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

let log: pino.Logger | undefined;

/**
 * Check whether orchestrator-side parallel fan-out should run before the root
 * query. Requires the feature flag, review mode, and a resolvable PR context.
 */
function shouldRunFanout(config: RunClaudeConfig): boolean {
  if (process.env.PARALLEL_FANOUT !== "true") return false;
  if (!config.prompt.includes("/autopilot:pr-review ")) return false;
  if (!config.pluginDir) return false;
  if (!process.env.GITHUB_REPOSITORY || !process.env.PR_NUMBER) return false;
  return true;
}

/** Spawn the 12 review sub-agents in parallel and persist their results. */
async function runFanoutIfEnabled(
  config: RunClaudeConfig,
  settingSources: ("user" | "project")[],
  mcpServers: Record<string, McpServerConfig>,
  pathToClaudeCodeExecutable: string | undefined
): Promise<string | undefined> {
  if (!log || !shouldRunFanout(config)) return undefined;

  const fanoutCtx: FanoutContext = {
    log,
    repo: process.env.GITHUB_REPOSITORY ?? "",
    prNumber: process.env.PR_NUMBER ?? "",
    pluginDir: config.pluginDir ?? "",
    mcpServers,
    settingSources,
    pathToClaudeCodeExecutable,
    fallbackModel: config.model,
    inheritedAllowedTools: config.allowedTools,
    inheritedDisallowedTools: config.disallowedTools,
    // Give each sub-agent 10 min — rfc-compliance historically hits ~77s.
    subagentTimeoutMs: 10 * 60 * 1000,
  };

  const results = await runReviewFanout(fanoutCtx);
  const outputPath = `${process.env.RUNNER_TEMP ?? "/tmp"}/precomputed-reviews.json`;
  await Bun.write(outputPath, JSON.stringify(results, null, 2));
  log.info({ output_path: outputPath, count: results.length }, "Fan-out results written.");
  return outputPath;
}

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

  const precomputedReviewsPath = await runFanoutIfEnabled(
    config,
    settingSources as ("user" | "project")[],
    mcpServers,
    pathToClaudeCodeExecutable
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
      env: {
        ...(process.env as Record<string, string>),
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
        CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "",
        GH_TOKEN: process.env.GH_TOKEN ?? "",
        PRECOMPUTED_REVIEWS_PATH: precomputedReviewsPath ?? "",
      },
    },
  });

  for await (const message of q) {
    logMessage(log, message);
    messages.push(message);
  }

  // Prevent the 30min timer from keeping the event loop alive after completion
  clearTimeout(timeout);

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

/**
 * Emit GitHub Actions outputs from the collected messages, flag long-running
 * sessions, and exit non-zero when the final result subtype isn't "success".
 */
async function emitOutputs(
  log: pino.Logger,
  outputFilePath: string,
  messages: unknown[]
): Promise<void> {
  const resultMessage = messages.findLast(
    (m): m is Record<string, unknown> =>
      typeof m === "object" && m !== null && (m as Record<string, unknown>).type === "result"
  );

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
