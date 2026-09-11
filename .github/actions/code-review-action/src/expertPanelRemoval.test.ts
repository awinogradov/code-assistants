/**
 * Guards the removal of the domain-expert review panel (issue #662).
 *
 * The panel was deleted rather than disabled: the `expert-review` agent, the shared
 * pipeline's review-and-score step, the per-stack expert tables, the `--experts-review`
 * flag, and the `Score:` fields it produced are all gone. Prompt files carry no import
 * graph, so the only thing that stops a stray reference from quietly re-growing an
 * entry point — a skill that mentions the flag, a doc that promises a panel — is a
 * text sweep over every shipped markdown file.
 *
 * Discovery comes from the filesystem via `walkMarkdown`, so a newly added skill, agent,
 * or chapter is swept without editing this test. The plugin CHANGELOG, release notes, and
 * MIGRATING notes are deliberately outside the sweep: they record the history of the
 * subsystem and its removal, which is exactly where the words belong.
 *
 * What this CANNOT prove: that no runtime launches a panel by some other name. CI sees
 * text in a file, nothing more.
 */
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { describe, expect, test } from "bun:test";

import { walkMarkdown } from "./markdownFiles";

const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");

const sweptDirs = ["claude-plugins/autopilot/skills", "claude-plugins/autopilot/agents", "docs"];
const sweptFiles = ["README.md", "CONTRIBUTING.md", "claude-plugins/autopilot/README.md"];

/** Every spelling the subsystem was ever invoked or documented by. */
const forbidden = /expert-review|experts-review|expert panel|expert review|expert table|Pre-mortem Analyst/i;

const files = [
  ...(await Promise.all(sweptDirs.map((dir) => walkMarkdown(join(repoRoot, dir))))).flat(),
  ...sweptFiles.map((file) => join(repoRoot, file)),
].map((file) => relative(repoRoot, file));

describe("expert panel removal", () => {
  test("the sweep covers the shipped skills, agents, and docs", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain("claude-plugins/autopilot/skills/plan/references/pipeline.md");
  });

  test.each(files)("%s names no expert panel", async (file) => {
    const source = await readFile(join(repoRoot, file), "utf8");
    const hit = source.split("\n").find((line) => forbidden.test(line));
    expect(`${file}: ${hit ?? ""}`).toBe(`${file}: `);
  });
});
