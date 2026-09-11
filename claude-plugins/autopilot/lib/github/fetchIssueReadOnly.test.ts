/** Ensures invalid issue-helper arguments are rejected before any GitHub request. */
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const helperPath = join(import.meta.dirname, "fetch-issue.ts");

describe("review issue lookup", () => {
  test.each([
    ["--read-only", "owner/repo", "42", "--assign"],
    ["--assign", "owner/repo", "42", "--read-only"],
  ])("rejects assignment regardless of flag order: %j", async (...args) => {
    const child = Bun.spawn([process.execPath, helperPath, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    const result = JSON.parse(stdout);
    expect(exitCode).toBe(0);
    expect(result.resolveError).toBe("--read-only forbids --assign");
    expect(result.telemetry.requestCount).toBe(0);
    expect(stderr).toContain("fetch-issue telemetry:");
  });
});

describe("issue lookup argument validation", () => {
  test.each([
    { label: "missing repository", args: [] },
    { label: "missing issue number", args: ["owner/repo"] },
    { label: "extra argument", args: ["owner/repo", "42", "extra"] },
    { label: "missing owner", args: ["/repo", "42"] },
    { label: "missing repository name", args: ["owner/", "42"] },
    { label: "extra path segment", args: ["owner/repo/extra", "42"] },
    { label: "repository whitespace", args: ["owner/re po", "42"] },
    { label: "non-numeric issue", args: ["owner/repo", "abc"] },
    { label: "numeric prefix", args: ["owner/repo", "42abc"] },
    { label: "zero issue", args: ["owner/repo", "0"] },
    { label: "zero-padded issue", args: ["owner/repo", "042"] },
    { label: "negative issue", args: ["owner/repo", "-1"] },
    { label: "fractional issue", args: ["owner/repo", "1.5"] },
    { label: "unsafe integer", args: ["owner/repo", "9007199254740992"] },
  ])("rejects $label without GitHub requests", async ({ args }) => {
    const child = Bun.spawn([process.execPath, helperPath, "--read-only", ...args], {
      env: { ...process.env, PATH: "" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    const result = JSON.parse(stdout);
    expect(exitCode).toBe(0);
    expect(result.resolveError).toContain("arguments missing or invalid");
    expect(result.telemetry.requestCount).toBe(0);
    expect(stderr).toContain("fetch-issue telemetry:");
  });
});
