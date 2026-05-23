/**
 * Monorepo entry point invoked by `action.yml` when discovery resolves to
 * monorepo mode. For each release-eligible member, runs the create or publish
 * flow inside that member's directory.
 *
 * Standalone repositories never reach this script — `action.yml` gates this
 * step on `steps.detect.outputs.mode == 'monorepo'`.
 *
 * @example
 * ```bash
 * # Driven by action.yml (with INPUT_BRANCH etc. exported)
 * bun src/run.ts --mode=create
 * bun src/run.ts --mode=publish
 * ```
 */
import { appendFile } from "node:fs/promises";

import { $ } from "bun";

import { discoverMembers } from "./monorepo/discoverMembers.ts";
import { memberMajorTag, memberVersionTag } from "./monorepo/memberTags.ts";
import {
  emitMemberArtifacts,
  runCreate,
  type MemberRelease,
} from "./monorepo/runCreate.ts";
import {
  readChangedFiles,
  resolvePublishPlan,
} from "./monorepo/runPublish.ts";
import { ensureGitignoreEntry } from "./prepareRelease.ts";
import { postReleaseNotification } from "./slackNotify.ts";

type Mode = "create" | "publish";

function parseMode(args: readonly string[]): Mode {
  const arg = args.find((value) => value.startsWith("--mode="));
  const mode = arg?.slice("--mode=".length);
  if (mode !== "create" && mode !== "publish") {
    throw new Error(`run.ts requires --mode=create|publish; got '${mode ?? "none"}'`);
  }
  return mode;
}

async function writeGithubOutput(line: string): Promise<void> {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  await appendFile(outputPath, `${line}\n`);
}

async function ensureLabel(label: string, description: string): Promise<void> {
  await $`gh label create ${label} --color 85e131 --description ${description}`
    .quiet()
    .nothrow();
}

async function openOrUpdatePr(
  release: MemberRelease,
  cwd: string,
): Promise<string> {
  const label = `release-${release.member.name}`;
  await ensureLabel(label, `Release PR for ${release.member.name}`);

  const bodyFile = `${release.member.relPath}/.release_bot/body_enhanced`;
  const title = `Release ${release.member.name} ${release.newVersion}`;

  const existing = await $`gh pr view --head ${release.branch} --json url -q .url`
    .cwd(cwd)
    .quiet()
    .nothrow();
  if (existing.exitCode === 0 && existing.stdout.toString().trim()) {
    await $`gh pr edit --title ${title} --body-file ${bodyFile}`
      .cwd(cwd)
      .quiet();
    return existing.stdout.toString().trim();
  }

  const created = await $`gh pr create --head ${release.branch} --title ${title} --label ${label} -F ${bodyFile}`
    .cwd(cwd)
    .quiet();
  return created.stdout.toString().trim();
}

async function runMonorepoCreate(cwd: string): Promise<void> {
  await ensureGitignoreEntry(".release_bot", cwd);
  const branchTemplate = process.env.INPUT_BRANCH ?? "release-{member}-{version}";
  const result = await runCreate({ cwd, branchTemplate });

  if (result.releases.length === 0) {
    console.log("No members need releasing.");
    await writeGithubOutput("released-count=0");
    return;
  }

  const releasedNames: string[] = [];
  for (const release of result.releases) {
    // Reset to origin/main BEFORE emitting artifacts so the working tree is
    // clean of prior members' files. Emit, then commit + push the per-member
    // diff onto the fresh branch.
    await $`git fetch origin main`.cwd(cwd).quiet().nothrow();
    await $`git checkout -B ${release.branch} origin/main`.cwd(cwd).quiet();
    await emitMemberArtifacts({ release, cwd });
    await $`git add ${release.member.relPath}`.cwd(cwd).quiet();
    await $`git commit -n -m ${`chore: release ${release.member.name} ${release.newVersion}`}`
      .cwd(cwd)
      .quiet();
    await $`git push --no-verify --force origin ${release.branch}`.cwd(cwd).quiet();
    const url = await openOrUpdatePr(release, cwd);
    console.log(`::notice title=Release ${release.member.name} ${release.newVersion}::${url}`);
    releasedNames.push(`${release.member.name}@${release.newVersion}`);
  }

  await writeGithubOutput(`released-count=${result.releases.length}`);
  await writeGithubOutput(`released=${releasedNames.join(",")}`);
}

async function runMonorepoPublish(cwd: string): Promise<void> {
  const discovery = await discoverMembers(cwd);
  if (discovery.mode !== "monorepo") {
    throw new Error("Publish invoked without monorepo discovery — check action.yml gating");
  }

  // The PR file list is supplied via gh pr view in the workflow shell; the
  // resolver supports either a `changedFiles` override (passed via env) or
  // GITHUB_EVENT_PATH discovery. Read the env override here.
  const overrideFiles = process.env.PR_CHANGED_FILES;
  const changedFiles = overrideFiles
    ? overrideFiles.split("\n").map((line) => line.trim()).filter(Boolean)
    : await readChangedFiles({ cwd });

  const plan = await resolvePublishPlan({ cwd, changedFiles });

  if (plan.publishToNpm) {
    const npmToken = process.env.NPM_TOKEN ?? "";
    if (!npmToken) {
      throw new Error("NPM_TOKEN required to publish lib-nodejs/lib-bun member");
    }
    await $`bun install`.cwd(plan.member.path).quiet();
    await $`npm config set //registry.npmjs.org/:_authToken ${npmToken}`.quiet();
    await $`npm publish`.cwd(plan.member.path);
  }

  await $`git tag ${plan.versionTag}`.cwd(cwd).quiet();
  await $`git push --no-verify origin ${plan.versionTag}`.cwd(cwd).quiet();
  console.log(`Created and pushed tag ${plan.versionTag}`);

  if (plan.majorTag) {
    await $`git tag -fa ${plan.majorTag} -m ${`Update ${plan.majorTag} tag`}`.cwd(cwd).quiet();
    await $`git push origin ${plan.majorTag} --force`.cwd(cwd).quiet();
    console.log(`Updated major version tag ${plan.majorTag}`);
  }

  const notesFile = `${plan.member.relPath}/.release_notes/${plan.version}.md`;
  const releaseTitle = `Release ${plan.member.name} ${plan.version}`;
  await $`gh release create ${plan.versionTag} --title ${releaseTitle} -F ${notesFile}`
    .cwd(cwd)
    .quiet();
  console.log(`Created GitHub release ${releaseTitle} (${plan.versionTag})`);

  if (plan.slackChannel) {
    try {
      await postReleaseNotification({
        cwd: plan.member.path,
        releaseTag: plan.versionTag,
        displayName: plan.member.name,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`::warning::Slack notification failed: ${message}`);
    }
  }

  await writeGithubOutput(`released-member=${plan.member.name}`);
  await writeGithubOutput(`released-version=${plan.version}`);
  await writeGithubOutput(`released-tag=${plan.versionTag}`);
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const cwd = process.cwd();

  const discovery = await discoverMembers(cwd);
  if (discovery.mode !== "monorepo") {
    console.log(`Standalone mode detected — run.ts is a no-op; action.yml drives the flow.`);
    return;
  }

  if (mode === "create") {
    await runMonorepoCreate(cwd);
  } else {
    await runMonorepoPublish(cwd);
  }
}

if (import.meta.main) {
  await main();
}

// Re-exports for downstream tooling
export { memberVersionTag, memberMajorTag };
