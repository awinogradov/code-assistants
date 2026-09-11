#!/usr/bin/env node
// Watches a pull request deterministically and prints exactly one bounded JSON
// event to stdout when there is something to act on (failed checks, new or
// edited review feedback, a merge conflict), when monitoring completes (ready
// for review, approved, merged, closed), or when it cannot continue (blocked).
// Invoked by the pr-monitor skill in place of its former model-driven polling
// loop: the model launches this process once and stays dormant until it exits.
//
// Runs under Node's native type stripping (Node >=24) and Bun — no build step;
// the file ships as source at ${CLAUDE_PLUGIN_ROOT}/lib/github/.
//
// Usage:  node "${CLAUDE_PLUGIN_ROOT}/lib/github/watch-pr.ts" <owner/repo> <pr-number> \
//           [--wait-for-approval] [--ack <event-id>] [--timeout <s>] [--interval <s>] \
//           [--check-grace <s>] [--state-dir <dir>] [--expect-check <name>]...
//
// Always exits 0 and always prints a single JSON object (schemaVersion 1); the
// one-line telemetry summary goes to stderr. Per-cycle diagnostics go to a
// pruned log next to the state file, never to stdout. State is keyed by
// repository and PR under <git common dir>/autopilot/pr-watch/ (override with
// --state-dir): a non-terminal event stays pending until the caller relaunches
// with --ack <event-id>, so a restart re-emits unacknowledged work and never
// repeats acknowledged work. The watcher performs no writes to GitHub.

import { execFile } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { buildEvent, maxLogLines, parseWatchArgs } from "./prWatch.ts";
import type { WatchState } from "./prWatch.ts";
import { runWatch } from "./prWatchLoop.ts";
import type { GhReadKind, GhReadResult } from "./prWatchLoop.ts";

const execFileAsync = promisify(execFile);
const ghOptions = { maxBuffer: 32 * 1024 * 1024, timeout: 120_000 };
const redactedPattern = /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g;

const classifyGhError = (stderr: string): GhReadKind => {
  if (/HTTP 401|not logged in|gh auth login|authentication required/i.test(stderr)) return "auth";
  if (/rate limit|secondary rate|HTTP 429/i.test(stderr)) return "rate-limited";
  if (/HTTP 404|Not Found|Branch not protected/i.test(stderr)) return "not-found";
  return "transient";
};

async function readGh(args: string[]): Promise<GhReadResult> {
  try {
    const { stdout } = await execFileAsync("gh", args, ghOptions);
    return { stdout: stdout.toString(), kind: "ok", error: null };
  } catch (error) {
    const e = error as { stderr?: string; message?: string };
    const stderr = e.stderr ?? e.message ?? "";
    const firstLine = stderr.split("\n")[0].slice(0, 200);
    return { stdout: null, kind: classifyGhError(stderr), error: firstLine || "gh invocation failed" };
  }
}

async function defaultStateDir(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--git-common-dir"]);
    return join(resolve(stdout.toString().trim()), "autopilot", "pr-watch");
  } catch {
    return join(tmpdir(), "autopilot-pr-watch");
  }
}

const pruneLog = async (logFile: string): Promise<void> => {
  const existing = await readFile(logFile, "utf8").catch(() => "");
  const lines = existing.split("\n").filter((line) => line.length > 0);
  if (lines.length <= maxLogLines) return;
  await writeFile(logFile, `${lines.slice(-maxLogLines).join("\n")}\n`);
};

interface Cancellation {
  isCancelled: () => boolean;
  sleep: (ms: number) => Promise<void>;
  dispose: () => void;
}

/** SIGINT/SIGTERM end the current sleep and let the loop flush state and exit cleanly. */
const installCancellation = (): Cancellation => {
  let cancelled = false;
  let wake: (() => void) | null = null;
  const onSignal = (): void => {
    cancelled = true;
    wake?.();
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  return {
    isCancelled: () => cancelled,
    sleep: (ms) =>
      new Promise((done) => {
        const timer = setTimeout(() => {
          wake = null;
          done();
        }, ms);
        wake = () => {
          clearTimeout(timer);
          wake = null;
          done();
        };
      }),
    dispose: () => {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    },
  };
};

async function main(): Promise<string> {
  const startedAt = Date.now();
  const parsed = parseWatchArgs(process.argv.slice(2));
  if (parsed.options === null) {
    const event = buildEvent({
      decision: { kind: "emit", event: "blocked", reason: parsed.error ?? "usage", keys: [], terminal: true, feedback: [] },
      classified: null,
      options: { owner: "", repo: "", pr: 0 },
      stateFile: null,
      logFile: null,
    });
    process.stderr.write(`watch-pr telemetry: ${JSON.stringify({ durationMs: 0, cycles: 0, requestCount: 0 })}\n`);
    return JSON.stringify(event);
  }
  const options = parsed.options;
  const stateDir = options.stateDir ?? (await defaultStateDir());
  await mkdir(stateDir, { recursive: true });
  const baseName = join(stateDir, `${options.owner}__${options.repo}__${options.pr}`);
  const stateFile = `${baseName}.json`;
  const logFile = `${baseName}.log`;
  await pruneLog(logFile);
  const cancellation = installCancellation();

  const log = (line: string): void => {
    const sanitized = line.replace(redactedPattern, "[redacted]");
    void appendFile(logFile, `${new Date().toISOString()} ${sanitized}\n`).catch(() => undefined);
  };
  const saveState = (state: WatchState): Promise<void> =>
    writeFile(stateFile, `${JSON.stringify({ ...state, updatedAt: Date.now() }, null, 2)}\n`);

  try {
    const run = await runWatch(options, {
      readGh,
      sleep: cancellation.sleep,
      now: () => Date.now(),
      loadState: () => readFile(stateFile, "utf8").catch(() => null),
      saveState,
      log,
      isCancelled: cancellation.isCancelled,
      stateFile,
      logFile,
    });
    await writeFile(`${baseName}.event.json`, `${JSON.stringify(run.event, null, 2)}\n`);
    const telemetry = {
      durationMs: Date.now() - startedAt,
      cycles: run.cycles,
      requestCount: run.requestCount,
    };
    log(`exit ${run.event.event} (${run.event.eventId}) ${JSON.stringify(telemetry)}`);
    process.stderr.write(`watch-pr telemetry: ${JSON.stringify(telemetry)}\n`);
    return JSON.stringify(run.event);
  } finally {
    cancellation.dispose();
  }
}

process.stdout.write(await main());
