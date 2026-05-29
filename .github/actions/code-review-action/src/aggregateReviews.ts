/**
 * Deterministically merge the structured findings from all `pr:review:*`
 * sub-agents into a single severity-ordered list — in code, not in the model.
 *
 * Previously the root review model re-parsed 12 markdown blocks and deduped them
 * per run (~18k output tokens). The sub-agents now emit structured findings and
 * this module does the dedupe/merge/order, mirroring the in-code rule→URL
 * resolution in `ruleUrls.ts`.
 *
 * @example
 * const merged = aggregateReviews([
 *   { category: "correctness", findings: [...] },
 *   { category: "security", findings: [...] },
 * ]);
 * // merged: blockers first, then suggestions, then nitpicks; same (file,line) deduped.
 */
import type { AgentReview, ReviewFinding, ReviewSeverity } from "./reviewFindings.ts";

/** Lower rank = higher severity, so it sorts first and wins a dedupe tie. */
const severityRank: Record<ReviewSeverity, number> = {
  blocker: 0,
  suggestion: 1,
  nitpick: 2,
};

/** Split a (possibly comma-joined) rule field into trimmed, non-empty codes. */
function splitRules(rule: string | null): string[] {
  return rule
    ? rule
        .split(",")
        .map((code) => code.trim())
        .filter(Boolean)
    : [];
}

/** Merge two findings' rule codes into one ordered, de-duplicated comma list (or null). */
function mergeRules(a: string | null, b: string | null): string | null {
  const unique = [...new Set([...splitRules(a), ...splitRules(b)])];
  return unique.length > 0 ? unique.join(", ") : null;
}

/**
 * Combine two findings at the same `(file, line)`: keep the higher-severity one
 * (ties keep the first seen) and merge both rule codes onto it.
 */
function mergeFindings(existing: ReviewFinding, next: ReviewFinding): ReviewFinding {
  const higher = severityRank[existing.severity] <= severityRank[next.severity] ? existing : next;
  return { ...higher, rule: mergeRules(existing.rule, next.rule) };
}

/**
 * Merge all sub-agent findings into a single list: dedupe by `(file, line)`
 * keeping the higher severity and merging rule codes, then order blockers →
 * suggestions → nitpicks (stable within a severity). Findings with a null line
 * (out-of-diff) are never merged and pass through individually.
 */
export function aggregateReviews(reviews: AgentReview[]): ReviewFinding[] {
  const byLocation = new Map<string, ReviewFinding>();
  const standalone: ReviewFinding[] = [];

  for (const finding of reviews.flatMap((review) => review.findings)) {
    if (finding.line === null) {
      standalone.push(finding);
      continue;
    }
    const key = `${finding.file}:${finding.line}`;
    const existing = byLocation.get(key);
    byLocation.set(key, existing ? mergeFindings(existing, finding) : finding);
  }

  return [...byLocation.values(), ...standalone]
    .map((finding, index) => ({ finding, index }))
    .sort(
      (a, b) =>
        severityRank[a.finding.severity] - severityRank[b.finding.severity] || a.index - b.index,
    )
    .map(({ finding }) => finding);
}
