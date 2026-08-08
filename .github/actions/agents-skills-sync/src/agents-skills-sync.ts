/**
 * Entry point for the agents-skills-sync composite action.
 *
 * Enumerates the source repository's `agent-skills/` layout via the Git Trees
 * API and emits a YAML `files` list as a step output that the downstream
 * `files-sync` step consumes, landing the portable Agent Skills under the
 * consumer's `.agents/skills/`.
 */

import * as core from '@actions/core';
import { stringify as stringifyYaml } from 'yaml';

import { createOctokit } from '@code-assistants/actions-core/createOctokit';

import { buildSkillSyncEntries } from './buildSkillSyncEntries.ts';
import { fetchSkillTree } from './fetchSkillTree.ts';

function requiredToken(): string {
  const value = process.env.GITHUB_TOKEN;

  if (value === undefined || value === '') {
    throw new Error(
      'GITHUB_TOKEN is empty. Pass an explicit PAT or GitHub App installation token via the action\'s `bot_token` input — ' +
        'the workflow\'s default `GITHUB_TOKEN` is not supported because it cannot create pull requests when the repo/org ' +
        'disables "Allow GitHub Actions to create and approve pull requests". ' +
        'See https://github.com/awinogradov/code-assistants/blob/main/.github/actions/agents-skills-sync/README.md#permissions',
    );
  }

  return value;
}

function required(name: string): string {
  const value = process.env[name];

  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function main(): Promise<void> {
  const token = requiredToken();
  const sourceRepo = required('INPUT_SOURCE_REPO');
  const sourceRef = process.env.INPUT_SOURCE_REF ?? '';
  const octokit = createOctokit(token);

  const files = await fetchSkillTree({ octokit, sourceRepo, sourceRef });
  const entries = buildSkillSyncEntries({ sourceRepo, sourceRef, files });

  core.info(`Resolved ${entries.length} portable skill file(s) from ${sourceRepo} agent-skills/ → .agents/skills/`);
  core.setOutput('files', stringifyYaml(entries));

  const summaryLines = [
    '### Agents skills sync',
    '',
    `Syncing ${entries.length} file(s) from \`${sourceRepo}\` \`agent-skills/\` to \`.agents/skills/\`.`,
    '',
  ];
  await core.summary.addRaw(summaryLines.join('\n')).write();
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  core.setFailed(message);
  process.exit(1);
});
