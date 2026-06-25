/**
 * GitHub I/O for the auto-label action, behind a small interface so the two modes
 * (labelPr, pruneLabels) are unit-testable with a fake. The concrete implementation
 * wraps `@octokit/rest` and reuses actions-core's `fetchRawContent` (which returns
 * `null` on 404) to read `package.json` at a ref — no checkout or `git` required.
 *
 * @example
 *   const api = createGitHubApi(new Octokit({ auth: token }), owner, repo);
 *   const pkg = await api.readPackageJson(".github/actions/files-sync", headSha);
 */
import { Octokit } from "@octokit/rest";

import { fetchRawContent } from "@code-assistants/actions-core/fetchRawContent";

import { parsePnpmPackages, type PackageJson } from "./enumerateWorkspaces.ts";

/** A file changed by a pull request, with its pre-rename path when applicable. */
export interface ChangedFile {
  filename: string;
  previousFilename: string | null;
}

/** Fields needed to create a repository label. */
export interface LabelSpec {
  name: string;
  color: string;
  description: string;
}

/** The GitHub operations the modes depend on — injected so logic is testable without a network. */
export interface GitHubApi {
  /** Parse the `package.json` inside `dir` at `ref` (`""`/`"."` → repo-root manifest). `null` when absent. */
  readPackageJson(dir: string, ref: string): Promise<PackageJson | null>;
  /** Workspace globs from the root `pnpm-workspace.yaml` `packages:` at `ref`; `null` when the file is absent. */
  readPnpmWorkspaces(ref: string): Promise<string[] | null>;
  /** Immediate child directory names of `parent` at `ref` (empty when the path is missing). */
  listSubdirs(parent: string, ref: string): Promise<string[]>;
  /** Files changed by the PR, including pre-rename paths. */
  listChangedFiles(prNumber: number): Promise<ChangedFile[]>;
  /** Label names currently on the PR. */
  listPrLabels(prNumber: number): Promise<string[]>;
  /** All label names defined in the repository. */
  listRepoLabels(): Promise<string[]>;
  /** Create the label; idempotent (an already-existing label is ignored). */
  ensureLabel(spec: LabelSpec): Promise<void>;
  addLabels(prNumber: number, names: string[]): Promise<void>;
  removeLabel(prNumber: number, name: string): Promise<void>;
  deleteLabel(name: string): Promise<void>;
}

function packageJsonPath(dir: string): string {
  return dir === "" || dir === "." ? "package.json" : `${dir}/package.json`;
}

function statusOf(error: unknown): number | undefined {
  return (error as { status?: number }).status;
}

/** Builds the production {@link GitHubApi} backed by `@octokit/rest`. */
export function createGitHubApi(octokit: Octokit, owner: string, repo: string): GitHubApi {
  return {
    async readPackageJson(dir, ref) {
      const raw = await fetchRawContent({ octokit, owner, repo, path: packageJsonPath(dir), ref });
      return raw === null ? null : (JSON.parse(raw) as PackageJson);
    },

    async readPnpmWorkspaces(ref) {
      const raw = await fetchRawContent({ octokit, owner, repo, path: "pnpm-workspace.yaml", ref });
      return raw === null ? null : parsePnpmPackages(raw);
    },

    async listSubdirs(parent, ref) {
      try {
        const { data } = await octokit.rest.repos.getContent({ owner, repo, path: parent, ref });
        if (!Array.isArray(data)) {
          return [];
        }
        return data.filter((entry) => entry.type === "dir").map((entry) => entry.name);
      } catch (error) {
        if (statusOf(error) === 404) {
          return [];
        }
        throw error;
      }
    },

    async listChangedFiles(prNumber) {
      const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      });
      return files.map((file) => ({
        filename: file.filename,
        previousFilename: file.previous_filename ?? null,
      }));
    },

    async listPrLabels(prNumber) {
      const labels = await octokit.paginate(octokit.rest.issues.listLabelsOnIssue, {
        owner,
        repo,
        issue_number: prNumber,
        per_page: 100,
      });
      return labels.map((label) => label.name);
    },

    async listRepoLabels() {
      const labels = await octokit.paginate(octokit.rest.issues.listLabelsForRepo, {
        owner,
        repo,
        per_page: 100,
      });
      return labels.map((label) => label.name);
    },

    async ensureLabel({ name, color, description }) {
      try {
        await octokit.rest.issues.createLabel({ owner, repo, name, color, description });
      } catch (error) {
        // 422 = label already exists; any other status is a real failure.
        if (statusOf(error) !== 422) {
          throw error;
        }
      }
    },

    async addLabels(prNumber, names) {
      if (names.length === 0) {
        return;
      }
      await octokit.rest.issues.addLabels({ owner, repo, issue_number: prNumber, labels: names });
    },

    async removeLabel(prNumber, name) {
      await octokit.rest.issues.removeLabel({ owner, repo, issue_number: prNumber, name });
    },

    async deleteLabel(name) {
      await octokit.rest.issues.deleteLabel({ owner, repo, name });
    },
  };
}
