/**
 * Prepare repository for release: ensure .gitignore entries and update version files.
 *
 * Combines two pre-release operations:
 * 1. Ensure `.release_bot` is in `.gitignore`
 * 2. Update version across package managers (package.json, pyproject.toml, plugin.json)
 *
 * @example
 * ```bash
 * # Ensure .gitignore entry only
 * bun src/prepareRelease.ts --ensure-gitignore
 *
 * # Update version files only
 * bun src/prepareRelease.ts --update-version 1.2.3
 * ```
 */
import { $, Glob } from "bun";
import { parse } from "smol-toml";

/**
 * Ensure an entry exists in `.gitignore`, creating the file if needed.
 *
 * @param entry - Line to ensure exists in .gitignore
 * @param cwd - Working directory (default: process.cwd())
 * @returns true if entry was added, false if already present
 */
export async function ensureGitignoreEntry(entry: string, cwd = process.cwd()): Promise<boolean> {
  const gitignorePath = `${cwd}/.gitignore`;
  const file = Bun.file(gitignorePath);

  if (await file.exists()) {
    const content = await file.text();
    const lines = content.split("\n");
    if (lines.some((line) => line.trim() === entry)) {
      return false;
    }
    await Bun.write(gitignorePath, `${content.trimEnd()}\n${entry}\n`);
  } else {
    await Bun.write(gitignorePath, `${entry}\n`);
  }

  return true;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Update the project's own version in a uv.lock file without resolving dependencies.
 *
 * Uses smol-toml to parse and identify the project's package entry
 * (source.virtual or source.editable = "."), then does a targeted string
 * replacement to preserve formatting.
 *
 * @param lockContent - Raw uv.lock file content
 * @param version - New version string
 * @returns Modified lock content, or original if no change needed
 */
export function updateUvLockVersion(lockContent: string, version: string): string {
  const parsed = parse(lockContent);
  const packages = parsed.package as Array<Record<string, unknown>> | undefined;
  if (!packages) return lockContent;

  // Match the project's own package — its source points at the repo root (".").
  // Other workspace members may also use `virtual`/`editable` with different paths.
  const projectPkg = packages.find((pkg) => {
    const source = pkg.source as Record<string, unknown> | undefined;
    return source && (source.virtual === "." || source.editable === ".");
  });
  if (!projectPkg || projectPkg.version === version) return lockContent;

  const oldVersion = projectPkg.version as string;
  const projectName = projectPkg.name as string;

  const blockPattern = new RegExp(
    `(\\[\\[package\\]\\]\\s*\\nname\\s*=\\s*"${escapeRegExp(projectName)}"\\s*\\n)version\\s*=\\s*"${escapeRegExp(oldVersion)}"`,
    "m"
  );
  return lockContent.replace(blockPattern, `$1version = "${version}"`);
}

/**
 * Update version string across all detected package manager files.
 *
 * Supports:
 * - `package.json` — JSON field update
 * - `pyproject.toml` — regex replacement
 * - `**\/.claude-plugin/plugin.json` — JSON field update via glob
 *
 * @param version - New version string (e.g. "1.2.3")
 * @param cwd - Working directory (default: process.cwd())
 * @returns List of updated file paths (relative to cwd)
 */
export async function updateVersionFiles(version: string, cwd = process.cwd()): Promise<string[]> {
  const updated: string[] = [];

  // package.json
  const pkgPath = `${cwd}/package.json`;
  const pkgFile = Bun.file(pkgPath);
  if (await pkgFile.exists()) {
    const pkg = (await pkgFile.json()) as Record<string, unknown>;
    const updatedPkg = { ...pkg, version };
    await Bun.write(pkgPath, `${JSON.stringify(updatedPkg, null, 2)}\n`);
    updated.push("package.json");
  }

  // pyproject.toml — scoped to [project] section so unrelated `version` keys
  // in other tables (e.g., [tool.uv.workspace], dependency declarations) are untouched
  const pyPath = `${cwd}/pyproject.toml`;
  const pyFile = Bun.file(pyPath);
  if (await pyFile.exists()) {
    const content = await pyFile.text();
    const newContent = content.replace(
      /(^\[project\][\s\S]*?^)version\s*=\s*"[^"]*"/m,
      `$1version = "${version}"`
    );
    if (newContent !== content) {
      await Bun.write(pyPath, newContent);
      updated.push("pyproject.toml");
    }
  }

  // uv.lock — update project version without resolving dependencies
  const uvLockPath = `${cwd}/uv.lock`;
  const uvLockFile = Bun.file(uvLockPath);
  if ((await uvLockFile.exists()) && updated.includes("pyproject.toml")) {
    const lockContent = await uvLockFile.text();
    const newLockContent = updateUvLockVersion(lockContent, version);
    if (newLockContent !== lockContent) {
      await Bun.write(uvLockPath, newLockContent);
      updated.push("uv.lock");
    }
  }

  // plugin.json files
  const glob = new Glob("**/.claude-plugin/plugin.json");
  for await (const match of glob.scan({ cwd, dot: true, absolute: false })) {
    if (match.includes("node_modules")) continue;
    const pluginPath = `${cwd}/${match}`;
    const plugin = (await Bun.file(pluginPath).json()) as Record<string, unknown>;
    const updatedPlugin = { ...plugin, version };
    await Bun.write(pluginPath, `${JSON.stringify(updatedPlugin, null, 2)}\n`);
    updated.push(match);
    console.log(`Updated ${match} to ${version}`);
  }

  return updated;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--ensure-gitignore")) {
    const added = await ensureGitignoreEntry(".release_bot");
    if (added) {
      console.log("Added .release_bot to .gitignore");
      // Commit the .gitignore change separately so it doesn't get folded into
      // the release commit. Uses --no-verify because pre-commit hooks are
      // irrelevant for this change.
      await $`git add .gitignore`.quiet();
      await $`git commit -n -m "chore: add .release_bot to .gitignore"`.quiet();
    } else {
      console.log(".release_bot already in .gitignore");
    }
  }

  const versionIndex = args.indexOf("--update-version");
  if (versionIndex !== -1) {
    const version = args[versionIndex + 1];
    if (!version) {
      console.log("::error::--update-version requires a version argument");
      process.exit(1);
    }
    const files = await updateVersionFiles(version);
    for (const file of files) {
      console.log(`Updated ${file} to ${version}`);
    }
  }
}

if (import.meta.main) {
  main().catch((error: Error) => {
    console.log(`::error::${error.message}`);
    process.exit(1);
  });
}
