/**
 * Converts a Claude subagent definition (`agents/<name>.md`) into a portable
 * skill. The instruction body is already markdown, but it was written for a
 * subagent context — its output contract assumes a parent conversation reads
 * the return value — so the conversion prepends a provenance note telling a
 * CLI without subagents to run the task inline. Claude-only frontmatter
 * (`tools`, `model`) is dropped.
 *
 * @example
 *   const out = transformAgentFile(raw, "agents/digest-branch-diff.md", ctx);
 *   // → SKILL.md body for the `autopilot-digest-branch-diff` skill
 */
import matter from "gray-matter";
import { rewriteBody, toPortableSlug, type RewriteContext } from "./transformSkill.ts";

/**
 * Transform one agent file into portable `SKILL.md` content: portable name,
 * carried-over description, provenance note, rewritten body.
 */
export function transformAgentFile(raw: string, sourceRelPath: string, ctx: RewriteContext): string {
  const { data, content } = matter(raw);
  const name = String(data.name);
  const note = `> Derived from the autopilot \`${name}\` subagent. Where subagents are unavailable, run this task inline and treat its structured output block as the result handed back to the invoking workflow.`;
  const body = `${note}\n${rewriteBody(content, sourceRelPath, ctx)}`;
  return matter.stringify(body, {
    name: toPortableSlug(name),
    description: String(data.description),
  });
}
