/**
 * Update the release badge in README.md with the current version.
 *
 * Handles three cases:
 * 1. Existing badge — updates the version number in-place
 * 2. README with `# ` header — inserts badges after the first header
 * 3. README without header — prepends badges to the file
 *
 * Exits silently if README.md does not exist.
 *
 * @example
 * ```bash
 * GITHUB_SERVER_URL=https://github.com GITHUB_REPOSITORY=owner/repo \
 *   bun src/updateReleaseBadge.ts
 * ```
 */

/**
 * Update or insert release badge in README content.
 *
 * @param readme - Current README.md content
 * @param version - Release version (e.g. "1.2.3")
 * @param serverUrl - GitHub server URL (e.g. "https://github.com")
 * @param repo - GitHub repository (e.g. "owner/repo")
 * @returns Updated README content
 */
export function updateReleaseBadge(
  readme: string,
  version: string,
  serverUrl: string,
  repo: string
): string {
  const releaseBadge = `[![GitHub Release](https://img.shields.io/badge/release-v${version}-blue)](${serverUrl}/${repo}/releases/latest)`;
  const createBadge = `[![Create Release](https://img.shields.io/badge/Create-Release-blue?logo=github)](${serverUrl}/${repo}/actions/workflows/release_create.yml)`;

  // Case 1: Existing badge — update version in-place
  if (readme.includes("img.shields.io/badge/release-v")) {
    return readme.replace(/release-v[\d.]*-blue/g, `release-v${version}-blue`);
  }

  const lines = readme.split("\n");

  // Case 2: Insert after first # header
  const headerIndex = lines.findIndex((l) => l.startsWith("# "));
  if (headerIndex !== -1) {
    return [
      ...lines.slice(0, headerIndex + 1),
      "",
      releaseBadge,
      createBadge,
      ...lines.slice(headerIndex + 1),
    ].join("\n");
  }

  // Case 3: Prepend to file
  return `${releaseBadge}\n${createBadge}\n\n${readme}`;
}

/**
 * Update the README badge in-place for the given working directory.
 * No-ops when `<cwd>/README.md` does not exist.
 *
 * @param cwd - Member directory (defaults to `process.cwd()`).
 */
export async function refreshReleaseBadge(cwd: string = process.cwd()): Promise<void> {
  const { join } = await import("node:path");
  const readmePath = join(cwd, "README.md");
  const versionPath = join(cwd, "version");
  const readmeFile = Bun.file(readmePath);

  if (!(await readmeFile.exists())) {
    return;
  }

  const version = (await Bun.file(versionPath).text()).trim();
  const serverUrl = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  const repo = process.env.GITHUB_REPOSITORY ?? "";

  const readme = await readmeFile.text();
  const updated = updateReleaseBadge(readme, version, serverUrl, repo);

  if (updated !== readme) {
    await Bun.write(readmePath, updated);
    console.log(`Updated release badge to v${version}`);
  }
}

if (import.meta.main) {
  refreshReleaseBadge().catch((error: Error) => {
    console.log(`::error::${error.message}`);
    process.exit(1);
  });
}
