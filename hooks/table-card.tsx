import type { ElementTable, RenderElement } from "claude-code";

import { borderOf, type Frame } from "./fold";
import type { Align, Table } from "./markdown";

type Ui = Pick<ElementTable, "Box" | "Text">;

const FILL = "userMessageBackground";
const HEADER = "claude";
const GAP = 2;
const PADDING_X = 1;
const BORDER = 2;
const MIN_WIDTH = 3;

const JUSTIFY = { left: "flex-start", center: "center", right: "flex-end" } as const satisfies Record<Align, string>;

const widthOf = (text: string): number => [...text].length;

// Each column as wide as its longest cell. When the table is wider than `available` columns, the widest columns are cut
// back to a common cap, no narrower than a few characters, and their cells wrap.
export function columnWidths(table: Table, available: number): number[] {
  const natural = table.header.map((cell, col) =>
    Math.max(1, widthOf(cell), ...table.rows.map((row) => widthOf(row[col] ?? ""))),
  );
  const budget = available - BORDER - 2 * PADDING_X - GAP * (natural.length - 1);
  const total = (cap: number) => natural.reduce((sum, width) => sum + Math.min(width, cap), 0);
  let cap = Math.max(...natural);

  while (cap > MIN_WIDTH && total(cap) > budget) {
    cap--;
  }

  return natural.map((width) => Math.min(width, cap));
}

// A table as one native card that fits its content: a rounded border, a bold header row in the accent colour, and every
// second row filled. The header and the filled rows run the full width of the card. Cells that are too wide wrap.
export function tableCard(
  { Box, Text }: Ui,
  table: Table,
  available: number,
  frame: Frame = "bordered",
): RenderElement {
  const widths = columnWidths(table, available);
  const row = (cells: readonly string[], key: string, fill?: string, isHeader = false) => (
    <Box key={key} flexDirection="row" gap={GAP} paddingX={PADDING_X} backgroundColor={fill}>
      {widths.map((width, col) => (
        <Box key={`cell-${col}`} width={width} justifyContent={JUSTIFY[table.align[col] ?? "left"]}>
          <Text bold={isHeader} color={isHeader ? HEADER : "text"} wrap="wrap">
            {cells[col] ?? ""}
          </Text>
        </Box>
      ))}
    </Box>
  );

  return (
    <Box flexDirection="column" alignSelf="flex-start" {...borderOf(frame)}>
      {row(table.header, "header", FILL, true)}
      {table.rows.map((cells, i) => row(cells, `row-${i}`, i % 2 === 1 ? FILL : undefined))}
    </Box>
  );
}
