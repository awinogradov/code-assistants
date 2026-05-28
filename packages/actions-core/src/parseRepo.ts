/**
 * Split an `owner/repo` slug into its parts, throwing on malformed input.
 *
 * Centralizes the `REPO.split("/")` + validation pattern that GitHub Actions in
 * this repository repeat when reading the `REPO`/`GITHUB_REPOSITORY` environment
 * variable.
 *
 * @example
 *   const { owner, repo } = parseRepo("awinogradov/code-assistants");
 */

/** A parsed `owner/repo` pair. */
export interface Repo {
  owner: string;
  repo: string;
}

export function parseRepo(repository: string): Repo {
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid REPO format: ${repository}. Expected owner/repo`);
  }

  return { owner, repo };
}
