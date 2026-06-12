/**
 * Snapshot loading for the perf report.
 *
 * A snapshot directory (produced by the action's snapshot step) contains:
 *   - `index.html`             — the measured bundle artifact, raw bytes
 *   - `lighthouse-viewer.json` — optional; missing when LH failed or was skipped
 *   - `bundle-stats.html`      — optional treemap, listed in the footer only
 *   - `meta.json`              — { sha, ref, runId, runUrl, lhStatus }
 *
 * Bundle sizes are computed in-process via async `node:zlib` (gzip level 9 +
 * brotli) so a multi-megabyte artifact does not block the event loop.
 * Lighthouse headlines are extracted with finite-number guards — partial LH
 * output downgrades that section to "partial measurement" rather than
 * emitting NaN deltas. `meta.json` is Zod-validated: a baseline produced by
 * an older incompatible action version degrades to head-only mode upstream
 * instead of mis-rendering.
 *
 * @example
 *   const head = await loadSnapshot("perf-snapshot");
 *   const base = await loadBase("perf-baseline");
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, gzip } from "node:zlib";

import { z } from "zod";

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

const snapshotMetaSchema = z.object({
  sha: z.string({ error: "meta.sha must be a string" }),
  ref: z.string({ error: "meta.ref must be a string" }),
  runId: z.string({ error: "meta.runId must be a string" }),
  runUrl: z.string({ error: "meta.runUrl must be a string" }),
  lhStatus: z.enum(["success", "failed", "skipped"], {
    error: "meta.lhStatus must be success | failed | skipped",
  }),
});

/** Run provenance written by the action's snapshot step. */
export type SnapshotMeta = z.infer<typeof snapshotMetaSchema>;

/** Sizes of the measured bundle artifact, in bytes. */
export interface BundleSizes {
  raw: number;
  gzip: number;
  brotli: number;
}

const lhrSchema = z
  .object({
    categories: z.record(z.string(), z.object({ score: z.number().nullish() }).loose()).optional(),
    audits: z
      .record(z.string(), z.object({ numericValue: z.number().nullish() }).loose())
      .optional(),
  })
  .loose();

type LhrLike = z.infer<typeof lhrSchema>;

/** A headline metric: present and finite, or absent with a reason. */
export type MetricResult = { ok: true; value: number } | { ok: false; reason: string };

/** The six Lighthouse headline metrics the comment reports. */
export interface LhHeadlines {
  performance: MetricResult;
  accessibility: MetricResult;
  lcpMs: MetricResult;
  tbtMs: MetricResult;
  cls: MetricResult;
  ttiMs: MetricResult;
}

/** The Lighthouse section of a snapshot: full headlines or a degrade reason. */
export type LhSection = { ok: true; headlines: LhHeadlines } | { ok: false; reason: string };

/** One loaded snapshot: bundle sizes, Lighthouse section, provenance, files. */
export interface Snapshot {
  bundle: BundleSizes;
  lighthouse: LhSection;
  meta: SnapshotMeta;
  /** Filenames present in the snapshot directory, for the footer artifact list. */
  files: string[];
}

/** A baseline snapshot, or the reason head-only mode applies. */
export type BaseSnapshot = { ok: true; snapshot: Snapshot } | { ok: false; reason: string };

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const sizeBundle = async (htmlPath: string): Promise<BundleSizes> => {
  const buffer = await readFile(htmlPath);
  const [gz, br] = await Promise.all([gzipAsync(buffer, { level: 9 }), brotliAsync(buffer)]);
  return { raw: buffer.byteLength, gzip: gz.byteLength, brotli: br.byteLength };
};

const extractHeadlines = (lhr: LhrLike): LhHeadlines => {
  const category = (id: string): MetricResult => {
    const score = lhr.categories?.[id]?.score;
    return finite(score) ? { ok: true, value: score } : { ok: false, reason: "missing" };
  };
  const audit = (id: string): MetricResult => {
    const value = lhr.audits?.[id]?.numericValue;
    return finite(value) ? { ok: true, value } : { ok: false, reason: "missing" };
  };
  return {
    performance: category("performance"),
    accessibility: category("accessibility"),
    lcpMs: audit("largest-contentful-paint"),
    tbtMs: audit("total-blocking-time"),
    cls: audit("cumulative-layout-shift"),
    ttiMs: audit("interactive"),
  };
};

const requiredHeadlines: readonly (keyof LhHeadlines)[] = [
  "performance",
  "accessibility",
  "lcpMs",
  "tbtMs",
  "cls",
  "ttiMs",
];

const readLighthouse = async (
  path: string,
  lhStatus: SnapshotMeta["lhStatus"]
): Promise<LhSection> => {
  if (lhStatus === "skipped") return { ok: false, reason: "skipped" };
  if (lhStatus !== "success") return { ok: false, reason: "measurement failed" };
  try {
    const lhr = lhrSchema.parse(JSON.parse(await readFile(path, "utf8")));
    const headlines = extractHeadlines(lhr);
    const missing = requiredHeadlines.filter((key) => !headlines[key].ok);
    if (missing.length > 0) {
      return { ok: false, reason: `partial measurement (missing ${missing.join(", ")})` };
    }
    return { ok: true, headlines };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `parse error: ${message}` };
  }
};

/** Load a snapshot directory. Throws when the directory is unreadable. */
export const loadSnapshot = async (dir: string): Promise<Snapshot> => {
  const meta = snapshotMetaSchema.parse(
    JSON.parse(await readFile(resolve(dir, "meta.json"), "utf8"))
  );
  const bundle = await sizeBundle(resolve(dir, "index.html"));
  const lighthouse = await readLighthouse(resolve(dir, "lighthouse-viewer.json"), meta.lhStatus);
  const files = (await readdir(dir)).sort();
  return { bundle, lighthouse, meta, files };
};

const isReadableDir = async (dir: string): Promise<boolean> => {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
};

/**
 * Load the baseline snapshot. Any failure (missing dir, expired artifact,
 * incompatible meta) degrades to head-only mode — the PR must never be
 * blocked by a bad baseline.
 */
export const loadBase = async (dir: string | undefined): Promise<BaseSnapshot> => {
  if (dir === undefined) return { ok: false, reason: "no-baseline" };
  if (!(await isReadableDir(dir))) return { ok: false, reason: "no-baseline" };
  try {
    return { ok: true, snapshot: await loadSnapshot(dir) };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `perf-report: base snapshot unreadable (${message}); falling back to head-only.\n`
    );
    return { ok: false, reason: "no-baseline" };
  }
};
