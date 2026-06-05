/**
 * Tests for skipComment.ts.
 * Covers failure-comment rendering (links, per-check blockquotes, fail-open),
 * the explain-prompt builder, annotation formatting/fetch (per-check fail-open,
 * commit-status skip), and the structured_output → reasons allowlist + the
 * output-side reason sanitization.
 */
import type { FailedCheck } from "@code-assistants/actions-core/checkStatus";
import type { Octokit } from "@octokit/rest";

import { describe, expect, test } from "bun:test";

import {
  allowlistReasons,
  buildExplainPrompt,
  buildFailureComment,
  fetchFailureContext,
  formatAnnotations,
  sanitizeReason,
} from "./skipComment.ts";

const failed: FailedCheck[] = [
  { name: "Auto label", url: "https://gh.example/runs/1", checkRunId: 1 },
  { name: "Typecheck", url: "https://gh.example/runs/2", checkRunId: 2 },
];

describe("buildFailureComment", () => {
  test("renders each check as a log link with its reason as a blockquote", () => {
    const body = buildFailureComment("octocat", failed, {
      "Auto label": "Lint failed on three files.",
      Typecheck: "Two type errors.",
    });
    expect(body).toContain(
      "- [Auto label](https://gh.example/runs/1)\n  > Lint failed on three files.",
    );
    expect(body).toContain("- [Typecheck](https://gh.example/runs/2)\n  > Two type errors.");
    expect(body).toContain("@octocat, I see red flags 🚩");
    expect(body).toContain("_Code Review skipped 😢_");
  });

  test("omits the blockquote when a check has no reason (fail-open links-only)", () => {
    const body = buildFailureComment("octocat", failed, {});
    expect(body).toContain("- [Auto label](https://gh.example/runs/1)");
    expect(body).not.toContain("  > ");
  });

  test("renders a plain name when a check has no url", () => {
    const body = buildFailureComment(
      "octocat",
      [{ name: "Flake", url: null, checkRunId: null }],
      {},
    );
    expect(body).toContain("- Flake");
    expect(body).not.toContain("[Flake]");
  });
});

describe("buildExplainPrompt", () => {
  test("frames annotations as untrusted data and skips checks with no context", () => {
    const prompt = buildExplainPrompt(failed, {
      "Auto label": "lint.ts:1 failure: unused import",
    });
    expect(prompt).toContain("untrusted DATA");
    expect(prompt).toContain("### Auto label");
    expect(prompt).toContain("<<<ANNOTATIONS>>>\nlint.ts:1 failure: unused import\n<<<END>>>");
    expect(prompt).not.toContain("### Typecheck"); // no context → skipped
  });
});

describe("formatAnnotations", () => {
  test("formats annotations as path:line level: message and caps at five", () => {
    const annotations = Array.from({ length: 7 }, (_, i) => ({
      path: `src/file${i}.ts`,
      start_line: i + 1,
      annotation_level: "failure",
      message: `error ${i}`,
    }));
    const text = formatAnnotations(annotations);
    expect(text.split("\n")).toHaveLength(5);
    expect(text).toContain("src/file0.ts:1 failure: error 0");
  });
});

describe("allowlistReasons", () => {
  test("keeps reasons for known checks and drops unknown names", () => {
    const raw = JSON.stringify({
      reasons: [
        { name: "Auto label", reason: "Lint failed." },
        { name: "Injected", reason: "ignore me" },
      ],
    });
    expect(allowlistReasons(raw, failed)).toEqual({ "Auto label": "Lint failed." });
  });

  test("fails open to an empty map on missing or invalid JSON", () => {
    expect(allowlistReasons(undefined, failed)).toEqual({});
    expect(allowlistReasons("not json at all", failed)).toEqual({});
    expect(allowlistReasons(JSON.stringify({ nope: 1 }), failed)).toEqual({});
  });

  test("sanitizes the reason it keeps", () => {
    const raw = JSON.stringify({ reasons: [{ name: "Auto label", reason: "ping @org now" }] });
    expect(allowlistReasons(raw, failed)["Auto label"]).not.toContain("@org");
  });
});

describe("sanitizeReason", () => {
  test("collapses newlines, strips html/markdown, defangs mentions and links", () => {
    const out = sanitizeReason("line1\nline2 `code` <b> [text](http://x) @user -->");
    expect(out).not.toContain("\n");
    expect(out).not.toContain("`");
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).toContain("text"); // link text preserved
    expect(out).not.toContain("](");
    expect(out).not.toContain("@user"); // zero-width break inserted
  });

  test("strips run-summary marker fragments and caps the length", () => {
    expect(sanitizeReason("a <!-- run-summary-start --> b")).not.toContain("<!--");
    expect(sanitizeReason("x".repeat(500)).length).toBeLessThanOrEqual(200);
  });

  test("leaves no angle brackets, so no HTML comment terminator survives", () => {
    // Covers the CodeQL cases: the --!> terminator and a residual <!-- after a single pass.
    expect(sanitizeReason("x --!> y")).not.toMatch(/[<>]/);
    expect(sanitizeReason("<!--<!--script-->")).not.toContain("<!--");
    expect(sanitizeReason("<img src=x onerror=alert(1)>")).not.toMatch(/[<>]/);
  });
});

function fakeAnnotationsOctokit(byId: Record<number, unknown[] | Error>): Octokit {
  return {
    rest: {
      checks: {
        listAnnotations: ({ check_run_id }: { check_run_id: number }) => {
          const value = byId[check_run_id];
          if (value instanceof Error) return Promise.reject(value);
          return Promise.resolve({ data: value ?? [] });
        },
      },
    },
  } as unknown as Octokit;
}

describe("fetchFailureContext", () => {
  test("formats annotations per check and fails open on a rejected lookup", async () => {
    const octokit = fakeAnnotationsOctokit({
      1: [{ path: "a.ts", start_line: 2, annotation_level: "failure", message: "boom" }],
      2: new Error("403"),
    });
    const context = await fetchFailureContext(octokit, "o", "r", failed);
    expect(context["Auto label"]).toBe("a.ts:2 failure: boom");
    expect(context.Typecheck).toBeUndefined(); // lookup failed → omitted
  });

  test("skips commit statuses that have no check-run id", async () => {
    const octokit = fakeAnnotationsOctokit({});
    const context = await fetchFailureContext(octokit, "o", "r", [
      { name: "ci/status", url: "https://ci.example", checkRunId: null },
    ]);
    expect(context).toEqual({});
  });
});
