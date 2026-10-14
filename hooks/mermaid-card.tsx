import type { ElementTable, RenderElement } from "claude-code";

type Ui = Pick<ElementTable, "Box" | "Text">;

// A Mermaid diagram drawn in box characters, inside a rounded card with its kind dimmed at the top left. A line wider
// than the card is cut at the edge, since wrapping would tear the lines apart.
export function mermaidCard({ Box, Text }: Ui, lines: readonly string[]): RenderElement {
  return (
    <Box flexDirection="column" alignSelf="flex-start" borderStyle="round" borderColor="subtle" paddingX={1}>
      <Text dimColor>mermaid</Text>
      {lines.map((line, i) => (
        <Text key={`line-${i}`} wrap="truncate-end">
          {line === "" ? " " : line}
        </Text>
      ))}
    </Box>
  );
}
