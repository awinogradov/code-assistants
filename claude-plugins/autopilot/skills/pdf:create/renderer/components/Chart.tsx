import { Line, Path, Rect, Svg, Text as SvgText, Text, View } from "@react-pdf/renderer";
import type { ReactElement, ReactNode } from "react";

import type { Block } from "../schemas/blockSchema";
import type { ChartSpec } from "../schemas/chartSpecSchema";
import { useTheme } from "../theme/themeContext";
import type { Theme } from "../theme/themeInterface";
import { Caption } from "./primitives/Caption";

type ChartData = Extract<Block, { type: "chart" }>;

const padding = { left: 44, right: 16, top: 14, bottom: 30 };

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

function cartesian(spec: ChartSpec, theme: Theme, colors: string[]): ReactNode[] {
  const categories = spec.series[0].points.map((point) => String(point.x));
  const plotW = spec.width - padding.left - padding.right;
  const plotH = spec.height - padding.top - padding.bottom;
  const baseY = padding.top + plotH;

  const stacked = spec.kind === "stackedBar";
  const seriesMax = Math.max(
    ...spec.series.flatMap((series) => series.points.map((point) => point.y)),
    0,
  );
  const stackedMax = Math.max(
    ...categories.map((_, index) =>
      spec.series.reduce((sum, series) => sum + (series.points[index]?.y ?? 0), 0),
    ),
    0,
  );
  const yMax = niceCeil(stacked ? stackedMax : seriesMax);
  const scaleY = (value: number): number => baseY - (value / yMax) * plotH;

  const nodes: ReactNode[] = [];

  // Gridlines + y-axis labels.
  const steps = 4;
  for (let step = 0; step <= steps; step += 1) {
    const value = (yMax / steps) * step;
    const y = scaleY(value);
    nodes.push(
      <Line
        key={`grid-${step}`}
        x1={padding.left}
        y1={y}
        x2={padding.left + plotW}
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
        style={{ fontSize: 7, fontFamily: theme.text.caption.fontFamily }}
        fill={theme.colors.muted}
        textAnchor="end"
      >
        {String(Math.round(value))}
      </SvgText>,
    );
  }

  // X-axis category labels.
  categories.forEach((label, index) => {
    const x =
      spec.kind === "line" || spec.kind === "area"
        ? padding.left + (categories.length === 1 ? plotW / 2 : (index / (categories.length - 1)) * plotW)
        : padding.left + (index + 0.5) * (plotW / categories.length);
    nodes.push(
      <SvgText
        key={`xlabel-${index}`}
        x={x}
        y={baseY + 12}
        style={{ fontSize: 7, fontFamily: theme.text.caption.fontFamily }}
        fill={theme.colors.muted}
        textAnchor="middle"
      >
        {label}
      </SvgText>,
    );
  });

  if (spec.kind === "bar") {
    const groupW = plotW / categories.length;
    const barW = (groupW * 0.8) / spec.series.length;
    spec.series.forEach((series, seriesIndex) => {
      series.points.forEach((point, index) => {
        const x = padding.left + index * groupW + groupW * 0.1 + seriesIndex * barW;
        const top = scaleY(point.y);
        nodes.push(
          <Rect
            key={`bar-${seriesIndex}-${index}`}
            x={x}
            y={top}
            width={barW * 0.9}
            height={baseY - top}
            fill={colors[seriesIndex % colors.length]}
          />,
        );
      });
    });
  } else if (spec.kind === "stackedBar") {
    const groupW = plotW / categories.length;
    const barW = groupW * 0.6;
    categories.forEach((_, index) => {
      let runningTop = baseY;
      spec.series.forEach((series, seriesIndex) => {
        const value = series.points[index]?.y ?? 0;
        const segmentHeight = (value / yMax) * plotH;
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
  } else {
    // line and area
    const xAt = (index: number): number =>
      padding.left + (categories.length === 1 ? plotW / 2 : (index / (categories.length - 1)) * plotW);
    spec.series.forEach((series, seriesIndex) => {
      const color = colors[seriesIndex % colors.length];
      const points = series.points.map((point, index) => `${xAt(index)},${scaleY(point.y)}`).join(" ");
      if (spec.kind === "area") {
        const first = xAt(0);
        const last = xAt(series.points.length - 1);
        nodes.push(
          <Path
            key={`area-${seriesIndex}`}
            d={`M ${first},${baseY} L ${points.split(" ").join(" L ")} L ${last},${baseY} Z`}
            fill={color}
            fillOpacity={0.18}
          />,
        );
      }
      nodes.push(
        <Path
          key={`line-${seriesIndex}`}
          d={`M ${points.split(" ").join(" L ")}`}
          stroke={color}
          strokeWidth={1.5}
          fill="none"
        />,
      );
    });
  }

  return nodes;
}

function pie(spec: ChartSpec, theme: Theme, colors: string[]): ReactNode[] {
  const series = spec.series[0];
  const total = series.points.reduce((sum, point) => sum + Math.abs(point.y), 0) || 1;
  const cx = spec.width / 2;
  const cy = spec.height / 2;
  const radius = Math.min(spec.width, spec.height) / 2 - padding.top;
  const innerRadius = spec.kind === "donut" ? radius * 0.55 : 0;

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
        {isPie ? pie(block.spec, theme, colors) : cartesian(block.spec, theme, colors)}
      </Svg>
      <Legend spec={block.spec} colors={colors} />
      {block.caption ? <Caption>{block.caption}</Caption> : null}
    </View>
  );
}
