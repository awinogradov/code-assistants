/**
 * Tests for ticket ID extraction utilities
 */
import { describe, expect, test } from "bun:test";

import {
  buildTicketPattern,
  extractPrNumber,
  extractTicketIds,
  getAllKeys,
  genericTicketPattern,
  mapTicketToSystem,
} from "./ticketExtractor.ts";

describe("ticketExtractor", () => {
  describe("genericTicketPattern", () => {
    test("matches UPPERCASE-number format", () => {
      expect("TEAM-123".match(genericTicketPattern)).toEqual(["TEAM-123"]);
    });

    test("matches multiple tickets in text", () => {
      const text = "feat: TEAM-1 and PROJ-456 done";
      expect(text.match(genericTicketPattern)).toEqual(["TEAM-1", "PROJ-456"]);
    });

    test("matches alphanumeric prefixes", () => {
      expect("ABC123-456".match(genericTicketPattern)).toEqual(["ABC123-456"]);
    });

    test("does not match lowercase", () => {
      expect("team-123".match(genericTicketPattern)).toBeNull();
    });

    test("does not match without number", () => {
      expect("TEAM-".match(genericTicketPattern)).toBeNull();
    });

    test("does not match without hyphen", () => {
      expect("TEAM123".match(genericTicketPattern)).toBeNull();
    });
  });

  describe("buildTicketPattern()", () => {
    test("returns generic pattern for empty keys", () => {
      const pattern = buildTicketPattern([]);
      expect("TEAM-123".match(pattern)).toEqual(["TEAM-123"]);
    });

    test("matches only specified keys", () => {
      const pattern = buildTicketPattern(["TEAM", "PROJ"]);
      expect("TEAM-1 PROJ-2 OTHER-3".match(pattern)).toEqual(["TEAM-1", "PROJ-2"]);
    });

    test("handles single key", () => {
      const pattern = buildTicketPattern(["TEAM"]);
      expect("TEAM-123".match(pattern)).toEqual(["TEAM-123"]);
      expect("PROJ-456".match(pattern)).toBeNull();
    });

    test("escapes regex special characters in keys", () => {
      const pattern = buildTicketPattern(["TE.AM"]);
      expect("TE.AM-123".match(pattern)).toEqual(["TE.AM-123"]);
      expect("TEXAM-123".match(pattern)).toBeNull();
    });
  });

  describe("extractTicketIds()", () => {
    test("extracts all tickets without keys filter", () => {
      const result = extractTicketIds("feat: TEAM-123 PROJ-456 fix");
      expect(result).toEqual(["TEAM-123", "PROJ-456"]);
    });

    test("filters by specified keys", () => {
      const result = extractTicketIds("TEAM-1 PROJ-2 OTHER-3", ["TEAM"]);
      expect(result).toEqual(["TEAM-1"]);
    });

    test("returns unique tickets only", () => {
      const result = extractTicketIds("TEAM-123 fixed TEAM-123 again");
      expect(result).toEqual(["TEAM-123"]);
    });

    test("returns empty array when no matches", () => {
      const result = extractTicketIds("no tickets here");
      expect(result).toEqual([]);
    });

    test("handles empty text", () => {
      expect(extractTicketIds("")).toEqual([]);
    });

    test("handles multiple keys", () => {
      const result = extractTicketIds("TEAM-1 PROJ-2 CORE-3 OTHER-4", ["TEAM", "PROJ", "CORE"]);
      expect(result).toEqual(["TEAM-1", "PROJ-2", "CORE-3"]);
    });

    test("is case sensitive for prefixes", () => {
      const result = extractTicketIds("TEAM-123 team-456 Team-789");
      expect(result).toEqual(["TEAM-123"]);
    });
  });

  describe("extractPrNumber()", () => {
    test("extracts PR number from squash merge format", () => {
      expect(extractPrNumber("feat: add auth (#45)")).toBe(45);
    });

    test("extracts from end of message only", () => {
      expect(extractPrNumber("fix (#123) issue (#456)")).toBe(456);
    });

    test("handles large PR numbers", () => {
      expect(extractPrNumber("chore: update (#12345)")).toBe(12345);
    });

    test("returns undefined when no PR number", () => {
      expect(extractPrNumber("chore: update deps")).toBeUndefined();
    });

    test("returns undefined for non-parenthesized number", () => {
      expect(extractPrNumber("fix #123")).toBeUndefined();
    });

    test("handles trailing whitespace", () => {
      expect(extractPrNumber("feat: add feature (#99)  ")).toBe(99);
    });
  });

  describe("mapTicketToSystem()", () => {
    test("maps ticket to system with matching key", () => {
      const systems = [
        { type: "linear" as const, keys: ["TEAM"] },
        { type: "jira" as const, keys: ["CORE"] },
      ];
      expect(mapTicketToSystem("TEAM-123", systems)).toBe("linear");
      expect(mapTicketToSystem("CORE-456", systems)).toBe("jira");
    });

    test("returns undefined when no key matches", () => {
      const systems = [{ type: "linear" as const, keys: ["TEAM"] }];
      expect(mapTicketToSystem("OTHER-123", systems)).toBeUndefined();
    });

    test("returns single generic system for any ticket", () => {
      const systems = [{ type: "linear" as const }];
      expect(mapTicketToSystem("ANY-123", systems)).toBe("linear");
    });

    test("returns first non-github system when multiple generic systems", () => {
      const systems = [{ type: "linear" as const }, { type: "github" as const }];
      expect(mapTicketToSystem("TEAM-123", systems)).toBe("linear");
    });

    test("returns first system when multiple non-github generic systems", () => {
      const systems = [{ type: "linear" as const }, { type: "jira" as const }];
      expect(mapTicketToSystem("ANY-123", systems)).toBe("linear");
    });

    test("prefers specific key match over generic", () => {
      const systems = [{ type: "linear" as const, keys: ["TEAM"] }, { type: "jira" as const }];
      expect(mapTicketToSystem("TEAM-123", systems)).toBe("linear");
    });

    test("handles multiple keys per system", () => {
      const systems = [{ type: "linear" as const, keys: ["TEAM", "PROJ", "DEV"] }];
      expect(mapTicketToSystem("TEAM-1", systems)).toBe("linear");
      expect(mapTicketToSystem("PROJ-2", systems)).toBe("linear");
      expect(mapTicketToSystem("DEV-3", systems)).toBe("linear");
    });
  });

  describe("getAllKeys()", () => {
    test("collects all keys from systems", () => {
      const systems = [
        { type: "linear" as const, keys: ["TEAM", "PROJ"] },
        { type: "jira" as const, keys: ["CORE"] },
      ];
      expect(getAllKeys(systems)).toEqual(["TEAM", "PROJ", "CORE"]);
    });

    test("returns empty array when any system is generic", () => {
      const systems = [{ type: "linear" as const, keys: ["TEAM"] }, { type: "jira" as const }];
      expect(getAllKeys(systems)).toEqual([]);
    });

    test("returns empty for empty keys array", () => {
      const systems = [{ type: "linear" as const, keys: [] }];
      expect(getAllKeys(systems)).toEqual([]);
    });

    test("deduplicates keys across systems", () => {
      const systems = [
        { type: "linear" as const, keys: ["TEAM", "SHARED"] },
        { type: "jira" as const, keys: ["SHARED", "CORE"] },
      ];
      const keys = getAllKeys(systems);
      expect(keys).toContain("TEAM");
      expect(keys).toContain("SHARED");
      expect(keys).toContain("CORE");
      expect(keys.filter((k) => k === "SHARED")).toHaveLength(1);
    });
  });
});
