/**
 * Version-1 review-context bundle contract (issue #605).
 *
 * One deterministic startup fetch replaces the review session's many small
 * discovery calls: the builder (`buildReviewContext.ts`) assembles this bundle
 * before the Claude session starts, and the pr-review skill consumes it in
 * place of its Phase 1 rediscovery. The schema is `.strict()` and carries an
 * in-payload `version` literal — the skill gates consumption on that field, so
 * additive changes require a version bump by design.
 *
 * Every fallible section is a discriminated union on `available`, which makes
 * a partially failed fetch unrepresentable-wrong: a section is either complete
 * data with truncation metadata, or an explicit reason it is missing.
 *
 * @example
 * const bundle = reviewContextBundleSchema.parse(JSON.parse(raw));
 * if (bundle.changedFiles.available) console.log(bundle.changedFiles.totalFiles);
 */
import { z } from "zod";

/** In-payload contract version; the pr-review skill consumes only this value. */
export const bundleVersion = 1;

/**
 * Explicit bounds applied by the builder. Exported so tests and docs cite the
 * same numbers the builder enforces — never restate these as literals elsewhere.
 */
export const bundleBounds = {
  /** Changed-file entries kept in the bundle (`totalFiles` stays exact). */
  maxChangedFiles: 300,
  /** Bytes of unified diff streamed to the referenced file before cutting. */
  maxDiffBytes: 1_000_000,
  /** Unresolved review threads kept. */
  maxThreads: 100,
  /** Prior reviewer verdict bodies kept (most recent first). */
  maxPriorReviews: 20,
  /** Characters kept per prior-review or thread body. */
  maxBodyChars: 4_000,
  /** Failing / pending check names kept. */
  maxCheckNames: 50,
  /** Changed-since-last-review file paths kept in the re-review delta. */
  maxDeltaFiles: 300,
} as const;

/**
 * Paths deprioritized by the truncation policy: lockfiles, build output, and
 * vendored or generated trees. When the changed-file list exceeds its bound,
 * these sort to the tail so human-authored files survive the cut.
 */
export function isGeneratedPath(path: string): boolean {
  if (/(^|\/)(dist|build|vendor|node_modules|\.repomix)\//.test(path)) return true;
  if (/(^|\/)(bun\.lock|bun\.lockb|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(path)) {
    return true;
  }
  return path.endsWith(".min.js") || path.endsWith(".min.css") || path.endsWith(".snap");
}

/**
 * Deterministic truncation order: non-generated entries first, generated last,
 * original (API) order preserved within each group — so the truncated subset
 * is reproducible and generated churn never crowds out reviewable files.
 */
export function orderForTruncation<T extends { path: string }>(files: T[]): T[] {
  return [...files.filter((f) => !isGeneratedPath(f.path)), ...files.filter((f) => isGeneratedPath(f.path))];
}

/** Shared unavailable arm: the section could not be fetched, with the reason. */
const unavailableSchema = z
  .object({
    available: z.literal(false),
    /** `rate-limited` for 403/429; otherwise the first line of the error. */
    reason: z.string(),
  })
  .strict();

/** One changed file as reported by the pulls files endpoint. */
const changedFileSchema = z
  .object({
    path: z.string(),
    status: z.string(),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
  })
  .strict();

const changedFilesSchema = z.discriminatedUnion("available", [
  z
    .object({
      available: z.literal(true),
      files: z.array(changedFileSchema).max(bundleBounds.maxChangedFiles),
      /** Exact count from PR metadata, valid even when `files` is truncated. */
      totalFiles: z.number().int().nonnegative(),
      truncated: z.boolean(),
    })
    .strict(),
  unavailableSchema,
]);

const diffSchema = z.discriminatedUnion("available", [
  z
    .object({
      available: z.literal(true),
      /** Absolute path of the streamed unified diff — content stays out of the bundle. */
      path: z.string(),
      /** Bytes actually written (the full size is unknown when truncated). */
      bytes: z.number().int().nonnegative(),
      truncated: z.boolean(),
    })
    .strict(),
  unavailableSchema,
]);

const checksSchema = z.discriminatedUnion("available", [
  z
    .object({
      available: z.literal(true),
      allCompleted: z.boolean(),
      failing: z.array(z.string()).max(bundleBounds.maxCheckNames),
      pending: z.array(z.string()).max(bundleBounds.maxCheckNames),
      truncated: z.boolean(),
    })
    .strict(),
  unavailableSchema,
]);

/** A prior non-pending review by the bot reviewer (the record of past findings). */
const priorReviewSchema = z
  .object({
    state: z.string(),
    submittedAt: z.string().nullable(),
    commitId: z.string().nullable(),
    body: z.string().max(bundleBounds.maxBodyChars),
    bodyTruncated: z.boolean(),
  })
  .strict();

/** An unresolved inline review thread carried into the bundle. */
const unresolvedThreadSchema = z
  .object({
    path: z.string(),
    line: z.number().int().nullable(),
    author: z.string().nullable(),
    body: z.string().max(bundleBounds.maxBodyChars),
    bodyTruncated: z.boolean(),
  })
  .strict();

const reviewStateSchema = z.discriminatedUnion("available", [
  z
    .object({
      available: z.literal(true),
      /** State of the reviewer's latest non-pending review, or null before any. */
      existingVerdict: z.string().nullable(),
      priorReviews: z.array(priorReviewSchema).max(bundleBounds.maxPriorReviews),
      priorReviewsTruncated: z.boolean(),
      unresolvedThreads: z.array(unresolvedThreadSchema).max(bundleBounds.maxThreads),
      threadsTruncated: z.boolean(),
    })
    .strict(),
  unavailableSchema,
]);

const deltaSchema = z.discriminatedUnion("available", [
  z
    .object({
      available: z.literal(true),
      files: z.array(z.string()).max(bundleBounds.maxDeltaFiles),
      commitCount: z.number().int().nonnegative(),
      /** The compare endpoint silently caps at 250 commits / 300 files. */
      truncated: z.boolean(),
    })
    .strict(),
  /** Unavailable reasons include `ref-missing` (404) and `compare-status-<status>`. */
  unavailableSchema,
]);

/**
 * Round metadata: a first review carries no delta; a re-review names the SHA
 * the delta is computed from, or an explicit reason the delta is unavailable
 * (force-pushed ref, diverged history) — in which case the reviewer must treat
 * the full diff as the review surface.
 */
const roundSchema = z.discriminatedUnion("firstReview", [
  z.object({ firstReview: z.literal(true) }).strict(),
  z
    .object({
      firstReview: z.literal(false),
      lastReviewedSha: z.string(),
      delta: deltaSchema,
    })
    .strict(),
]);

/**
 * The complete version-1 review-context bundle written by the builder and
 * consumed by the pr-review skill's §1.0.
 */
export const reviewContextBundleSchema = z
  .object({
    version: z.literal(bundleVersion),
    identity: z
      .object({
        repo: z.string(),
        prNumber: z.number().int().positive(),
        url: z.string(),
        title: z.string(),
        /** PR body (bounded) — carries the `Issues:` section for linked-issue extraction. */
        body: z.string().max(bundleBounds.maxBodyChars),
        bodyTruncated: z.boolean(),
        author: z.string(),
        baseRefName: z.string(),
        headRefName: z.string(),
      })
      .strict(),
    refs: z
      .object({
        baseSha: z.string(),
        headSha: z.string(),
        lastReviewedSha: z.string().nullable(),
      })
      .strict(),
    changedFiles: changedFilesSchema,
    diff: diffSchema,
    checks: checksSchema,
    reviewState: reviewStateSchema,
    round: roundSchema,
  })
  .strict();

/** Validated version-1 bundle. */
export type ReviewContextBundle = z.infer<typeof reviewContextBundleSchema>;

/**
 * Builder telemetry emitted as the `telemetry` step output and merged into the
 * run summary by `runClaude.ts` (issue #605 acceptance: duration, request
 * counts, payload size, truncation, cache use). Snake_case to slot directly
 * into the run-summary object beside its existing keys.
 */
export const contextBuilderTelemetrySchema = z
  .object({
    builder_ms: z.number().int().nonnegative(),
    request_count: z.number().int().nonnegative(),
    bundle_bytes: z.number().int().nonnegative(),
    diff_bytes: z.number().int().nonnegative(),
    truncated: z.boolean(),
    sections_unavailable: z.number().int().nonnegative(),
    /** Always false today; the field exists so cache adoption is measurable. */
    cache_used: z.boolean(),
  })
  .strict();

/** Validated builder telemetry. */
export type ContextBuilderTelemetry = z.infer<typeof contextBuilderTelemetrySchema>;

/**
 * Truncate a body to the shared per-body bound, flagging the cut so consumers
 * can request the full text as a targeted follow-up instead of guessing.
 */
export function boundBody(body: string): { body: string; bodyTruncated: boolean } {
  if (body.length <= bundleBounds.maxBodyChars) return { body, bodyTruncated: false };
  return { body: body.slice(0, bundleBounds.maxBodyChars), bodyTruncated: true };
}
