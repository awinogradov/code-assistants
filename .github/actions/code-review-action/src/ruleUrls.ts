/**
 * Resolve PR-review rule codes (e.g. `CHECK-BUG-002`) to GitHub links by pure
 * string templating — no file scan, no heading slugification.
 *
 * The consolidated `pr:review` skill defines every rule beside an HTML anchor
 * (`<a id="CHECK-BUG-002"></a>`), so a code resolves to `<rulesDocUrl>#<code>`
 * with no parsing. The review model emits bare `[CHECK-XXX-NNN]` codes and the
 * action appends the links here after the model returns.
 *
 * @example
 * const body = linkRuleCodes("🚧 Bug [CHECK-BUG-002]");
 */

/**
 * Canonical location of the consolidated review rubric. Intentionally hardcoded to
 * the source repo (not derived from GITHUB_REPOSITORY): the skill lives here
 * regardless of which downstream repo the action runs in, so links must always
 * target this repo. The `:` in the path is percent-encoded so markdown link
 * parsers don't choke.
 */
export const rulesDocUrl =
  "https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/skills/pr%3Areview/SKILL.md";

/**
 * Append resolved URLs to bare rule codes in a review body. A bracket group of one
 * or more comma-separated codes becomes markdown links, preserving the merged form:
 * `[CHECK-BUG-002, CHECK-AI-002]` → `[[CHECK-BUG-002](…), [CHECK-AI-002](…)]`.
 * Brackets that aren't a pure code list, and already-linked codes (`](…)`), are
 * left untouched.
 */
export function linkRuleCodes(body: string, baseUrl: string = rulesDocUrl): string {
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
    const linked = codes.map((c) => `[${c}](${baseUrl}#${c})`);
    return codes.length === 1 ? linked[0] : `[${linked.join(", ")}]`;
  });
}
