<!-- pr-body-grammar:start -->

### PR body grammar

The canonical grammar for a PR body: sections, ordering, formatting, and magic words.

The PR body uses `---` separators to divide three sections: description, release notes (optional), and issue links.

**CRITICAL — Section ordering is MANDATORY and MUST NOT be rearranged:**

1. Description (FIRST — always at the top, no heading)
2. Release notes (MIDDLE — only when applicable, headed `**Release notes:**`)
3. Issue links (LAST — always at the bottom, headed `**Issues:**`)

Each section is separated by `---`. The `**Issues:**` section is ALWAYS last. Placing it before the description or release notes is a format violation.

**Section 1: Description**

- Opening paragraph: what changes and why, 1-2 sentences
- Then one bullet per implementation decision the diff does not explain by itself — the decision and its reason, at most 20 words, at most 7 bullets
- Nothing about process: no plan, expert panel, score, review round, or "scoped out" narration; a deliberate exclusion is one bullet starting `Out of scope:`

Target density for Section 1, from a real PR:

```
pr-monitor and pr-resolve never read `mergeable`, so a conflicting PR looked like one awaiting review and the monitor polled forever. Both skills now detect `CONFLICTING` and end in a reported terminal state.

- Read `mergeable` in the existing `gh pr view` calls, so detection costs no extra request
- Conflict Sweep rebases onto the base with the push lease pinned to the pre-rebase SHA
- A halted rebase is aborted and reported; hunks are never resolved unattended
- `UNKNOWN` counts as pending because GitHub computes mergeability asynchronously
- Sweeps cap at 2 per run; a per-SHA cap would refund on every base commit
- Out of scope: `BEHIND` under a branch-up-to-date rule this repository does not enable
```

**Formatting rule (no hard-wrapping):**

- Do NOT hard-wrap or line-break text within paragraphs or bullet items at any column width
- Each paragraph must be a single continuous line (let GitHub handle word wrapping)
- Each bullet item must be a single continuous line
- GitHub renders single newlines as visible line breaks — hard-wrapping creates ugly broken text

**Section 2: Release Notes (conditional)**

Include this section (titled `**Release notes:**`) with a `---` separator when:

- `--release-notes` flag is present, OR
- Breaking changes were detected by the [analyze-pr-commits](https://github.com/awinogradov/code-assistants/blob/main/claude-plugins/autopilot/agents/analyze-pr-commits.md#phase-3-analyze-change-significance) agent while gathering context (mandatory)

Content rules:

- Short, user-facing descriptions of changes (not implementation details)
- Written for someone reading a project changelog
- Focus on what changed from the user/API consumer perspective
- Use bullet points, one per distinct user-facing change
- Keep each bullet to 1 sentence
- For breaking changes, prefix with "BREAKING:" and describe the impact

**Format rules (exact heading required):**

- The heading MUST be exactly `**Release notes:**` — bold, lowercase "n" in "notes", with colon
- DO NOT use `## Release Notes` (H2 heading) — that format is for `.release_notes/*.md` files only
- DO NOT use `**Release Notes:**` (capital "N") — use lowercase `**Release notes:**`
- The section MUST be placed between the description and the `**Issues:**` section
- The section MUST be separated from adjacent sections by `---` on both sides

**Section 3: Issue Links (titled `**Issues:**`)**

**Format rules (exact section required):**

- The heading MUST be exactly `**Issues:**` — bold, with colon
- The section MUST be separated from the previous section by `---`
- There MUST be a blank line between the `---` separator and the `**Issues:**` heading
- The section MUST be present when any issue-linking magic words exist
- DO NOT place magic words (e.g., `Closes #N`, `Related to #N`) as bare text in the description — they MUST be inside the `**Issues:**` section
- Issue links MUST use magic words — NEVER use markdown links like `[#N](url)` (they break the GitHub and Linear close-parsers); for a Linear issue the magic word takes the plain issue URL, which GitHub auto-links and Linear detects
- The section is omitted ONLY for special prefix branches (HOTFIX / TRIVIAL / MAINTENANCE / PROPOSAL / SECURITY) when no issue numbers are provided
- For a `security-` branch (code-scanning alert fix), the `**Issues:**` section is omitted and replaced by an `**Alert:**` section recording the alert reference — a `---` separator, then `**Alert:**` on its own line, then the alert URL. The URL is the `htmlUrl` from the [`run` skill's Phase 0](../../run/SKILL.md#phase-0-resolve-input) `resolve-alert-context` output, carried in conversation context; when `pr-create` runs standalone (no parent context), resolve it via `gh api repos/{owner}/{repo}/code-scanning/alerts/{n}` if the alert number is known, otherwise ask the user for the alert URL. Emit NO `Closes #`: code-scanning alerts close on the next scan, not via PR magic words. The `**Alert:**` section is last, in the same slot `**Issues:**` would occupy.

**Magic Words:**

- `Closes #N` — Links and closes the issue on merge
- `Fixes #N` — Links and closes the issue on merge
- `Resolves #N` — Links and closes the issue on merge
- `Part of #N` — Plain reference (auto-linked, no close)
- `Related to #N` — Plain reference (auto-linked, no close)

For a **Linear** branch, use the plain Linear issue URL in place of `#N` (e.g., `Closes https://linear.app/<workspace>/issue/ENG-123`, `Part of https://linear.app/<workspace>/issue/ENG-100`) — a bare Linear id is dead text on GitHub, while [Linear's magic-word parser](https://linear.app/docs/github#linking-linear-issues-to-github-prs) accepts the URL form and GitHub renders it as a clickable autolink. Take the URL from the issue context gathered earlier; when no URL is resolvable there, fall back to the bare id and state "issue URL unresolvable — emitting bare Linear id" in the run output. Linear auto-closes the ticket on merge only when the GitHub↔Linear integration is configured for the repository; otherwise the magic word is a tracked reference.

**Issue linking rules:**

1. Always include `Closes #<N>` (GitHub) or `Closes <linear-issue-url>` (Linear; bare-id fallback per the rule above) for the issue derived from the branch name (skip for special prefix branches — no issue exists)
2. If `--closes` provided, add `Closes #<n>` for each additional issue
3. If `--related` provided, add `Related to #<n>` for each related issue
4. Each magic word on its own line

**Example format (with release notes):**

```
<Brief description of what this PR does and why it's needed.>

- <Important implementation detail 1>
- <Important implementation detail 2>

---

**Release notes:**

- <User-facing change 1>
- <User-facing change 2>

---

**Issues:**

Closes #<issue-from-branch>
Closes #<issue-from-closes-arg>
Related to #<issue-from-related-arg>
```

**Example format (without release notes):**

```
<Brief description of what this PR does and why it's needed.>

- <Important implementation detail 1>
- <Important implementation detail 2>

---

**Issues:**

Closes #<issue-from-branch>
```

<!-- pr-body-grammar:end -->
