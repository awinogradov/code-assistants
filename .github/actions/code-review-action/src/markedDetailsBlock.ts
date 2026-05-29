/**
 * Build the marker-bounded, collapsible `<details>` block shared by the PR
 * help footer (`updatePrFooter.ts`) and the review run-summary footer
 * (`runSummaryFooter.ts`). The HTML-comment markers bound the block so callers
 * can locate it to rebuild or strip it, and the blank line after `<br />` lets
 * a GitHub-flavored markdown table or list render inside the `<details>`.
 *
 * @example
 * buildMarkedDetailsBlock({
 *   startMarker: "<!-- run-summary-start -->",
 *   endMarker: "<!-- run-summary-end -->",
 *   summary: "Review run summary 🤖",
 *   bodyLines: ["| Metric | Value |", "| --- | --- |", "| Cost | $0.10 |"],
 * });
 */
export interface MarkedDetailsBlock {
  /** Opening HTML-comment marker placed directly above the `---` rule. */
  startMarker: string;
  /** Closing HTML-comment marker placed directly below `</details>`. */
  endMarker: string;
  /** Text rendered inside `<summary>`, e.g. `"Available commands 🤖"`. */
  summary: string;
  /** Markdown lines rendered inside the open `<details>`, after the blank line. */
  bodyLines: string[];
}

/** Assemble the marker-wrapped `<details>` block from its parts. */
export function buildMarkedDetailsBlock({
  startMarker,
  endMarker,
  summary,
  bodyLines,
}: MarkedDetailsBlock): string {
  return [
    startMarker,
    "---",
    "<details>",
    `<summary>${summary}</summary>`,
    "<br />",
    "",
    ...bodyLines,
    "",
    "</details>",
    endMarker,
  ].join("\n");
}
