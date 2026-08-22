<!-- github-review-fetch:start -->

### Fetch PR review threads (deterministic helper)

Fetch review threads with the bundled zero-dependency helper — one bounded Bash call, no delegated agent:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/github/fetch-pr-reviews.mjs" <OWNER>/<REPO> <PR_NUMBER> <PR_AUTHOR>
```

`${CLAUDE_PLUGIN_ROOT}` is the plugin root Claude Code provides to plugin components; when it is unset, resolve the script from the invoking skill's base directory instead: `<skill base directory>/../../lib/github/fetch-pr-reviews.mjs`.

The helper performs four bounded, read-only GitHub reads (REST reviews, REST inline comments, PR metadata, and the GraphQL `reviewThreads` resolution query — all paginated), always exits 0, and prints a single JSON object:

- `pr`, `title`, `author` — PR number, title, and author login.
- `reviewState` — `APPROVED` | `CHANGES_REQUESTED` | `REVIEW_REQUIRED` | `PENDING`.
- `reviewers` — `{ "login", "state" }` per reviewer, carrying each reviewer's latest review state.
- `comments` — the unresolved review comments, grouped by `path` and sorted by `line` (`null` lines last; `line` is `null` when the diff line moved). Each is `{ "commentId", "path", "line", "reviewer", "severity", "body", "authorReplied", "lastAuthorReply" }`: `commentId` is the REST review-comment id used to reply to that thread; `severity` is `blocker` (a comment from a `CHANGES_REQUESTED` review, or blocker markers) | `suggestion` | `nitpick` | `question`; `body` is a 400-character excerpt. Resolved threads, CI-automation bots, and the PR author's own root comments are already filtered out.
- `authorReplied` / `lastAuthorReply` — whether the PR author replied in the thread, and the latest such reply. Whether that reply actually addresses the comment is a judgment call: make it in-model before acting on the comment; the helper never makes it.
- `note` — `null` when comments are present; `"no-comments"` when none were found; `"all-resolved"` when every review thread is resolved.
- `truncated` — `true` when the 100-comment cap dropped comments (unresolved blockers are kept first).
- `fetchError` — `null` on a clean fetch. When non-null, one or more GitHub reads failed (rate limiting is named explicitly) and `telemetry.degradedReads` lists them; the remaining reads still populate the payload. Surface the error and treat the fetch as incomplete — a degraded fetch is NEVER "no prior findings". When `degradedReads` includes `reviewThreads`, resolution state is unknown and comments are kept rather than silently dropped as resolved.
- `telemetry` — diagnostic only (`durationMs`, `requestCount`, `payloadBytes`, `degradedReads`); report `fetchError`, never act on telemetry values.

<!-- github-review-fetch:end -->
