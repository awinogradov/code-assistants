/**
 * Tests for the `package.json` `release` field reader.
 */
import { describe, expect, test } from "bun:test";

import { readReleaseField, releaseTypes } from "./releaseField.ts";

describe("readReleaseField — type", () => {
  test.each(releaseTypes.map((value) => [value]))(
    "accepts recognized type %s",
    (value) => {
      expect(readReleaseField({ name: "x", release: { type: value } })).toEqual({
        type: value,
      });
    },
  );

  test("throws when the release field is missing", () => {
    expect(() => readReleaseField({ name: "x" })).toThrow(
      /Missing 'release' field in package\.json/,
    );
  });

  test("missing-field error references the docs", () => {
    expect(() => readReleaseField({ name: "x" })).toThrow(
      /docs\/release-field\.md/,
    );
  });

  test("throws when release is a bare string (old shape)", () => {
    expect(() => readReleaseField({ release: "lib-nodejs" })).toThrow(
      /'release' in package\.json must be an object/,
    );
  });

  test("throws when release is an array", () => {
    expect(() => readReleaseField({ release: [] })).toThrow(
      /must be an object.*Got array/,
    );
  });

  test("throws when release.type is missing", () => {
    expect(() => readReleaseField({ release: {} })).toThrow(
      /'release\.type'.*must be a string; got undefined/,
    );
  });

  test("throws when release.type is unrecognized", () => {
    expect(() =>
      readReleaseField({ release: { type: "not-a-real-type" } }),
    ).toThrow(/Unrecognized 'release\.type' value "not-a-real-type"/);
  });

  test("unrecognized-type error lists allowed values", () => {
    expect(() =>
      readReleaseField({ release: { type: "not-a-real-type" } }),
    ).toThrow(/lib-nodejs.*github-action.*claude-plugin/);
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
    expect(() => readReleaseField("not-an-object")).toThrow(
      /expected an object/,
    );
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
    expect(() =>
      readReleaseField({ release: { type: "lib-nodejs", slack: "" } }),
    ).toThrow(/'release\.slack'.*must be a non-empty string/);
  });

  test("throws when slack is not a string", () => {
    expect(() =>
      readReleaseField({ release: { type: "lib-nodejs", slack: 42 } }),
    ).toThrow(/'release\.slack'.*must be a non-empty string/);
  });
});
