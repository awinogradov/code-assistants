/**
 * Guards RFC-0001 v3: every local markdown reference must resolve. For each link
 * in the autopilot skills/agents, docs/, rfc/, README.md, and CONTRIBUTING.md whose
 * target is repo-local (a relative path or a bare `#anchor`, not an external URL or a
 * `<placeholder>`), this asserts the target file exists and — when the link carries a
 * heading anchor into a markdown file — that the anchor matches a real heading (using
 * GitHub's slug algorithm). Fenced code blocks and the inlined `ref-format` block are
 * excluded: the links inside them are illustrative specimens, not references.
 */
import { existsSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { describe, expect, test } from "bun:test";

const actionDir = join(import.meta.dirname, "..");
const repoRoot = join(actionDir, "..", "..", "..");

const sourceDirs = [
  "claude-plugins/autopilot/skills",
  "claude-plugins/autopilot/agents",
  "docs",
  "rfc",
];
const sourceRootFiles = ["README.md", "CONTRIBUTING.md"];

async function walkMarkdown(dir: string): Promise<string[]> {
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    // Skip bundled dependencies (e.g. the pdf:create skill's renderer/node_modules):
    // their READMEs carry package-relative links that do not resolve in this tree.
    if (entry.isDirectory() && entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkMarkdown(full)));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

/** Drop fenced code blocks, honouring CommonMark fences of any length (3+ ` or ~). */
function stripFences(s: string): string {
  const out: string[] = [];
  let fence: { char: string; len: number } | null = null;
  for (const line of s.split("\n")) {
    const open = /^\s*(`{3,}|~{3,})/.exec(line);
    const isBareFence = /^\s*(`{3,}|~{3,})\s*$/.test(line);
    if (!fence) {
      if (open) fence = { char: open[1][0], len: open[1].length };
      else out.push(line);
    } else if (open && isBareFence && open[1][0] === fence.char && open[1].length >= fence.len) {
      fence = null;
    }
  }
  return out.join("\n");
}

const stripRefBlock = (s: string): string =>
  s.replace(/<!-- ref-format:start -->[\s\S]*?<!-- ref-format:end -->/g, "");

/** Drop inline-code spans so a whole link rendered as a code specimen is not treated as a reference. */
const stripInlineCode = (s: string): string => s.replace(/`[^`\n]*`/g, "");

const linkPattern = /\[[^\]]*\]\(([^)\s]+)\)/g;

/** Repo-local link targets only: skip external schemes, `<placeholders>`, empty anchors. */
function isLocalTarget(target: string): boolean {
  if (!target || target === "#") return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return false;
  if (target.includes("<") || target.includes(">")) return false;
  return true;
}

/** GitHub heading-anchor slug: lowercase, drop punctuation/emoji, spaces → hyphens, de-dupe. */
function slugify(headingText: string, seen: Map<string, number>): string {
  let s = headingText.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/[`*_~]/g, "");
  s = s.trim().toLowerCase();
  s = s.replace(/[^\p{L}\p{N}\s-]/gu, "");
  s = s.replace(/\s/g, "-");
  const count = seen.get(s) ?? 0;
  seen.set(s, count + 1);
  return count === 0 ? s : `${s}-${count}`;
}

const anchorCache = new Map<string, Set<string>>();
async function anchorsFor(file: string): Promise<Set<string>> {
  const cached = anchorCache.get(file);
  if (cached) return cached;
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  let content: string;
  try {
    content = await readFile(file, "utf8");
  } catch {
    anchorCache.set(file, anchors);
    return anchors;
  }
  for (const line of stripFences(content).split("\n")) {
    const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) anchors.add(slugify(heading[1], seen));
    for (const id of line.matchAll(/<a\s+id="([^"]+)"/g)) {
      anchors.add(id[1]);
      anchors.add(id[1].toLowerCase());
    }
  }
  anchorCache.set(file, anchors);
  return anchors;
}

interface Reference {
  label: string;
  sourceFile: string;
  filePath: string;
  anchor: string | null;
}

const sourceFiles = [
  ...(await Promise.all(sourceDirs.map((d) => walkMarkdown(join(repoRoot, d))))).flat(),
  ...sourceRootFiles.map((f) => join(repoRoot, f)).filter((f) => existsSync(f)),
];

const references: Reference[] = [];
for (const sourceFile of sourceFiles) {
  const body = stripInlineCode(stripRefBlock(stripFences(await readFile(sourceFile, "utf8"))));
  for (const match of body.matchAll(linkPattern)) {
    const target = match[1];
    if (!isLocalTarget(target)) continue;
    const hashIndex = target.indexOf("#");
    const pathPart = hashIndex === -1 ? target : target.slice(0, hashIndex);
    const anchor = hashIndex === -1 ? null : target.slice(hashIndex + 1);
    const filePath = pathPart === "" ? sourceFile : resolve(dirname(sourceFile), pathPart);
    const rel = sourceFile.slice(repoRoot.length + 1);
    references.push({ label: `${rel} → ${target}`, sourceFile, filePath, anchor });
  }
}

describe("link resolution (RFC-0001 v3)", () => {
  test("found a meaningful number of local references to validate", () => {
    expect(references.length).toBeGreaterThan(50);
  });

  test.each(references)("$label", async ({ filePath, anchor }) => {
    expect(existsSync(filePath)).toBe(true);
    if (anchor && filePath.endsWith(".md") && statSync(filePath).isFile()) {
      const anchors = await anchorsFor(filePath);
      expect(anchors.has(anchor) || anchors.has(anchor.toLowerCase())).toBe(true);
    }
  });
});
