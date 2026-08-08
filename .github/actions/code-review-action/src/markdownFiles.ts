/**
 * Markdown discovery shared by the repository guard tests.
 *
 * The guards (`linkResolution`, `planFileOutputPurity`) all start the same way: walk a
 * source directory and collect every `.md` file, so their coverage comes from the
 * filesystem rather than a hardcoded list. That discovery is the load-bearing property —
 * it is what makes a newly added skill or reference file guarded without editing a test —
 * so it lives in one place instead of being copied per guard.
 *
 * @example
 * const files = await walkMarkdown(join(repoRoot, "claude-plugins/autopilot/skills"));
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Every `.md` file under `dir`, recursively.
 *
 * Returns `[]` for a directory that cannot be read, so a guard listing an optional source
 * directory (`rfc/` in a repo that has none) degrades to "nothing to check" instead of
 * throwing. Bundled dependencies are skipped: the `pdf-create` skill vendors a `renderer/`
 * whose package READMEs carry package-relative links that do not resolve in this tree.
 */
export async function walkMarkdown(dir: string): Promise<string[]> {
  // `.catch(() => null)` rather than a try/catch around an annotated binding: annotating it
  // as `Awaited<ReturnType<typeof readdir>>` picks the Buffer overload, so every `entry.name`
  // then types as NonSharedBuffer instead of string.
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => null);
  if (!entries) return [];
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkMarkdown(full)));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}
