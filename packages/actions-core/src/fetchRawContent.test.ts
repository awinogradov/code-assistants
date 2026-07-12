import { describe, expect, test } from "bun:test";

import type { Octokit } from "@octokit/rest";

import { fetchRawContent } from "./fetchRawContent.ts";

const args = {
  owner: "awinogradov",
  repo: "code-assistants",
  path: "CLAUDE.md",
  ref: "main",
};

function octokitThrowing(error: unknown): Octokit {
  return {
    request: () => Promise.reject(error),
  } as unknown as Octokit;
}

function octokitReturning(data: unknown): Octokit {
  return {
    request: () => Promise.resolve({ data }),
  } as unknown as Octokit;
}

async function captureFailure(octokit: Octokit): Promise<Error> {
  try {
    await fetchRawContent({ octokit, ...args });
  } catch (error) {
    return error as Error;
  }

  throw new Error("Expected fetchRawContent to reject");
}

describe("fetchRawContent", () => {
  test("returns the raw file body", async () => {
    const content = await fetchRawContent({ octokit: octokitReturning("# Rules\n"), ...args });

    expect(content).toBe("# Rules\n");
  });

  test("returns null when the file is missing", async () => {
    const error = Object.assign(new Error("Not Found"), { status: 404 });
    const content = await fetchRawContent({ octokit: octokitThrowing(error), ...args });

    expect(content).toBeNull();
  });

  test("summarizes a 5xx HTML error page instead of dumping it", async () => {
    // GitHub's "Unicorn" page: Octokit lifts the whole document into `message`.
    const htmlPage = `<!DOCTYPE html>\n<html>\n${"  <p>padding</p>\n".repeat(50)}</html>`;
    const error = Object.assign(new Error(htmlPage), { status: 500 });

    const failure = await captureFailure(octokitThrowing(error));

    expect(failure.message).toStartWith(
      "Failed to fetch awinogradov/code-assistants:CLAUDE.md@main: HTTP 500: <!DOCTYPE html>",
    );
    expect(failure.message).not.toInclude("padding");
    expect(failure.message.split("\n")).toHaveLength(1);
  });

  test("truncates an over-long single-line message", async () => {
    const error = Object.assign(new Error("x".repeat(500)), { status: 502 });

    const failure = await captureFailure(octokitThrowing(error));

    expect(failure.message).toInclude("HTTP 502: ");
    expect(failure.message).toEndWith("…");
    expect(failure.message.length).toBeLessThan(300);
  });

  test("keeps a statusless error message intact", async () => {
    const failure = await captureFailure(octokitReturning({ notAString: true }));

    expect(failure.message).toBe(
      "Failed to fetch awinogradov/code-assistants:CLAUDE.md@main: Expected raw string content from awinogradov/code-assistants:CLAUDE.md@main, got object",
    );
  });
});
