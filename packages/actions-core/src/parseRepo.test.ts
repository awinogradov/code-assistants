import { describe, expect, test } from "bun:test";

import { parseRepo } from "./parseRepo.ts";

describe("parseRepo", () => {
  test("splits a valid owner/repo slug", () => {
    expect(parseRepo("awinogradov/code-assistants")).toEqual({
      owner: "awinogradov",
      repo: "code-assistants",
    });
  });

  test("throws on a missing repo segment", () => {
    expect(() => parseRepo("owner-only")).toThrow("Invalid REPO format");
  });

  test("throws on an empty owner", () => {
    expect(() => parseRepo("/repo")).toThrow("Invalid REPO format");
  });
});
