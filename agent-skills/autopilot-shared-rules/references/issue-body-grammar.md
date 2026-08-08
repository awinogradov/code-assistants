<!-- issue-body-grammar:start -->

### Issue body grammar

The five-section structure every generated issue body follows, on GitHub and Linear alike. The caller supplies the content, any related-items list, and — when posting where relative paths do not resolve — the absolute `<repo-blob-url>` base for links.

**Section ordering is fixed and MUST NOT be rearranged:**

1. `## Context` (FIRST)
2. `## What`
3. `## Why`
4. `## Scope`
5. `## Solution` (LAST)

Heading format MUST be exact: `## Context` (single space, no trailing colon, no bold `**Heading:**`).

**Single-responsibility rule:** each section answers exactly one question and MUST NOT repeat what another section already covers — cross-reference a sibling section instead of restating it. Length follows the content: include as much context as a reader needs to act on the issue, and never cap a section at a fixed paragraph count. Do not pad — every sentence must add information.

- **Context** — the situation and background only: the current state of the world, what work area this touches, and what surfaced it now. No user impact or motivation (that is Why), no proposed fix (that is Solution). Single continuous line per paragraph — no hard-wrapping. When the caller found related issues or PRs, end the section with one `Related:` line in the plain `#N (state)` format (e.g. `Related: #123 (open), #456 (closed)`) — NEVER magic words like `Closes #N` here, which would close issues on merge.
- **What** — the deliverable: the observable end state once this is done, in plain terms. WHAT changes, not HOW (the approach is Solution). A paragraph or bullet list; single continuous line per item.
- **Why** — user impact and business motivation only: what problem this solves and the cost of leaving it unsolved. Assume the reader has already read Context — do not restate the situation. A reader on day one should understand the stakes.
- **Scope** — a bullet list with two sub-headings: `**In scope:**` and `**Out of scope:**`. Bound the work by referencing the What deliverables — do not re-describe them. With no out-of-scope items, write `_None — this is the entire change._` under "Out of scope"; never invent items to fill the section.
- **Solution** — the high-level approach: HOW the What gets delivered, without restating the deliverable. Invoke `autopilot-ascii-schemas` whenever a diagram would aid understanding — a flow between components, an architecture, a comparison — and embed its output verbatim in a fenced ` ```text ` block; skip it only when prose alone is unambiguous.

**Linkability pass (after drafting all five sections):** sweep the body per the reference-formatting block (RFC-0001) — every prose mention of a file or path that exists in the repo becomes a resolvable link, and every cited external source whose URL is in context becomes an inline `[title](url)` link. Backticks remain only on code specimens: identifiers, files the issue proposes to create, and command or fenced-block content. Never invent a URL — leave an unlinkable mention backticked (files) or plain prose (external sources).

<!-- issue-body-grammar:end -->
