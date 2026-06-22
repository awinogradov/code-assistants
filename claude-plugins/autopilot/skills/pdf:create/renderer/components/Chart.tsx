import { Line, Path, Rect, Svg, Text as SvgText, Text, View } from "@react-pdf/renderer";
import type { ReactElement, ReactNode } from "react";

import type { Block } from "../schemas/blockSchema";
import type { ChartSpec } from "../schemas/chartSpecSchema";
import { useTheme } from "../theme/themeContext";
import type { Theme } from "../theme/themeInterface";
import { Caption } from "./primitives/Caption";

type ChartData = Extract<Block, { type: "chart" }>;

const padding = { left: 44, right: 16, top: 14, bottom: 30 };
const gridSteps = 4;
const axisLabelFontSize = 7;
const groupFillRatio = 0.8; // grouped bars span this fraction of a category slot
const barWidthRatio = 0.9; // each bar fills this fraction of its sub-slot
const stackedWidthRatio = 0.6; // a stacked bar spans this fraction of a category slot
const areaFillOpacity = 0.18;
const lineStrokeWidth = 1.5;
const donutHoleRatio = 0.55; // inner radius as a fraction of the outer radius

function seriesColors(spec: ChartSpec, theme: Theme): string[] {
  return (
    spec.palette ?? [
      theme.colors.primary,
      theme.colors.accent,
      theme.colors.success,
      theme.colors.warning,
      theme.colors.info,
      theme.colors.danger,
      theme.colors.neutral,
    ]
  );
}

/** Round a value up to a clean axis maximum (1/2/5 × 10^n). */
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function polar(cx: number, cy: number, radius: number, angleDeg: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
}

interface CartesianGeometry {
  categories: string[];
  plotW: number;
  plotH: number;
  baseY: number;
  yMax: number;
  scaleY: (value: number) => number;
}

/** Compute the shared plot geometry and y-scale for a cartesian chart. */
function cartesianGeometry(spec: ChartSpec): CartesianGeometry {
  const categories = spec.series[0].points.map((point) => String(point.x));
  const plotW = spec.width - padding.left - padding.right;
  const plotH = spec.height - padding.top - padding.bottom;
  const baseY = padding.top + plotH;
  const seriesMax = Math.max(...spec.series.flatMap((series) => series.points.map((point) => point.y)), 0);
  const stackedMax = Math.max(
    ...categories.map((_, index) =>
      spec.series.reduce((sum, series) => sum + (series.points[index]?.y ?? 0), 0),
    ),
    0,
  );
  const yMax = niceCeil(spec.kind === "stackedBar" ? stackedMax : seriesMax);
  const scaleY = (value: number): number => baseY - (value / yMax) * plotH;
  return { categories, plotW, plotH, baseY, yMax, scaleY };
}

/** Horizontal position of a category: evenly spread for line/area, slot-centered for bars. */
function categoryX(spec: ChartSpec, geo: CartesianGeometry, index: number): number {
  const { categories, plotW } = geo;
  if (spec.kind === "line" || spec.kind === "area") {
    return padding.left + (categories.length === 1 ? plotW / 2 : (index / (categories.length - 1)) * plotW);
  }
  return padding.left + (index + 0.5) * (plotW / categories.length);
}

function drawGridlines(geo: CartesianGeometry, theme: Theme): ReactNode[] {
  const nodes: ReactNode[] = [];
  for (let step = 0; step <= gridSteps; step += 1) {
    const value = (geo.yMax / gridSteps) * step;
    const y = geo.scaleY(value);
    nodes.push(
      <Line
        key={`grid-${step}`}
        x1={padding.left}
        y1={y}
        x2={padding.left + geo.plotW}
        y2={y}
        strokeWidth={0.5}
        stroke={theme.colors.border}
      />,
    );
    nodes.push(
      <SvgText
        key={`ylabel-${step}`}
        x={padding.left - 6}
        y={y + 3}
        style={{ fontSize: axisLabelFontSize, fontFamily: theme.text.caption.fontFamily }}
        fill={theme.colors.muted}
        textAnchor="end"
      >
        {String(Math.round(value))}
      </SvgText>,
    );
  }
  return nodes;
}

function drawAxisLabels(spec: ChartSpec, geo: CartesianGeometry, theme: Theme): ReactNode[] {
  return geo.categories.map((label, index) => (
    <SvgText
      key={`xlabel-${index}`}
      x={categoryX(spec, geo, index)}
      y={geo.baseY + 12}
      style={{ fontSize: axisLabelFontSize, fontFamily: theme.text.caption.fontFamily }}
      fill={theme.colors.muted}
      textAnchor="middle"
    >
      {label}
    </SvgText>
  ));
}

function drawBars(spec: ChartSpec, geo: CartesianGeometry, colors: string[]): ReactNode[] {
  const groupW = geo.plotW / geo.categories.length;
  const groupPad = (1 - groupFillRatio) / 2;
  const barW = (groupW * groupFillRatio) / spec.series.length;
  return spec.series.flatMap((series, seriesIndex) =>
    series.points.map((point, index) => {
      const x = padding.left + index * groupW + groupW * groupPad + seriesIndex * barW;
      const top = geo.scaleY(point.y);
      return (
        <Rect
          key={`bar-${seriesIndex}-${index}`}
          x={x}
          y={top}
          width={barW * barWidthRatio}
          height={geo.baseY - top}
          fill={colors[seriesIndex % colors.length]}
        />
      );
    }),
  );
}

function drawStackedBars(spec: ChartSpec, geo: CartesianGeometry, colors: string[]): ReactNode[] {
  const groupW = geo.plotW / geo.categories.length;
  const barW = groupW * stackedWidthRatio;
  const nodes: ReactNode[] = [];
  geo.categories.forEach((_, index) => {
    let runningTop = geo.baseY;
    spec.series.forEach((series, seriesIndex) => {
      const segmentHeight = ((series.points[index]?.y ?? 0) / geo.yMax) * geo.plotH;
      runningTop -= segmentHeight;
      nodes.push(
        <Rect
          key={`stack-${seriesIndex}-${index}`}
          x={padding.left + index * groupW + (groupW - barW) / 2}
          y={runningTop}
          width={barW}
          height={segmentHeight}
          fill={colors[seriesIndex % colors.length]}
        />,
      );
    });
  });
  return nodes;
}

function drawLineArea(spec: ChartSpec, geo: CartesianGeometry, colors: string[]): ReactNode[] {
  const nodes: ReactNode[] = [];
  spec.series.forEach((series, seriesIndex) => {
    const color = colors[seriesIndex % colors.length];
    const points = series.points.map((point, index) => `${categoryX(spec, geo, index)},${geo.scaleY(point.y)}`);
    const polyline = points.join(" L ");
    if (spec.kind === "area") {
      const first = categoryX(spec, geo, 0);
      const last = categoryX(spec, geo, series.points.length - 1);
      nodes.push(
        <Path
          key={`area-${seriesIndex}`}
          d={`M ${first},${geo.baseY} L ${polyline} L ${last},${geo.baseY} Z`}
          fill={color}
          fillOpacity={areaFillOpacity}
        />,
      );
    }
    nodes.push(
      <Path key={`line-${seriesIndex}`} d={`M ${polyline}`} stroke={color} strokeWidth={lineStrokeWidth} fill="none" />,
    );
  });
  return nodes;
}

/** Draw a bar, stacked-bar, line, or area chart by composing the focused helpers. */
function cartesian(spec: ChartSpec, theme: Theme, colors: string[]): ReactNode[] {
  const geo = cartesianGeometry(spec);
  const nodes = [...drawGridlines(geo, theme), ...drawAxisLabels(spec, geo, theme)];
  if (spec.kind === "stackedBar") nodes.push(...drawStackedBars(spec, geo, colors));
  else if (spec.kind === "bar") nodes.push(...drawBars(spec, geo, colors));
  else nodes.push(...drawLineArea(spec, geo, colors));
  return nodes;
}

function pie(spec: ChartSpec, colors: string[]): ReactNode[] {
  const series = spec.series[0];
  const total = series.points.reduce((sum, point) => sum + Math.abs(point.y), 0) || 1;
  const cx = spec.width / 2;
  const cy = spec.height / 2;
  const radius = Math.min(spec.width, spec.height) / 2 - padding.top;
  const innerRadius = spec.kind === "donut" ? radius * donutHoleRatio : 0;

  let angle = 0;
  return series.points.map((point, index) => {
    const sweep = (Math.abs(point.y) / total) * 360;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    const largeArc = sweep > 180 ? 1 : 0;
    const [ox1, oy1] = polar(cx, cy, radius, start);
    const [ox2, oy2] = polar(cx, cy, radius, end);
    const color = colors[index % colors.length];
    if (innerRadius === 0) {
      const d = `M ${cx},${cy} L ${ox1},${oy1} A ${radius},${radius} 0 ${largeArc} 1 ${ox2},${oy2} Z`;
      return <Path key={`slice-${index}`} d={d} fill={color} />;
    }
    const [ix1, iy1] = polar(cx, cy, innerRadius, start);
    const [ix2, iy2] = polar(cx, cy, innerRadius, end);
    const d =
      `M ${ox1},${oy1} A ${radius},${radius} 0 ${largeArc} 1 ${ox2},${oy2} ` +
      `L ${ix2},${iy2} A ${innerRadius},${innerRadius} 0 ${largeArc} 0 ${ix1},${iy1} Z`;
    return <Path key={`slice-${index}`} d={d} fill={color} />;
  });
}

function Legend({ spec, colors }: { spec: ChartSpec; colors: string[] }): ReactElement {
  const theme = useTheme();
  const isPie = spec.kind === "pie" || spec.kind === "donut";
  const items = isPie
    ? spec.series[0].points.map((point) => String(point.x))
    : spec.series.map((series) => series.name);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: theme.spacing.xs }}>
      {items.map((label, index) => (
        <View key={index} style={{ flexDirection: "row", alignItems: "center", marginRight: theme.spacing.md }}>
          <View
            style={{
              width: 8,
              height: 8,
              backgroundColor: colors[index % colors.length],
              marginRight: 4,
              borderRadius: 1,
            }}
          />
          <Text style={theme.text.caption}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * A chart drawn with @react-pdf/renderer's SVG primitives — bar, stacked bar,
 * line, area, pie, and donut. Vector output, no native canvas dependency.
 */
export function Chart({ block, maxWidth }: { block: ChartData; maxWidth: number }): ReactElement {
  const theme = useTheme();
  const colors = seriesColors(block.spec, theme);
  const width = Math.min(block.spec.width, maxWidth);
  const scale = width / block.spec.width;
  const height = block.spec.height * scale;
  const isPie = block.spec.kind === "pie" || block.spec.kind === "donut";

  return (
    <View wrap={false} style={{ marginVertical: theme.spacing.md }}>
      <Svg width={width} height={height} viewBox={`0 0 ${block.spec.width} ${block.spec.height}`}>
        {isPie ? pie(block.spec, colors) : cartesian(block.spec, theme, colors)}
      </Svg>
      <Legend spec={block.spec} colors={colors} />
      {block.caption ? <Caption>{block.caption}</Caption> : null}
    </View>
  );
}
