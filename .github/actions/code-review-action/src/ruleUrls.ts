/**
 * Resolve PR-review rule codes (e.g. `CHECK-BUG-002`) to GitHub links pointing at
 * the owning agent file's section — deterministically, in code.
 *
 * Previously the review model did this per run by reading every `pr:review:*.md`
 * agent file and slugifying headings (~11 tool round-trips + reasoning). The model
 * now emits bare `[CHECK-XXX-NNN]` codes and the action appends the links here.
 *
 * @example
 * const map = await buildRuleUrlMap(`${pluginDir}/agents`);
 * const body = linkRuleCodes("🚧 Bug [CHECK-BUG-002]", map);
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Canonical source location of the autopilot agent files. Intentionally hardcoded
 * to the source repo (not derived from GITHUB_REPOSITORY): the agent files live
 * here regardless of which downstream repo the action runs in, so links must
 * always target this repo.
 */
const agentsSourceUrl =
  "https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents";

/** The installed plugin's agents directory, from the env the action exposes. */
export function agentsDirFromEnv(): string {
  return `${process.env.CLAUDE_PLUGIN_DIR ?? ""}/agents`;
}

/** Slugify a `### ` heading to a GitHub anchor (lowercase, alnum + hyphens). */
export function slugifyHeading(heading: string): string {
  return heading
    .replace(/^#+\s*/, "")
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .trim()
    .replaceAll(/\s+/g, "-")
    .replaceAll(/-+/g, "-");
}

/** Percent-encode `:` in an agent filename so markdown link parsers don't choke. */
function encodeAgentFile(filename: string): string {
  return filename.replaceAll(":", "%3A");
}

/** Extract one agent file's `[ruleCode, url]` pairs, each keyed to its section anchor. */
function indexAgentFile(text: string, filename: string): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  let anchor = "";
  for (const line of text.split("\n")) {
    const heading = line.match(/^###\s+(.+)$/);
    if (heading) {
      anchor = slugifyHeading(heading[1]);
      continue;
    }
    const code = line.match(/\*\*(CHECK-[A-Z]+-\d+):/);
    if (code && anchor) {
      entries.push([code[1], `${agentsSourceUrl}/${encodeAgentFile(filename)}#${anchor}`]);
    }
  }
  return entries;
}

/**
 * Build a `ruleCode → GitHub URL` map by scanning the `pr:review:*.md` agent files.
 * Returns an empty map (never throws) when the directory is missing/unreadable —
 * callers then emit bare codes, never blocking the review.
 */
export async function buildRuleUrlMap(agentsDir: string): Promise<Map<string, string>> {
  let files: string[];
  try {
    files = (await readdir(agentsDir)).filter(
      (f) => f.startsWith("pr:review:") && f.endsWith(".md")
    );
  } catch {
    return new Map();
  }

  const map = new Map<string, string>();
  for (const file of files) {
    const text = await Bun.file(join(agentsDir, file)).text();
    for (const [code, url] of indexAgentFile(text, file)) {
      map.set(code, url);
    }
  }
  return map;
}

/**
 * Append resolved URLs to bare rule codes in a review body. A bracket group of
 * one or more comma-separated codes becomes markdown links, preserving the merged
 * form: `[CHECK-BUG-002, CHECK-AI-002]` → `[[CHECK-BUG-002](a), [CHECK-AI-002](b)]`.
 * Codes absent from the map stay bare; already-linked codes (`](…)`) are left alone.
 */
export function linkRuleCodes(body: string, map: Map<string, string>): string {
  // The `(?!\()` negative lookahead skips brackets already followed by `(…)` —
  // i.e. an already-linked `[CODE](url)` — so re-runs don't double-wrap.
  return body.replace(/\[([^\]]*CHECK-[A-Z]+-\d+[^\]]*)\](?!\()/g, (full, inner: string) => {
    const codes = inner
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!codes.every((c) => /^CHECK-[A-Z]+-\d+$/.test(c))) {
      return full;
    }
    const linked = codes.map((c) => {
      const url = map.get(c);
      return url ? `[${c}](${url})` : `[${c}]`;
    });
    return codes.length === 1 ? linked[0] : `[${linked.join(", ")}]`;
  });
}
