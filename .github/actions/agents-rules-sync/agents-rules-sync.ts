/**
 * Entry point for the agents-rules-sync composite action.
 *
 * Reads the current repository's `package.json` via the GitHub contents API,
 * validates the `agents.rules` field, and emits a single- or two-entry YAML
 * `files` list as a step output that the downstream `files-sync` step consumes.
 */

import * as core from '@actions/core';
import { Octokit } from '@octokit/rest';
import { stringify as stringifyYaml } from 'yaml';

import { fetchRawContent } from '@code-assistants/actions-core/fetchRawContent';

import { buildSyncEntries } from './src/buildSyncEntries.ts';
import { resolvePackageAgentsRules } from './src/resolvePackageAgentsRules.ts';

interface Env {
  token: string;
  destRepo: { owner: string; name: string };
  sourceRepo: string;
  sourceRef: string;
  agentsMd: boolean;
  base: string;
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
      'GITHUB_TOKEN is empty. Pass an explicit PAT or GitHub App installation token via the action\'s `token` input — ' +
        'the workflow\'s default `GITHUB_TOKEN` is not supported because it cannot create pull requests when the repo/org ' +
        'disables "Allow GitHub Actions to create and approve pull requests". ' +
        'See https://github.com/awinogradov/code-assistants/blob/main/.github/actions/agents-rules-sync/README.md#permissions',
    );
  }

  return value;
}

function parseBooleanInput(name: string, fallback: boolean): boolean {
  const value = process.env[name];

  if (value === undefined || value === '') {
    return fallback;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new Error(
    `Invalid boolean for ${name}: expected "true" or "false", got "${value}"`,
  );
}

function readEnv(): Env {
  const token = requiredToken();
  const destRepoRaw = required('DEST_REPO');
  const sourceRepo = required('INPUT_SOURCE_REPO');
  const base = required('INPUT_BASE');
  const sourceRef = process.env.INPUT_SOURCE_REF ?? '';
  const agentsMd = parseBooleanInput('INPUT_AGENTS_MD', false);

  const [owner, name] = destRepoRaw.split('/');

  if (owner === undefined || name === undefined || owner === '' || name === '') {
    throw new Error(`Invalid DEST_REPO slug: ${destRepoRaw}`);
  }

  return {
    token,
    destRepo: { owner, name },
    sourceRepo,
    sourceRef,
    agentsMd,
    base,
  };
}

async function main(): Promise<void> {
  const env = readEnv();
  const octokit = new Octokit({ auth: env.token });

  const raw = await fetchRawContent({
    octokit,
    owner: env.destRepo.owner,
    repo: env.destRepo.name,
    path: 'package.json',
    ref: env.base,
  });

  if (raw === null) {
    throw new Error(
      `package.json not found at ${env.destRepo.owner}/${env.destRepo.name}@${env.base}. ` +
        `Add a package.json with an \`agents.rules\` field — see https://github.com/awinogradov/code-assistants/blob/main/docs/agents-field.md`,
    );
  }

  const rules = resolvePackageAgentsRules(raw);
  const entries = buildSyncEntries({
    sourceRepo: env.sourceRepo,
    rules,
    sourceRef: env.sourceRef,
    agentsMd: env.agentsMd,
  });

  const filesYaml = stringifyYaml(entries);

  core.info(`Resolved agents.rules=${rules}; syncing rules/${rules}.md → CLAUDE.md from ${env.sourceRepo}`);
  if (env.agentsMd) {
    core.info('Also publishing AGENTS.md as a symlink to CLAUDE.md.');
  }
  core.setOutput('files', filesYaml);

  const summaryLines = [
    '### Agents rules sync',
    '',
    `Resolved \`agents.rules=${rules}\` → syncing \`rules/${rules}.md\` to \`CLAUDE.md\` from ${env.sourceRepo}.`,
  ];
  if (env.agentsMd) {
    summaryLines.push('Also published `AGENTS.md` as a symlink to `CLAUDE.md`.');
  }
  summaryLines.push('');
  await core.summary.addRaw(summaryLines.join('\n')).write();
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  core.setFailed(message);
  process.exit(1);
});
