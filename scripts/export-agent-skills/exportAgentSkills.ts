#!/usr/bin/env bun
/**
 * Regenerates the committed `agent-skills/` directory — the portable Agent
 * Skills layout Codex, Kimi, and other SKILL.md-compatible CLIs consume — from
 * the Claude plugin source of truth. Enumerates git-tracked files only, so
 * gitignored artifacts (e.g. the pdf renderer's node_modules) never leak into
 * the export. `--check` regenerates into a temp directory and exits non-zero
 * on any drift; `bun run lint` runs it in CI.
 *
 * @example
 *   bun scripts/export-agent-skills/exportAgentSkills.ts          # regenerate
 *   bun scripts/export-agent-skills/exportAgentSkills.ts --check  # CI drift gate
 */
import { $ } from "bun";
import matter from "gray-matter";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { claudeOnlySkills } from "./claudeOnly.ts";
import { transformAgentFile } from "./transformAgent.ts";
import { exportedPathOf, toPortableSlug, transformSkillFile, rewriteBody, type RewriteContext } from "./transformSkill.ts";

const repoRoot = resolve(import.meta.dirname, "../..");
const pluginRoot = join(repoRoot, "claude-plugins/autopilot");
const outputDirName = "agent-skills";
const repoBlobBase = "https://github.com/awinogradov/code-assistants/blob/main";

interface ExportedEntry {
  /** Portable skill directory name. */
  dir: string;
  /** Frontmatter description carried into the generated README table. */
  description: string;
  /** True when the skill was converted from a Claude subagent. */
  fromAgent: boolean;
}

async function listTrackedFiles(prefix: string): Promise<string[]> {
  const out = await $`git -C ${pluginRoot} ls-files ${prefix}`.text();
  return out.split("\n").filter(Boolean).sort();
}

function buildContext(skillFiles: string[], agentFiles: string[]): RewriteContext {
  const skillDirs = new Map<string, string>();
  for (const file of skillFiles) {
    const dir = file.split("/")[1]!;
    if (!claudeOnlySkills.has(dir)) skillDirs.set(dir, toPortableSlug(dir));
  }
  const agentDirs = new Map<string, string>();
  for (const file of agentFiles) {
    const name = file.replace(/^agents\//, "").replace(/\.md$/, "");
    agentDirs.set(name, toPortableSlug(name));
  }
  return { skillDirs, agentDirs, claudeOnly: claudeOnlySkills };
}

function escapeTableCell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function buildReadme(skills: ExportedEntry[], ctx: RewriteContext): string {
  const skillRows = skills
    .filter((entry) => !entry.fromAgent)
    .map((entry) => `| [${entry.dir}](./${entry.dir}/SKILL.md) | ${escapeTableCell(entry.description)} |`);
  const agentRows = skills
    .filter((entry) => entry.fromAgent)
    .map((entry) => `| [${entry.dir}](./${entry.dir}/SKILL.md) | ${escapeTableCell(entry.description)} |`);
  const claudeOnlyRows = [...ctx.claudeOnly.entries()].map(
    ([dir, reason]) =>
      `- [${dir}](${repoBlobBase}/claude-plugins/autopilot/skills/${dir}/SKILL.md) — ${reason}`,
  );
  return [
    "# Autopilot Agent Skills (portable layout)",
    "",
    "<!-- GENERATED FILE — do not edit. Regenerate with `bun run export:skills`. -->",
    "",
    "Generated from the [autopilot Claude Code plugin](https://github.com/awinogradov/code-assistants/tree/main/claude-plugins/autopilot) — the single source of truth. Each directory below is a portable [Agent Skill](https://github.com/awinogradov/code-assistants/blob/main/docs/18-agent-skills-export.md) (`SKILL.md`) consumable by any SKILL.md-compatible CLI. A Claude Code slash command `/autopilot:x` corresponds to the exported skill `autopilot-x`.",
    "",
    "## Install",
    "",
    "- **OpenAI Codex CLI** — copy the skill directories into `~/.codex/skills/` (personal) or `.codex/skills/` (project); `~/.agents/skills/` also works. Invoke with the `$` prefix (e.g. `$autopilot-commits-create`) or let auto-matching pick the skill up.",
    "- **Kimi Code CLI** — copy the skill directories into a configured skills directory (user, project, or extra); see [Agent Skills — Kimi Code CLI docs](https://moonshotai.github.io/kimi-cli/en/customization/skills.html).",
    "- **Claude Code** — do not install these; use the [autopilot plugin](https://github.com/awinogradov/code-assistants/tree/main/claude-plugins/autopilot) instead, which keeps subagents, tool permissions, and plan mode.",
    "",
    "Repositories synced by the agents-skills-sync action receive this layout under `.agents/skills/` automatically.",
    "",
    "## Skills",
    "",
    "| Skill | Description |",
    "| ----- | ----------- |",
    ...skillRows,
    "",
    "## Skills derived from subagents",
    "",
    "These run as isolated subagents in Claude Code; in other CLIs they run inline and their structured output block is the result.",
    "",
    "| Skill | Description |",
    "| ----- | ----------- |",
    ...agentRows,
    "",
    "## Claude Code-only skills (not exported)",
    "",
    ...claudeOnlyRows,
    "",
  ].join("\n");
}

async function generate(outDir: string): Promise<void> {
  const skillFiles = await listTrackedFiles("skills");
  const agentFiles = await listTrackedFiles("agents");
  const ctx = buildContext(skillFiles, agentFiles);
  const entries: ExportedEntry[] = [];

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const file of skillFiles) {
    const exported = exportedPathOf(file, ctx);
    if (!exported) continue;
    const destPath = join(outDir, exported);
    await mkdir(dirname(destPath), { recursive: true });
    const source = Bun.file(join(pluginRoot, file));
    if (!file.endsWith(".md")) {
      await writeFile(destPath, new Uint8Array(await source.arrayBuffer()));
      continue;
    }
    const raw = await source.text();
    if (/^skills\/[^/]+\/SKILL\.md$/.test(file)) {
      await writeFile(destPath, transformSkillFile(raw, file, ctx));
      entries.push({
        dir: ctx.skillDirs.get(file.split("/")[1]!)!,
        description: String(matter(raw).data.description),
        fromAgent: false,
      });
    } else {
      await writeFile(destPath, rewriteBody(raw, file, ctx));
    }
  }

  for (const file of agentFiles) {
    const exported = exportedPathOf(file, ctx);
    if (!exported) continue;
    const destPath = join(outDir, exported);
    await mkdir(dirname(destPath), { recursive: true });
    const raw = await Bun.file(join(pluginRoot, file)).text();
    await writeFile(destPath, transformAgentFile(raw, file, ctx));
    entries.push({
      dir: ctx.agentDirs.get(file.replace(/^agents\//, "").replace(/\.md$/, ""))!,
      description: String(matter(raw).data.description),
      fromAgent: true,
    });
  }

  entries.sort((a, b) => a.dir.localeCompare(b.dir));
  await writeFile(join(outDir, "README.md"), buildReadme(entries, ctx));
}

async function main() {
  const checkMode = process.argv.includes("--check");
  const committedDir = join(repoRoot, outputDirName);

  if (!checkMode) {
    await generate(committedDir);
    console.log(`export-agent-skills: regenerated ${outputDirName}/`);
    return;
  }

  const tempDir = await mkdtemp(join(tmpdir(), "agent-skills-"));
  try {
    await generate(tempDir);
    const diff = await $`diff -r ${tempDir} ${committedDir}`.nothrow().quiet();
    if (diff.exitCode !== 0) {
      console.error(diff.stdout.toString() || diff.stderr.toString());
      console.error(`export-agent-skills: ${outputDirName}/ is out of date — run \`bun run export:skills\``);
      process.exitCode = 1;
      return;
    }
    console.log(`export-agent-skills: ${outputDirName}/ is up to date`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

await main();
