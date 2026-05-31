/**
 * Entry point for the auto-label composite action. Reads the GitHub Actions
 * environment, derives the label prefix (from the `label-prefix` input or the root
 * `package.json` scope), dispatches to the mode matching `github.event_name`
 * (`pull_request` → label-PR, `push` → prune-labels), and writes a step summary.
 * All inputs/payloads are validated before any label is mutated.
 */
import * as core from "@actions/core";
import { Octokit } from "@octokit/rest";

import { parseRepo } from "@code-assistants/actions-core/parseRepo";

import { deriveLabelPrefix } from "./enumerateWorkspaces.ts";
import { readPullRequestEvent } from "./eventPayload.ts";
import { createGitHubApi, type GitHubApi } from "./githubApi.ts";
import { labelPr, type LabelPrResult } from "./labelPr.ts";
import { pruneLabels, type PruneResult } from "./pruneLabels.ts";

const defaultColor = "5319e7";
const defaultDescriptionTemplate = "Auto-applied: PR touches {label}";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function resolvePrefix(api: GitHubApi, ref: string, override: string): Promise<string> {
  if (override) {
    return override.endsWith("/") ? override : `${override}/`;
  }
  const rootPkg = await api.readPackageJson("", ref);
  return deriveLabelPrefix(rootPkg?.name);
}

async function writeSummary(title: string, lines: string[]): Promise<void> {
  core.summary.addRaw(`### ${title}\n\n${lines.join("\n")}\n`, true);
  await core.summary.write();
}

function bullets(label: string, values: string[]): string {
  return values.length > 0 ? `**${label}:**\n${values.map((v) => `- ${v}`).join("\n")}` : `**${label}:** _(none)_`;
}

async function runPullRequest(api: GitHubApi, prefixOverride: string): Promise<void> {
  const event = readPullRequestEvent(requireEnv("GITHUB_EVENT_PATH"));
  const prefix = await resolvePrefix(api, event.headSha, prefixOverride);
  const result: LabelPrResult = await labelPr(api, {
    prNumber: event.prNumber,
    baseSha: event.baseSha,
    headSha: event.headSha,
    prefix,
    labelColor: process.env.LABEL_COLOR || defaultColor,
    labelDescriptionTemplate: process.env.LABEL_DESCRIPTION_TEMPLATE || defaultDescriptionTemplate,
  });
  await writeSummary(`Auto label · PR #${event.prNumber}`, [
    `Prefix: \`${prefix}\``,
    bullets("Touched", result.touched),
    bullets("Added", result.added),
    bullets("Removed", result.removed),
  ]);
}

async function runPush(api: GitHubApi, prefixOverride: string): Promise<void> {
  const ref = requireEnv("GITHUB_SHA");
  const prefix = await resolvePrefix(api, ref, prefixOverride);
  const result: PruneResult = await pruneLabels(api, { ref, prefix });
  await writeSummary("Auto label · prune", [`Prefix: \`${prefix}\``, bullets("Deleted", result.deleted)]);
}

async function run(): Promise<void> {
  const token = requireEnv("GH_TOKEN");
  const eventName = requireEnv("GITHUB_EVENT_NAME");
  const { owner, repo } = parseRepo(requireEnv("GITHUB_REPOSITORY"));
  const prefixOverride = (process.env.LABEL_PREFIX ?? "").trim();

  const api = createGitHubApi(new Octokit({ auth: token }), owner, repo);

  if (eventName === "pull_request") {
    await runPullRequest(api, prefixOverride);
    return;
  }
  if (eventName === "push") {
    await runPush(api, prefixOverride);
    return;
  }
  core.info(`auto-label: no action for event "${eventName}"`);
}

run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
