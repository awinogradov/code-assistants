// Pure transforms for the branch digest: parse read-only `git` output into the
// bounded contract the gather-context skill consumes in place of the retired
// digest-branch-diff delegated agent. No I/O lives here — the CLI in
// digest-branch.ts is a thin shell around these functions, so the fixture tests
// in branchDigest.test.ts exercise the exact production paths.
//
// Runs under Node's native type stripping (Node >=24) and Bun without a build
// step, so it ships as source at ${CLAUDE_PLUGIN_ROOT}/lib/git/.
//
// Usage:
//   import { buildBranchDigest } from "./branchDigest.ts";
//   const digest = buildBranchDigest(reads);

/** One commit ahead of the base; `upstream` means `git cherry` found an equivalent patch on the base. */
export interface BranchCommit {
  sha: string;
  subject: string;
  upstream: boolean;
}

/** One changed file from `git diff --numstat`; counts are null for binary files. */
export interface BranchFile {
  path: string;
  additions: number | null;
  deletions: number | null;
}

/**
 * The bounded digest contract. Degraded reads yield tri-state fields:
 * `isStaleMerged`/`baseAhead` are null — never a confident false/0 — when the
 * `cherry`/`rev-list` read they derive from failed.
 */
export interface BranchDigest {
  branch: string;
  isWorktree: boolean;
  commits: BranchCommit[];
  files: BranchFile[];
  isStaleMerged: boolean | null;
  baseAhead: number | null;
  truncated: boolean;
  digestError: string | null;
}

/**
 * Raw stdout per read, or null when that read failed. The CLI collects the
 * per-read failure reasons separately and joins them into `digestError`.
 */
export interface GitReadResults {
  branch: string | null;
  gitDir: string | null;
  gitCommonDir: string | null;
  log: string | null;
  numstat: string | null;
  cherry: string | null;
  baseAhead: string | null;
}

/** Commit-list bound; `git log` is capped at the source with `-n maxCommits + 1`. */
export const maxCommits = 100;

/** File-list bound applied to the parsed numstat entries. */
export const maxFiles = 200;

/** Parse `git log --oneline --no-decorate` output into sha/subject pairs. */
export function parseOnelineLog(log: string): { sha: string; subject: string }[] {
  return log
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const spaceAt = line.indexOf(" ");
      if (spaceAt === -1) return { sha: line, subject: "" };
      return { sha: line.slice(0, spaceAt), subject: line.slice(spaceAt + 1) };
    });
}

/** Full SHAs `git cherry` marked `-` (an equivalent patch already exists upstream). */
export function parseCherryUpstream(cherry: string): string[] {
  return cherry
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

/**
 * Stale-merged per the digest-branch-diff rules: at least one cherry line and
 * every line `-` means all work already landed upstream (rebase/squash merge);
 * empty output means the branch is level; any `+` line is genuine unmerged work.
 */
export function deriveIsStaleMerged(cherry: string): boolean {
  const lines = cherry.split("\n").filter((line) => line.trim() !== "");
  return lines.length > 0 && lines.every((line) => line.startsWith("-"));
}

/** Parse `git diff --numstat` lines (`added<TAB>deleted<TAB>path`); `-` counts mean binary. */
export function parseNumstat(numstat: string): BranchFile[] {
  return numstat
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const [added, deleted, ...pathParts] = line.split("\t");
      return {
        path: pathParts.join("\t"),
        additions: added === "-" ? null : Number.parseInt(added, 10),
        deletions: deleted === "-" ? null : Number.parseInt(deleted, 10),
      };
    });
}

/**
 * Assemble the digest from raw read results. Independent reads degrade
 * independently: a failed `cherry` read nulls only `isStaleMerged`, a failed
 * `rev-list` read nulls only `baseAhead`, and the commit/file lists keep
 * whatever loaded.
 */
export function buildBranchDigest(reads: GitReadResults): BranchDigest {
  const upstreamShas = reads.cherry === null ? [] : parseCherryUpstream(reads.cherry);
  const allCommits = reads.log === null ? [] : parseOnelineLog(reads.log);
  const commits = allCommits.slice(0, maxCommits).map(({ sha, subject }) => ({
    sha,
    subject,
    upstream: upstreamShas.some((full) => full.startsWith(sha)),
  }));

  const allFiles = reads.numstat === null ? [] : parseNumstat(reads.numstat);
  const files = allFiles.slice(0, maxFiles);

  const parsedBaseAhead =
    reads.baseAhead === null ? Number.NaN : Number.parseInt(reads.baseAhead.trim(), 10);

  return {
    branch: reads.branch?.trim() ?? "",
    isWorktree:
      reads.gitDir !== null &&
      reads.gitCommonDir !== null &&
      reads.gitDir.trim() !== reads.gitCommonDir.trim(),
    commits,
    files,
    isStaleMerged: reads.cherry === null ? null : deriveIsStaleMerged(reads.cherry),
    baseAhead: Number.isNaN(parsedBaseAhead) ? null : parsedBaseAhead,
    truncated: allCommits.length > maxCommits || allFiles.length > maxFiles,
    digestError: null,
  };
}
