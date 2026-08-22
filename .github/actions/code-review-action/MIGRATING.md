# MIGRATING

## From 0.3.0 to 1.0.0

### Breaking changes

- removed the parallel_fanout and review_model_overrides action inputs

## From 1.7.2 to 2.0.0

### Breaking changes

- the consuming repo's PR quality-gate workflow must be named `PR` (name:

## From 2.4.0 to 3.0.0

### Breaking changes

- expert review no longer gates planning. plan skips it unless --experts-review is passed; linear-plan stores plans unconditionally with no ExitPlanMode and no score check; the 98 scoring target and three-pass revision budget are removed from the shared pipeline; the recorded score line format changed to `Score: <N>/100 · weakest: <dimension>`.

## From 3.0.0 to 4.0.0

### Breaking changes

- /autopilot:linear-plan no longer runs the expert-review panel by default; pass --experts-review to keep the previous always-review behavior. Plans stored without the flag record Score: skipped in the stored header.

## From 4.0.1 to 5.0.0

### Breaking changes

- the four migrated agents emit bare JSON objects instead of markdown blocks, expert-review drops revision.rescore and derives score from its dimensions, and stored plan Score: lines record per-reviewer verdicts instead of a single average

## From 5.1.0 to 6.0.0

### Breaking changes

- _Document migration steps here._

## From 6.4.0 to 7.0.0

### Breaking changes

- the autopilot:fetch-pr-reviews agent is removed; review-thread
