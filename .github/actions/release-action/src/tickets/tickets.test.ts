/**
 * Tests for ticket system integration orchestrator
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  autoDetectTicketSystems,
  extractPrDescriptions,
  formatTicketsMarkdown,
  parseTicketArgs,
  releasePrTitlePattern,
  serializePrDescriptionsToYaml,
} from "./tickets.ts";
import type { PullRequestInfo, TicketInfo } from "./tickets.types.ts";

describe("tickets", () => {
  describe("parseTicketArgs()", () => {
    test("parses single system without keys", () => {
      const result = parseTicketArgs(["--tickets=linear"]);

      expect(result).toEqual([{ type: "linear" }]);
    });

    test("parses single system with keys", () => {
      const result = parseTicketArgs(["--tickets=linear:TEAM,PROJ"]);

      expect(result).toEqual([{ type: "linear", keys: ["TEAM", "PROJ"] }]);
    });

    test("parses multiple systems", () => {
      const result = parseTicketArgs(["--tickets=linear:TEAM", "--tickets=jira:CORE,INFRA"]);

      expect(result).toEqual([
        { type: "linear", keys: ["TEAM"] },
        { type: "jira", keys: ["CORE", "INFRA"] },
      ]);
    });

    test("returns null when no --tickets args", () => {
      const result = parseTicketArgs(["--other=value"]);

      expect(result).toBeNull();
    });

    test("ignores non-tickets args", () => {
      const result = parseTicketArgs(["--other=value", "--tickets=linear", "--foo"]);

      expect(result).toEqual([{ type: "linear" }]);
    });

    test("handles github system", () => {
      const result = parseTicketArgs(["--tickets=github"]);

      expect(result).toEqual([{ type: "github" }]);
    });

    test("handles single key", () => {
      const result = parseTicketArgs(["--tickets=jira:PROJ"]);

      expect(result).toEqual([{ type: "jira", keys: ["PROJ"] }]);
    });
  });

  describe("formatTicketsMarkdown()", () => {
    test("formats Linear tickets as table with markdown links", () => {
      const tickets: TicketInfo[] = [
        {
          id: "TEAM-123",
          title: "Add authentication",
          url: "https://linear.app/issue/TEAM-123",
          system: "linear",
          prNumber: 45,
          prAuthor: "developer",
          prUrl: "https://github.com/org/repo/pull/45",
        },
      ];

      const result = formatTicketsMarkdown(tickets, "Linear", "org", "repo");

      expect(result).toContain("## Linear");
      expect(result).toContain("| Issue | PR | Author |");
      expect(result).toContain("| --- | --- | --- |");
      expect(result).toContain(
        "| [TEAM-123: Add authentication](https://linear.app/issue/TEAM-123) | [#45](https://github.com/org/repo/pull/45) | @developer |"
      );
    });

    test("formats GitHub Issues as table with bare refs (no title)", () => {
      const tickets: TicketInfo[] = [
        {
          id: "40",
          title: "Robust review",
          url: "https://github.com/org/repo/issues/40",
          system: "github",
          prNumber: 42,
          prAuthor: "developer",
          prUrl: "https://github.com/org/repo/pull/42",
        },
      ];

      const result = formatTicketsMarkdown(tickets, "GitHub Issues", "org", "repo");

      expect(result).toContain("## GitHub Issues");
      expect(result).toContain("| #40 | [#42](https://github.com/org/repo/pull/42) | @developer |");
      // Should NOT include title (GitHub preview shows it)
      expect(result).not.toContain("Robust review");
    });

    test("formats Linear tickets without PR info using dash cells", () => {
      const tickets: TicketInfo[] = [
        {
          id: "TEAM-123",
          title: "Add feature",
          url: "https://linear.app/issue/TEAM-123",
          system: "linear",
        },
      ];

      const result = formatTicketsMarkdown(tickets, "Linear", "org", "repo");

      expect(result).toContain("## Linear");
      expect(result).toContain(
        "| [TEAM-123: Add feature](https://linear.app/issue/TEAM-123) | — | — |"
      );
    });

    test("formats PR as bare number when prUrl is missing", () => {
      const tickets: TicketInfo[] = [
        {
          id: "TEAM-123",
          title: "Add feature",
          url: "https://linear.app/issue/TEAM-123",
          system: "linear",
          prNumber: 45,
        },
      ];

      const result = formatTicketsMarkdown(tickets, "Linear", "org", "repo");

      expect(result).toContain("| #45 |");
      expect(result).not.toContain("[#45]");
    });

    test("returns empty string for empty tickets", () => {
      const result = formatTicketsMarkdown([], "Linear", "org", "repo");

      expect(result).toBe("");
    });

    test("formats multiple Linear tickets as table rows", () => {
      const tickets: TicketInfo[] = [
        {
          id: "TEAM-1",
          title: "First",
          url: "url1",
          system: "linear",
          prNumber: 10,
          prUrl: "pr1",
        },
        {
          id: "TEAM-2",
          title: "Second",
          url: "url2",
          system: "linear",
          prNumber: 11,
          prUrl: "pr2",
          prAuthor: "dev",
        },
      ];

      const result = formatTicketsMarkdown(tickets, "Linear", "org", "repo");
      const lines = result.split("\n");

      expect(lines[0]).toBe("## Linear");
      expect(lines[2]).toBe("| Issue | PR | Author |");
      expect(lines[3]).toBe("| --- | --- | --- |");
      expect(lines[4]).toContain("[TEAM-1: First](url1)");
      expect(lines[5]).toContain("[TEAM-2: Second](url2)");
      expect(lines[5]).toContain("@dev");
    });

    test("uses correct system name", () => {
      const tickets: TicketInfo[] = [{ id: "CORE-1", title: "Fix", url: "url", system: "jira" }];

      expect(formatTicketsMarkdown(tickets, "Jira", "org", "repo")).toContain("## Jira");
      expect(formatTicketsMarkdown(tickets, "GitHub Issues", "org", "repo")).toContain(
        "## GitHub Issues"
      );
    });

    test("ignores commits in table output", () => {
      const tickets: TicketInfo[] = [
        {
          id: "ARCH-90",
          title: "Release action for History service",
          url: "https://linear.app/issue/ARCH-90",
          system: "linear",
          prNumber: 44,
          prAuthor: "arturovt",
          prUrl: "https://github.com/org/repo/pull/44",
          commits: [
            {
              message: "feat(ci): add manual release workflow for history service",
              sha: "52ff2cd",
            },
            { message: "fix(ci): correct workflow trigger", sha: "a1b2c3d" },
          ],
        },
      ];

      const result = formatTicketsMarkdown(tickets, "Linear", "org", "repo");

      expect(result).toContain("## Linear");
      expect(result).toContain(
        "| [ARCH-90: Release action for History service](https://linear.app/issue/ARCH-90) | [#44](https://github.com/org/repo/pull/44) | @arturovt |"
      );
      // Commits should NOT appear in the table format
      expect(result).not.toContain("commits");
      expect(result).not.toContain("<details>");
      expect(result).not.toContain("52ff2cd");
    });
  });

  describe("autoDetectTicketSystems()", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      delete process.env.LINEAR_KEYS;
      delete process.env.JIRA_KEYS;
    });

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    test("detects Linear when linearApiKey is set", () => {
      const result = autoDetectTicketSystems({ linearApiKey: "lin_xxx" });

      expect(result).toEqual([{ type: "linear", keys: undefined }]);
    });

    test("detects Jira when all credentials are set", () => {
      const result = autoDetectTicketSystems({
        jiraBaseUrl: "https://company.atlassian.net",
        jiraEmail: "user@company.com",
        jiraApiToken: "token",
      });

      expect(result).toEqual([{ type: "jira", keys: undefined }]);
    });

    test("does not detect Jira with partial credentials", () => {
      const result = autoDetectTicketSystems({
        jiraBaseUrl: "https://company.atlassian.net",
        jiraEmail: "user@company.com",
        // missing jiraApiToken
      });

      expect(result).toEqual([]);
    });

    test("detects both systems when all credentials are set", () => {
      const result = autoDetectTicketSystems({
        linearApiKey: "lin_xxx",
        jiraBaseUrl: "https://company.atlassian.net",
        jiraEmail: "user@company.com",
        jiraApiToken: "token",
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ type: "linear", keys: undefined });
      expect(result[1]).toEqual({ type: "jira", keys: undefined });
    });

    test("returns empty array when no credentials", () => {
      const result = autoDetectTicketSystems({});

      expect(result).toEqual([]);
    });

    test("reads LINEAR_KEYS from environment", () => {
      process.env.LINEAR_KEYS = "TEAM,PROJ";

      const result = autoDetectTicketSystems({ linearApiKey: "lin_xxx" });

      expect(result).toEqual([{ type: "linear", keys: ["TEAM", "PROJ"] }]);
    });

    test("reads JIRA_KEYS from environment", () => {
      process.env.JIRA_KEYS = "CORE,INFRA";

      const result = autoDetectTicketSystems({
        jiraBaseUrl: "https://company.atlassian.net",
        jiraEmail: "user@company.com",
        jiraApiToken: "token",
      });

      expect(result).toEqual([{ type: "jira", keys: ["CORE", "INFRA"] }]);
    });

    test("handles empty keys string", () => {
      process.env.LINEAR_KEYS = "";

      const result = autoDetectTicketSystems({ linearApiKey: "lin_xxx" });

      expect(result).toEqual([{ type: "linear", keys: undefined }]);
    });

    test("handles single key", () => {
      process.env.LINEAR_KEYS = "TEAM";

      const result = autoDetectTicketSystems({ linearApiKey: "lin_xxx" });

      expect(result).toEqual([{ type: "linear", keys: ["TEAM"] }]);
    });

    test("detects GitHub when githubToken is set", () => {
      const result = autoDetectTicketSystems({ githubToken: "ghp_xxx" });

      expect(result).toEqual([{ type: "github" }]);
    });

    test("detects all systems when all credentials are set", () => {
      const result = autoDetectTicketSystems({
        linearApiKey: "lin_xxx",
        jiraBaseUrl: "https://company.atlassian.net",
        jiraEmail: "user@company.com",
        jiraApiToken: "token",
        githubToken: "ghp_xxx",
      });

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ type: "linear", keys: undefined });
      expect(result[1]).toEqual({ type: "jira", keys: undefined });
      expect(result[2]).toEqual({ type: "github" });
    });
  });

  describe("release PR filtering", () => {
    test("release PR titles are excluded from PR details map", () => {
      expect(releasePrTitlePattern.test("Release 1.2.0")).toBe(true);
      expect(releasePrTitlePattern.test("Release Dialog Manager 1.2.0")).toBe(true);
      expect(releasePrTitlePattern.test("TOOLS-323: Fix ticket extraction")).toBe(false);
      expect(releasePrTitlePattern.test("feat: add release notes")).toBe(false);
      expect(releasePrTitlePattern.test("release 1.0.0")).toBe(false);
    });

    test("filtering removes release PRs from descriptions", () => {
      const map = new Map<string, PullRequestInfo>();
      map.set("sha-feature", {
        number: 100,
        title: "TOOLS-50: Add feature",
        body: "Feature description",
        url: "https://github.com/org/repo/pull/100",
        author: "developer",
      });
      map.set("sha-release", {
        number: 101,
        title: "Release 1.2.0",
        body: "## [1.2.0]\n\n### Features\n\n* TOOLS-50: add feature",
        url: "https://github.com/org/repo/pull/101",
        author: "release-bot",
      });

      const filtered = new Map([...map].filter(([, pr]) => !releasePrTitlePattern.test(pr.title)));

      const descriptions = extractPrDescriptions(filtered);

      expect(descriptions).toHaveLength(1);
      expect(descriptions[0]?.prNumber).toBe(100);
      expect(descriptions[0]?.title).toBe("TOOLS-50: Add feature");
    });
  });

  describe("extractPrDescriptions()", () => {
    function makePrMap(
      ...prs: Array<Partial<PullRequestInfo> & { sha?: string }>
    ): Map<string, PullRequestInfo> {
      const map = new Map<string, PullRequestInfo>();
      for (const { sha, ...pr } of prs) {
        const full: PullRequestInfo = {
          number: pr.number ?? 1,
          title: pr.title ?? "PR title",
          body: pr.body,
          url: pr.url ?? "https://github.com/org/repo/pull/1",
          author: pr.author ?? "dev",
        };
        map.set(sha ?? `sha-${full.number}`, full);
      }
      return map;
    }

    test("returns empty array when no PRs have bodies", () => {
      const map = makePrMap(
        { number: 1, body: undefined },
        { number: 2, body: "" },
        { number: 3, body: "   " }
      );

      expect(extractPrDescriptions(map)).toEqual([]);
    });

    test("extracts release notes section when present", () => {
      const body = `Some description\n\n**Release notes:**\n\n- Feature A added\n- Feature B improved\n\n---\n\n**Issues:**\nCloses TOOLS-100`;
      const map = makePrMap({ number: 54, body, title: "TOOLS-100: Add feature", author: "dev" });

      const result = extractPrDescriptions(map);

      expect(result).toHaveLength(1);
      expect(result[0]?.content).toBe("- Feature A added\n- Feature B improved");
      expect(result[0]?.prNumber).toBe(54);
    });

    test("falls back to full body when no release notes section", () => {
      const body = "This PR adds a new endpoint for auth.";
      const map = makePrMap({ number: 10, body });

      const result = extractPrDescriptions(map);

      expect(result).toHaveLength(1);
      expect(result[0]?.content).toBe("This PR adds a new endpoint for auth.");
    });

    test("truncates content exceeding max length", () => {
      const body = "x".repeat(3000);
      const map = makePrMap({ number: 1, body });

      const result = extractPrDescriptions(map);

      expect(result).toHaveLength(1);
      expect(result[0]?.content).toHaveLength(2003); // 2000 + "..."
      expect(result[0]?.content).toEndWith("...");
    });

    test("deduplicates by PR number", () => {
      const map = new Map<string, PullRequestInfo>();
      const pr: PullRequestInfo = {
        number: 42,
        title: "Feature",
        body: "description",
        url: "url",
        author: "dev",
      };
      map.set("sha-1", pr);
      map.set("sha-2", pr);

      const result = extractPrDescriptions(map);

      expect(result).toHaveLength(1);
    });

    test("handles release note singular form", () => {
      const body = `**Release note:**\n\nSingle important change\n\n---`;
      const map = makePrMap({ number: 1, body });

      const result = extractPrDescriptions(map);

      expect(result[0]?.content).toBe("Single important change");
    });
  });

  describe("serializePrDescriptionsToYaml()", () => {
    test("produces valid YAML with block scalars", () => {
      const result = serializePrDescriptionsToYaml([
        { prNumber: 54, title: "Add feature", content: "Line 1\nLine 2", author: "dev" },
      ]);

      expect(result).toContain("- prNumber: 54");
      expect(result).toContain('  title: "Add feature"');
      expect(result).toContain("  author: dev");
      expect(result).toContain("  content: |");
      expect(result).toContain("    Line 1");
      expect(result).toContain("    Line 2");
    });

    test("escapes quotes in titles", () => {
      const result = serializePrDescriptionsToYaml([
        { prNumber: 1, title: 'Fix "broken" thing', content: "Fixed it", author: "dev" },
      ]);

      expect(result).toContain('  title: "Fix \\"broken\\" thing"');
    });

    test("escapes backslashes before quotes in titles", () => {
      const result = serializePrDescriptionsToYaml([
        { prNumber: 1, title: 'C:\\path "x"', content: "Fixed it", author: "dev" },
      ]);

      expect(result).toContain('  title: "C:\\\\path \\"x\\""');
    });

    test("escapes backslashes in titles without quotes", () => {
      const result = serializePrDescriptionsToYaml([
        { prNumber: 1, title: 'C:\\path', content: "Fixed it", author: "dev" },
      ]);

      expect(result).toContain('  title: "C:\\\\path"');
    });

    test("serializes multiple descriptions", () => {
      const result = serializePrDescriptionsToYaml([
        { prNumber: 1, title: "First", content: "Content 1", author: "dev1" },
        { prNumber: 2, title: "Second", content: "Content 2", author: "dev2" },
      ]);

      const entries = result.split("- prNumber:");
      expect(entries).toHaveLength(3); // first element is empty string before first match
    });
  });
});
