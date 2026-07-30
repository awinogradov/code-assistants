# MIGRATING

## From 0.3.0 to 1.0.0

### Breaking changes

- removed the parallel_fanout and review_model_overrides action inputs

## From 1.7.2 to 2.0.0

### Breaking changes

- the consuming repo's PR quality-gate workflow must be named `PR` (name:

## From 2.4.0 to 3.0.0

### Breaking changes

- expert review no longer gates planning. plan skips it unless --experts-review is passed; linear:plan stores plans unconditionally with no ExitPlanMode and no score check; the 98 scoring target and three-pass revision budget are removed from the shared pipeline; the recorded score line format changed to `Score: <N>/100 · weakest: <dimension>`.
