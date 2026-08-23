#!/usr/bin/env node
// Fetches a GitHub issue deterministically and prints the provider-agnostic
// issue contract to stdout. Invoked by the gather-context skill in place of the
// resolve-issue-context delegated agent's GitHub path (the agent itself remains
// for the pr-review CI path); Linear inputs use lib/linear/fetch-issue.mjs.
//
// Runs under Node's native type stripping (Node >=24) and Bun — no build step;
// the file ships as source at ${CLAUDE_PLUGIN_ROOT}/lib/github/.
//
// Usage:  node "${CLAUDE_PLUGIN_ROOT}/lib/github/fetch-issue.ts" <owner/repo> <issue-number> [--assign]
//
// Always exits 0 and always prints a single JSON object: on any failure it
// prints the degraded shape with a non-null `resolveError`, so the caller can
// surface the error and STOP rather than proceed against missing data. With
// --assign it also self-assigns the authenticated user (idempotent,
// best-effort — an assignment failure never degrades the fetch) and fills
// `assignee` with one of the six canonical status strings. The one-line
// telemetry summary is mirrored to stderr for CI logs.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  buildIssueContext,
  degradedIssueContext,
  deriveAssigneeStatus,
  parseIssueJson,
} from "./issueContext.ts";
import type { IssueContext } from "./issueContext.ts";

interface Telemetry {
  durationMs: number;
  requestCount: number;
  payloadBytes: number;
  degradedReads: string[];
}

type HelperOutput = IssueContext & { telemetry: Telemetry };

const execFileAsync = promisify(execFile);
const ghOptions = { maxBuffer: 32 * 1024 * 1024, timeout: 120_000 };

let requestCount = 0;

async function ghRead(args: string[]): Promise<{ stdout: string | null; error: string | null }> {
  requestCount += 1;
  try {
    const { stdout } = await execFileAsync("gh", args, ghOptions);
    return { stdout: stdout.toString(), error: null };
  } catch (error) {
    const e = error as { stderr?: string; message?: string };
    const reason = (e.stderr ?? e.message ?? "").split("\n")[0].slice(0, 200);
    return { stdout: null, error: reason || "gh invocation failed" };
  }
}

const assigneesOf = (stdout: string | null): string[] | null => {
  if (stdout === null) return null;
  try {
    const parsed = JSON.parse(stdout) as { assignees?: { login?: string }[] };
    return (parsed.assignees ?? []).flatMap((entry) => (entry.login ? [entry.login] : []));
  } catch {
    return null;
  }
};

async function selfAssign(repo: string, issueNumber: number, context: IssueContext): Promise<string> {
  const login = (await ghRead(["api", "user", "--jq", ".login"])).stdout?.trim() ?? null;
  const preconditions = {
    login,
    state: context.status,
    assignees: [] as string[],
    editExitCode: null as number | null,
    editStderr: "",
    verifiedAssignees: null as string[] | null,
  };
  if (!login || context.status === "CLOSED") return deriveAssigneeStatus(preconditions);

  const current = await ghRead([
    "issue",
    "view",
    String(issueNumber),
    "-R",
    repo,
    "--json",
    "assignees",
  ]);
  const assignees = assigneesOf(current.stdout) ?? [];
  if (assignees.includes(login)) return deriveAssigneeStatus({ ...preconditions, assignees });

  requestCount += 1;
  let editExitCode = 0;
  let editStderr = "";
  try {
    await execFileAsync(
      "gh",
      ["issue", "edit", String(issueNumber), "-R", repo, "--add-assignee", login],
      ghOptions,
    );
  } catch (error) {
    const e = error as { code?: number; stderr?: string; message?: string };
    editExitCode = typeof e.code === "number" ? e.code : 1;
    editStderr = e.stderr ?? e.message ?? "";
  }
  if (editExitCode !== 0) {
    return deriveAssigneeStatus({ ...preconditions, assignees, editExitCode, editStderr });
  }

  // gh returns exit 0 even when GitHub silently drops the addition, so trust
  // only a verifying re-read.
  const verified = await ghRead([
    "issue",
    "view",
    String(issueNumber),
    "-R",
    repo,
    "--json",
    "assignees",
  ]);
  return deriveAssigneeStatus({
    ...preconditions,
    assignees,
    editExitCode,
    editStderr,
    verifiedAssignees: assigneesOf(verified.stdout) ?? [],
  });
}

async function main(): Promise<HelperOutput> {
  const startedAt = Date.now();
  const args = process.argv.slice(2).filter((arg) => arg !== "--assign");
  const assign = process.argv.includes("--assign");
  const [repo, numberArg] = args;
  const issueNumber = Number.parseInt(numberArg ?? "", 10);

  const finish = (context: IssueContext, degradedReads: string[]): HelperOutput => ({
    ...context,
    telemetry: {
      durationMs: Date.now() - startedAt,
      requestCount,
      payloadBytes: Buffer.byteLength(JSON.stringify(context)),
      degradedReads,
    },
  });

  if (!repo || !repo.includes("/") || Number.isNaN(issueNumber)) {
    return finish(
      degradedIssueContext(
        Number.isNaN(issueNumber) ? null : issueNumber,
        "usage: fetch-issue.ts <owner/repo> <issue-number> [--assign] — arguments missing or invalid",
      ),
      [],
    );
  }

  const fetched = await ghRead([
    "issue",
    "view",
    String(issueNumber),
    "-R",
    repo,
    "--json",
    "title,body,comments,labels,state,url",
  ]);
  if (fetched.stdout === null) {
    return finish(degradedIssueContext(issueNumber, fetched.error ?? "gh invocation failed"), [
      "issue",
    ]);
  }

  const raw = parseIssueJson(fetched.stdout);
  if (raw === null) {
    return finish(
      degradedIssueContext(issueNumber, "gh issue view returned an unrecognized payload shape"),
      ["issue"],
    );
  }

  const context = buildIssueContext(issueNumber, raw);
  if (!assign) return finish(context, []);
  return finish({ ...context, assignee: await selfAssign(repo, issueNumber, context) }, []);
}

const output = await main();
process.stderr.write(`fetch-issue telemetry: ${JSON.stringify(output.telemetry)}\n`);
process.stdout.write(JSON.stringify(output));
