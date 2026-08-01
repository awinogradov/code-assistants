---
name: pr:validate
description: Validate a PR title and branch name against repository contributing guidelines
argument-hint: 'PR_TITLE: "<title>" BRANCH_NAME: "<branch>" PR_AUTHOR: "<author-login>"'
allowed-tools:
  - Bash(gh *)
  - Read
---

## Input

Arguments: `$ARGUMENTS`

Expected form (typically supplied by `awinogradov/code-review-action`):

- `PR_TITLE: "<title>" BRANCH_NAME: "<branch>" PR_AUTHOR: "<author-login>"`

## Input resolution

- **`PR_TITLE`** — `$ARGUMENTS` → `gh pr view --json title --jq .title` as a fallback when invoked interactively.
- **`BRANCH_NAME`** — `$ARGUMENTS` → `gh pr view --json headRefName --jq .headRefName` → `git branch --show-current` as a last resort. Empty is allowed for bot PRs (skip branch validation).
- **`PR_AUTHOR`** — `$ARGUMENTS` → `gh pr view --json author --jq .author.login`.

Do NOT prompt the user. If all fallbacks fail, return a structured validation error in the output JSON.

## Task

$ARGUMENTS

---

## Rules

You are validating the PR title and branch name provided above. Read [`pr-title-grammar.md`](../shared-rules/references/pr-title-grammar.md) and apply its rules exactly — they are the canonical encoding of `CONTRIBUTING.md`. Do not invent alternatives, and do not validate against a remembered version of the rules: read the block.

---

## GitHub Issue Verification

For `issue-<number>-` branch names (skip for HOTFIX/TRIVIAL/MAINTENANCE/PROPOSAL/SECURITY prefixes, Linear branches, and Release branches), perform these additional checks:

1. **Extract the issue number** from the branch name (e.g., `123` from `issue-123-add-password-reset`).

2. **Check issue existence**:

   ```bash
   gh issue view <NUMBER> --json title,body,state
   ```

   If not found, mark invalid with reason: "GitHub issue #<NUMBER> referenced by branch does not exist"

3. **Validate relevance**: Compare the PR title against the issue title and body. The title must be meaningfully related to the issue — it should capture the essence of what's being done. Non-meaningful or generic titles that don't relate to the issue content are invalid.

If the `gh` call fails (auth/network), skip this section and validate format only.

For Linear branches, skip ticket-existence and relevance verification entirely — in CI only `gh` is available, with no Linear read path. The format rules plus the title↔branch consistency rule are the full check.

---

## Comment Generation

When the PR is **invalid**, generate a full GitHub PR comment in the `comment` field. Be sarcastic and use emojis generously. Address the PR author by @-mentioning PR_AUTHOR. Explain what went wrong, show how to fix it, and link to the [contributing guidelines](<repo-blob-url>/CONTRIBUTING.md). When the PR is **valid**, set `comment` to an empty string.

---

## Output

Return structured JSON output with exactly these fields:

- `titleValid` (boolean): Whether the PR title passes all title rules
- `branchValid` (boolean): Whether the branch name passes all branch rules (always true when BRANCH_NAME is empty)
- `reason` (string): If any check failed, a brief technical summary of what failed. If all valid, an empty string.
- `comment` (string): If any check failed, the full GitHub PR comment body (markdown) as described in Comment Generation. If all valid, an empty string.

## Reference formatting

Before writing any output that mentions a file, standard, section, commit, or issue, read [`reference-formatting.md`](../shared-rules/references/reference-formatting.md) (RFC-0001) and apply it verbatim — link files, docs, skills, agents, and sections, and never leave a reference as bare text.
