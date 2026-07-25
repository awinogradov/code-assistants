/**
 * Guards the audience split between the plan file and the skills that write it: a plan
 * file is what a human approves, so the text copied into it describes outcomes in prose
 * and never carries the tool calls that produce them. Those live in the phase that runs
 * them — see the "Plan file is output, not instructions" rule in plan/SKILL.md.
 *
 * The insert bodies are exactly the fenced blocks whose first heading is `## Pre-Implementation`
 * or `## Post-Implementation`: branch-blocks.md keys one per input type, pipeline.md's draft
 * template carries the default tail, and run/SKILL.md substitutes its automated variant. This
 * finds them by walking the tree rather than naming those three files, the same load-bearing
 * property linkResolution.test.ts and sharedRulesInvocation.test.ts rely on — a fourth insert
 * body added anywhere under skills/ is covered without editing this test.
 *
 * What this CANNOT prove: that an emitted plan file is clean. CI sees the template, not the
 * artifact; a drafter can still hand-write a tool call into a plan. Runtime evidence comes from
 * inspecting a plan file written by a real run, recorded on the PR.
 */
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { describe, expect, test } from "bun:test";

import { walkMarkdown } from "./markdownFiles";

const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");
const skillsDir = join(repoRoot, "claude-plugins/autopilot/skills");

/**
 * Agent-facing constructs that must never reach a plan file. Each is matched as a literal
 * substring, so a partial leftover fails too — a body that keeps only the `options` array
 * still trips `Tool parameters`.
 */
const forbidden = [
  { token: "Skill(", why: "a skill dispatch belongs to the phase that runs it" },
  { token: "Tool parameters", why: "an AskUserQuestion parameter block is not prose" },
  { token: "AskUserQuestion", why: "naming the tool describes the mechanism, not the outcome" },
  { token: "<!--", why: "an HTML-comment directive addresses the agent, not the reader" },
];

const insertBodyHeadings = ["## Pre-Implementation", "## Post-Implementation"];

interface InsertBody {
  /** Repo-relative file the body lives in. */
  file: string;
  /** 1-indexed line the opening fence sits on, so a failure points at the source. */
  line: number;
  heading: string;
  content: string;
}

/**
 * Fenced blocks carrying an insert-body heading anywhere inside them. It has to be anywhere
 * rather than on the first heading line: branch-blocks.md fences a lone section, while
 * pipeline.md fences the whole plan-file template, where `## Post-Implementation` sits below
 * `## Summary`. Either way the entire fence is text destined for a plan file, so the whole
 * block is checked. Honours CommonMark fences of any length so a longer outer fence does not
 * terminate early.
 */
function insertBodies(file: string, source: string): InsertBody[] {
  const out: InsertBody[] = [];
  const lines = source.split("\n");
  let open: { len: number; char: string; start: number } | null = null;
  let body: string[] = [];

  for (const [index, line] of lines.entries()) {
    const fence = /^(`{3,}|~{3,})/.exec(line.trimStart());
    if (!open) {
      // Ternary rather than a nested `if`: block nesting is capped at 2 (CLAUDE.md).
      open = fence ? { len: fence[1].length, char: fence[1][0], start: index } : null;
      continue;
    }
    const closes =
      fence && fence[1][0] === open.char && fence[1].length >= open.len;
    if (!closes) {
      body.push(line);
      continue;
    }
    const heading = body
      .map((l) => l.trim())
      .find((l) => insertBodyHeadings.some((h) => l.startsWith(h)));
    if (heading) {
      out.push({ file, line: open.start + 1, heading, content: body.join("\n") });
    }
    open = null;
    body = [];
  }
  return out;
}

const files = await walkMarkdown(skillsDir);
const bodies = (
  await Promise.all(
    files.map(async (file) =>
      insertBodies(relative(repoRoot, file), await readFile(file, "utf8")),
    ),
  )
).flat();

describe("plan file output purity", () => {
  test("insert bodies are discovered, not hardcoded", () => {
    // branch-blocks.md keys four by input type; pipeline.md and run/SKILL.md add one each.
    expect(bodies.length).toBeGreaterThanOrEqual(6);
    expect(new Set(bodies.map((b) => b.file)).size).toBeGreaterThanOrEqual(3);
  });

  test.each(bodies.map((b) => [`${b.file}:${b.line} ${b.heading}`, b] as const))(
    "%s carries no agent-facing tool call",
    (label, b) => {
      for (const { token, why } of forbidden) {
        // Assert on a labelled string so a failure names the body, the token, and why.
        expect(`${label} has "${token}": ${b.content.includes(token)} — ${why}`).toBe(
          `${label} has "${token}": false — ${why}`,
        );
      }
    },
  );
});
