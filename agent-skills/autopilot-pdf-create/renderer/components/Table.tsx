import { Text, View } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import type { Block } from "../schemas/blockSchema";
import { useTheme } from "../theme/themeContext";
import { Caption } from "./primitives/Caption";
import { InlineRuns } from "./primitives/InlineText";

type TableData = Extract<Block, { type: "table" }>;

/** Column widths as percentage strings: explicit fractions when given, else evenly split. */
function columnWidths(columns: TableData["columns"]): string[] {
  const explicit = columns.every((column) => typeof column.width === "number");
  if (explicit) {
    const total = columns.reduce((sum, column) => sum + (column.width ?? 0), 0) || 1;
    return columns.map((column) => `${(((column.width ?? 0) / total) * 100).toFixed(3)}%`);
  }
  return columns.map(() => `${(100 / columns.length).toFixed(3)}%`);
}

/**
 * A themed table built from flexbox rows. Each row is `wrap={false}` (a single
 * row never splits) while the table itself wraps, so long tables paginate
 * cleanly. (Header rows do not repeat across pages — a react-pdf limitation.)
 */
export function Table({ block }: { block: TableData }): ReactElement {
  const theme = useTheme();
  const widths = columnWidths(block.columns);
  const cellBase = {
    fontSize: theme.text.body.fontSize - 0.5,
    fontFamily: theme.text.body.fontFamily,
    padding: theme.spacing.sm,
  };

  return (
    <View style={{ marginVertical: theme.spacing.md }}>
      <View
        style={{
          borderWidth: 0.5,
          borderColor: theme.colors.border,
          borderRadius: theme.rounded.sm,
        }}
      >
        <View wrap={false} style={{ flexDirection: "row", backgroundColor: theme.colors.primary }}>
          {block.columns.map((column, index) => (
            <Text
              key={index}
              style={{
                ...theme.text.label,
                color: theme.colors.onPrimary,
                width: widths[index],
                padding: theme.spacing.sm,
                textAlign: column.align ?? "left",
              }}
            >
              {column.header}
            </Text>
          ))}
        </View>
        {block.rows.map((row, rowIndex) => (
          <View
            key={rowIndex}
            wrap={false}
            style={{
              flexDirection: "row",
              backgroundColor: rowIndex % 2 === 1 ? theme.colors.surface : theme.colors.background,
              borderTopWidth: 0.5,
              borderTopColor: theme.colors.border,
            }}
          >
            {block.columns.map((column, cellIndex) => {
              const cell = row[cellIndex];
              return (
                <Text
                  key={cellIndex}
                  style={{
                    ...cellBase,
                    color: theme.colors.text,
                    width: widths[cellIndex],
                    textAlign: column.align ?? "left",
                  }}
                >
                  {cell ? <InlineRuns content={cell} /> : ""}
                </Text>
              );
            })}
          </View>
        ))}
      </View>
      {block.caption ? <Caption>{block.caption}</Caption> : null}
    </View>
  );
}
