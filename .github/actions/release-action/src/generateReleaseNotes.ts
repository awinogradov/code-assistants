/**
 * Generate AI-powered release notes via Anthropic API and verify output.
 *
 * Reads changelog and optional ticket/PR context from `.release_bot/`,
 * calls the Anthropic Messages API to produce human-readable release notes,
 * then verifies notes exist (with fallback to changelog body).
 *
 * @example
 * ```bash
 * ANTHROPIC_API_KEY=sk-... bun src/generateReleaseNotes.ts
 * ```
 */
import { join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";

import { assertExclusiveAnthropicAuth } from "@code-assistants/actions-core/anthropicAuth";

import {
  buildUserMessage,
  defaultAnthropicModel,
  filterChangelogForAi,
  maxOutputTokens,
  readServiceContext,
  systemPrompt,
} from "./releaseNotesPrompt.ts";

/** Minimal interface for the Anthropic messages client (for testing) */
export interface AnthropicMessages {
  create(params: {
    model: string;
    max_tokens: number;
    system?: string;
    messages: Array<{ role: string; content: string }>;
  }): Promise<{ content: Array<{ type: string; text?: string }> }>;
}

/** Anthropic client auth/host options resolved from the environment. */
export interface AnthropicClientOptions {
  /** API key for `x-api-key` auth. */
  apiKey?: string;
  /** Bearer token for `Authorization: Bearer` auth (custom hosts/gateways). */
  authToken?: string;
  /** Custom API base URL (gateway/proxy/compatible endpoint). */
  baseURL?: string;
}

/**
 * Resolve Anthropic client options from the environment.
 *
 * Trims values and treats blanks as unset: GitHub renders an unset optional action
 * input as `""`, and a blank base URL would override the SDK default with a blank
 * host. `apiKey` (x-api-key) and `authToken` (bearer) are mutually exclusive, so
 * setting both is rejected fast rather than as a downstream API 400.
 *
 * @param env - Source environment, typically `process.env`.
 * @returns Only the options that are actually set.
 * @throws If both `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` are non-blank.
 */
export function resolveAnthropicClientOptions(
  env: Record<string, string | undefined>
): AnthropicClientOptions {
  const apiKey = env.ANTHROPIC_API_KEY?.trim() || undefined;
  const authToken = env.ANTHROPIC_AUTH_TOKEN?.trim() || undefined;
  const baseURL = env.ANTHROPIC_BASE_URL?.trim() || undefined;
  assertExclusiveAnthropicAuth(apiKey, authToken);
  return {
    ...(apiKey ? { apiKey } : {}),
    ...(authToken ? { authToken } : {}),
    ...(baseURL ? { baseURL } : {}),
  };
}

/**
 * Resolve the Anthropic model from the environment, falling back to the default.
 *
 * GitHub renders an unset optional action input as `""`, so a blank
 * `ANTHROPIC_MODEL` is treated as unset and the built-in
 * {@link defaultAnthropicModel} applies — keeping the default in one place.
 *
 * @param env - Source environment, typically `process.env`.
 * @returns The configured model id, or the default when unset/blank.
 */
export function resolveAnthropicModel(env: Record<string, string | undefined>): string {
  return env.ANTHROPIC_MODEL?.trim() || defaultAnthropicModel;
}

/**
 * Call the Anthropic Messages API to generate release notes.
 *
 * @param clientOptions - Resolved Anthropic client auth/host options
 * @param userMessage - User message with changelog and context
 * @param system - System prompt with stable instructions
 * @param model - Anthropic model id to call
 * @param messages - Optional messages client (for testing)
 * @returns Generated release notes text
 * @throws On API error or timeout
 */
export async function callAnthropicApi(
  clientOptions: AnthropicClientOptions,
  userMessage: string,
  system: string,
  model: string,
  messages?: AnthropicMessages
): Promise<string> {
  const client = messages ?? new Anthropic({ ...clientOptions, timeout: 120_000 }).messages;

  const message = await client.create({
    model,
    max_tokens: maxOutputTokens,
    system,
    messages: [{ role: "user", content: userMessage }],
  });

  for (const block of message.content) {
    if (block.type === "text" && "text" in block) {
      return block.text as string;
    }
  }

  throw new Error("Anthropic API returned no text content");
}

/**
 * Verify release notes exist and apply fallback if needed.
 *
 * Priority:
 * 1. Use existing notes if non-empty
 * 2. Fall back to changelog body (stripped of badge images)
 * 3. Last resort: default placeholder message
 *
 * @param notesPath - Path to release_notes.md
 * @param bodyPath - Path to changelog body file (fallback source)
 */
export async function verifyReleaseNotes(notesPath: string, bodyPath: string): Promise<void> {
  const notesFile = Bun.file(notesPath);

  if (await notesFile.exists()) {
    const content = (await notesFile.text()).trim();
    if (content.length > 0) {
      console.log("Release notes present");
      return;
    }
  }

  console.log("AI release notes not generated, using full changelog");

  const bodyFile = Bun.file(bodyPath);
  if (await bodyFile.exists()) {
    const body = await bodyFile.text();
    const stripped = body.replace(/^!\[.*\n?/gm, "").trim();
    if (stripped.length > 0) {
      await Bun.write(notesPath, stripped);
      return;
    }
  }

  await Bun.write(notesPath, "- See changelog for detailed changes\n");
}

export async function generateWithApi(
  clientOptions: AnthropicClientOptions,
  notesPath: string,
  bodyPath: string,
  model: string,
  cwd = process.cwd(),
  messages?: AnthropicMessages,
): Promise<void> {
  try {
    const changelog = await Bun.file(bodyPath).text();

    const ticketsFile = Bun.file(join(cwd, ".release_bot/tickets.json"));
    const tickets = (await ticketsFile.exists()) ? await ticketsFile.text() : undefined;

    const prDescFile = Bun.file(join(cwd, ".release_bot/pr_descriptions.yml"));
    const prDescriptions = (await prDescFile.exists()) ? await prDescFile.text() : undefined;

    const serviceContext = await readServiceContext(cwd);

    if (serviceContext) console.log("Found service documentation context");
    if (tickets) console.log("Found tickets.json with context");
    if (prDescriptions) console.log("Found pr_descriptions.yml with context");

    const filtered = filterChangelogForAi(changelog);
    const userMessage = buildUserMessage(filtered, serviceContext, tickets, prDescriptions);
    const notes = await callAnthropicApi(clientOptions, userMessage, systemPrompt, model, messages);

    await Bun.write(notesPath, notes, { createPath: true });
    console.log("Release notes generated");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`::warning::Failed to generate release notes: ${message}`);
  }
}

/**
 * Generate and verify release notes for a given working directory. Reads the
 * full changelog from `<cwd>/.release_bot/body`, writes the AI summary to
 * `<cwd>/.release_bot/release_notes.md`, and falls back to the full changelog
 * when the API key is missing or the call fails.
 *
 * Used by the standalone `main()` (cwd = repo root) and by the monorepo
 * `emitMemberArtifacts` (cwd = member path).
 */
export async function runReleaseNotes(
  cwd = process.cwd(),
  messages?: AnthropicMessages,
): Promise<void> {
  const clientOptions = resolveAnthropicClientOptions(process.env);
  const model = resolveAnthropicModel(process.env);
  // GitHub renders an unset optional action input as ""; strip a blank host/token so
  // the SDK's own env fallback cannot read it as a configured (blank) host.
  if (!process.env.ANTHROPIC_BASE_URL?.trim()) delete process.env.ANTHROPIC_BASE_URL;
  if (!process.env.ANTHROPIC_AUTH_TOKEN?.trim()) delete process.env.ANTHROPIC_AUTH_TOKEN;
  const notesPath = join(cwd, ".release_bot/release_notes.md");
  const bodyPath = join(cwd, ".release_bot/body");

  if (clientOptions.apiKey || clientOptions.authToken) {
    await generateWithApi(clientOptions, notesPath, bodyPath, model, cwd, messages);
  }

  await verifyReleaseNotes(notesPath, bodyPath);
}

if (import.meta.main) {
  runReleaseNotes().catch((error: Error) => {
    console.log(`::error::${error.message}`);
    process.exit(1);
  });
}
