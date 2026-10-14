import type { ElementTable, RenderElement } from "claude-code";

import type { Row } from "./mermaid-cells";

type Ui = Pick<ElementTable, "Box" | "Text">;

// Columns the card's border and padding take from what it draws in.
export const CARD_COLUMNS = 4;

// A Mermaid diagram drawn in characters, inside a rounded card with its kind dimmed at the top left. Each row is runs of
// text in theme colours. A row wider than the card is cut at the edge, since wrapping would tear the lines apart.
export function mermaidCard({ Box, Text }: Ui, rows: readonly Row[]): RenderElement {
  return (
    <Box flexDirection="column" alignSelf="flex-start" borderStyle="round" borderColor="subtle" paddingX={1}>
      <Text dimColor>mermaid</Text>
      {rows.map((row, i) => (
        <Text key={`line-${i}`} wrap="truncate-end">
          {row.length === 0
            ? " "
            : row.map((run, n) => (
                <Text key={`run-${n}`} color={run.color} backgroundColor={run.back} bold={run.bold}>
                  {run.text}
                </Text>
              ))}
        </Text>
      ))}
    </Box>
  );
}
