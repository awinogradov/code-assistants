---
name: autopilot-fetch-pr-reviews
description: >-
  Fetch, filter, and categorize PR review comments by severity. Use when PR
  skills need categorized review feedback without raw API output in context.
---
> Derived from the autopilot `fetch-pr-reviews` subagent. Where subagents are unavailable, run this task inline and treat its structured output block as the result handed back to the invoking workflow.

You are a PR review fetcher. Fetch review comments from GitHub, filter out noise, categorize by severity, and return a structured summary. Do not output intermediate steps — only the final structured block.

## Input

The invoking skill provides in the prompt:

- **Repository** in `owner/repo` format (e.g., `awinogradov/code-assistants`)
- **PR number**
- **PR author login** (for filtering author's own comments)

## Phase 1: Fetch

Run in parallel:

```bash
# Get all reviews
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/reviews

# Get all inline review comments
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/comments
```

Also fetch PR metadata:

```bash
gh pr view <PR_NUMBER> -R <OWNER>/<REPO> --json title,author,reviewDecision,reviewRequests
```

Fetch review-thread resolution state — this is the source of truth for "is this comment resolved", paginating past the 100-node page so long PRs don't silently drop threads (`--paginate` follows `$endCursor` automatically):

```bash
gh api graphql --paginate -F owner=<OWNER> -F repo=<REPO> -F pr=<PR_NUMBER> -f query='
  query($owner: String!, $repo: String!, $pr: Int!, $endCursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100, after: $endCursor) {
          nodes { path line isResolved isOutdated comments(first: 1) { nodes { author { login } body } } }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }'
```

## Phase 2: Filter

Remove from processing:

- **Resolved threads** — drop a comment when its review thread has `isResolved: true`. Match the REST comment to a `reviewThreads` node by `path` + `line`, disambiguating with the thread's first-comment author/body when several threads share a file (outdated threads report `line: null`, so never merge distinct threads on a `(path, null)` key). Treat `isOutdated: true` as **informational only** — the diff line moved, but an unresolved outdated comment is still actionable, so keep it. Do NOT use REST `position: null` as a resolved signal (it only means the line is outdated).
- **CI/automation bots only** — drop a comment only when its author login is in the CI-bot denylist: `github-actions[bot]`, `dependabot[bot]`, `codecov[bot]`, `coderabbitai[bot]` (extend as the repo needs). Do NOT drop by the generic `[bot]` suffix — real review bots such as `cubic-dev-ai[bot]` and `symbiot-bot` must survive.
- **PR author's own comments** — these are responses, not review items
- **Already-addressed comments** — threads where the PR author has replied acknowledging the fix

## Phase 3: Categorize

Parse each remaining comment and categorize by severity:

**Blockers:**

- Comments from reviews with `state: "CHANGES_REQUESTED"`
- Comments containing blocker markers: `🚧`, `blocker`, `must fix`, `blocking`
- Comments explicitly requesting changes

**Suggestions:**

- Comments containing suggestion markers: `🙋‍♂️`, `suggestion`, `consider`, `should`
- Non-blocking improvement requests

**Nitpicks:**

- Comments containing nitpick markers: `💡`, `nitpick`, `nit`, `minor`, `optional`
- Style or naming preferences

**Questions:**

- Comments that ask a question or request explanation
- Comments that don't request a code change

Group comments by file path and sort within each file by line number.

## Phase 4: Output

<!-- agent-json:start -->

Output ONLY a single JSON object matching the schema below — no preamble, no surrounding code fence, no commentary. The parent parses it directly, so any extra text breaks consumption.

<!-- agent-json:end -->

| Field         | Type           | Constraint                                                                                                                                                                                                                                                                                  |
| ------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pr`          | integer        | PR number                                                                                                                                                                                                                                                                                   |
| `title`       | string         | PR title                                                                                                                                                                                                                                                                                    |
| `author`      | string         | PR author login, without `@`                                                                                                                                                                                                                                                                |
| `reviewState` | string         | `APPROVED` \| `CHANGES_REQUESTED` \| `REVIEW_REQUIRED` \| `PENDING`                                                                                                                                                                                                                         |
| `reviewers`   | object[]       | `{ "login": string, "state": string }` per reviewer; `[]` when none                                                                                                                                                                                                                         |
| `comments`    | object[]       | `{ "commentId": number, "path": string, "line": number \| null, "reviewer": string, "severity": "blocker" \| "suggestion" \| "nitpick" \| "question", "summary": string }` per surviving comment, grouped by `path` and sorted by `line` per [Phase 3](#phase-3-categorize); `[]` when none |
| `note`        | string \| null | `null` when `comments` is non-empty; `"no-comments"` when no unresolved comments were found; `"all-resolved"` when every review comment is resolved                                                                                                                                         |

`commentId` is the REST review-comment `id` from the `/comments` payload — the parent replies to specific threads with it; the GraphQL `reviewThreads` query is used only to read `isResolved`/`isOutdated`, not for comment IDs. `line` is `null` for an outdated thread whose diff line moved.

Example:

```json
{
  "pr": 238,
  "title": "Rerun review on PR description edits",
  "author": "awinogradov",
  "reviewState": "CHANGES_REQUESTED",
  "reviewers": [{ "login": "symbiot-bot", "state": "CHANGES_REQUESTED" }],
  "comments": [
    {
      "commentId": 2154433001,
      "path": ".github/workflows/code-review.yml",
      "line": 12,
      "reviewer": "symbiot-bot",
      "severity": "blocker",
      "summary": "Scope cancel-in-progress to non-edited events"
    }
  ],
  "note": null
}
```

Emit the raw object, not the fenced form.
