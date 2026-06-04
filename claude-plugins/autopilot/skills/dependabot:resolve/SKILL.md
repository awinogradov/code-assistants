---
name: dependabot:resolve
description: Review and merge dependabot PRs safely using gh CLI. Process one-by-one to avoid package-lock.json conflicts
allowed-tools:
  - Bash(gh *)
  - AskUserQuestion
---

Review and merge dependabot PRs safely using gh CLI. Process one-by-one to avoid package-lock.json conflicts.

## Input

Arguments: `$ARGUMENTS`

No arguments are expected. Any supplied arguments are ignored.

## Input resolution

- **Repository** — `gh repo view --json nameWithOwner --jq .nameWithOwner` on the current directory. Do NOT prompt.
- **Open dependabot PRs** — discovered dynamically in Phase 1.

## Phase 1: Discovery

1. List all open dependabot PRs using both author formats:
   ```bash
   gh pr list --author "app/dependabot" --state open --json number,title,headRefName
   gh pr list --author "dependabot[bot]" --state open --json number,title,headRefName
   ```
   Merge results from both queries and deduplicate by PR number before proceeding.
2. For each PR, gather:
   - PR number and title
   - Package name and version change (from → to)
   - Update type: major (X.0.0), minor (0.X.0), patch (0.0.X)

## Phase 2: Analysis & Reporting

For each PR, create a report:

| PR  | Package | Change        | Type  | Risk | Breaking Changes         |
| --- | ------- | ------------- | ----- | ---- | ------------------------ |
| #N  | name    | 1.0.0 → 2.0.0 | major | high | [summary from changelog] |

**Risk Levels:**

- **patch** (low): Bug fixes, safe to merge if checks pass
- **minor** (medium): New features, backward compatible, review recommended
- **major** (high): Breaking changes, requires careful review

For major/minor updates, fetch changelog summary:

```bash
gh pr view [number] --json body -q '.body'
```

## Phase 3: Approval Flow

**All updates require individual approval.** Process one-by-one with context.

Before each approval, show relevant context:

- **Patch:** package, version change, CI status
- **Minor:** package, version change, CI status, changelog summary
- **Major:** package, version change, CI status, full changelog with breaking changes highlighted

Then present approval using AskUserQuestion tool:

Tool parameters:

- `question`: "[TYPE] [package] X.X.X → Y.Y.Y\n\nCI: [pass/fail]\n[changelog summary for minor/major]"
- `header`: "PR #N"
- `options`: [
  { label: "Merge", description: "Approve and merge this update" },
  { label: "Skip", description: "Skip this update for now" }
  ]
- `multiSelect`: false

## Phase 4: Sequential Merge

For each approved PR (one at a time):

### 4.1 Pre-merge checks

```bash
gh pr checks [number] --watch
```

If checks fail → analyze and report fix plan:

1. Fetch failure details:
   ```bash
   gh pr checks [number] --json name,state,conclusion
   gh run view [run-id] --log-failed
   ```
2. Analyze the error (type errors, test failures, lint issues, etc.)
3. Report fix plan:

   ```
   PR #N [package] - CI Failed

   **Error:** [brief description]
   **Cause:** [why this update broke it]
   **Fix:** [1-3 actionable steps to resolve]
   ```

4. Skip this PR, continue to next

### 4.2 Conflict check

```bash
gh pr view [number] --json mergeable -q '.mergeable'
```

If not mergeable → request rebase from dependabot:

```bash
gh pr comment [number] --body "@dependabot rebase"
```

Report: "Requested rebase for PR #N, will need to re-run /dependabot-resolve later"
Continue to next PR.

### 4.3 Approve & Merge

```bash
gh pr review [number] --approve
gh pr merge [number] --rebase --delete-branch
```

### 4.4 Post-merge

Wait 2-3 seconds before next PR to allow CI to update base branch.

## Phase 5: Session Summary

```
## Dependabot Session Summary

### Merged (N PRs)
| PR | Package | Change | Type |
|----|---------|--------|------|

### Skipped - Failed Checks (N PRs)
| PR | Package | Error | Fix Plan |
|----|---------|-------|----------|

### Rebased - Conflicts (N PRs)
| PR | Package | Status |
|----|---------|--------|
(Requested @dependabot rebase - re-run /dependabot-resolve later)

### Skipped - Not Approved (N PRs)
| PR | Package | Reason |
|----|---------|--------|
```

## Safety Rules

1. **Never force push or skip CI**
2. **Process strictly one-by-one** - wait for merge to complete
3. **Stop on unexpected errors** - report and ask before continuing
4. **Major updates require explicit "yes"** - not just Enter

<!-- ref-format:start -->

### Reference formatting & readability

These rules govern references — when you point the reader at a real file, standard, commit, or issue. (A token named only as an example, with no real target, is a code specimen in backticks, like any code identifier.) Prefer stable references that never rot; render the same kind of reference the same way everywhere:

- Code identifiers and file names — backticks, e.g. `buildReviewComments`, `reviewOutput.ts`. A backticked specimen names the thing without a link that breaks when a file moves or a doc is restructured.
- Standards and conventions — ALWAYS link the versioned RFC by its stable ID, e.g. `[RFC-0001](<repo-blob-url>/rfc/0001-reference-formatting.md)`; an Accepted RFC is immutable except through an explicit version bump, so the link never rots.
- Other docs and sections — do NOT link a doc name or a section anchor; those rot the moment the doc is restructured. Inline a short gist of the point you need instead.
- Commit SHAs — ALWAYS a link, e.g. `[0328a61](<repo-commit-url>/0328a61)`; a commit is immutable. If you cannot build the URL, leave the bare SHA un-backticked.
- Issue / PR references — leave the bare number (GitHub auto-links it) or write a full link.

Backticks suppress GitHub autolinking: a commit SHA or issue/PR number inside a code span renders as dead text — that is why a backticked SHA was un-clickable in a prior review. Never wrap a SHA or issue/PR number in backticks; link it, or leave it bare so GitHub auto-links it.

Write the most helpful, readable output you can: plain, direct prose; every reference resolvable; explain the "why", not the obvious "what".

<!-- ref-format:end -->
