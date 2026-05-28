/**
 * Tests for the `package.json` `release` field reader.
 */
import { describe, expect, test } from "bun:test";

import { readReleaseField, readRootRelease, releaseTypes } from "./releaseField.ts";

describe("readReleaseField — type", () => {
  test.each(releaseTypes.map((value) => [value]))("accepts recognized type %s", (value) => {
    expect(readReleaseField({ name: "x", release: { type: value } })).toEqual({
      type: value,
    });
  });

  test("throws when the release field is missing", () => {
    expect(() => readReleaseField({ name: "x" })).toThrow(
      /Missing 'release' field in package\.json/,
    );
  });

  test("missing-field error references the docs", () => {
    expect(() => readReleaseField({ name: "x" })).toThrow(/docs\/release-field\.md/);
  });

  test("throws when release is a bare string (old shape)", () => {
    expect(() => readReleaseField({ release: "lib-nodejs" })).toThrow(
      /'release' in package\.json must be an object/,
    );
  });

  test("throws when release is an array", () => {
    expect(() => readReleaseField({ release: [] })).toThrow(/must be an object.*Got array/);
  });

  test("throws when release.type is missing", () => {
    expect(() => readReleaseField({ release: {} })).toThrow(
      /'release\.type'.*must be a string; got undefined/,
    );
  });

  test("throws when release.type is unrecognized", () => {
    expect(() => readReleaseField({ release: { type: "not-a-real-type" } })).toThrow(
      /Unrecognized 'release\.type' value "not-a-real-type"/,
    );
  });

  test("unrecognized-type error lists allowed values", () => {
    expect(() => readReleaseField({ release: { type: "not-a-real-type" } })).toThrow(
      /lib-nodejs.*github-action.*claude-plugin/,
    );
  });

  test("throws when release.type is not a string", () => {
    expect(() => readReleaseField({ release: { type: 42 } })).toThrow(
      /must be a string; got number/,
    );
  });

  test("throws when packageJson is null", () => {
    expect(() => readReleaseField(null)).toThrow(/expected an object/);
  });

  test("throws when packageJson is not an object", () => {
    expect(() => readReleaseField("not-an-object")).toThrow(/expected an object/);
  });
});

describe("readReleaseField — slack", () => {
  test("returns slack channel when present", () => {
    expect(
      readReleaseField({
        release: { type: "lib-nodejs", slack: "#releases" },
      }),
    ).toEqual({ type: "lib-nodejs", slack: "#releases" });
  });

  test("omits slack key when not present", () => {
    const result = readReleaseField({ release: { type: "lib-nodejs" } });
    expect(result).toEqual({ type: "lib-nodejs" });
    expect("slack" in result).toBe(false);
  });

  test("throws when slack is an empty string", () => {
    expect(() => readReleaseField({ release: { type: "lib-nodejs", slack: "" } })).toThrow(
      /'release\.slack'.*must be a non-empty string/,
    );
  });

  test("throws when slack is not a string", () => {
    expect(() => readReleaseField({ release: { type: "lib-nodejs", slack: 42 } })).toThrow(
      /'release\.slack'.*must be a non-empty string/,
    );
  });
});

describe("readRootRelease", () => {
  test("returns empty object when no release field is present", () => {
    expect(readRootRelease({ name: "monorepo" })).toEqual({});
  });

  test("returns members array for monorepo root", () => {
    expect(
      readRootRelease({
        release: { members: [".github/actions/release-action", "packages/foo"] },
      }),
    ).toEqual({ members: [".github/actions/release-action", "packages/foo"] });
  });

  test("returns type for standalone root", () => {
    expect(readRootRelease({ release: { type: "lib-nodejs" } })).toEqual({
      type: "lib-nodejs",
    });
  });

  test("returns slack alongside members", () => {
    expect(
      readRootRelease({
        release: { members: ["packages/*"], slack: "#releases" },
      }),
    ).toEqual({ members: ["packages/*"], slack: "#releases" });
  });

  test("throws when both members and type are declared", () => {
    expect(() =>
      readRootRelease({
        release: { members: ["packages/*"], type: "lib-nodejs" },
      }),
    ).toThrow(/mutually exclusive/);
  });

  test("throws when members is not an array", () => {
    expect(() => readRootRelease({ release: { members: "packages/*" } })).toThrow(
      /must be an array of workspace paths/,
    );
  });

  test("throws when members is empty", () => {
    expect(() => readRootRelease({ release: { members: [] } })).toThrow(
      /must contain at least one workspace path/,
    );
  });

  test("throws when a members entry is not a non-empty string", () => {
    expect(() => readRootRelease({ release: { members: ["packages/*", ""] } })).toThrow(
      /entries must be non-empty strings/,
    );
  });

  test("throws when release is not an object", () => {
    expect(() => readRootRelease({ release: "lib-nodejs" })).toThrow(/must be an object/);
  });

  test("throws when packageJson is null", () => {
    expect(() => readRootRelease(null)).toThrow(/expected an object/);
  });
});

describe("readRootRelease — automerge", () => {
  test("returns automerge alongside members", () => {
    expect(readRootRelease({ release: { members: ["packages/*"], automerge: true } })).toEqual({
      members: ["packages/*"],
      automerge: true,
    });
  });

  test("returns automerge alongside type", () => {
    expect(readRootRelease({ release: { type: "lib-nodejs", automerge: false } })).toEqual({
      type: "lib-nodejs",
      automerge: false,
    });
  });

  test("returns automerge-only root with no members or type", () => {
    const result = readRootRelease({ release: { automerge: true } });
    expect(result).toEqual({ automerge: true });
    expect("members" in result).toBe(false);
    expect("type" in result).toBe(false);
  });

  test("omits automerge key when not present", () => {
    const result = readRootRelease({ release: { type: "lib-nodejs" } });
    expect("automerge" in result).toBe(false);
  });

  test("throws when automerge is not a boolean", () => {
    expect(() => readRootRelease({ release: { automerge: "yes" } })).toThrow(
      /'release\.automerge'.*must be a boolean/,
    );
  });
});
