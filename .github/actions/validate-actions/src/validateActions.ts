#!/usr/bin/env bun
/**
 * Entry point for the validate-actions composite action.
 *
 * Lints the files passed via `--files <paths…>` (the action computes the changed
 * set), or, with no flag, discovers every workflow and composite action manifest.
 * Workflow files go to actionlint (which also shellchecks their embedded `run:`
 * bash); composite `action.yml` files have their inline `run:` blocks shellchecked
 * directly, because actionlint never parses action manifests.
 *
 * @example
 *   bun run validateActions.ts --files .github/workflows/ci.yml .github/actions/x/action.yml
 *   bun run validateActions.ts            # discover and lint everything
 */
import { Glob } from "bun";
import { classifyTargets } from "./classifyTargets.ts";
import { extractRunBlocks } from "./extractRunBlocks.ts";
import {
  type Annotation,
  computeExitCode,
  formatAnnotation,
  mapShellcheckFinding,
  sanitizeExpressions,
  shellcheckArgs,
  shellcheckOutputSchema,
  shellcheckSetup,
} from "./linterReport.ts";

interface ProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** The outcome of shellchecking one composite action manifest. */
export interface ManifestResult {
  readonly annotations: Annotation[];
  /** A tool crashed or returned output that could not be parsed (must fail the run). */
  readonly operationalError: boolean;
}

/** Run a child process, draining stdout/stderr concurrently to avoid pipe deadlock. */
async function runProcess(command: string[], stdin?: Uint8Array): Promise<ProcessResult> {
  try {
    const proc = Bun.spawn(command, { stdin: stdin ?? "ignore", stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { exitCode, stdout, stderr };
  } catch (error) {
    // Preserve the error class (e.g. a spawn ENOENT vs a TypeError) so operational
    // failures stay diagnosable instead of being flattened to a bare message.
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return { exitCode: -1, stdout: "", stderr: detail };
  }
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Read the `--files <paths…>` argument, or `null` to discover everything. */
function parseFilesArg(argv: readonly string[]): string[] | null {
  const index = argv.indexOf("--files");
  if (index === -1) return null;
  return argv.slice(index + 1).filter((arg) => !arg.startsWith("--"));
}

/** Discover every workflow file and composite action manifest in the repository. */
async function discoverTargetPaths(): Promise<string[]> {
  const patterns = [
    ".github/workflows/*.yml",
    ".github/workflows/*.yaml",
    ".github/actions/*/action.yml",
    ".github/actions/*/action.yaml",
  ];
  const found = await Promise.all(
    patterns.map((pattern) => Array.fromAsync(new Glob(pattern).scan("."))),
  );
  return found.flat();
}

/** Lint workflow files with actionlint; returns whether it found problems or crashed. */
async function runActionlint(paths: readonly string[]): Promise<{ operationalError: boolean; hasFindings: boolean }> {
  if (paths.length === 0) return { operationalError: false, hasFindings: false };
  const result = await runProcess(["actionlint", "-no-color", ...paths]);
  if (result.stdout) console.log(result.stdout);
  if (result.exitCode === 0) return { operationalError: false, hasFindings: false };
  if (result.exitCode === 1) return { operationalError: false, hasFindings: true };
  console.log(`::error::actionlint could not run (exit ${result.exitCode}): ${result.stderr || "see log"}`);
  return { operationalError: true, hasFindings: false };
}

/**
 * Shellcheck the inline `run:` blocks of one composite action manifest, mapping each
 * finding back to a line in the manifest. A YAML parse error becomes a blocking finding.
 */
export async function lintActionManifest(path: string): Promise<ManifestResult> {
  const source = await Bun.file(path).text();
  const extracted = extractRunBlocks(source);
  if (!extracted.ok) {
    const annotation: Annotation = {
      level: "error",
      file: path,
      line: extracted.line,
      message: `invalid YAML: ${extracted.error}`,
      blocking: true,
    };
    return { annotations: [annotation], operationalError: false };
  }

  const annotations: Annotation[] = [];
  let operationalError = false;
  for (const block of extracted.blocks) {
    const script = `${shellcheckSetup(block.shell)}\n${sanitizeExpressions(block.script)}`;
    const result = await runProcess(["shellcheck", ...shellcheckArgs(block.shell)], new TextEncoder().encode(script));
    const parsed = shellcheckOutputSchema.safeParse(tryParseJson(result.stdout));
    if (!parsed.success) {
      operationalError = true;
      console.log(`::error file=${path}::shellcheck failed: ${result.stderr || result.stdout || `exit ${result.exitCode}`}`);
      continue;
    }
    annotations.push(...parsed.data.map((finding) => mapShellcheckFinding(finding, path, block.line)));
  }
  return { annotations, operationalError };
}

/** Lint the resolved targets and return the process exit code (0 clean, 1 problems). */
export async function runValidate(argv: readonly string[]): Promise<number> {
  const filesArg = parseFilesArg(argv);
  const paths = filesArg ?? (await discoverTargetPaths());
  const targets = classifyTargets(paths);

  if (targets.length === 0) {
    console.log("validate-actions: no workflow or action files to check");
    return 0;
  }

  const workflowPaths = targets.filter((target) => target.kind === "workflow").map((target) => target.path);
  const actionPaths = targets.filter((target) => target.kind === "action").map((target) => target.path);

  const [actionlintResult, manifestResults] = await Promise.all([
    runActionlint(workflowPaths),
    Promise.all(actionPaths.map(lintActionManifest)),
  ]);

  const annotations = manifestResults.flatMap((result) => result.annotations);
  for (const annotation of annotations) {
    console.log(formatAnnotation(annotation));
  }

  const operationalError = actionlintResult.operationalError || manifestResults.some((result) => result.operationalError);
  const failed = actionlintResult.hasFindings || computeExitCode(annotations, operationalError) === 1;
  console.log(failed ? "validate-actions: problems found" : `validate-actions: ${targets.length} file(s) OK`);
  return failed ? 1 : 0;
}

if (import.meta.main) {
  process.exit(await runValidate(Bun.argv.slice(2)));
}
