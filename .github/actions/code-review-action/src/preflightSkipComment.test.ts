/**
 * Tests for the skip-comment assembly + posting reused by the post step.
 * Covers buildSkipCommentBody (footer only when reasons were produced, fail-open
 * links-only), the footer-aware dedup in postSkipComment, and stripFailureReasons.
 */
import type { FailedCheck } from "@code-assistants/actions-core/checkStatus";
import type { Octokit } from "@octokit/rest";

import { describe, expect, test } from "bun:test";

import { buildSkipCommentBody, postSkipComment, stripFailureReasons } from "./skipComment.ts";

const failed: FailedCheck[] = [{ name: "Auto label", url: "https://gh.example/runs/1", checkRunId: 1 }];

const reasonsOutput = JSON.stringify({ reasons: [{ name: "Auto label", reason: "Lint failed." }] });

const runSummary = JSON.stringify({
  mode: "preflight",
  model: "claude-sonnet-4-6",
  model_ms: 1200,
  tokens_in: 100,
  tokens_out: 20,
  cache_read_tokens: 0,
  cache_creation_tokens: 0,
  cost_usd: 0.01,
  num_turns: 1,
  tool_round_trips: 0,
});

describe("buildSkipCommentBody", () => {
  test("renders links, reason blockquotes, and the run-summary footer", () => {
    const body = buildSkipCommentBody("octocat", failed, reasonsOutput, runSummary, "review-bot");
    expect(body).toContain("- [Auto label](https://gh.example/runs/1)\n  > Lint failed.");
    expect(body).toContain("<!-- run-summary-start -->");
    expect(body).toContain("Review run summary 🤖");
  });

  test("links only and no footer when there are no reasons (fail-open)", () => {
    const body = buildSkipCommentBody("octocat", failed, "", "", "review-bot");
    expect(body).toContain("- [Auto label](https://gh.example/runs/1)");
    expect(body).not.toContain("  > ");
    expect(body).not.toContain("<!-- run-summary-start -->");
  });

  test("reasons without a summary yield blockquotes but no footer", () => {
    const body = buildSkipCommentBody("octocat", failed, reasonsOutput, "", "review-bot");
    expect(body).toContain("  > Lint failed.");
    expect(body).not.toContain("<!-- run-summary-start -->");
  });
});

describe("stripFailureReasons", () => {
  test("drops blockquote lines so dedup compares the stable skeleton", () => {
    expect(stripFailureReasons("- [A](u)\n  > reason\n> hint\nkeep")).toBe("- [A](u)\nkeep");
  });
});

function fakeOctokit(existing: string | null): { octokit: Octokit; created: string[] } {
  const created: string[] = [];
  const octokit = {
    rest: {
      issues: {
        listComments: () =>
          Promise.resolve({
            data: existing === null ? [] : [{ user: { login: "review-bot" }, body: existing }],
          }),
        createComment: ({ body }: { body: string }) => {
          created.push(body);
          return Promise.resolve({});
        },
      },
    },
  } as unknown as Octokit;
  return { octokit, created };
}

describe("postSkipComment", () => {
  test("posts when no equivalent comment exists", async () => {
    const { octokit, created } = fakeOctokit(null);
    await postSkipComment(octokit, "o", "r", 1, "review-bot", "- [A](u)\n  > reason");
    expect(created).toHaveLength(1);
  });

  test("skips a duplicate, ignoring footer and reason blockquotes", async () => {
    const { octokit, created } = fakeOctokit("- [A](u)\n  > old reason");
    await postSkipComment(octokit, "o", "r", 1, "review-bot", "- [A](u)\n  > new reason");
    expect(created).toHaveLength(0);
  });
});
