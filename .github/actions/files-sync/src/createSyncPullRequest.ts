/**
 * Pull request creation for the files-sync action.
 *
 * Builds a single commit through the GitHub Git Data API (`blob` → `tree` → `commit` → `ref`)
 * and opens or reuses one PR with all changed files. Never touches the local working tree.
 *
 * @example
 *   const pr = await createSyncPullRequest(octokit, { destRepo, base, branch, ...meta, changes });
 */

import type { Octokit } from '@octokit/rest';
import type { RequestError } from '@octokit/request-error';

import type { BotIdentity } from './botIdentity.ts';
import type { FileChange } from './changeDetector.ts';

interface CreateArgs {
  octokit: Octokit;
  destRepo: { owner: string; name: string };
  base: string;
  branch: string;
  title: string;
  body: string;
  commitMessage: string;
  changes: FileChange[];
  identity: BotIdentity;
}

export interface SyncPullRequest {
  number: number;
  htmlUrl: string;
}

export async function createSyncPullRequest({
  octokit,
  destRepo,
  base,
  branch,
  title,
  body,
  commitMessage,
  changes,
  identity,
}: CreateArgs): Promise<SyncPullRequest> {
  const { owner, name: repo } = destRepo;

  const baseRef = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${base}`,
  });
  const baseCommitSha = baseRef.data.object.sha;

  const baseCommit = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: baseCommitSha,
  });
  const baseTreeSha = baseCommit.data.tree.sha;

  const blobs = await Promise.all(
    changes.map((change) =>
      octokit.rest.git.createBlob({
        owner,
        repo,
        content: change.content,
        encoding: 'utf-8',
      }),
    ),
  );

  const newTree = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: changes.map((change, index) => ({
      path: change.path,
      mode: change.mode as '100644' | '100755' | '040000' | '160000' | '120000',
      type: 'blob',
      sha: blobs[index]!.data.sha,
    })),
  });

  const newCommit = await octokit.rest.git.createCommit({
    owner,
    repo,
    message: commitMessage,
    tree: newTree.data.sha,
    parents: [baseCommitSha],
    author: identity,
    committer: identity,
  });

  await upsertBranch({ octokit, owner, repo, branch, sha: newCommit.data.sha });

  return upsertPullRequest({
    octokit,
    owner,
    repo,
    base,
    branch,
    title,
    body,
  });
}

interface UpsertBranchArgs {
  octokit: Octokit;
  owner: string;
  repo: string;
  branch: string;
  sha: string;
}

async function upsertBranch({
  octokit,
  owner,
  repo,
  branch,
  sha,
}: UpsertBranchArgs): Promise<void> {
  try {
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha,
    });
  } catch (error) {
    const requestError = error as RequestError;

    if (requestError.status !== 422) {
      throw error;
    }

    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha,
      force: true,
    });
  }
}

interface UpsertPrArgs {
  octokit: Octokit;
  owner: string;
  repo: string;
  base: string;
  branch: string;
  title: string;
  body: string;
}

async function upsertPullRequest({
  octokit,
  owner,
  repo,
  base,
  branch,
  title,
  body,
}: UpsertPrArgs): Promise<SyncPullRequest> {
  const existing = await octokit.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    head: `${owner}:${branch}`,
    base,
  });

  const open = existing.data[0];

  if (open !== undefined) {
    // The branch is force-updated every run, but a reused PR keeps its original
    // title/body — refresh them so the `Updated files` list matches the current diff.
    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: open.number,
      title,
      body,
    });

    return { number: open.number, htmlUrl: open.html_url };
  }

  try {
    const created = await octokit.rest.pulls.create({
      owner,
      repo,
      base,
      head: branch,
      title,
      body,
    });

    return { number: created.data.number, htmlUrl: created.data.html_url };
  } catch (error) {
    const requestError = error as RequestError;

    if (requestError.status === 403) {
      throw new Error(
        `Refused to create pull request in ${owner}/${repo}: ${requestError.message}. ` +
          'Confirm the `bot_token` input is a PAT or GitHub App installation token with `contents: write` + `pull-requests: write` ' +
          `on ${owner}/${repo} (not the workflow's default \`GITHUB_TOKEN\`). ` +
          'See https://github.com/awinogradov/code-assistants/blob/main/.github/actions/files-sync/README.md#permissions',
        { cause: error },
      );
    }

    throw error;
  }
}
