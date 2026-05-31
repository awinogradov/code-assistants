/**
 * Reads and validates the GitHub Actions event payload (`GITHUB_EVENT_PATH`).
 * The payload is untrusted external input, so it is parsed through a Zod schema
 * that throws a descriptive error on anything unexpected.
 *
 * @example
 *   const { prNumber, baseSha, headSha } = readPullRequestEvent(process.env.GITHUB_EVENT_PATH!);
 */
import { readFileSync } from "node:fs";

import { z } from "zod";

const pullRequestEventSchema = z.object({
  pull_request: z.object({
    number: z.number().int().positive(),
    base: z.object({ sha: z.string().min(1) }),
    head: z.object({ sha: z.string().min(1) }),
  }),
});

/** The pull-request coordinates label-PR mode needs. */
export interface PullRequestEvent {
  prNumber: number;
  baseSha: string;
  headSha: string;
}

/** Validates an already-parsed payload object — the pure, unit-testable core. */
export function parsePullRequestEvent(payload: unknown): PullRequestEvent {
  const parsed = pullRequestEventSchema.parse(payload);
  return {
    prNumber: parsed.pull_request.number,
    baseSha: parsed.pull_request.base.sha,
    headSha: parsed.pull_request.head.sha,
  };
}

export function readPullRequestEvent(eventPath: string): PullRequestEvent {
  return parsePullRequestEvent(JSON.parse(readFileSync(eventPath, "utf8")));
}
