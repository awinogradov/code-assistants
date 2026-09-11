/** Ensures the review-only issue helper refuses assignment before any GitHub request. */
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
