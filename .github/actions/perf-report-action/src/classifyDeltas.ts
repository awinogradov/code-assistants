/**
 * Delta classification against per-metric noise bands.
 *
 * A delta is a regression only when it clears the band (absolute AND, where
 * defined, relative threshold) in the unfavorable direction. The same
 * `outsideBand` decision drives both the regression verdict and the table
 * display (`≈ 0` inside the band), so the comment can never advertise
 * sub-noise variance.
 *
 * @example
 *   const delta = deltaFor(head, base, bands.timing, false);
 *   if (delta.kind === "ok" && delta.regressed) ...
 */
import type { NoiseBand, NoiseBands } from "./noiseBands.ts";
import type { BundleSizes, LhHeadlines, MetricResult, Snapshot } from "./snapshotLoad.ts";

/** A classified metric delta, or the reason it could not be computed. */
export type MetricDelta =
  | { kind: "ok"; absolute: number; relative: number | null; regressed: boolean }
  | { kind: "n/a"; reason: string };

const relativeChange = (absolute: number, base: number): number | null =>
  base === 0 ? null : absolute / Math.abs(base);

export const outsideBand = (
  absolute: number,
  relative: number | null,
  band: NoiseBand
): boolean => {
  if (Math.abs(absolute) < band.absolute) return false;
  if (band.relative === undefined) return true;
  if (relative === null) return false;
  return Math.abs(relative) >= band.relative;
};

export const deltaFor = (
  head: MetricResult,
  base: MetricResult,
  band: NoiseBand,
  higherIsBetter: boolean
): MetricDelta => {
  if (!head.ok) return { kind: "n/a", reason: head.reason };
  if (!base.ok) return { kind: "n/a", reason: base.reason };
  const absolute = head.value - base.value;
  const relative = relativeChange(absolute, base.value);
  const unfavorable = higherIsBetter ? absolute < 0 : absolute > 0;
  const regressed = outsideBand(absolute, relative, band) && unfavorable;
  return { kind: "ok", absolute, relative, regressed };
};

export const bundleDelta = (head: number, base: number, band: NoiseBand): MetricDelta =>
  deltaFor({ ok: true, value: head }, { ok: true, value: base }, band, false);

/** True when the delta clears the band — drives `≈ 0` rendering. */
export const isMeaningful = (delta: MetricDelta, band: NoiseBand): boolean =>
  delta.kind === "ok" && outsideBand(delta.absolute, delta.relative, band);

/** One regressed metric, pre-formatted for the comment's regressions list. */
export interface Regression {
  metric: string;
  base: string;
  head: string;
  delta: string;
  band: string;
}

interface LhRegressionSpec {
  key: keyof LhHeadlines;
  label: string;
  band: keyof Pick<NoiseBands, "score" | "timing" | "cls">;
  higherIsBetter: boolean;
}

const lhRegressionSpecs: readonly LhRegressionSpec[] = [
  { key: "performance", label: "Performance", band: "score", higherIsBetter: true },
  { key: "accessibility", label: "Accessibility", band: "score", higherIsBetter: true },
  { key: "lcpMs", label: "LCP", band: "timing", higherIsBetter: false },
  { key: "tbtMs", label: "TBT", band: "timing", higherIsBetter: false },
  { key: "cls", label: "CLS", band: "cls", higherIsBetter: false },
  { key: "ttiMs", label: "TTI", band: "timing", higherIsBetter: false },
];

const withRelative = (band: NoiseBand, absoluteLabel: string): string =>
  band.relative === undefined
    ? `>= ${absoluteLabel}`
    : `>= ${(band.relative * 100).toString()}% AND >= ${absoluteLabel}`;

/** Human-readable band description rendered in the regressions list. */
export const bandLabelFor = (bands: NoiseBands, kind: keyof NoiseBands): string => {
  const band = bands[kind];
  if (kind === "bundle") return withRelative(band, `${(band.absolute / 1024).toString()} KiB`);
  if (kind === "score") return `>= ${Math.round(band.absolute * 100).toString()} pts`;
  if (kind === "timing") return withRelative(band, `${band.absolute.toString()} ms`);
  return `>= ${band.absolute.toString()}`;
};

/** Formatters injected by the renderer so values appear exactly as tabled. */
export interface RegressionFormatters {
  kib: (bytes: number) => string;
  signedKib: (delta: MetricDelta) => string;
  formatFor: (key: keyof LhHeadlines) => (m: MetricResult) => string;
  signedFor: (key: keyof LhHeadlines) => (d: MetricDelta) => string;
}

export const collectRegressions = (
  head: Snapshot,
  base: Snapshot,
  bands: NoiseBands,
  fmt: RegressionFormatters
): Regression[] => {
  const regressions: Regression[] = [];
  const bundleKeys: readonly (keyof BundleSizes)[] = ["raw", "gzip", "brotli"];
  const bundleLabels: Record<keyof BundleSizes, string> = {
    raw: "raw",
    gzip: "gzip",
    brotli: "brotli",
  };
  for (const key of bundleKeys) {
    const delta = bundleDelta(head.bundle[key], base.bundle[key], bands.bundle);
    if (delta.kind === "ok" && delta.regressed) {
      regressions.push({
        metric: `Bundle ${bundleLabels[key]}`,
        base: fmt.kib(base.bundle[key]),
        head: fmt.kib(head.bundle[key]),
        delta: fmt.signedKib(delta),
        band: bandLabelFor(bands, "bundle"),
      });
    }
  }

  if (!head.lighthouse.ok || !base.lighthouse.ok) return regressions;
  const headHeadlines = head.lighthouse.headlines;
  const baseHeadlines = base.lighthouse.headlines;
  for (const spec of lhRegressionSpecs) {
    const delta = deltaFor(
      headHeadlines[spec.key],
      baseHeadlines[spec.key],
      bands[spec.band],
      spec.higherIsBetter
    );
    if (delta.kind === "ok" && delta.regressed) {
      regressions.push({
        metric: `LH ${spec.label}`,
        base: fmt.formatFor(spec.key)(baseHeadlines[spec.key]),
        head: fmt.formatFor(spec.key)(headHeadlines[spec.key]),
        delta: fmt.signedFor(spec.key)(delta),
        band: bandLabelFor(bands, spec.band),
      });
    }
  }
  return regressions;
};
