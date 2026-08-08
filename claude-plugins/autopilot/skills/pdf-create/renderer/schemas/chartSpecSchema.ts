import { z } from "zod";

/** A single data point. `x` is a category label (string) or numeric position. */
export const chartPointSchema = z.object({
  x: z.union([z.string(), z.number()]),
  y: z.number(),
});

/** A named data series — one bar group, line, or pie's worth of points. */
export const chartSeriesSchema = z.object({
  name: z.string(),
  points: z.array(chartPointSchema).min(1),
});

/**
 * A declarative chart, rendered to vector graphics with @react-pdf/renderer's
 * own SVG primitives (no native canvas dependency, fully portable).
 */
export const chartSpecSchema = z.object({
  kind: z.enum(["bar", "line", "area", "pie", "donut", "stackedBar"]),
  series: z.array(chartSeriesSchema).min(1),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  width: z.number().positive().default(480),
  height: z.number().positive().default(280),
  palette: z.array(z.string()).optional(),
});

export type ChartSpec = z.infer<typeof chartSpecSchema>;
export type ChartSeries = z.infer<typeof chartSeriesSchema>;
export type ChartPoint = z.infer<typeof chartPointSchema>;
