/**
 * Enumerates every file under the source repository's authored skills layout
 * (`claude-plugins/autopilot/skills/`, the single source of truth per RFC-0002)
 * via the Git Trees API. The Contents API is unsuited here: the layout holds
 * over a hundred files across nested skill directories, and one recursive
 * tree call returns them all.
 *
 * @example
 *   const files = await fetchSkillTree({ octokit, sourceRepo: 'awinogradov/code-assistants', sourceRef: '' });
 *   // → ['claude-plugins/autopilot/skills/run/SKILL.md', …]
 */

import type { Octokit } from '@octokit/rest';

import { parseRepo } from '@code-assistants/actions-core/parseRepo';

const layoutPrefix = 'claude-plugins/autopilot/skills/';

interface FetchArgs {
  octokit: Octokit;
  sourceRepo: string;
  /** Branch, tag, or SHA; empty string means the source repo's default branch. */
  sourceRef: string;
}

export async function fetchSkillTree({ octokit, sourceRepo, sourceRef }: FetchArgs): Promise<string[]> {
  const { owner, repo } = parseRepo(sourceRepo);
  const ref =
    sourceRef === '' ? (await octokit.rest.repos.get({ owner, repo })).data.default_branch : sourceRef;

  const { data } = await octokit.rest.git.getTree({ owner, repo, tree_sha: ref, recursive: '1' });

  if (data.truncated) {
    throw new Error(
      `Git tree for ${sourceRepo}@${ref} is truncated; the agent-skills listing would be incomplete`,
    );
  }

  const files = data.tree
    .filter((entry) => entry.type === 'blob' && entry.path !== undefined && entry.path.startsWith(layoutPrefix))
    .map((entry) => entry.path as string)
    .sort();

  if (files.length === 0) {
    throw new Error(`No files found under ${layoutPrefix} in ${sourceRepo}@${ref}`);
  }

  return files;
}
