# Skill token budget

Why a skill body costs what it does, the two rules that govern splitting one, and the guard that stops the bodies growing back.

## A skill body is charged per turn

Invoking a skill injects its whole `SKILL.md` into the conversation. That text is then re-charged as input on every subsequent request in the session, and each `Skill()` call injects a fresh copy. The cost of a skill is therefore:

```text
body size  ×  invocations per session  ×  turns resident afterwards
```

All three factors matter, and size is the one that matters least. `pr-review` is the largest body in the plugin at ~56 KB and costs nothing measurable, because it runs once inside `code-review-action` on a pull request and never enters an interactive session. `preflight-check` was less than a quarter of that size and reached 8% of session tokens, because the autopilot chain loaded it up to six times in a single `/autopilot:run` — once each from `branch-create`, `commits-create` and `pr-create`, plus `run` itself and one more per `pr-resolve` cycle.

The lever with the best return is therefore invocation count, not byte count.

## Chain plumbing loads once per session

A skill that other skills call as plumbing must be invoked once per session, at the earliest point that needs it, and skipped by every later caller that the first invocation already covered.

The `/autopilot:run` family does this with `preflight-check`. Its Phase 2 invokes the skill unconditionally — that invocation is where [`preflight-check`](../claude-plugins/autopilot/skills/preflight-check/SKILL.md)'s history-policy gate installs, and the gate then applies for the rest of the session. Because it ran, `branch-create`, `commits-create` and `pr-create` skip their own Phase 0 preflight whenever `--autopilot` is passed, each stating inline why its remaining checks cannot change the outcome.

Note which way that trade went. The invocation was previously _conditional_ — run "only for a state the Context Map does not cover" — which saved one load and, on a branch the map fully described, installed the session's git-history gate never, while the three later call sites re-installed it three times over. Making the single invocation unconditional cut five loads and closed a correctness hole in the same change. A skip is only sound when something else already established what was skipped; `pr-create` keeps the one check that still carries independent information at its point in the chain, inline, as `git status --porcelain`.

## Two rules for splitting a body

Sections that a typical invocation never reaches belong in a per-skill `references/` file, read on demand. Two rules keep such a split from costing more than it saves.

**Extract only unreached content.** Anything read on every run costs _more_ after extraction — the body still carries a pointer, and the full text arrives via `Read` anyway. In `commits-create` the `Commit Message Validation` gate stays in the body because it runs before every commit, while the validation-failure dialog it escalates to after three failed attempts moves out. In `pr-monitor` the Conflict Sweep moves out because it runs only when `mergeable` is `CONFLICTING`, but the Approval Sweep stays: `APPROVED` is the expected terminal state of every monitored pull request, not a rare branch. `pr-resolve` was examined and left unchanged — it is always interactive and its phases all run, so it has nothing that qualifies.

**Give every extracted file a body-side trigger.** A reader who cannot see the content must still recognise the situation that calls for it, so the body keeps the heading and names the condition. This is why `Edge Cases` sections stay in the body in both `pr-monitor` and `pr-resolve`: their bullet conditions _are_ the recognition index, so relocating them would either hide the trigger or save nothing.

The mode-scoped case is the cleanest win. `preflight-check` takes exactly one of four modes per invocation, so each mode's own checks live in [`mode-plan-branch.md`](../claude-plugins/autopilot/skills/preflight-check/references/mode-plan-branch.md) or [`mode-commits-pr.md`](../claude-plugins/autopilot/skills/preflight-check/references/mode-commits-pr.md), and a run reads one file and never the other. The same shape applies to content that only exists off `--autopilot`: the interactive dialogs in `commits-create` and `pr-update`, and background mode in `pr-monitor`.

Prose is denser than a padded Markdown table. A routing table with four columns costs more bytes than the three lines of prose that say the same thing, and Prettier re-pads it on every edit — so state routing rules as a list unless the content is genuinely tabular.

## The guard

`skillBodyBudget.test.ts` in [`code-review-action`](../.github/actions/code-review-action/src/skillBodyBudget.test.ts) holds a per-skill byte budget. It fails when a body exceeds its budget **and** when a skill directory has no budget entry, so a new skill cannot ship unguarded. Discovery walks the filesystem via `walkMarkdown`, not a hardcoded list.

Budgets are a regression tripwire, not a target: a skill may sit well under its budget, and growth that earns its keep is a budget bump in the same commit, reviewed like any other change.

What the guard cannot prove is that a smaller body actually costs less at runtime. Moving a section into `references/` only saves tokens when a typical invocation does not read it back, and CI sees file sizes rather than what the model read — a body that halved by relocating text every run then loads via `Read` is strictly worse and still passes. The two rules above are what make an extraction sound; the guard only stops the bodies growing back.

## Measured effect

Applying all of the above to the five skills that re-load on the PR-review cycle:

| Skill             | Before   | After    | Change |
| ----------------- | -------- | -------- | ------ |
| `preflight-check` | 12,929 B | 10,313 B | −20%   |
| `commits-create`  | 20,537 B | 16,133 B | −21%   |
| `pr-update`       | 13,139 B | 9,464 B  | −28%   |
| `pr-monitor`      | 23,772 B | 17,156 B | −28%   |
| `pr-resolve`      | 16,008 B | 16,008 B | 0%     |
| **Total**         | 86,385 B | 69,074 B | −20%   |

Bodies alone understate it, because the invocation-count fix is the larger half. Counting each injection in one `/autopilot:run` with two review cycles, the skill-body bytes entering the conversation fall from roughly 208 KB to roughly 120 KB — about −42%. Interactive sessions gain less, since they read the extracted dialogs back.
