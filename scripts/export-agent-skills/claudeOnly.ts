/**
 * Skills excluded from the portable export because their core mechanic is the
 * Claude Code harness itself, not a workflow another CLI could follow. The
 * criteria: a skill is Claude-only when removing the harness-only tool it is
 * built around (not merely mentions) silently voids the skill's contract —
 * degraded prose is acceptable, a silently missing human gate is not. Links
 * pointing at an excluded skill rewrite to its GitHub source, so exported
 * skills that reference one stay readable.
 */

/** Excluded plugin skill directory name → one-line reason shown in the generated README. */
export const claudeOnlySkills: ReadonlyMap<string, string> = new Map([
  [
    "plan",
    "its human approval gate is Claude Code plan mode (EnterPlanMode/ExitPlanMode); without it the skill's contract — no edits before an approved plan — silently disappears",
  ],
  [
    "run-primed",
    "consumes the SHA-validated context brief a Claude Code explore session writes to .claude/context/brief.md and fails loudly without that Claude-session artifact",
  ],
]);
