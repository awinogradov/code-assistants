#!/usr/bin/env node
// Fetches a PR's review threads deterministically and prints the typed review
// contract to stdout. Invoked by the pr-answer, pr-resolve, and pr-review
// skills in place of the retired fetch-pr-reviews delegated agent — one bounded
// Bash call instead of a model-driven loop.
//
// Runs under Node's native type stripping (Node >=24) — no build step; the file
// ships as source at ${CLAUDE_PLUGIN_ROOT}/lib/github/.
//
// Usage:  node "${CLAUDE_PLUGIN_ROOT}/lib/github/fetch-pr-reviews.ts" <owner/repo> <pr-number> <pr-author>
//
// Always exits 0 and always prints a single JSON object. Reads degrade
// independently: a failed GraphQL read never discards successful REST reads —
// the payload is built from whatever loaded, `fetchError` names what failed
// (distinguishing rate limiting), and `telemetry.degradedReads` lists the
// failed reads so consumers never mistake a degraded fetch for "no findings".
// The one-line telemetry summary is mirrored to stderr for CI logs.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  buildGhReadCommands,
  buildReviewPayload,
  mergeReviewThreadPages,
  parseGhPaginatedJson,
} from "./reviewThreads.ts";
import type {
  RestComment,
  Review,
  ReviewMeta,
  ReviewPayload,
  ThreadPage,
} from "./reviewThreads.ts";

interface Telemetry {
  durationMs: number;
  requestCount: number;
  payloadBytes: number;
  degradedReads: string[];
}

type HelperOutput = ReviewPayload & { fetchError: string | null; telemetry: Telemetry };

interface ReadResult<T> {
  documents: T[];
  error: string | null;
}

const execFileAsync = promisify(execFile);
const ghOptions = { maxBuffer: 32 * 1024 * 1024, timeout: 120_000 };

const degradedReason = (error: unknown): string => {
  const e = error as { stderr?: string; message?: string };
  const stderr = (e.stderr ?? e.message ?? "").split("\n")[0].slice(0, 200);
  const isRateLimit = /rate limit|secondary rate/i.test(e.stderr ?? "");
  return isRateLimit ? `rate limited — ${stderr}` : stderr || "gh invocation failed";
};

async function ghRead<T>(args: string[]): Promise<ReadResult<T>> {
  try {
    const { stdout } = await execFileAsync("gh", args, ghOptions);
    return { documents: parseGhPaginatedJson<T>(stdout.toString()), error: null };
  } catch (error) {
    return { documents: [], error: degradedReason(error) };
  }
}

async function main(): Promise<HelperOutput> {
  const startedAt = Date.now();
  const [repoArg, prArg, authorArg] = process.argv.slice(2);
  const [owner, repo] = (repoArg ?? "").split("/");
  const pr = Number.parseInt(prArg ?? "", 10);

  if (!owner || !repo || Number.isNaN(pr) || !authorArg) {
    return {
      ...buildReviewPayload({
        pr: pr || 0,
        author: authorArg ?? "",
        meta: null,
        reviews: [],
        comments: [],
        threads: [],
      }),
      fetchError:
        "usage: fetch-pr-reviews.ts <owner/repo> <pr-number> <pr-author> — arguments missing or invalid",
      telemetry: { durationMs: 0, requestCount: 0, payloadBytes: 0, degradedReads: [] },
    };
  }

  const reads = buildGhReadCommands({ owner, repo, pr });
  const [reviews, comments, meta, threads] = await Promise.all([
    ghRead<Review[]>(reads.reviews),
    ghRead<RestComment[]>(reads.comments),
    ghRead<ReviewMeta>(reads.meta),
    ghRead<ThreadPage>(reads.threads),
  ]);

  const payload = buildReviewPayload({
    pr,
    author: authorArg,
    meta: meta.documents[0] ?? null,
    reviews: reviews.documents.flat(),
    comments: comments.documents.flat(),
    // A failed threads read leaves resolution state unknown: comments are kept
    // (never silently dropped as resolved) and the degradation is reported.
    threads: mergeReviewThreadPages(threads.documents),
  });

  const named: { name: string; read: ReadResult<unknown> }[] = [
    { name: "reviews", read: reviews },
    { name: "comments", read: comments },
    { name: "meta", read: meta },
    { name: "reviewThreads", read: threads },
  ];
  const failures = named
    .filter(({ read }) => read.error !== null)
    .map(({ name, read }) => ({ name, error: read.error }));

  const requestCount =
    reviews.documents.length + comments.documents.length + threads.documents.length + 1;

  return {
    ...payload,
    fetchError: failures.length
      ? failures.map(({ name, error }) => `${name}: ${error}`).join("; ")
      : null,
    telemetry: {
      durationMs: Date.now() - startedAt,
      requestCount,
      payloadBytes: Buffer.byteLength(JSON.stringify(payload)),
      degradedReads: failures.map(({ name }) => name),
    },
  };
}

const output = await main();
process.stderr.write(`fetch-pr-reviews telemetry: ${JSON.stringify(output.telemetry)}\n`);
process.stdout.write(JSON.stringify(output));
