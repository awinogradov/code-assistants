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
import Anthropic from "@anthropic-ai/sdk";

import {
  anthropicModel,
  buildUserMessage,
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

/**
 * Call the Anthropic Messages API to generate release notes.
 *
 * @param apiKey - Anthropic API key
 * @param userMessage - User message with changelog and context
 * @param system - System prompt with stable instructions
 * @param messages - Optional messages client (for testing)
 * @returns Generated release notes text
 * @throws On API error or timeout
 */
export async function callAnthropicApi(
  apiKey: string,
  userMessage: string,
  system: string,
  messages?: AnthropicMessages
): Promise<string> {
  const client = messages ?? new Anthropic({ apiKey, timeout: 120_000 }).messages;

  const message = await client.create({
    model: anthropicModel,
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

async function generateWithApi(apiKey: string, notesPath: string, bodyPath: string): Promise<void> {
  try {
    const changelog = await Bun.file(bodyPath).text();

    const ticketsFile = Bun.file(".release_bot/tickets.json");
    const tickets = (await ticketsFile.exists()) ? await ticketsFile.text() : undefined;

    const prDescFile = Bun.file(".release_bot/pr_descriptions.yml");
    const prDescriptions = (await prDescFile.exists()) ? await prDescFile.text() : undefined;

    const serviceContext = await readServiceContext();

    if (serviceContext) console.log("Found service documentation context");
    if (tickets) console.log("Found tickets.json with context");
    if (prDescriptions) console.log("Found pr_descriptions.yml with context");

    const filtered = filterChangelogForAi(changelog);
    const userMessage = buildUserMessage(filtered, serviceContext, tickets, prDescriptions);
    const notes = await callAnthropicApi(apiKey, userMessage, systemPrompt);

    await Bun.write(notesPath, notes, { createPath: true });
    console.log("Release notes generated");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`::warning::Failed to generate release notes: ${message}`);
  }
}

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const notesPath = ".release_bot/release_notes.md";
  const bodyPath = ".release_bot/body";

  if (apiKey) {
    await generateWithApi(apiKey, notesPath, bodyPath);
  }

  await verifyReleaseNotes(notesPath, bodyPath);
}

if (import.meta.main) {
  main().catch((error: Error) => {
    console.log(`::error::${error.message}`);
    process.exit(1);
  });
}
