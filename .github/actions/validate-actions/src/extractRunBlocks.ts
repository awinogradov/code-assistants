import { isMap, isScalar, isSeq, parseDocument, Scalar } from "yaml";

/**
 * Extract the shell scripts from a composite action manifest so they can be
 * shellchecked — actionlint never parses `action.yml`, so this is the only place
 * inline composite-action bash gets linted.
 *
 * Only steps whose effective shell is `bash` or `sh` are returned; `uses:` steps
 * and steps running other interpreters (e.g. `python`) are skipped, matching how
 * actionlint decides whether to shellcheck a workflow `run:` step.
 */

/** The shells shellcheck can lint. */
export type LintableShell = "bash" | "sh";

/** One runnable shell script lifted from `runs.steps[].run`. */
export interface RunBlock {
  /** The raw script body (dedented by the YAML parser). */
  readonly script: string;
  /** The interpreter shellcheck should assume. */
  readonly shell: LintableShell;
  /** 1-based line in the source manifest where the script body starts. */
  readonly line: number;
}

/** Outcome of scanning one manifest: its run blocks, or a YAML parse failure. */
export type ExtractResult =
  | { readonly ok: true; readonly blocks: RunBlock[] }
  | { readonly ok: false; readonly error: string; readonly line: number };

/** 1-based line number of a character offset within `source`. */
function offsetToLine(source: string, offset: number): number {
  return source.slice(0, Math.max(0, offset)).split("\n").length;
}

/** Resolve a step's `shell:` to a shellcheck-supported shell, or `null` to skip it. */
function resolveShell(shell: unknown): LintableShell | null {
  if (shell === "bash" || (typeof shell === "string" && shell.startsWith("bash "))) return "bash";
  if (shell === "sh" || (typeof shell === "string" && shell.startsWith("sh "))) return "sh";
  return null;
}

/**
 * Parse a composite `action.yml` and return every shellcheckable `run:` block with
 * the line where its body begins. A YAML parse error is returned as a failure so the
 * caller can surface it as a finding (a malformed manifest must fail the check).
 */
export function extractRunBlocks(source: string): ExtractResult {
  const doc = parseDocument(source);
  const [firstError] = doc.errors;
  if (firstError) {
    const line = firstError.linePos?.[0]?.line ?? offsetToLine(source, firstError.pos?.[0] ?? 0);
    return { ok: false, error: firstError.message, line };
  }

  const steps = doc.getIn(["runs", "steps"], true);
  if (!isSeq(steps)) return { ok: true, blocks: [] };

  const blocks = steps.items.flatMap((step): RunBlock[] => {
    if (!isMap(step)) return [];
    const runNode = step.get("run", true);
    if (!isScalar(runNode) || typeof runNode.value !== "string") return [];
    const shell = resolveShell(step.get("shell"));
    if (!shell) return [];
    // Block scalars (`|`/`>`) report range[0] at the header line, but the script body
    // starts on the next line; flow scalars report the body line directly.
    const isBlock = runNode.type === Scalar.BLOCK_LITERAL || runNode.type === Scalar.BLOCK_FOLDED;
    const bodyLine = offsetToLine(source, runNode.range?.[0] ?? 0) + (isBlock ? 1 : 0);
    return [{ script: runNode.value, shell, line: bodyLine }];
  });

  return { ok: true, blocks };
}
