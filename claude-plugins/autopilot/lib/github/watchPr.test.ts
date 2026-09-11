/**
 * End-to-end test of the watcher CLI: a `gh` shim on PATH serves scripted
 * responses, so the real process runs its own wait loop and the assertions
 * are about the contract a caller sees — one process, one JSON object on
 * stdout, the state and event files on disk, and the `--ack` round trip.
 */
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import type { WatchEvent } from "./prWatch.ts";

const cliPath = join(import.meta.dirname, "watch-pr.ts");

/** The shim script: picks the response for each gh invocation from `script.json`, advancing a persisted cycle counter. */
const shimServer = `
const { readFileSync, writeFileSync } = require("node:fs");
const dir = process.env.GH_SHIM_DIR;
const script = JSON.parse(readFileSync(dir + "/script.json", "utf8"));
const statePath = dir + "/shim-state.json";
let state = { cycle: -1, pullReads: 0, calls: 0 };
try { state = JSON.parse(readFileSync(statePath, "utf8")); } catch {}
const args = process.argv.slice(2);
const target = args[1] || "";
const isPull = /\\/pulls\\/\\d+$/.test(target);
if (isPull && state.pullReads === 0) state.cycle += 1;
state.calls += 1;
const cycle = script[state.cycle] || script[script.length - 1];
const pull = (sha) => ({ state: "open", merged: false, mergeable: true, mergeable_state: "clean", html_url: "https://github.com/o/r/pull/7", head: { sha }, base: { ref: "main" }, user: { login: "author" } });
let out;
if (isPull) { state.pullReads = state.pullReads === 0 ? 1 : 0; out = pull(cycle.head || "aaa111"); }
else if (target.includes("/check-runs")) out = { check_runs: cycle.checkRuns };
else if (target.endsWith("/status")) out = { statuses: [] };
else if (target.includes("/reviews")) out = [];
else if (target === "graphql") out = { data: { repository: { pullRequest: { reviewDecision: null, reviewThreads: { nodes: [] } } } } };
else if (target.includes("/rules/branches/")) out = [];
else if (target.includes("/contents/")) out = [{ name: "ci.yml" }];
else { process.stderr.write("unexpected gh args: " + args.join(" ")); process.exitCode = 1; }
writeFileSync(statePath, JSON.stringify(state));
if (out !== undefined) process.stdout.write(JSON.stringify(out));
`;

const run = (id: number, conclusion: string | null, status = "completed") => ({
  id,
  name: "Test",
  status,
  conclusion,
  app: { slug: "github-actions" },
  html_url: `https://ci/${id}`,
  completed_at: new Date().toISOString(),
});

const pendingCycle = { checkRuns: [run(1, null, "in_progress")] };
const readyCycle = { checkRuns: [run(1, "success")] };
const failingCycle = { checkRuns: [run(3, "failure")] };

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  event: WatchEvent;
}

describe("watch-pr CLI", () => {
  let workDir: string;
  let shimDir: string;
  let stateDir: string;

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), "watch-pr-"));
    shimDir = join(workDir, "bin");
    stateDir = join(workDir, "state");
    await Bun.write(join(shimDir, "gh-shim.cjs"), shimServer);
    const shim = `#!/bin/sh\nexec "${process.execPath}" "${join(shimDir, "gh-shim.cjs")}" "$@"\n`;
    await writeFile(join(shimDir, "gh"), shim);
    await chmod(join(shimDir, "gh"), 0o755);
  });

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  const invoke = async (args: string[], script: unknown[] | null): Promise<CliResult> => {
    if (script !== null) {
      await writeFile(join(shimDir, "script.json"), JSON.stringify(script));
      await rm(join(shimDir, "shim-state.json"), { force: true });
    }
    const proc = Bun.spawn([process.execPath, cliPath, ...args], {
      env: { ...process.env, PATH: `${shimDir}:${process.env.PATH ?? ""}`, GH_SHIM_DIR: shimDir },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { stdout, stderr, exitCode, event: JSON.parse(stdout) as WatchEvent };
  };

  const shimCalls = async (): Promise<number> =>
    (JSON.parse(await readFile(join(shimDir, "shim-state.json"), "utf8")) as { calls: number }).calls;

  test("missing arguments print one blocked event with the usage line and exit 0", async () => {
    const result = await invoke([], null);
    expect(result.exitCode).toBe(0);
    expect(result.event).toMatchObject({ schemaVersion: 1, event: "blocked" });
    expect(result.event.reason).toContain("usage:");
  });

  test("pending → pending → ready runs in one process and prints exactly one JSON object", async () => {
    const result = await invoke(["o/r", "7", "--interval", "0.01", "--state-dir", stateDir], [pendingCycle, pendingCycle, readyCycle]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim().startsWith("{") && result.stdout.trim().endsWith("}")).toBe(true);
    expect(result.event).toMatchObject({ event: "ready_for_review", headSha: "aaa111", terminal: true });
    expect(result.stderr.split("\n").filter(Boolean)).toHaveLength(1);
    expect(result.stderr).toContain('"cycles":3');
    const stateFile = join(stateDir, "o__r__7.json");
    expect(result.event.state.file).toBe(stateFile);
    expect(await Bun.file(stateFile).exists()).toBe(true);
    expect(await Bun.file(join(stateDir, "o__r__7.event.json")).exists()).toBe(true);
    expect(await Bun.file(join(stateDir, "o__r__7.log")).exists()).toBe(true);
  }, 20_000);

  test("checks_failed is re-emitted on restart without new reads and released by --ack", async () => {
    const first = await invoke(["o/r", "7", "--interval", "0.01", "--state-dir", stateDir], [failingCycle]);
    expect(first.event).toMatchObject({ event: "checks_failed", terminal: false });
    const callsAfterFirst = await shimCalls();

    const restarted = await invoke(["o/r", "7", "--interval", "0.01", "--state-dir", stateDir], null);
    expect(restarted.event.eventId).toBe(first.event.eventId);
    expect(await shimCalls()).toBe(callsAfterFirst);

    const acked = await invoke(
      ["o/r", "7", "--interval", "0.01", "--state-dir", stateDir, "--ack", first.event.eventId],
      [failingCycle, { checkRuns: [run(4, "success")] }],
    );
    expect(acked.event.event).toBe("ready_for_review");
  }, 20_000);
});
