/**
 * Guards the git history policy across every encoding it has: the canonical
 * shared block, the human-facing CONTRIBUTING.md section, the four generated
 * rules/*.md files that sync downstream as AGENTS.md, the pr-review check that
 * reports the same condition, and the CI step that fails it.
 *
 * The rule exists because an agent merged origin/main into a narrow feature
 * branch to refresh a stale pull_request event, pulling 17 unrelated files into
 * the diff. Prose alone did not stop it, so the block carries an executable
 * forbidden-command regex and this test exercises it — a rule an agent has to
 * interpret is a rule that gets interpreted away.
 *
 * What this CANNOT prove: that a skill actually read the block before running a
 * command. CI sees text in a file, nothing more — the same limit
 * sharedRulesInvocation.test.ts states for its own presence guard. What it can
 * prove is that the pattern rejects the commands the policy names, that every
 * restatement still carries the block's own prohibition sentence, and that the
 * CI step exists with the dependabot guard the action's own comment demands.
 * Whether the CI predicate is correct is mergeCommitGuard.test.ts's job.
 *
 * Vacuous-pass defences: the extracted regex and the extracted prohibition
 * sentence must each be non-empty and above a minimum length, so a reworded
 * heading or a dropped fence cannot extract "" and match everything.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");
const skillsDir = join(repoRoot, "claude-plugins/autopilot/skills");
const blockPath = join(skillsDir, "shared-rules/references/git-history-policy.md");
const contributingPath = join(repoRoot, "CONTRIBUTING.md");
const contributingCheckPath = join(repoRoot, ".github/actions/contributing-check/action.yml");
const hygienePath = join(skillsDir, "pr-review/references/checks-pr-hygiene.md");
const reviewSkillPath = join(skillsDir, "pr-review/SKILL.md");

/** Shortest a real extraction can be; anything smaller means it went wrong. */
const minExtractionLength = 40;

/** The four generated rule files, all synced downstream as AGENTS.md. */
const ruleFiles = [
  "Bun.md",
  "Bun+React+Tailwind.md",
  "NodeJS+React.md",
  "NodeJS+React+Tailwind.md",
];

/** Skills that run a push or a history-changing command and must load the block. */
const consumingSkills = ["preflight-check", "commits-restructure", "pr-monitor", "pr-resolve"];

/** Commands the policy names as forbidden; the regex must match every one. */
const forbiddenCommands = [
  "git merge main",
  "git merge origin/main",
  "git merge --no-ff origin/main",
  "git pull origin main",
  "git push --force",
  "git push -f origin issue-592-forbid-base-merges",
];

/** Commands the policy permits; a match on any of these would block real work. */
const permittedCommands = [
  "git fetch origin main",
  "git rebase origin/main",
  "git push --force-with-lease",
  "git push --force-with-lease --force-if-includes",
  "git push -u origin issue-592-forbid-base-merges",
  "git pull --rebase origin main",
];

/** The exact dependabot guard every step of contributing-check must carry. */
const dependabotGuard = "if: ${{ github.event.pull_request.user.login != 'dependabot[bot]' }}";

const block = await readFile(blockPath, "utf8");

/** The single `text` fence under the canonical-regex heading. */
const canonicalRegex = /#### Canonical forbidden-command regex[\s\S]*?```text\n(.+)\n```/.exec(
  block,
)?.[1];

/** The block's own prohibition heading, reused as the phrase every restatement must carry. */
const prohibition = /^#### (Never merge the base branch[^\n]*)$/m.exec(block)?.[1];

describe("canonical forbidden-command regex", () => {
  test("is extractable and substantial", () => {
    expect(canonicalRegex).toBeDefined();
    expect(canonicalRegex!.length).toBeGreaterThan(minExtractionLength);
  });

  test.each(forbiddenCommands)("rejects %s", (command) => {
    expect(new RegExp(canonicalRegex!).test(command)).toBe(true);
  });

  test.each(permittedCommands)("permits %s", (command) => {
    expect(new RegExp(canonicalRegex!).test(command)).toBe(false);
  });

  // The pattern cannot see which branch is checked out, so its scope has to be
  // stated in prose. Without it a gate reads `git pull origin main` as a
  // violation even on `main`, where it is an ordinary fast-forward — which is
  // exactly the command preflight-check's own Phase 3 prescribes.
  test("scopes itself to topic branches", () => {
    expect(block).toContain("Evaluate it only while HEAD is on a topic branch");
  });
});

// `--onto <merge-commit>` replays the range <merge-commit>..<branch>, so every
// commit the branch made before the merge is an ancestor of the exclusion point
// and is silently dropped: `A, B, M(merge), C` recovers as `C` alone. Both
// encodings prescribed that form until a downstream review caught it. The
// positive half of each case is what stops this guard passing vacuously once the
// section is renamed or moved.
describe("the recovery recipe keeps the branch's own commits", () => {
  const recipe = "`git rebase <base-tip> <branch>`";
  const destructive = "rebase --onto";

  test.each([
    ["the canonical block", blockPath],
    ["CONTRIBUTING.md", contributingPath],
  ])("%s prescribes the plain rebase and no --onto form", async (name, path) => {
    const content = await readFile(path, "utf8");
    expect(`${name} prescribes the recipe: ${content.includes(recipe)}`).toBe(
      `${name} prescribes the recipe: true`,
    );
    expect(`${name} mentions --onto: ${content.includes(destructive)}`).toBe(
      `${name} mentions --onto: false`,
    );
  });
});

describe("prohibition wording survives every restatement", () => {
  test("the block states it as a heading", () => {
    expect(prohibition).toBeDefined();
    expect(prohibition!.length).toBeGreaterThan(minExtractionLength);
  });

  test("CONTRIBUTING.md carries the section and the block's prohibition", async () => {
    const contributing = await readFile(contributingPath, "utf8");
    expect(contributing).toContain("### Updating pull-request branches");
    expect(contributing).toContain(prohibition!);
    expect(contributing).toContain("`git push --force-with-lease`");
    // The stale-event case is documented apart from ordinary synchronization.
    expect(contributing).toContain("A stale check is not a reason to touch history.");
  });

  test.each(ruleFiles)("rules/%s carries the prohibition and the alternative", async (name) => {
    const rules = await readFile(join(repoRoot, "rules", name), "utf8");
    expect(rules).toContain(prohibition!);
    expect(rules).toContain("`git push --force-with-lease`");
    expect(rules).toContain("Updating pull-request branches");
  });

  test("the four rule files keep an identical Git Workflow section", async () => {
    const sections = await Promise.all(
      ruleFiles.map(async (name) => {
        const rules = await readFile(join(repoRoot, "rules", name), "utf8");
        return /^## 15\. Git Workflow$[\s\S]*?(?=^## 16\.)/m.exec(rules)?.[0] ?? "";
      }),
    );
    expect(sections[0].length).toBeGreaterThan(minExtractionLength);
    for (const section of sections) expect(section).toBe(sections[0]);
  });
});

describe("skills load the block", () => {
  test.each(consumingSkills)("%s points at git-history-policy.md", async (name) => {
    const skill = await readFile(join(skillsDir, name, "SKILL.md"), "utf8");
    expect(skill).toContain("shared-rules/references/git-history-policy.md");
  });

  // Invariants 1-3 of preflight-check are acknowledgeable by the user; this one
  // is not, and a prompt would reintroduce exactly the acknowledgement path the
  // policy removes.
  test("preflight-check gates without offering an acknowledgement", async () => {
    const skill = await readFile(join(skillsDir, "preflight-check/SKILL.md"), "utf8");
    expect(skill).toContain("## Phase 0: History Policy Gate");
    expect(skill).toContain("This gate takes no AskUserQuestion");
  });

  // Phase 3 tells the user to run `git pull origin main` on main, which the
  // shape-only regex matches. Phase 0 must supply the branch condition the
  // regex cannot, or the skill deterministically refuses its own instruction.
  test("preflight-check scopes the gate so Phase 3 stays reachable", async () => {
    const skill = await readFile(join(skillsDir, "preflight-check/SKILL.md"), "utf8");
    expect(skill).toContain("whenever HEAD is on a topic branch");
    expect(skill).toContain("On `main` or `master` itself the gate does not fire.");
  });
});

describe("pr-review agrees with CI", () => {
  test("CHECK-PR-004 blocks and points at the block", async () => {
    const [hygiene, reviewSkill] = await Promise.all([
      readFile(hygienePath, "utf8"),
      readFile(reviewSkillPath, "utf8"),
    ]);
    expect(hygiene).toContain("**CHECK-PR-004: No merge commits in feature branch** — Severity: blocker");
    expect(hygiene).toContain("shared-rules/references/git-history-policy.md");
    expect(reviewSkill).toContain("**CHECK-PR-004** (blocker)");
  });
});

describe("contributing-check enforces the rule", () => {
  test("the base-branch merge step exists", async () => {
    const actionYml = await readFile(contributingCheckPath, "utf8");
    expect(actionYml).toContain("- name: Validate no base-branch merges");
    expect(actionYml).toContain("git rev-list --merges");
    // head.sha, never HEAD: on pull_request, checkout resolves refs/pull/N/merge.
    expect(actionYml).toContain("HEAD_SHA: ${{ github.event.pull_request.head.sha }}");
  });

  // The action's own comment says every step MUST carry this guard or dependabot
  // is re-blocked, and Actions have no YAML anchors to enforce it. Nothing tested
  // that until this change added the first new step in a while.
  test("every step carries the dependabot guard", async () => {
    const actionYml = await readFile(contributingCheckPath, "utf8");
    const steps = actionYml.split(/^    - name: /m).slice(1);
    expect(steps.length).toBeGreaterThan(5);
    for (const step of steps) {
      expect(`${step.split("\n")[0]}: ${step.includes(dependabotGuard)}`).toBe(
        `${step.split("\n")[0]}: true`,
      );
    }
  });
});
