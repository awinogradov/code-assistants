/**
 * Executes the `Validate no base-branch merges` step of contributing-check
 * against real git history, instead of asserting that its text exists.
 *
 * Presence is already covered by gitHistoryPolicy.test.ts. What that cannot see
 * is whether the predicate is right, and the predicate is the whole risk: the
 * step ships to every repository consuming the action at `@main` and fails a
 * required check, so a rule that is too broad breaks pull requests that never
 * violated anything. The issue asks for exactly this distinction — reject merge
 * commits the pull request introduces, without flagging merge commits inherited
 * from the base branch — and only running it can show which side each case
 * lands on.
 *
 * The script is extracted from action.yml rather than restated here, so the YAML
 * stays the single source: an edit to the step is exercised by these cases on the
 * next run.
 *
 * Vacuous-pass defence: the extracted script must be non-empty, above a minimum
 * length, and contain the `git rev-list --merges` call, so a renamed step or a
 * changed block scalar cannot extract "" and "pass" every case.
 */
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, test } from "bun:test";

const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");
const contributingCheckPath = join(repoRoot, ".github/actions/contributing-check/action.yml");

/** Shortest the real script can be; anything smaller means the extraction went wrong. */
const minScriptLength = 200;

/** Deterministic identity and no global config, so the host's git setup cannot leak in. */
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Guard Test",
  GIT_AUTHOR_EMAIL: "guard@example.com",
  GIT_COMMITTER_NAME: "Guard Test",
  GIT_COMMITTER_EMAIL: "guard@example.com",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

/** The `run: |` body of a named step, dedented back to column zero. */
function extractRunScript(actionYml: string, stepName: string): string | null {
  const marker = `    - name: ${stepName}\n`;
  const stepStart = actionYml.indexOf(marker);
  if (stepStart === -1) return null;
  const runMarker = "\n      run: |\n";
  const runStart = actionYml.indexOf(runMarker, stepStart);
  if (runStart === -1) return null;
  const lines: string[] = [];
  for (const line of actionYml.slice(runStart + runMarker.length).split("\n")) {
    if (line.trim() !== "" && !line.startsWith("        ")) break;
    lines.push(line.slice(8));
  }
  return lines.join("\n");
}

const script = extractRunScript(
  await readFile(contributingCheckPath, "utf8"),
  "Validate no base-branch merges",
);

const scratchDirs: string[] = [];

afterAll(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env: gitEnv, encoding: "utf8" });
}

/** One file per commit — a shared file would make the merge cases conflict. */
async function commit(cwd: string, message: string): Promise<string> {
  const name = message.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  await writeFile(join(cwd, `${name}.txt`), `${message}\n`);
  git(cwd, "add", "-A");
  git(cwd, "commit", "-m", message);
  return git(cwd, "rev-parse", "HEAD").trim();
}

/** A `base` repository holding `main` plus a clone of it in `work`. */
async function scratch(): Promise<{ base: string; work: string }> {
  const dir = await mkdtemp(join(tmpdir(), "merge-guard-"));
  scratchDirs.push(dir);
  const base = join(dir, "base");
  await mkdir(base);
  git(base, "init", "-q", "-b", "main");
  await commit(base, "A: initial");
  return { base, work: join(dir, "work") };
}

function clone(base: string, work: string): void {
  execFileSync("git", ["clone", "-q", base, work], { env: gitEnv, encoding: "utf8" });
}

function runGuard(cwd: string, headSha: string): { code: number; output: string } {
  try {
    const stdout = execFileSync("bash", ["-c", script!], {
      cwd,
      env: { ...gitEnv, BASE_REF: "main", HEAD_SHA: headSha },
      encoding: "utf8",
    });
    return { code: 0, output: stdout };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };
    return { code: failure.status, output: `${failure.stdout}${failure.stderr}` };
  }
}

describe("extraction", () => {
  test("the step's script is extractable and substantial", () => {
    expect(script).not.toBeNull();
    expect(script!.length).toBeGreaterThan(minScriptLength);
    expect(script).toContain("git rev-list --merges");
  });
});

describe("Validate no base-branch merges", () => {
  test("passes a branch rebased onto an advanced main", async () => {
    const { base, work } = await scratch();
    clone(base, work);
    await commit(base, "B: main moves on");
    git(work, "fetch", "-q", "origin");
    git(work, "checkout", "-q", "-b", "topic", "origin/main");
    const head = await commit(work, "T1: the actual task");

    const { code, output } = runGuard(work, head);
    expect(`${code}: ${output.trim()}`).toBe(`0: contributing-check: no base-branch merges since ${git(work, "rev-parse", "origin/main").trim()}`);
  });

  test("fails a branch that merged the base branch, naming the commit", async () => {
    const { base, work } = await scratch();
    clone(base, work);
    git(work, "checkout", "-q", "-b", "topic");
    await commit(work, "T1: the actual task");
    await commit(base, "B: main moves on");
    git(work, "fetch", "-q", "origin");
    git(work, "merge", "-q", "--no-ff", "origin/main", "-m", "Merge branch main into topic");
    const head = git(work, "rev-parse", "HEAD").trim();

    const { code, output } = runGuard(work, head);
    expect(code).toBe(1);
    expect(output).toContain("Pull request merges the base branch into its head branch");
    expect(output).toContain(head.slice(0, 7));
  });

  test("passes when the merge commit was inherited from base history", async () => {
    const { base, work } = await scratch();
    git(base, "checkout", "-q", "-b", "feature");
    await commit(base, "F1: someone else's work");
    git(base, "checkout", "-q", "main");
    git(base, "merge", "-q", "--no-ff", "feature", "-m", "Merge feature into main");
    clone(base, work);
    git(work, "checkout", "-q", "-b", "topic");
    const head = await commit(work, "T1: the actual task");

    const { code } = runGuard(work, head);
    expect(code).toBe(0);
  });

  test("passes a branch that merged another topic branch", async () => {
    const { base, work } = await scratch();
    clone(base, work);
    git(work, "checkout", "-q", "-b", "side");
    await commit(work, "S1: stacked work");
    git(work, "checkout", "-q", "-b", "topic", "main");
    await commit(work, "T1: the actual task");
    git(work, "merge", "-q", "--no-ff", "side", "-m", "Merge side into topic");
    const head = git(work, "rev-parse", "HEAD").trim();

    const { code } = runGuard(work, head);
    expect(code).toBe(0);
  });
});
