/**
 * Orchestrator-side parallel fan-out for PR-review sub-agents.
 *
 * Reads the 12 `pr:review:*` sub-agent definitions from the installed autopilot
 * plugin, spawns them as parallel headless `query()` calls via the Agent SDK,
 * and returns their markdown output. The results are written to disk so the
 * root `/autopilot:pr-review` command can consume them instead of attempting
 * its own (unreliable) in-model fan-out.
 *
 * @see runClaude.ts — wires this module into review mode
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import type { McpServerConfig, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type pino from "pino";

import { logMessage } from "./logClaudeMessage.ts";

/** Filename prefix that identifies the 12 review sub-agents in the plugin. */
const reviewAgentPrefix = "pr:review:";

/** Shared runtime context threaded into every parallel sub-agent invocation. */
export interface FanoutContext {
  log: pino.Logger;
  repo: string;
  prNumber: string;
  pluginDir: string;
  mcpServers: Record<string, McpServerConfig>;
  settingSources: ("user" | "project")[];
  pathToClaudeCodeExecutable: string | undefined;
  fallbackModel: string;
  /** Per-category model overrides (e.g. `{ "correctness": "opus" }`), keyed by the
   * bare review category. Takes precedence over the agent's frontmatter model. */
  modelOverrides: Record<string, string>;
  /** Tools inherited from the root query — used when the agent file declares none. */
  inheritedAllowedTools: string[];
  inheritedDisallowedTools: string[];
  /** Per-sub-agent timeout, independent of the 30-min root timeout. */
  subagentTimeoutMs: number;
}

/** Result of a single sub-agent invocation, written to the shared JSON file. */
export interface SubagentResult {
  subagent_type: string;
  markdown: string;
  duration_ms: number;
  error?: string;
}

/** In-memory representation of one loaded agent definition file. */
interface AgentDefinition {
  subagent_type: string;
  filename: string;
  body: string;
  model: string | undefined;
  allowedTools: string[] | undefined;
}

/**
 * Split a markdown file with YAML frontmatter into the frontmatter text and body.
 * Returns empty frontmatter if the file doesn't start with the `---` fence.
 */
export function splitFrontmatter(content: string): { fm: string; body: string } {
  if (!content.startsWith("---\n")) return { fm: "", body: content };
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) return { fm: "", body: content };
  return { fm: content.slice(4, end), body: content.slice(end + 5) };
}

function parseInlineTools(value: string): string[] {
  return value
    .split(",")
    .map((t) => stripQuotes(t.trim()))
    .filter(Boolean);
}

/**
 * Parse the tiny YAML subset used by Claude Code agent frontmatter.
 *
 * Handles: scalar `key: value` (quoted or unquoted) and `key:` with an
 * indented `- item` list underneath. That's all agent frontmatter needs;
 * pulling in a full YAML lib would be premature.
 */
export function parseAgentFrontmatter(fm: string): {
  model?: string;
  allowedTools?: string[];
} {
  const out: { model?: string; allowedTools?: string[] } = {};
  const listBuffer: string[] = [];
  let inToolsList = false;

  for (const line of fm.split("\n")) {
    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch && inToolsList) {
      listBuffer.push(stripQuotes((listMatch[1] ?? "").trim()));
      continue;
    }
    inToolsList = false;

    const kvMatch = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (!kvMatch) continue;
    const [, key, rawValue] = kvMatch;
    const value = (rawValue ?? "").trim();

    if (key === "model" && value) out.model = stripQuotes(value);
    if (key === "tools" && value) out.allowedTools = parseInlineTools(value);
    if (key === "tools" && !value) inToolsList = true;
  }

  if (listBuffer.length > 0) out.allowedTools = listBuffer;
  return out;
}

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

/** Read all `pr:review:*.md` files from the plugin's agents directory. */
export async function loadReviewAgents(pluginDir: string): Promise<AgentDefinition[]> {
  const agentsDir = join(pluginDir, "agents");
  const entries = await readdir(agentsDir);
  const reviewFiles = entries
    .filter((f) => f.startsWith(reviewAgentPrefix) && f.endsWith(".md"))
    .sort();

  return Promise.all(
    reviewFiles.map(async (filename) => {
      const content = await Bun.file(join(agentsDir, filename)).text();
      const { fm, body } = splitFrontmatter(content);
      const parsed = parseAgentFrontmatter(fm);
      return {
        subagent_type: `autopilot:${filename.replace(/\.md$/, "")}`,
        filename,
        body: body.trim(),
        model: parsed.model,
        allowedTools: parsed.allowedTools,
      };
    }),
  );
}

/** Resolve a sub-agent's model: per-category override > frontmatter > fallback. */
export function resolveModel(ctx: FanoutContext, agent: AgentDefinition): string {
  const category = agent.subagent_type.replace("autopilot:pr:review:", "");
  return ctx.modelOverrides[category] ?? agent.model ?? ctx.fallbackModel;
}

/** Build the `Stack: ... Diff: ...` user prompt each review sub-agent expects. */
export function buildSubagentPrompt(stack: string, diff: string): string {
  return `Stack: ${stack}\n\nDiff:\n\`\`\`diff\n${diff}\n\`\`\``;
}

/** Fetch the unified PR diff via the gh CLI. */
async function fetchPrDiff(repo: string, prNumber: string): Promise<string> {
  const proc = Bun.spawn(["gh", "pr", "diff", prNumber, "-R", repo], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  if (proc.exitCode !== 0) {
    throw new Error(`gh pr diff failed (exit ${proc.exitCode}): ${stderr.trim()}`);
  }
  return stdout;
}

/** Detect the stack name from `package.json` `agents.rules` in the checked-out repo root. */
export async function detectStack(cwd: string = process.cwd()): Promise<string> {
  try {
    const pkg = (await Bun.file(join(cwd, "package.json")).json()) as {
      agents?: { rules?: unknown };
    };
    const value = pkg.agents?.rules;
    return typeof value === "string" && value.length > 0 ? value : "unknown";
  } catch {
    return "unknown";
  }
}

interface TextBlock {
  type: "text";
  text: string;
}

function isTextBlock(block: unknown): block is TextBlock {
  return (
    typeof block === "object" &&
    block !== null &&
    (block as { type?: unknown }).type === "text" &&
    typeof (block as { text?: unknown }).text === "string"
  );
}

/**
 * Capture the final assistant text block from an SDK message stream.
 *
 * The review sub-agents are instructed to emit a single structured markdown
 * block as their last assistant message; later text wins to cover the case
 * where the model emits intermediate narration before the final block.
 */
function extractFinalText(message: SDKMessage): string | undefined {
  if (message.type !== "assistant") return undefined;
  const content = (message as { message: { content?: unknown[] } }).message.content ?? [];
  const texts = content.filter(isTextBlock);
  return texts.at(-1)?.text;
}

/**
 * Run one review sub-agent as a headless SDK query.
 *
 * Uses a child logger bound with `orchestrator_subagent` so the debug-log
 * analyzer can group interleaved messages from the parallel streams.
 */
async function runSubagent(
  ctx: FanoutContext,
  agent: AgentDefinition,
  userPrompt: string,
): Promise<SubagentResult> {
  const childLog = ctx.log.child({ orchestrator_subagent: agent.subagent_type });
  const start = performance.now();
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), ctx.subagentTimeoutMs);

  const model = resolveModel(ctx, agent);
  let markdown = "";
  let error: string | undefined;

  childLog.info({ model }, "Sub-agent query starting.");

  try {
    markdown = await streamAssistantText(
      childLog,
      query({
        prompt: userPrompt,
        options: buildSubagentOptions(ctx, agent, abortController),
      }),
    );
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    childLog.error({ error }, "Sub-agent invocation failed.");
  } finally {
    clearTimeout(timeout);
  }

  const durationMs = Math.round(performance.now() - start);
  childLog.info(
    { duration_ms: durationMs, markdown_bytes: markdown.length, error },
    "Sub-agent query finished.",
  );
  return { subagent_type: agent.subagent_type, markdown, duration_ms: durationMs, error };
}

/** Stream SDK messages through the logger; return the last assistant text. */
async function streamAssistantText(
  log: pino.Logger,
  stream: AsyncIterable<SDKMessage>,
): Promise<string> {
  let markdown = "";
  for await (const message of stream) {
    logMessage(log, message);
    const text = extractFinalText(message);
    if (text !== undefined) markdown = text;
  }
  return markdown;
}

/** Build the SDK `query()` options for a single sub-agent. */
function buildSubagentOptions(
  ctx: FanoutContext,
  agent: AgentDefinition,
  abortController: AbortController,
): Parameters<typeof query>[0]["options"] {
  return {
    model: resolveModel(ctx, agent),
    allowedTools: agent.allowedTools ?? ctx.inheritedAllowedTools,
    disallowedTools: ctx.inheritedDisallowedTools,
    plugins: [{ type: "local" as const, path: ctx.pluginDir }],
    mcpServers: ctx.mcpServers,
    permissionMode: "bypassPermissions" as const,
    allowDangerouslySkipPermissions: true,
    settingSources: ctx.settingSources,
    systemPrompt: {
      type: "preset" as const,
      preset: "claude_code" as const,
      append: agent.body,
    },
    pathToClaudeCodeExecutable: ctx.pathToClaudeCodeExecutable,
    abortController,
    env: {
      ...(process.env as Record<string, string>),
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
      CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "",
      GH_TOKEN: process.env.GH_TOKEN ?? "",
    },
  };
}

/**
 * Run all 12 `pr:review:*` sub-agents in parallel and return their markdown
 * review blocks. Individual failures are captured in the `error` field of the
 * corresponding result but do not abort the whole fan-out — this mirrors the
 * current root-model behavior where a failing sub-agent is skipped.
 */
export async function runReviewFanout(ctx: FanoutContext): Promise<SubagentResult[]> {
  ctx.log.info(
    { repo: ctx.repo, pr_number: ctx.prNumber, plugin_dir: ctx.pluginDir },
    "Parallel review fan-out starting.",
  );

  const [agents, diff, stack] = await Promise.all([
    loadReviewAgents(ctx.pluginDir),
    fetchPrDiff(ctx.repo, ctx.prNumber),
    detectStack(),
  ]);

  ctx.log.info(
    { agent_count: agents.length, diff_bytes: diff.length, stack },
    "Agent definitions and PR context loaded.",
  );

  const userPrompt = buildSubagentPrompt(stack, diff);
  const start = performance.now();

  const results = await Promise.all(agents.map((agent) => runSubagent(ctx, agent, userPrompt)));

  const totalMs = Math.round(performance.now() - start);
  const maxAgentMs = results.reduce((max, r) => Math.max(max, r.duration_ms), 0);
  const totalAgentMs = results.reduce((sum, r) => sum + r.duration_ms, 0);
  const failed = results.filter((r) => r.error).length;

  ctx.log.info(
    {
      total_ms: totalMs,
      max_agent_ms: maxAgentMs,
      // Gain vs. a hypothetical serial run: sum(agent time) / wall time.
      parallel_speedup: totalMs > 0 ? +(totalAgentMs / totalMs).toFixed(2) : 0,
      agent_count: results.length,
      failed_count: failed,
    },
    "Parallel review fan-out complete.",
  );

  return results;
}
