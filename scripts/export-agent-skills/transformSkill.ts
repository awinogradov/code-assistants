/**
 * Pure transforms that turn a Claude Code plugin skill file into a portable
 * Agent Skills entry consumable by Codex, Kimi, and other SKILL.md-compatible
 * CLIs. Portable consumers reject `:` in skill names and un-prefixed names
 * collide in consumer repos, so names rewrite `:` to `-` under an `autopilot-`
 * prefix. Claude-only frontmatter keys (`allowed-tools`, `argument-hint`,
 * `model`) are dropped, and every relative reference is rewritten so it still
 * resolves in the flat exported layout — or falls back to the plugin source on
 * GitHub when the target is not exported.
 *
 * @example
 *   const out = transformSkillFile(raw, "skills/pr:review/SKILL.md", ctx);
 *   // frontmatter name becomes `autopilot-pr-review`, sibling links rewritten
 */
import matter from "gray-matter";
import { posix } from "node:path";

const repoBlobBase = "https://github.com/awinogradov/code-assistants/blob/main";
const pluginRootPrefix = "claude-plugins/autopilot";

/** `Skill(autopilot:x)` invocation tokens, with any surrounding backticks. */
const skillTokenPattern = /`?Skill\(autopilot:([a-z0-9:-]+)\)`?/g;

/** Inline markdown link targets: `](...)`. */
const linkPattern = /\]\(([^()\s]+)\)/g;

/**
 * Lookup tables the body rewriter needs to relocate references. Paths in the
 * maps are directory names relative to the exported layout root.
 */
export interface RewriteContext {
  /** Plugin skill directory name → exported directory name (exported skills only). */
  skillDirs: Map<string, string>;
  /** Agent file base name (no `.md`) → exported directory name. */
  agentDirs: Map<string, string>;
  /** Skill directory names kept Claude-only (excluded from the export) → reason. */
  claudeOnly: ReadonlyMap<string, string>;
}

/** `pr:review` → `autopilot-pr-review`. */
export function toPortableSlug(name: string): string {
  return `autopilot-${name.replaceAll(":", "-")}`;
}

/**
 * Exported path of a plugin-relative source file (`skills/plan/references/x.md`
 * → `autopilot-plan/references/x.md`; `agents/x.md` → `autopilot-x/SKILL.md`).
 * Returns null when the file is not part of the export.
 */
export function exportedPathOf(sourceRelPath: string, ctx: RewriteContext): string | null {
  const skillMatch = sourceRelPath.match(/^skills\/([^/]+)\/(.+)$/);
  if (skillMatch) {
    const mapped = ctx.skillDirs.get(skillMatch[1]!);
    return mapped ? `${mapped}/${skillMatch[2]}` : null;
  }
  const agentMatch = sourceRelPath.match(/^agents\/([^/]+)\.md$/);
  if (agentMatch) {
    const mapped = ctx.agentDirs.get(agentMatch[1]!);
    return mapped ? `${mapped}/SKILL.md` : null;
  }
  return null;
}

function splitAnchor(href: string): [string, string] {
  const idx = href.indexOf("#");
  return idx === -1 ? [href, ""] : [href.slice(0, idx), href.slice(idx)];
}

function rewriteHref(href: string, sourceRelPath: string, ctx: RewriteContext): string {
  if (/^[a-z][a-z0-9+.-]*:/.test(href) || href.startsWith("#")) return href;
  const [path, anchor] = splitAnchor(href);
  if (path === "") return href;
  const resolved = posix.normalize(posix.join(posix.dirname(sourceRelPath), path));
  const exportedTarget = exportedPathOf(resolved, ctx);
  if (exportedTarget) {
    const exportedSource = exportedPathOf(sourceRelPath, ctx);
    if (!exportedSource) return href;
    return posix.relative(posix.dirname(exportedSource), exportedTarget) + anchor;
  }
  const urlPath = posix.normalize(posix.join(pluginRootPrefix, resolved));
  if (urlPath.startsWith("../")) return href;
  return `${repoBlobBase}/${urlPath}${anchor}`;
}

/**
 * Rewrite a markdown body for the exported layout: `Skill(autopilot:x)`
 * invocation mentions become the backticked portable name, and every relative
 * link is relocated to its exported sibling or to the plugin source on GitHub.
 */
export function rewriteBody(body: string, sourceRelPath: string, ctx: RewriteContext): string {
  const withTokens = body.replace(skillTokenPattern, (_match, name: string) => `\`${toPortableSlug(name)}\``);
  return withTokens.replace(linkPattern, (match, href: string) => {
    const rewritten = rewriteHref(href, sourceRelPath, ctx);
    return rewritten === href ? match : `](${rewritten})`;
  });
}

/**
 * Transform a full `SKILL.md`: reduce frontmatter to the portable contract
 * (`name` rewritten, `description` carried over) and rewrite the body.
 */
export function transformSkillFile(raw: string, sourceRelPath: string, ctx: RewriteContext): string {
  const { data, content } = matter(raw);
  return matter.stringify(rewriteBody(content, sourceRelPath, ctx), {
    name: toPortableSlug(String(data.name)),
    description: String(data.description),
  });
}
