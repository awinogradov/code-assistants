#!/usr/bin/env bun
import { Glob } from "bun";
import matter from "gray-matter";
import { z, ZodError } from "zod";
import {
  agentFrontmatterSchema,
  marketplaceSchema,
  pluginManifestSchema,
  skillFrontmatterSchema,
} from "./schemas";

type Target =
  | { kind: "marketplace"; path: string }
  | { kind: "plugin-manifest"; path: string }
  | { kind: "skill"; path: string }
  | { kind: "agent"; path: string };

function classify(path: string): Target | null {
  if (path.endsWith("/.claude-plugin/marketplace.json") || path === ".claude-plugin/marketplace.json") {
    return { kind: "marketplace", path };
  }
  if (path.includes("/.claude-plugin/plugin.json")) {
    return { kind: "plugin-manifest", path };
  }
  if (/\/skills\/[^/]+\/SKILL\.md$/.test(path)) {
    return { kind: "skill", path };
  }
  if (/\/agents\/[^/]+\.md$/.test(path)) {
    return { kind: "agent", path };
  }
  return null;
}

async function discoverAll(): Promise<Target[]> {
  const patterns = [
    ".claude-plugin/marketplace.json",
    "claude-plugins/*/.claude-plugin/plugin.json",
    "claude-plugins/*/skills/*/SKILL.md",
    "claude-plugins/*/agents/*.md",
  ];
  const out: Target[] = [];
  for (const pattern of patterns) {
    const glob = new Glob(pattern);
    for await (const path of glob.scan(".")) {
      const t = classify(path);
      if (t) out.push(t);
    }
  }
  return out;
}

function formatZodError(err: ZodError): string {
  return err.errors
    .map((e) => `    - ${e.path.length ? e.path.join(".") + ": " : ""}${e.message}`)
    .join("\n");
}

async function validateJson<T>(path: string, schema: z.ZodType<T>): Promise<string | null> {
  const raw = await Bun.file(path).text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return `invalid JSON: ${(e as Error).message}`;
  }
  const result = schema.safeParse(parsed);
  if (!result.success) return `schema mismatch:\n${formatZodError(result.error)}`;
  return null;
}

async function validateFrontmatter<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<string | null> {
  const raw = await Bun.file(path).text();
  let data: unknown;
  try {
    ({ data } = matter(raw));
  } catch (e) {
    return `invalid YAML frontmatter: ${(e as Error).message}`;
  }
  if (!data || Object.keys(data as object).length === 0) {
    return "missing YAML frontmatter (---…---) block";
  }
  const result = schema.safeParse(data);
  if (!result.success) return `frontmatter mismatch:\n${formatZodError(result.error)}`;
  return null;
}

async function validateTarget(t: Target): Promise<string | null> {
  switch (t.kind) {
    case "marketplace":
      return validateJson(t.path, marketplaceSchema);
    case "plugin-manifest":
      return validateJson(t.path, pluginManifestSchema);
    case "skill":
      return validateFrontmatter(t.path, skillFrontmatterSchema);
    case "agent":
      return validateFrontmatter(t.path, agentFrontmatterSchema);
  }
}

const rulesSectionHeading = "## 15. Git Workflow";

/**
 * The rules/<stack>.md files carry a duplicated Git Workflow section that ships
 * downstream as each consumer's CLAUDE.md. Verify the section exists in every
 * file and is byte-identical across them so the copies cannot drift.
 */
async function validateRulesSectionSync(): Promise<string | null> {
  const sections = new Map<string, string>();
  for await (const path of new Glob("rules/*.md").scan(".")) {
    const raw = await Bun.file(path).text();
    const start = raw.indexOf(`\n${rulesSectionHeading}\n`);
    if (start === -1) return `missing "${rulesSectionHeading}" section in ${path}`;
    const end = raw.indexOf("\n## ", start + 1);
    sections.set(path, raw.slice(start + 1, end === -1 ? raw.length : end + 1));
  }
  if (sections.size === 0) return "no rules/*.md files found";
  const [[firstPath, firstSection], ...rest] = [...sections.entries()];
  const mismatch = rest.find(([, section]) => section !== firstSection);
  if (mismatch) {
    return `"${rulesSectionHeading}" section in ${mismatch[0]} differs from ${firstPath}`;
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  let targets: Target[] = [];
  let checkRules = true;

  const filesIdx = args.indexOf("--files");
  if (filesIdx !== -1) {
    const paths = args.slice(filesIdx + 1).map((p) => (p.startsWith("./") ? p.slice(2) : p));
    for (const rel of paths) {
      const t = classify(rel);
      if (t) targets.push(t);
    }
    checkRules = paths.some((p) => /^rules\/[^/]+\.md$/.test(p));
  } else {
    targets = await discoverAll();
  }

  if (targets.length === 0 && !checkRules) {
    console.log("validate-plugins: no plugin files to check");
    return;
  }

  let failed = 0;
  for (const t of targets) {
    const err = await validateTarget(t);
    if (err) {
      failed += 1;
      console.error(`✖ ${t.path}\n    ${err.split("\n").join("\n    ")}`);
    } else {
      console.log(`✔ ${t.path}`);
    }
  }

  if (checkRules) {
    const err = await validateRulesSectionSync();
    if (err) {
      failed += 1;
      console.error(`✖ rules/*.md\n    ${err}`);
    } else {
      console.log("✔ rules/*.md git workflow section in sync");
    }
  }

  if (failed > 0) {
    console.error(`\nvalidate-plugins: ${failed} file(s) failed validation`);
    process.exit(1);
  }
  console.log(`\nvalidate-plugins: ${targets.length + (checkRules ? 1 : 0)} check(s) OK`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
