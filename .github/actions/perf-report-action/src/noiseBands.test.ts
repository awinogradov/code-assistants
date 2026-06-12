import { describe, expect, test } from "bun:test";

import { defaultNoiseBands, parseNoiseBands } from "./noiseBands.ts";

describe("parseNoiseBands", () => {
  test("returns defaults for undefined input", () => {
    expect(parseNoiseBands(undefined)).toEqual(defaultNoiseBands);
  });

  test("returns defaults for empty input", () => {
    expect(parseNoiseBands("  ")).toEqual(defaultNoiseBands);
  });

  test("merges a partial override over defaults", () => {
    const bands = parseNoiseBands(JSON.stringify({ timing: { absolute: 500, relative: 0.2 } }));
    expect(bands.timing).toEqual({ absolute: 500, relative: 0.2 });
    expect(bands.bundle).toEqual(defaultNoiseBands.bundle);
    expect(bands.score).toEqual(defaultNoiseBands.score);
    expect(bands.cls).toEqual(defaultNoiseBands.cls);
  });

  test("accepts a band without relative threshold", () => {
    const bands = parseNoiseBands(JSON.stringify({ bundle: { absolute: 2048 } }));
    expect(bands.bundle).toEqual({ absolute: 2048 });
  });

  test("throws on malformed JSON", () => {
    expect(() => parseNoiseBands("{not json")).toThrow();
  });

  test("throws on unknown keys", () => {
    expect(() => parseNoiseBands(JSON.stringify({ bundel: { absolute: 1 } }))).toThrow();
  });

  test("throws on negative thresholds", () => {
    expect(() => parseNoiseBands(JSON.stringify({ cls: { absolute: -1 } }))).toThrow();
  });
});
