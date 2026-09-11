# Validate an explicit context brief

Input: the caller-selected brief path and repository root. Resolve the root before these file checks. Return exactly one verdict, in this order; never silently fall back to broad gathering:

1. **missing** — Read the caller-selected brief path; it does not exist.
2. **malformed** — no full 40-character hexadecimal `Base:` SHA, or any of the nine [brief sections](../../explore/SKILL.md#phase-4-write-the-brief) is absent. Name the omission. Complete these file checks before revision commands.
3. **revision-mismatch** — `git cat-file -e "<base>^{commit}"` fails, or `git merge-base --is-ancestor "<base>" HEAD` fails. A shallow clone may lack the required objects; report the missing revision rather than guessing.
4. **stale** — `git rev-parse origin/main` differs from the recorded base.
5. **valid** — the base equals the checkout's origin/main and is an ancestor-or-equal of HEAD.

Parse metadata with Read and use quoted, validated SHAs in git commands. Compare against origin/main, never require equality with HEAD: a topic branch may legitimately be ahead. Do not fetch during validation; the checkout's origin/main is the supplied base. If a later branch fetch advances it, invalidate affected claims and retrieve current evidence before implementation.

After a valid verdict, apply [brief reuse](brief-reuse.md). Base validity alone does not establish current working-tree content or complete task standards coverage. Callers own their error wording and explicit fallback options; run-primed never invokes run automatically.

## Optional brief flag

For callers accepting the optional brief flag, accept `--brief <path>` and strip it before issue detection. Never infer this flag from conversation history. Before gathering, apply the validation above; on any non-valid verdict, report it and stop with the option to refresh explore or rerun without `--brief`. On success, pass the brief and **`Scope: primed`** to gather-context, following [brief-reuse.md](brief-reuse.md) for current-code and standards gaps. Without the flag, use ordinary task gathering. Stored-plan file seeds also apply when a Linear run receives a brief.
