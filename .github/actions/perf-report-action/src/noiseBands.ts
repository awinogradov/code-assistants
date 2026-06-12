/**
 * Per-metric noise bands for regression classification.
 *
 * A delta has to clear the absolute threshold AND (where defined) the
 * relative threshold to count as a regression — inside the band it renders
 * `≈ 0` so reviewers don't chase sub-noise variance. Defaults are the bands
 * the report shipped with originally; consumers override them through the
 * action's `noise-bands` input (a JSON object), parsed here with Zod so a
 * typo fails loud instead of silently mis-classifying.
 *
 * @example
 *   const bands = parseNoiseBands(process.env.NOISE_BANDS);
 *   bands.bundle; // { absolute: 1024, relative: 0.05 }
 */
import { z } from "zod";

/** Thresholds below which a metric delta is treated as noise. */
export interface NoiseBand {
  /** Absolute threshold below which a delta is considered noise. */
  absolute: number;
  /** Optional relative threshold (fraction, e.g. 0.05 = 5%). */
  relative?: number;
}

/** The four band kinds the report classifies against. */
export interface NoiseBands {
  /** Bundle raw/gzip/brotli sizes, in bytes. */
  bundle: NoiseBand;
  /** Lighthouse category scores, on the 0–1 scale (0.03 = 3 points). */
  score: NoiseBand;
  /** Lighthouse timings (LCP, TBT, TTI), in milliseconds. */
  timing: NoiseBand;
  /** Cumulative Layout Shift, absolute. */
  cls: NoiseBand;
}

export const defaultNoiseBands: NoiseBands = {
  bundle: { absolute: 1024, relative: 0.05 },
  score: { absolute: 0.03 },
  timing: { absolute: 200, relative: 0.1 },
  cls: { absolute: 0.01 },
};

const bandSchema = z.object({
  absolute: z.number({ error: "band.absolute must be a number" }).nonnegative(),
  relative: z.number({ error: "band.relative must be a number" }).nonnegative().optional(),
});

const bandsSchema = z
  .object({
    bundle: bandSchema.optional(),
    score: bandSchema.optional(),
    timing: bandSchema.optional(),
    cls: bandSchema.optional(),
  })
  .strict();

/**
 * Parse the `noise-bands` input JSON and merge it over the defaults.
 * An empty/unset input returns the defaults; malformed JSON or unknown keys
 * throw so the entry point can emit a degraded comment naming the mistake.
 */
export const parseNoiseBands = (raw: string | undefined): NoiseBands => {
  if (raw === undefined || raw.trim() === "") return defaultNoiseBands;
  const parsed = bandsSchema.parse(JSON.parse(raw));
  return {
    bundle: parsed.bundle ?? defaultNoiseBands.bundle,
    score: parsed.score ?? defaultNoiseBands.score,
    timing: parsed.timing ?? defaultNoiseBands.timing,
    cls: parsed.cls ?? defaultNoiseBands.cls,
  };
};
