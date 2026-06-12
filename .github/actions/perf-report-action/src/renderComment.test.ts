import { describe, expect, test } from "bun:test";

import { defaultNoiseBands } from "./noiseBands.ts";
import { renderComment } from "./renderComment.ts";
import type { BaseSnapshot, LhHeadlines, Snapshot } from "./snapshotLoad.ts";

// Values modeled on the source repo's documented baseline (perf 100/a11y 100,
// LCP ~581 ms, TBT ~52 ms, CLS ~0.001, TTI ~318 ms, gzip ~646 KiB).
const headlines = (over: Partial<Record<keyof LhHeadlines, number>> = {}): LhHeadlines => ({
  performance: { ok: true, value: over.performance ?? 1 },
  accessibility: { ok: true, value: over.accessibility ?? 1 },
  lcpMs: { ok: true, value: over.lcpMs ?? 581 },
  tbtMs: { ok: true, value: over.tbtMs ?? 52 },
  cls: { ok: true, value: over.cls ?? 0.001 },
  ttiMs: { ok: true, value: over.ttiMs ?? 318 },
});

const snapshot = (over: Partial<Snapshot> = {}): Snapshot => ({
  bundle: { raw: 2881536, gzip: 661504, brotli: 524288 },
  lighthouse: { ok: true, headlines: headlines() },
  meta: {
    sha: "abcdef1234567890",
    ref: "feature",
    runId: "7",
    runUrl: "https://github.com/acme/repo/actions/runs/7",
    lhStatus: "success",
  },
  files: ["bundle-stats.html", "index.html", "lighthouse-viewer.json", "meta.json"],
  ...over,
});

const options = { bundleLabel: "dist/embed/index.html", bands: defaultNoiseBands };
const noBaseline: BaseSnapshot = { ok: false, reason: "no-baseline" };

describe("renderComment", () => {
  test("within budget against an identical baseline", () => {
    const { markdown, regressionCount } = renderComment(
      snapshot(),
      { ok: true, snapshot: snapshot() },
      options
    );
    expect(regressionCount).toBe(0);
    expect(markdown).toContain("✅ **within budget**");
    expect(markdown).toContain("### 📦 Bundle — `dist/embed/index.html`");
    expect(markdown).toContain("### ⚡ Lighthouse");
    expect(markdown).toContain("| 🟢 | Gzip | 646.0 KiB | 646.0 KiB | ≈ 0 |");
    expect(markdown).toContain("| 🟢 | CLS | 0.001 | 0.001 | ≈ 0 |");
    expect(markdown).toContain("✅ ≥ 90");
    expect(markdown).not.toContain("**Regressions**");
    expect(markdown).toContain("Baseline <code>abcdef1</code> → Head <code>abcdef1</code>");
    expect(markdown).toContain(
      "artifacts: <code>bundle-stats.html</code>, <code>lighthouse-viewer.json</code>"
    );
  });

  test("regressions cross the band and are listed with the band label", () => {
    const head = snapshot({
      bundle: { raw: 2881536, gzip: 761504, brotli: 524288 },
      lighthouse: { ok: true, headlines: headlines({ lcpMs: 881 }) },
    });
    const { markdown, regressionCount } = renderComment(
      head,
      { ok: true, snapshot: snapshot() },
      options
    );
    expect(regressionCount).toBe(2);
    expect(markdown).toContain("⚠️ **warning** — 2 metric(s) regressed (no hard-fail yet).");
    expect(markdown).toContain("**Regressions**");
    expect(markdown).toContain("- **Bundle gzip**: 646.0 KiB → 743.7 KiB");
    expect(markdown).toContain("band >= 5% AND >= 1 KiB)");
    expect(markdown).toContain("- **LH LCP**: 581 ms → 881 ms");
    expect(markdown).toContain("| 🔴 | LCP |");
  });

  test("no baseline renders head-only columns and the 🆕 verdict", () => {
    const { markdown, regressionCount } = renderComment(snapshot(), noBaseline, options);
    expect(regressionCount).toBe(0);
    expect(markdown).toContain("🆕 **no baseline available**");
    expect(markdown).toContain("| ⚪ | Raw | — | 2814.0 KiB | — |");
    expect(markdown).toContain("| ⚪ | Performance | — | 100 | — | ✅ ≥ 90 |");
    expect(markdown).toContain("Head <code>abcdef1</code>");
    expect(markdown).not.toContain("Baseline");
  });

  test("failed Lighthouse degrades the section but keeps the bundle table", () => {
    const head = snapshot({ lighthouse: { ok: false, reason: "measurement failed" } });
    const { markdown } = renderComment(head, noBaseline, options);
    expect(markdown).toContain("💔 Lighthouse measurement failed on this run (measurement failed)");
    expect(markdown).toContain("### 📦 Bundle");
  });

  test("skipped Lighthouse omits the section entirely", () => {
    const head = snapshot({ lighthouse: { ok: false, reason: "skipped" } });
    const { markdown } = renderComment(head, noBaseline, options);
    expect(markdown).not.toContain("Lighthouse");
    expect(markdown).toContain("### 📦 Bundle");
  });

  test("custom bands change the classification", () => {
    const head = snapshot({ lighthouse: { ok: true, headlines: headlines({ lcpMs: 881 }) } });
    const { regressionCount } = renderComment(
      head,
      { ok: true, snapshot: snapshot() },
      { ...options, bands: { ...defaultNoiseBands, timing: { absolute: 500 } } }
    );
    expect(regressionCount).toBe(0);
  });
});
