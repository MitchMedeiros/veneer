import type { ElementTable, RenderElement } from "claude-code";

import type { Heading } from "./markdown";

type Ui = Pick<ElementTable, "Box" | "Text">;

const ACCENT = "claude";

// A heading as native text. The first two levels are bold in the accent colour with a rule under them, heavy for the
// first and light for the second, as long as the text. The third is bold, the fourth bold and dim.
export function headingCard({ Box, Text }: Ui, heading: Heading, available: number): RenderElement {
  const rule = (glyph: string, color: string) => (
    <Text color={color}>{glyph.repeat(Math.max(1, Math.min([...heading.text].length, available)))}</Text>
  );

  switch (heading.level) {
    case 1:
      return (
        <Box flexDirection="column" alignSelf="flex-start">
          <Text bold color={ACCENT} wrap="wrap">
            {heading.text}
          </Text>
          {rule("━", ACCENT)}
        </Box>
      );
    case 2:
      return (
        <Box flexDirection="column" alignSelf="flex-start">
          <Text bold color={ACCENT} wrap="wrap">
            {heading.text}
          </Text>
          {rule("─", "subtle")}
        </Box>
      );
    case 3:
      return (
        <Text bold color="text" wrap="wrap">
          {heading.text}
        </Text>
      );
    default:
      return (
        <Text bold dimColor wrap="wrap">
          {heading.text}
        </Text>
      );
  }
}
