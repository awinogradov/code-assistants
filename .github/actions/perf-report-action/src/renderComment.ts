/**
 * Markdown rendering for the perf comment.
 *
 * Renders the verdict line, the bundle table (labeled with the measured
 * file's path), the Lighthouse table (omitted entirely when measurement was
 * skipped), an optional regressions list, and a provenance footer. Display
 * conventions: KiB with one decimal for sizes, 0–100 integers for Lighthouse
 * scores, ms rounded to 10 ms above 1 s for timings, three decimals for CLS;
 * deltas inside the noise band render `≈ 0`.
 *
 * @example
 *   process.stdout.write(
 *     renderComment(head, base, { bundleLabel: "dist/embed/index.html", bands })
 *   );
 */
import {
  bundleDelta,
  collectRegressions,
  deltaFor,
  isMeaningful,
  type MetricDelta,
  type Regression,
} from "./classifyDeltas.ts";
import type { NoiseBand, NoiseBands } from "./noiseBands.ts";
import type {
  BaseSnapshot,
  BundleSizes,
  LhHeadlines,
  LhSection,
  MetricResult,
  Snapshot,
} from "./snapshotLoad.ts";

const kib = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KiB`;

const signedKib =
  (band: NoiseBand) =>
  (delta: MetricDelta): string => {
    if (delta.kind === "n/a") return "—";
    if (!isMeaningful(delta, band)) return "≈ 0";
    const sign = delta.absolute >= 0 ? "+" : "-";
    return `${sign}${(Math.abs(delta.absolute) / 1024).toFixed(1)} KiB`;
  };

const formatScore = (result: MetricResult): string =>
  result.ok ? Math.round(result.value * 100).toString() : "—";

const signedScore =
  (band: NoiseBand) =>
  (delta: MetricDelta): string => {
    if (delta.kind === "n/a") return "—";
    if (!isMeaningful(delta, band)) return "≈ 0";
    const points = Math.round(delta.absolute * 100);
    const sign = points >= 0 ? "+" : "-";
    return `${sign}${Math.abs(points).toString()}`;
  };

const roundMs = (ms: number): number => (ms >= 1000 ? Math.round(ms / 10) * 10 : Math.round(ms));

const formatMs = (result: MetricResult): string =>
  result.ok ? `${roundMs(result.value).toLocaleString("en-US")} ms` : "—";

const signedMs =
  (band: NoiseBand) =>
  (delta: MetricDelta): string => {
    if (delta.kind === "n/a") return "—";
    if (!isMeaningful(delta, band)) return "≈ 0";
    const sign = delta.absolute >= 0 ? "+" : "-";
    return `${sign}${roundMs(Math.abs(delta.absolute)).toLocaleString("en-US")} ms`;
  };

const formatCls = (result: MetricResult): string => (result.ok ? result.value.toFixed(3) : "—");

const signedCls =
  (band: NoiseBand) =>
  (delta: MetricDelta): string => {
    if (delta.kind === "n/a") return "—";
    if (!isMeaningful(delta, band)) return "≈ 0";
    const sign = delta.absolute >= 0 ? "+" : "-";
    return `${sign}${Math.abs(delta.absolute).toFixed(3)}`;
  };

const shortSha = (sha: string): string => (sha.length >= 7 ? sha.slice(0, 7) : sha);

interface MetricTarget {
  readonly satisfies: (value: number) => boolean;
  readonly label: string;
}

const lhTargets: Partial<Record<keyof LhHeadlines, MetricTarget>> = {
  performance: { satisfies: (v) => v >= 0.9, label: "≥ 90" },
  accessibility: { satisfies: (v) => v >= 0.95, label: "≥ 95" },
  lcpMs: { satisfies: (v) => v <= 1000, label: "≤ 1,000 ms" },
  ttiMs: { satisfies: (v) => v <= 1000, label: "≤ 1,000 ms" },
};

const statusFor = (delta: MetricDelta): string => {
  if (delta.kind === "n/a") return "⚪";
  return delta.regressed ? "🔴" : "🟢";
};

const targetCell = (result: MetricResult, target: MetricTarget | undefined): string => {
  if (target === undefined) return "—";
  if (!result.ok) return `🎯 ${target.label}`;
  return `${target.satisfies(result.value) ? "✅" : "❌"} ${target.label}`;
};

const bundleRowLabel = (key: keyof BundleSizes): string =>
  key === "raw" ? "Raw" : key === "gzip" ? "Gzip" : "Brotli";

const renderBundleRow = (
  key: keyof BundleSizes,
  head: BundleSizes,
  base: BundleSizes | undefined,
  band: NoiseBand
): string => {
  const headStr = kib(head[key]);
  const label = bundleRowLabel(key);
  if (base === undefined) {
    return `| ⚪ | ${label} | — | ${headStr} | — |`;
  }
  const delta = bundleDelta(head[key], base[key], band);
  return `| ${statusFor(delta)} | ${label} | ${kib(base[key])} | ${headStr} | ${signedKib(band)(delta)} |`;
};

const renderBundleTable = (
  head: BundleSizes,
  base: BundleSizes | undefined,
  bundleLabel: string,
  band: NoiseBand
): string => {
  const headerLines = [
    `### 📦 Bundle — \`${bundleLabel}\``,
    "",
    "| Status | Metric | Base | Head | Δ |",
    "| :---: | :--- | ---: | ---: | ---: |",
  ];
  const rows = (["raw", "gzip", "brotli"] as const).map((key) =>
    renderBundleRow(key, head, base, band)
  );
  return [...headerLines, ...rows].join("\n");
};

interface LhRowSpec {
  readonly key: keyof LhHeadlines;
  readonly label: string;
  readonly format: (m: MetricResult) => string;
  readonly signed: (band: NoiseBand) => (d: MetricDelta) => string;
  readonly band: keyof Pick<NoiseBands, "score" | "timing" | "cls">;
  readonly higherIsBetter: boolean;
}

const lhRowSpecs: readonly LhRowSpec[] = [
  { key: "performance", label: "Performance", format: formatScore, signed: signedScore, band: "score", higherIsBetter: true },
  { key: "accessibility", label: "Accessibility", format: formatScore, signed: signedScore, band: "score", higherIsBetter: true },
  { key: "lcpMs", label: "LCP", format: formatMs, signed: signedMs, band: "timing", higherIsBetter: false },
  { key: "tbtMs", label: "TBT", format: formatMs, signed: signedMs, band: "timing", higherIsBetter: false },
  { key: "cls", label: "CLS", format: formatCls, signed: signedCls, band: "cls", higherIsBetter: false },
  { key: "ttiMs", label: "TTI", format: formatMs, signed: signedMs, band: "timing", higherIsBetter: false },
];

const renderLhRow = (
  spec: LhRowSpec,
  head: LhHeadlines,
  baseHeadlines: LhHeadlines | undefined,
  bands: NoiseBands
): string => {
  const headM = head[spec.key];
  const headStr = spec.format(headM);
  const target = targetCell(headM, lhTargets[spec.key]);
  if (baseHeadlines === undefined) {
    return `| ⚪ | ${spec.label} | — | ${headStr} | — | ${target} |`;
  }
  const baseM = baseHeadlines[spec.key];
  const band = bands[spec.band];
  const delta = deltaFor(headM, baseM, band, spec.higherIsBetter);
  return `| ${statusFor(delta)} | ${spec.label} | ${spec.format(baseM)} | ${headStr} | ${spec.signed(band)(delta)} | ${target} |`;
};

const renderLhTable = (head: LhSection, base: LhSection | undefined, bands: NoiseBands): string => {
  const sectionHeader = "### ⚡ Lighthouse";
  if (!head.ok) {
    return [
      sectionHeader,
      "",
      `💔 Lighthouse measurement failed on this run (${head.reason}) — see workflow log.`,
    ].join("\n");
  }
  const baseHeadlines = base?.ok === true ? base.headlines : undefined;
  const rows = lhRowSpecs.map((spec) => renderLhRow(spec, head.headlines, baseHeadlines, bands));
  return [
    sectionHeader,
    "",
    "| Status | Metric | Base | Head | Δ | Target |",
    "| :---: | :--- | ---: | ---: | ---: | :--- |",
    ...rows,
  ].join("\n");
};

const renderRegressionList = (regressions: Regression[]): string => {
  if (regressions.length === 0) return "";
  const lines = regressions.map(
    (r) => `- **${r.metric}**: ${r.base} → ${r.head} (Δ ${r.delta}, band ${r.band})`
  );
  return ["", "**Regressions**", "", ...lines].join("\n");
};

const gzipHighlight = (head: BundleSizes, base: BundleSizes, band: NoiseBand): string => {
  const delta = bundleDelta(head.gzip, base.gzip, band);
  if (!isMeaningful(delta, band)) return `gzip ${kib(head.gzip)}`;
  return `gzip ${kib(base.gzip)} → ${kib(head.gzip)}`;
};

const perfHighlight = (headM: MetricResult, baseM: MetricResult, band: NoiseBand): string => {
  if (!headM.ok) return "";
  const head = formatScore(headM);
  if (!baseM.ok) return `Perf ${head}`;
  const delta = deltaFor(headM, baseM, band, true);
  if (!isMeaningful(delta, band)) return `Perf ${head}`;
  return `Perf ${formatScore(baseM)} → ${head}`;
};

const renderHeadlineHighlight = (head: Snapshot, base: Snapshot, bands: NoiseBands): string => {
  const bundle = gzipHighlight(head.bundle, base.bundle, bands.bundle);
  if (!head.lighthouse.ok || !base.lighthouse.ok) return bundle;
  const perf = perfHighlight(
    head.lighthouse.headlines.performance,
    base.lighthouse.headlines.performance,
    bands.score
  );
  if (perf === "") return bundle;
  return `${perf} · ${bundle}`;
};

const renderHeadline = (
  head: Snapshot,
  base: BaseSnapshot,
  regressions: Regression[],
  bands: NoiseBands
): string => {
  if (!base.ok) {
    return "🆕 **no baseline available** — this PR will establish one once the default branch has a successful perf run.";
  }
  if (regressions.length > 0) {
    return `⚠️ **warning** — ${regressions.length.toString()} metric(s) regressed (no hard-fail yet).`;
  }
  return `✅ **within budget** · ${renderHeadlineHighlight(head, base.snapshot, bands)}`;
};

const renderFooter = (head: Snapshot, base: BaseSnapshot): string => {
  const headSha = `<code>${shortSha(head.meta.sha)}</code>`;
  const compare = base.ok
    ? `Baseline <code>${shortSha(base.snapshot.meta.sha)}</code> → Head ${headSha}`
    : `Head ${headSha}`;
  const link = `<a href="${head.meta.runUrl}">workflow run</a>`;
  const extras = head.files.filter((file) => file !== "index.html" && file !== "meta.json");
  const artifacts =
    extras.length === 0
      ? ""
      : ` · artifacts: ${extras.map((file) => `<code>${file}</code>`).join(", ")}`;
  return `<sub>${compare} · ${link}${artifacts}</sub>`;
};

/** Options threaded from the action inputs into the renderer. */
export interface RenderOptions {
  /** Path label for the bundle table heading (the measured file). */
  bundleLabel: string;
  bands: NoiseBands;
}

/** The full comment plus the regression count exposed as a step output. */
export interface RenderedComment {
  markdown: string;
  regressionCount: number;
}

export const renderComment = (
  head: Snapshot,
  base: BaseSnapshot,
  options: RenderOptions
): RenderedComment => {
  const { bands, bundleLabel } = options;
  const fmt = {
    kib,
    signedKib: signedKib(bands.bundle),
    formatFor: (key: keyof LhHeadlines) =>
      key === "cls" ? formatCls : key === "performance" || key === "accessibility" ? formatScore : formatMs,
    signedFor: (key: keyof LhHeadlines) =>
      key === "cls"
        ? signedCls(bands.cls)
        : key === "performance" || key === "accessibility"
          ? signedScore(bands.score)
          : signedMs(bands.timing),
  };
  const regressions = base.ok ? collectRegressions(head, base.snapshot, bands, fmt) : [];
  const lhSkipped = !head.lighthouse.ok && head.lighthouse.reason === "skipped";
  const sections = [
    "## Perf report",
    "",
    renderHeadline(head, base, regressions, bands),
    "",
    renderBundleTable(
      head.bundle,
      base.ok ? base.snapshot.bundle : undefined,
      bundleLabel,
      bands.bundle
    ),
  ];
  if (!lhSkipped) {
    sections.push(
      "",
      renderLhTable(head.lighthouse, base.ok ? base.snapshot.lighthouse : undefined, bands)
    );
  }
  const regressionBlock = renderRegressionList(regressions);
  if (regressionBlock !== "") sections.push(regressionBlock);
  sections.push("", renderFooter(head, base));
  return { markdown: `${sections.join("\n")}\n`, regressionCount: regressions.length };
};
