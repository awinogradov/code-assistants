/**
 * Update the release badge in README.md with the current version.
 *
 * Handles three cases:
 * 1. Existing badge — updates the version number and the Create-Release
 *    workflow target in-place
 * 2. README with `# ` header — inserts badges after the first header
 * 3. README without header — prepends badges to the file
 *
 * Exits silently if README.md does not exist.
 *
 * @example
 * ```bash
 * GITHUB_SERVER_URL=https://github.com GITHUB_REPOSITORY=owner/repo \
 *   GITHUB_WORKFLOW_REF=owner/repo/.github/workflows/release-create.yml@refs/heads/main \
 *   bun src/updateReleaseBadge.ts
 * ```
 */

/** Workflow file the Create-Release badge targets when the running ref is unknown. */
const fallbackWorkflowFile = "release_create.yml";

/** Matches the Create-Release badge so its target can be refreshed without touching other shields. */
const createBadgePattern = /\[!\[Create Release\]\([^)]*\)\]\([^)]*\)/;

/**
 * Derive the running workflow's file name from a `GITHUB_WORKFLOW_REF` value
 * (`owner/repo/.github/workflows/<file>@<ref>`). Falls back to
 * `release_create.yml` when the variable is unset or does not yield a plain
 * `.yml`/`.yaml` file name.
 *
 * @see https://docs.github.com/actions/learn-github-actions/variables#default-environment-variables
 */
export function releaseWorkflowFile(workflowRef = process.env.GITHUB_WORKFLOW_REF): string {
  const marker = "/.github/workflows/";
  const start = workflowRef?.indexOf(marker) ?? -1;
  if (start === -1 || !workflowRef) return fallbackWorkflowFile;

  // A workflow file name cannot contain `@` but a ref can (e.g. a branch named
  // `feat@2`), so the first `@` is the boundary — trimming from the last one
  // would swallow the extension.
  const tail = workflowRef.slice(start + marker.length);
  const at = tail.indexOf("@");
  const file = at === -1 ? tail : tail.slice(0, at);

  return /^[\w.-]+\.ya?ml$/.test(file) ? file : fallbackWorkflowFile;
}

/**
 * Update or insert release badge in README content.
 *
 * @param readme - Current README.md content
 * @param version - Release version (e.g. "1.2.3")
 * @param serverUrl - GitHub server URL (e.g. "https://github.com")
 * @param repo - GitHub repository (e.g. "owner/repo")
 * @param workflowFile - Create-Release workflow file name
 * @returns Updated README content
 */
export function updateReleaseBadge(
  readme: string,
  version: string,
  serverUrl: string,
  repo: string,
  workflowFile: string = fallbackWorkflowFile,
): string {
  const releaseBadge = `[![GitHub Release](https://img.shields.io/badge/release-v${version}-blue)](${serverUrl}/${repo}/releases/latest)`;
  const createBadge = `[![Create Release](https://img.shields.io/badge/Create-Release-blue?logo=github)](${serverUrl}/${repo}/actions/workflows/${workflowFile})`;

  // Case 1: Existing badge — update version and the Create-Release target
  // in-place. Refreshing the target is what reaches a README whose badges were
  // written against a differently-named workflow.
  if (readme.includes("img.shields.io/badge/release-v")) {
    return readme
      .replace(/release-v[\d.]*-blue/g, `release-v${version}-blue`)
      .replace(createBadgePattern, createBadge);
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
 * Update the README badge in-place for the given working directory, targeting
 * the workflow named by `GITHUB_WORKFLOW_REF`. No-ops when `<cwd>/README.md`
 * does not exist.
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
  const workflowFile = releaseWorkflowFile();

  if (workflowFile === fallbackWorkflowFile) {
    console.log(
      `::warning::Could not derive the release workflow file; badge links to ${workflowFile}`,
    );
  }

  const readme = await readmeFile.text();
  const updated = updateReleaseBadge(readme, version, serverUrl, repo, workflowFile);

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
