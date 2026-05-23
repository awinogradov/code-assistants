/**
 * Entry script invoked by `release-action`'s `Detect release type` step.
 *
 * Reads the consumer repo's `package.json`, validates the top-level
 * `release` field via {@link readReleaseField}, and emits the result on the
 * `type` output channel (`$GITHUB_OUTPUT`).
 *
 * @see ../../../../docs/release-field.md
 *
 * @example
 * ```bash
 * # Inside action.yml
 * bun "${{ github.action_path }}/src/detectReleaseType.ts"
 * ```
 */
import { appendFile } from "node:fs/promises";

import { discoverMembers } from "./monorepo/discoverMembers.ts";
import { readReleaseField } from "./releaseField.ts";

const DOCS_LINK = "docs/release-field.md";
const PACKAGE_JSON = "package.json";

async function readPackageJson(): Promise<unknown> {
  const file = Bun.file(PACKAGE_JSON);

  if (!(await file.exists())) {
    throw new Error(`${PACKAGE_JSON} not found in the working directory. See ${DOCS_LINK}.`);
  }

  try {
    return await file.json();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${PACKAGE_JSON}: ${detail}. See ${DOCS_LINK}.`, {
      cause: error,
    });
  }
}

async function writeGithubOutput(line: string): Promise<void> {
  const outputPath = process.env.GITHUB_OUTPUT;

  if (!outputPath) {
    return;
  }

  await appendFile(outputPath, `${line}\n`);
}

async function main(): Promise<void> {
  const discovery = await discoverMembers(process.cwd());

  if (discovery.mode === "monorepo") {
    await writeGithubOutput("mode=monorepo");
    await writeGithubOutput(`type=monorepo`);
    console.log(`Detected monorepo with ${discovery.members.length} member(s)`);
    return;
  }

  // Standalone fallback — preserve the pre-monorepo contract by emitting the
  // release.type so action.yml's existing publish steps continue to work.
  const pkg = await readPackageJson();
  const { type } = readReleaseField(pkg);
  await writeGithubOutput("mode=standalone");
  await writeGithubOutput(`type=${type}`);
  console.log(`Detected release type: ${type}`);
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`::error::${message}`);
  process.exitCode = 1;
}
