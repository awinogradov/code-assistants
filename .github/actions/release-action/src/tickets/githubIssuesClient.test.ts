/**
 * Tests for GitHub Issues client utilities
 */
import { afterEach, describe, expect, mock, test } from "bun:test";

import {
  createGithubIssuesClient,
  extractGithubIssueNumbers,
  githubIssuePattern,
} from "./githubIssuesClient.ts";

describe("githubIssuesClient", () => {
  describe("githubIssuePattern", () => {
    test("matches #N at start of text", () => {
      expect("#123 is the issue".match(githubIssuePattern)).toEqual(["#123"]);
    });

    test("matches #N mid-sentence", () => {
      expect("see issue #456 for details".match(githubIssuePattern)).toEqual(["#456"]);
    });

    test("does not match in URL paths", () => {
      githubIssuePattern.lastIndex = 0;
      expect("https://github.com/org/repo/pull/123".match(githubIssuePattern)).toBeNull();
    });

    test("does not match preceded by word character", () => {
      githubIssuePattern.lastIndex = 0;
      expect("word#123".match(githubIssuePattern)).toBeNull();
    });
  });

  describe("extractGithubIssueNumbers()", () => {
    test("extracts single issue number", () => {
      expect(extractGithubIssueNumbers("Fixes #123")).toEqual(["123"]);
    });

    test("extracts multiple issue numbers", () => {
      expect(extractGithubIssueNumbers("Fixes #123 and relates to #456")).toEqual(["123", "456"]);
    });

    test("deduplicates issue numbers", () => {
      expect(extractGithubIssueNumbers("#123 and #123")).toEqual(["123"]);
    });

    test("returns empty array when no matches", () => {
      expect(extractGithubIssueNumbers("no issues here")).toEqual([]);
    });

    test("does not match numbers in URLs", () => {
      expect(extractGithubIssueNumbers("https://github.com/org/repo/pull/123")).toEqual([]);
    });

    test("does not match numbers preceded by word characters", () => {
      expect(extractGithubIssueNumbers("word#123")).toEqual([]);
    });

    test("handles empty string", () => {
      expect(extractGithubIssueNumbers("")).toEqual([]);
    });

    test("excludes known PR numbers", () => {
      const excludePrNumbers = new Set([273]);
      expect(extractGithubIssueNumbers("Fixes #42 and refs #273", excludePrNumbers)).toEqual([
        "42",
      ]);
    });

    test("excludes multiple known PR numbers", () => {
      const excludePrNumbers = new Set([273, 269, 235]);
      expect(extractGithubIssueNumbers("#273 #269 #235 #42", excludePrNumbers)).toEqual(["42"]);
    });

    test("returns empty when all matches are excluded", () => {
      const excludePrNumbers = new Set([273, 269]);
      expect(extractGithubIssueNumbers("#273 #269", excludePrNumbers)).toEqual([]);
    });

    test("does not exclude when exclusion set is undefined", () => {
      expect(extractGithubIssueNumbers("#273")).toEqual(["273"]);
    });

    test("does not exclude when exclusion set is empty", () => {
      expect(extractGithubIssueNumbers("#273", new Set())).toEqual(["273"]);
    });

    test("exclusion matches exact number only", () => {
      const excludePrNumbers = new Set([273]);
      expect(extractGithubIssueNumbers("#27 #273 #2730", excludePrNumbers)).toEqual(["27", "2730"]);
    });
  });

  describe("createGithubIssuesClient()", () => {
    const originalFetch = globalThis.fetch;

    function mockFetch(handler: (...args: unknown[]) => Promise<Response>): void {
      globalThis.fetch = mock(handler) as unknown as typeof fetch;
    }

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    test("returns ticket info for a real issue", async () => {
      mockFetch(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              number: 42,
              title: "Bug in auth flow",
              html_url: "https://github.com/org/repo/issues/42",
            }),
            { status: 200 }
          )
        )
      );

      const client = createGithubIssuesClient("org", "repo", "ghp_xxx");
      const result = await client.fetchTicket("42");

      expect(result).toEqual({
        id: "#42",
        title: "Bug in auth flow",
        url: "https://github.com/org/repo/issues/42",
        system: "github",
      });
    });

    test("returns null when issue is actually a pull request", async () => {
      mockFetch(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              number: 393,
              title: "TOOLS-196: Fix release notes",
              html_url: "https://github.com/org/repo/pull/393",
              pull_request: {
                url: "https://api.github.com/repos/org/repo/pulls/393",
                html_url: "https://github.com/org/repo/pull/393",
              },
            }),
            { status: 200 }
          )
        )
      );

      const client = createGithubIssuesClient("org", "repo", "ghp_xxx");
      const result = await client.fetchTicket("393");

      expect(result).toBeNull();
    });

    test("returns null for 404 response", async () => {
      mockFetch(() => Promise.resolve(new Response(null, { status: 404 })));

      const client = createGithubIssuesClient("org", "repo", "ghp_xxx");
      const result = await client.fetchTicket("999");

      expect(result).toBeNull();
    });

    test("throws on non-404 error response", async () => {
      mockFetch(() =>
        Promise.resolve(new Response(null, { status: 500, statusText: "Internal Server Error" }))
      );

      const client = createGithubIssuesClient("org", "repo", "ghp_xxx");

      await expect(client.fetchTicket("42")).rejects.toThrow(
        "GitHub API error: 500 Internal Server Error"
      );
    });

    test("strips # prefix from ticket ID", async () => {
      mockFetch((...args: unknown[]) => {
        expect(String(args[0])).toContain("/issues/42");
        return Promise.resolve(
          new Response(
            JSON.stringify({
              number: 42,
              title: "Issue",
              html_url: "https://github.com/org/repo/issues/42",
            }),
            { status: 200 }
          )
        );
      });

      const client = createGithubIssuesClient("org", "repo", "ghp_xxx");
      await client.fetchTicket("#42");
    });
  });
});
