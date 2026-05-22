/**
 * Tests for platform.meta.yml parsing utilities
 */
import { describe, expect, test } from "bun:test";

import { parseReleaseType, parseSlackRelease } from "./platformMeta.ts";

describe("parseReleaseType", () => {
  test("extracts release type from valid content", () => {
    const content = `language: typescript
rules: Bun
release: github-action
`;
    expect(parseReleaseType(content)).toBe("github-action");
  });

  test("handles lib-nodejs release type", () => {
    expect(parseReleaseType("release: lib-nodejs\n")).toBe("lib-nodejs");
  });

  test("handles lib-bun release type", () => {
    expect(parseReleaseType("release: lib-bun\n")).toBe("lib-bun");
  });

  test("returns null when release field is missing", () => {
    const content = `language: typescript
rules: Bun
`;
    expect(parseReleaseType(content)).toBeNull();
  });

  test("returns null for empty content", () => {
    expect(parseReleaseType("")).toBeNull();
  });

  test("returns null when release value is empty", () => {
    expect(parseReleaseType("release:\n")).toBeNull();
  });

  test("does not match nested release fields", () => {
    const content = `slack:
  release: "#channel"
`;
    expect(parseReleaseType(content)).toBeNull();
  });
});

describe("parseSlackRelease", () => {
  test("extracts release channel from platform.meta.yml content", () => {
    const content = `language: typescript
slack:
  channel: "#platform"
  release: "#platform-engineering"
`;
    expect(parseSlackRelease(content)).toBe("#platform-engineering");
  });

  test("returns null when no slack block exists", () => {
    expect(parseSlackRelease("language: typescript\n")).toBeNull();
  });

  test("returns null when slack block has no release field", () => {
    const content = `slack:
  channel: "#platform"
`;
    expect(parseSlackRelease(content)).toBeNull();
  });

  test("stops at next top-level block", () => {
    const content = `slack:
  channel: "#platform"
linear:
  release: "#wrong"
`;
    expect(parseSlackRelease(content)).toBeNull();
  });

  test("strips quotes from channel name", () => {
    const content = `slack:
  release: "#quoted-channel"
`;
    expect(parseSlackRelease(content)).toBe("#quoted-channel");
  });
});
