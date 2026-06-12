/**
 * Entry point for the files-sync composite action.
 *
 * Reads action inputs from environment variables, fetches declared source files,
 * compares them against the current repository, and — when differences exist —
 * commits a single tree via the Git Data API and opens one PR.
 *
 * @example
 *   FILES_INPUT='- repo: owner/name
 *     source: README.md
 *     dest: README.md' \
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=me/dest \
 *   INPUT_BASE=main INPUT_BRANCH=maintenance-sync-files \
 *   INPUT_TITLE="MAINTENANCE: Sync" INPUT_BODY="Automated sync." \
 *   INPUT_COMMIT_MESSAGE="chore: sync files from upstream" \
 *   bun files-sync.ts
 */

import * as core from '@actions/core';
import { Octokit } from '@octokit/rest';

import { resolveBotIdentity } from './src/botIdentity.ts';
import { computeChanges } from './src/changeDetector.ts';
import { createSyncPullRequest } from './src/createSyncPullRequest.ts';
import {
  isSymlinkEntry,
  parseFilesInput,
  parseRepoSlug,
  type SyncEntry,
} from './src/parseInputs.ts';

interface Env {
  filesInput: string;
  token: string;
  destRepo: { owner: string; name: string };
  base: string;
  branch: string;
  title: string;
  body: string;
  commitMessage: string;
}

function readEnv(): Env {
  const token = requiredToken();
  const filesInput = required('FILES_INPUT');
  const repository = required('GITHUB_REPOSITORY');
  const base = required('INPUT_BASE');
  const branch = required('INPUT_BRANCH');
  const title = required('INPUT_TITLE');
  const body = required('INPUT_BODY');
  const commitMessage = required('INPUT_COMMIT_MESSAGE');

  const { owner, name } = parseRepoSlug(repository);

  return {
    filesInput,
    token,
    destRepo: { owner, name },
    base,
    branch,
    title,
    body,
    commitMessage,
  };
}

function required(name: string): string {
  const value = process.env[name];

  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function requiredToken(): string {
  const value = process.env.GITHUB_TOKEN;

  if (value === undefined || value === '') {
    throw new Error(
      'GITHUB_TOKEN is empty. Pass an explicit PAT or GitHub App installation token via the action\'s `bot_token` input — ' +
        'the workflow\'s default `GITHUB_TOKEN` is not supported because it cannot create pull requests when the destination ' +
        'repo/org disables "Allow GitHub Actions to create and approve pull requests". ' +
        'See https://github.com/awinogradov/code-assistants/blob/main/.github/actions/files-sync/README.md#permissions',
    );
  }

  return value;
}

function formatFileList(paths: string[]): string {
  return paths.map((path) => `- \`${path}\``).join('\n');
}

function composeBody(intro: string, paths: string[]): string {
  return `${intro}\n\n**Updated files:**\n\n${formatFileList(paths)}\n`;
}

function formatEntrySource(entry: SyncEntry): string {
  if (isSymlinkEntry(entry)) {
    return `(symlink) ${entry.symlink} → ${entry.dest}`;
  }

  return `${entry.repo}:${entry.source} → ${entry.dest}`;
}

async function writeNoChangesSummary(entries: SyncEntry[]): Promise<void> {
  const sources = entries.map(formatEntrySource);
  const body = [
    '### Files sync',
    '',
    'No file differences detected. No PR created.',
    '',
    '**Checked entries:**',
    '',
    formatFileList(sources),
    '',
  ].join('\n');
  await core.summary.addRaw(body).write();
}

async function writePrReadySummary(
  pr: { number: number; htmlUrl: string },
  title: string,
  paths: string[],
): Promise<void> {
  const body = [
    '### Files sync',
    '',
    `PR ready: [#${pr.number}](${pr.htmlUrl}) — ${title}`,
    '',
    '**Updated files:**',
    '',
    formatFileList(paths),
    '',
  ].join('\n');
  await core.summary.addRaw(body).write();
}

async function main(): Promise<void> {
  const env = readEnv();
  const entries = parseFilesInput(env.filesInput);

  core.info(`Resolved ${entries.length} sync entr${entries.length === 1 ? 'y' : 'ies'}.`);

  const octokit = new Octokit({ auth: env.token });
  const identity = await resolveBotIdentity(octokit, process.env.INPUT_BOT_USERNAME);

  const changes = await computeChanges({
    octokit,
    entries,
    destRepo: env.destRepo,
    baseRef: env.base,
  });

  if (changes.length === 0) {
    core.info('No file differences detected. Skipping PR creation.');
    core.setOutput('changed-files', '');
    core.setOutput('pr-number', '');
    core.setOutput('pr-url', '');
    await writeNoChangesSummary(entries);
    return;
  }

  core.info(`Detected ${changes.length} changed file(s):`);
  changes.forEach((change) => core.info(`  - ${change.path}`));

  const paths = changes.map((change) => change.path);
  const body = composeBody(env.body, paths);

  core.info(`Authoring sync commit as ${identity.name} <${identity.email}>`);

  const pr = await createSyncPullRequest({
    octokit,
    destRepo: env.destRepo,
    base: env.base,
    branch: env.branch,
    title: env.title,
    body,
    commitMessage: env.commitMessage,
    changes,
    identity,
  });

  core.setOutput('changed-files', paths.join('\n'));
  core.setOutput('pr-number', String(pr.number));
  core.setOutput('pr-url', pr.htmlUrl);

  core.notice(`Pull request ready: ${pr.htmlUrl}`, { title: env.title });
  await writePrReadySummary(pr, env.title, paths);
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  core.setFailed(message);
  process.exit(1);
});
