import { describe, expect, test } from "bun:test";

import { bandLabelFor, deltaFor, outsideBand } from "./classifyDeltas.ts";
import { defaultNoiseBands } from "./noiseBands.ts";
import type { MetricResult } from "./snapshotLoad.ts";

const ok = (value: number): MetricResult => ({ ok: true, value });
const missing: MetricResult = { ok: false, reason: "missing" };

describe("outsideBand", () => {
  const band = { absolute: 200, relative: 0.1 };

  test("inside when below the absolute threshold", () => {
    expect(outsideBand(199, 0.5, band)).toBe(false);
  });

  test("outside exactly at both thresholds", () => {
    expect(outsideBand(200, 0.1, band)).toBe(true);
  });

  test("inside when relative threshold not cleared", () => {
    expect(outsideBand(250, 0.05, band)).toBe(false);
  });

  test("outside on absolute-only bands", () => {
    expect(outsideBand(0.01, null, { absolute: 0.01 })).toBe(true);
  });

  test("inside when relative is required but base was zero", () => {
    expect(outsideBand(300, null, band)).toBe(false);
  });
});

describe("deltaFor", () => {
  const band = defaultNoiseBands.timing;

  test("classifies an unfavorable lower-is-better delta as regression", () => {
    const delta = deltaFor(ok(1300), ok(1000), band, false);
    expect(delta).toEqual({ kind: "ok", absolute: 300, relative: 0.3, regressed: true });
  });

  test("an improvement is never a regression", () => {
    const delta = deltaFor(ok(700), ok(1000), band, false);
    expect(delta.kind === "ok" && delta.regressed).toBe(false);
  });

  test("higher-is-better flips the unfavorable direction", () => {
    const delta = deltaFor(ok(0.85), ok(0.95), defaultNoiseBands.score, true);
    expect(delta.kind === "ok" && delta.regressed).toBe(true);
  });

  test("missing head propagates the reason", () => {
    expect(deltaFor(missing, ok(1), band, false)).toEqual({ kind: "n/a", reason: "missing" });
  });

  test("missing base propagates the reason", () => {
    expect(deltaFor(ok(1), missing, band, false)).toEqual({ kind: "n/a", reason: "missing" });
  });
});

describe("bandLabelFor", () => {
  test("renders the default bands like the original report", () => {
    expect(bandLabelFor(defaultNoiseBands, "bundle")).toBe(">= 5% AND >= 1 KiB");
    expect(bandLabelFor(defaultNoiseBands, "score")).toBe(">= 3 pts");
    expect(bandLabelFor(defaultNoiseBands, "timing")).toBe(">= 10% AND >= 200 ms");
    expect(bandLabelFor(defaultNoiseBands, "cls")).toBe(">= 0.01");
  });

  test("renders absolute-only overrides without the relative clause", () => {
    expect(bandLabelFor({ ...defaultNoiseBands, timing: { absolute: 500 } }, "timing")).toBe(
      ">= 500 ms"
    );
  });
});
