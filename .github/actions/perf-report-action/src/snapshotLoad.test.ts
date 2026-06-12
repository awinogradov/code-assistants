import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { loadBase, loadSnapshot } from "./snapshotLoad.ts";

const meta = (lhStatus: "success" | "failed" | "skipped") => ({
  sha: "0123456789abcdef",
  ref: "feature-branch",
  runId: "42",
  runUrl: "https://github.com/acme/repo/actions/runs/42",
  lhStatus,
});

const lhr = {
  categories: { performance: { score: 1 }, accessibility: { score: 0.98 } },
  audits: {
    "largest-contentful-paint": { numericValue: 581 },
    "total-blocking-time": { numericValue: 52 },
    "cumulative-layout-shift": { numericValue: 0.001 },
    interactive: { numericValue: 318 },
  },
};

const writeSnapshotDir = async (options: {
  lhStatus: "success" | "failed" | "skipped";
  lhrJson?: string;
}): Promise<string> => {
  const dir = await mkdtemp(resolve(tmpdir(), "perf-snapshot-"));
  await writeFile(resolve(dir, "meta.json"), JSON.stringify(meta(options.lhStatus)), "utf8");
  await writeFile(resolve(dir, "index.html"), "<html>".repeat(1000), "utf8");
  if (options.lhrJson !== undefined) {
    await writeFile(resolve(dir, "lighthouse-viewer.json"), options.lhrJson, "utf8");
  }
  return dir;
};

describe("loadSnapshot", () => {
  test("loads bundle sizes, headlines, and the file list", async () => {
    const dir = await writeSnapshotDir({ lhStatus: "success", lhrJson: JSON.stringify(lhr) });
    const snapshot = await loadSnapshot(dir);
    expect(snapshot.bundle.raw).toBe(6000);
    expect(snapshot.bundle.gzip).toBeGreaterThan(0);
    expect(snapshot.bundle.brotli).toBeGreaterThan(0);
    expect(snapshot.bundle.gzip).toBeLessThan(snapshot.bundle.raw);
    expect(snapshot.files).toEqual(["index.html", "lighthouse-viewer.json", "meta.json"]);
    if (!snapshot.lighthouse.ok) throw new Error("expected lighthouse ok");
    expect(snapshot.lighthouse.headlines.lcpMs).toEqual({ ok: true, value: 581 });
    expect(snapshot.lighthouse.headlines.performance).toEqual({ ok: true, value: 1 });
  });

  test("degrades to 'measurement failed' when lhStatus is failed", async () => {
    const dir = await writeSnapshotDir({ lhStatus: "failed" });
    const snapshot = await loadSnapshot(dir);
    expect(snapshot.lighthouse).toEqual({ ok: false, reason: "measurement failed" });
  });

  test("marks skipped measurement distinctly", async () => {
    const dir = await writeSnapshotDir({ lhStatus: "skipped" });
    const snapshot = await loadSnapshot(dir);
    expect(snapshot.lighthouse).toEqual({ ok: false, reason: "skipped" });
  });

  test("degrades to partial measurement when a headline is missing", async () => {
    const partial = { ...lhr, audits: { ...lhr.audits, interactive: {} } };
    const dir = await writeSnapshotDir({ lhStatus: "success", lhrJson: JSON.stringify(partial) });
    const snapshot = await loadSnapshot(dir);
    expect(snapshot.lighthouse).toEqual({
      ok: false,
      reason: "partial measurement (missing ttiMs)",
    });
  });

  test("degrades to parse error on corrupt LHR json", async () => {
    const dir = await writeSnapshotDir({ lhStatus: "success", lhrJson: "{broken" });
    const snapshot = await loadSnapshot(dir);
    if (snapshot.lighthouse.ok) throw new Error("expected lighthouse degrade");
    expect(snapshot.lighthouse.reason).toStartWith("parse error:");
  });

  test("throws on incompatible meta.json", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "perf-snapshot-"));
    await writeFile(resolve(dir, "meta.json"), JSON.stringify({ sha: 1 }), "utf8");
    await writeFile(resolve(dir, "index.html"), "<html>", "utf8");
    expect(loadSnapshot(dir)).rejects.toThrow();
  });
});

describe("loadBase", () => {
  test("no directory argument means head-only mode", async () => {
    expect(await loadBase(undefined)).toEqual({ ok: false, reason: "no-baseline" });
  });

  test("missing directory means head-only mode", async () => {
    expect(await loadBase("/nonexistent/perf-baseline")).toEqual({
      ok: false,
      reason: "no-baseline",
    });
  });

  test("unreadable snapshot degrades instead of throwing", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "perf-baseline-"));
    await writeFile(resolve(dir, "meta.json"), "{broken", "utf8");
    expect(await loadBase(dir)).toEqual({ ok: false, reason: "no-baseline" });
  });

  test("loads a valid baseline", async () => {
    const dir = await writeSnapshotDir({ lhStatus: "success", lhrJson: JSON.stringify(lhr) });
    const base = await loadBase(dir);
    expect(base.ok).toBe(true);
  });
});
