#!/usr/bin/env node
// Digests the current branch against its base deterministically and prints the
// typed contract to stdout. Invoked by the gather-context skill in place of the
// retired digest-branch-diff delegated agent — one bounded Bash call instead of
// a model-driven loop. Also reports git state (branch, isWorktree), absorbing
// the fan-out's separate git-state commands.
//
// Runs under Node's native type stripping (Node >=24) and Bun — no build step;
// the file ships as source at ${CLAUDE_PLUGIN_ROOT}/lib/git/.
//
// Usage:  node "${CLAUDE_PLUGIN_ROOT}/lib/git/digest-branch.ts" [base-ref]
//
// The base ref defaults to the remote HEAD (refs/remotes/origin/HEAD), falling
// back to origin/main. Always exits 0 and always prints a single JSON object.
// Reads degrade independently: a failed `cherry` read nulls only
// `isStaleMerged`, `digestError` names what failed, and
// `telemetry.degradedReads` lists the failed reads — so consumers never mistake
// a degraded digest for a level branch.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { buildBranchDigest, maxCommits } from "./branchDigest.ts";
import type { BranchDigest } from "./branchDigest.ts";

interface Telemetry {
  durationMs: number;
  commandCount: number;
  payloadBytes: number;
  degradedReads: string[];
}

type HelperOutput = BranchDigest & { telemetry: Telemetry };

interface ReadResult {
  stdout: string | null;
  error: string | null;
}

const execFileAsync = promisify(execFile);
const gitOptions = { maxBuffer: 32 * 1024 * 1024, timeout: 120_000 };

let commandCount = 0;

async function gitRead(args: string[]): Promise<ReadResult> {
  commandCount += 1;
  try {
    const { stdout } = await execFileAsync("git", args, gitOptions);
    return { stdout: stdout.toString(), error: null };
  } catch (error) {
    const e = error as { stderr?: string; message?: string };
    const reason = (e.stderr ?? e.message ?? "").split("\n")[0].slice(0, 200);
    return { stdout: null, error: reason || "git invocation failed" };
  }
}

async function resolveBaseRef(argRef: string | undefined): Promise<string> {
  if (argRef) return argRef;
  const remoteHead = await gitRead(["rev-parse", "--abbrev-ref", "refs/remotes/origin/HEAD"]);
  const resolved = remoteHead.stdout?.trim();
  return resolved ? resolved : "origin/main";
}

async function main(): Promise<HelperOutput> {
  const startedAt = Date.now();
  const base = await resolveBaseRef(process.argv[2]);

  const [branch, gitDir, gitCommonDir, baseVerify] = await Promise.all([
    gitRead(["branch", "--show-current"]),
    gitRead(["rev-parse", "--git-dir"]),
    gitRead(["rev-parse", "--git-common-dir"]),
    gitRead(["rev-parse", "--verify", "--quiet", `${base}^{commit}`]),
  ]);

  // An absent base ref (unfetched remote, non-main default with no origin/HEAD)
  // would fail every diff read identically; degrade once, explicitly, instead.
  const diffReads =
    baseVerify.error === null
      ? await Promise.all([
          gitRead(["log", `${base}..HEAD`, "--oneline", "--no-decorate", "-n", String(maxCommits + 1)]),
          gitRead(["diff", `${base}...HEAD`, "--numstat"]),
          gitRead(["cherry", base, "HEAD"]),
          gitRead(["rev-list", "--count", `HEAD..${base}`]),
        ])
      : null;
  const [log, numstat, cherry, baseAhead] = diffReads ?? [
    { stdout: null, error: `base ref ${base} not found` },
    { stdout: null, error: `base ref ${base} not found` },
    { stdout: null, error: `base ref ${base} not found` },
    { stdout: null, error: `base ref ${base} not found` },
  ];

  const digest = buildBranchDigest({
    branch: branch.stdout,
    gitDir: gitDir.stdout,
    gitCommonDir: gitCommonDir.stdout,
    log: log.stdout,
    numstat: numstat.stdout,
    cherry: cherry.stdout,
    baseAhead: baseAhead.stdout,
  });

  const named: { name: string; read: ReadResult }[] = [
    { name: "branch", read: branch },
    { name: "gitDir", read: gitDir },
    { name: "gitCommonDir", read: gitCommonDir },
    { name: "log", read: log },
    { name: "numstat", read: numstat },
    { name: "cherry", read: cherry },
    { name: "baseAhead", read: baseAhead },
  ];
  const failures = named.filter(({ read }) => read.error !== null);

  const withError: BranchDigest = {
    ...digest,
    digestError: failures.length
      ? failures.map(({ name, read }) => `${name}: ${read.error}`).join("; ")
      : null,
  };

  return {
    ...withError,
    telemetry: {
      durationMs: Date.now() - startedAt,
      commandCount,
      payloadBytes: Buffer.byteLength(JSON.stringify(withError)),
      degradedReads: failures.map(({ name }) => name),
    },
  };
}

const output = await main();
process.stderr.write(`digest-branch telemetry: ${JSON.stringify(output.telemetry)}\n`);
process.stdout.write(JSON.stringify(output));
