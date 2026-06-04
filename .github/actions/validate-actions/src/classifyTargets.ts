/**
 * Map repository-relative paths to the kind of file the validate-actions linter
 * knows how to check.
 *
 * Two kinds are recognized:
 * - `workflow` — a GitHub Actions workflow under `.github/workflows/` (`.yml`/`.yaml`),
 *   linted by actionlint (which also shellchecks the bash embedded in `run:` steps).
 * - `action` — a composite action manifest `.github/actions/<name>/action.yml|yaml`,
 *   whose inline `run:` blocks are shellchecked directly because actionlint does not
 *   parse action manifests.
 *
 * Anything else is irrelevant and dropped, so callers can pass `git diff` output verbatim.
 *
 * @example
 * classifyTarget(".github/workflows/ci.yml");       // { kind: "workflow", path: "..." }
 * classifyTarget(".github/actions/foo/action.yml"); // { kind: "action", path: "..." }
 * classifyTarget("src/index.ts");                   // null
 */

/** The category of a linting target. */
export type TargetKind = "workflow" | "action";

/** A path the linter recognizes, tagged with how it should be checked. */
export interface Target {
  readonly kind: TargetKind;
  readonly path: string;
}

const workflowPattern = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const actionPattern = /^\.github\/actions\/[^/]+\/action\.ya?ml$/;

/**
 * Classify a single path, returning its {@link Target} or `null` when it is neither
 * a workflow nor a composite action manifest. A leading `./` is stripped first.
 */
export function classifyTarget(rawPath: string): Target | null {
  const path = rawPath.startsWith("./") ? rawPath.slice(2) : rawPath;
  if (workflowPattern.test(path)) return { kind: "workflow", path };
  if (actionPattern.test(path)) return { kind: "action", path };
  return null;
}

/** Classify many paths at once, keeping only the recognized targets. */
export function classifyTargets(paths: readonly string[]): Target[] {
  return paths.map(classifyTarget).filter((target): target is Target => target !== null);
}
