import { z } from "zod";

/**
 * Pure helpers for turning shellcheck output into GitHub Actions annotations and a
 * process exit code. Kept free of any I/O so the line-mapping, severity, and
 * exit-code logic is unit-testable without spawning shellcheck.
 *
 * actionlint output is intentionally not modelled here: the orchestrator forwards
 * actionlint's native output to the job log and keys off its exit code, because
 * actionlint already understands workflow `run:` bash. This module exists for the
 * `action.yml` inline `run:` blocks that actionlint never parses.
 */

/** GitHub Actions annotation levels the linter emits. */
export type AnnotationLevel = "error" | "warning" | "notice";

/** A single finding rendered as a GitHub Actions annotation. */
export interface Annotation {
  readonly level: AnnotationLevel;
  readonly file: string;
  readonly line: number;
  readonly message: string;
  /** Errors and warnings fail the check; notices are informational only. */
  readonly blocking: boolean;
}

/**
 * Replace `${{ … }}` GitHub expressions with equal-length underscores so shellcheck
 * does not parse them as shell syntax, mirroring how actionlint sanitizes embedded
 * `run:` scripts. Equal length keeps line and column offsets stable.
 */
export function sanitizeExpressions(script: string): string {
  return script.replace(/\$\{\{[\s\S]*?\}\}/g, (match) => "_".repeat(match.length));
}

/**
 * shellcheck codes actionlint suppresses for `run:` scripts, replicated so a
 * composite action's inline bash is linted consistently with workflow `run:` bash.
 * Derived from actionlint v1.7.x (rule_shellcheck.go); each is unsafe specifically
 * because GitHub expressions and `env:` injection differ from a standalone script:
 * SC1091 (sourced file not found), SC2194/SC2050/SC2157 (constant-expression noise
 * from the `${{ }}` → underscores substitution), SC2153/SC2154 (vars assigned via
 * `env:`, invisible to shellcheck), SC2043 (one-iteration loop over a `${{ }}`).
 */
export const excludedShellcheckCodes = [
  "SC1091",
  "SC2194",
  "SC2050",
  "SC2153",
  "SC2154",
  "SC2157",
  "SC2043",
] as const;

/** Lines prepended to a script before it is piped to shellcheck (see {@link shellcheckSetup}). */
const setupLineCount = 1;

/** The shell-setup line prepended before a script is checked, mirroring actionlint. */
export function shellcheckSetup(shell: "bash" | "sh"): string {
  return shell === "bash" ? "set -eo pipefail" : "set -e";
}

/**
 * Arguments for `shellcheck` reading one script from stdin in the given shell.
 * No `--severity` is set, so the default (style and up) is used — identical to how
 * actionlint invokes shellcheck for workflow `run:` blocks, which keeps info-level
 * findings such as SC2086 (unquoted variable) and consistency between the two paths.
 */
export function shellcheckArgs(shell: "bash" | "sh"): string[] {
  return [
    "--norc",
    "--external-sources",
    "--format=json",
    "--shell",
    shell,
    "--exclude",
    excludedShellcheckCodes.join(","),
    "-",
  ];
}

/** A single diagnostic from `shellcheck --format=json`; unmodelled fields are ignored. */
export const shellcheckFindingSchema = z.object({
  line: z.number(),
  level: z.string(),
  code: z.number(),
  message: z.string(),
});

/** The full `shellcheck --format=json` payload: an array of findings. */
export const shellcheckOutputSchema = z.array(shellcheckFindingSchema);

export type ShellcheckFinding = z.infer<typeof shellcheckFindingSchema>;

function toAnnotationLevel(shellcheckLevel: string): AnnotationLevel {
  if (shellcheckLevel === "error") return "error";
  if (shellcheckLevel === "warning") return "warning";
  return "notice";
}

/**
 * Map a shellcheck finding back onto the source `action.yml`. The piped script is
 * prefixed with one setup line, so the finding line is shifted by that prefix and
 * rebased onto `blockStartLine` (the manifest line where the script body begins).
 * Every finding is blocking — actionlint fails a workflow on any shellcheck result,
 * so action manifests are held to the same bar; the level only sets the annotation color.
 */
export function mapShellcheckFinding(
  finding: ShellcheckFinding,
  file: string,
  blockStartLine: number,
): Annotation {
  return {
    level: toAnnotationLevel(finding.level),
    file,
    line: blockStartLine + finding.line - 1 - setupLineCount,
    message: `SC${finding.code}: ${finding.message}`,
    blocking: true,
  };
}

/** Render an annotation as a GitHub Actions workflow command line. */
export function formatAnnotation(annotation: Annotation): string {
  return `::${annotation.level} file=${annotation.file},line=${annotation.line}::${annotation.message}`;
}

/**
 * The process exit code: non-zero when any annotation is blocking or an operational
 * error occurred (a tool crashed or produced output that could not be parsed).
 */
export function computeExitCode(annotations: readonly Annotation[], operationalError: boolean): number {
  if (operationalError) return 1;
  return annotations.some((annotation) => annotation.blocking) ? 1 : 0;
}
