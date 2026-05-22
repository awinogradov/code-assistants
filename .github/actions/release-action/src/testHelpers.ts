/**
 * Shared test helpers for temporary directories and git repositories.
 *
 * Provides reusable setup/teardown utilities used across test files
 * to avoid duplicating temp dir and git repo creation logic.
 *
 * @example
 * ```typescript
 * import { withTempDir, withTempRepo, createCommit } from "../testHelpers.ts";
 *
 * test("my test", () => withTempDir(async (dir) => { ... }));
 * test("git test", () => withTempRepo(async (repo) => { ... }));
 * ```
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { $ } from "bun";

/**
 * Run a test function inside a temporary directory that is cleaned up afterward.
 *
 * @param fn - Test function receiving the temp directory path
 */
export async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "test-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Create an isolated temporary git repository with user config.
 *
 * @returns Path to the new git repository
 */
async function createTempGitRepo(): Promise<string> {
  const repoPath = await mkdtemp(join(tmpdir(), "test-repo-"));
  await $`git init`.cwd(repoPath).quiet();
  await $`git config user.email "test@test.com"`.cwd(repoPath).quiet();
  await $`git config user.name "Test"`.cwd(repoPath).quiet();
  return repoPath;
}

/**
 * Run a test function inside an isolated git repository that is cleaned up afterward.
 *
 * @param fn - Test function receiving the repo path
 */
export async function withTempRepo(fn: (repoPath: string) => Promise<void>): Promise<void> {
  const repoPath = await createTempGitRepo();
  try {
    await fn(repoPath);
  } finally {
    await rm(repoPath, { recursive: true, force: true });
  }
}

/**
 * Create a conventional commit in a test repository.
 *
 * @param repoPath - Path to the git repository
 * @param message - Commit message
 * @param file - File to create/modify (default: "file.txt")
 */
export async function createCommit(
  repoPath: string,
  message: string,
  file = "file.txt"
): Promise<void> {
  await Bun.write(join(repoPath, file), `${Date.now()}\n`);
  await $`git add ${file}`.cwd(repoPath).quiet();
  await $`git commit -m ${message}`.cwd(repoPath).quiet();
}

/**
 * Create an initial commit with package.json and tag it.
 *
 * @param repoPath - Path to the git repository
 * @param version - Version to tag (default: "1.0.0")
 */
export async function createInitialCommitAndTag(
  repoPath: string,
  version = "1.0.0"
): Promise<void> {
  await $`git add package.json`.cwd(repoPath).quiet();
  await $`git commit -m ${"chore: initial commit"}`.cwd(repoPath).quiet();
  await $`git tag v${version}`.cwd(repoPath).quiet();
}
