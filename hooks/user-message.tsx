import type { ElementTable, RenderElement } from "claude-code";

type Ui = Pick<ElementTable, "Box" | "Text">;

// A bubble is at most this share of the window wide, as the desktop's is.
const MAX_SHARE = 0.75;
const MARGIN = 1;
const PADDING = 1;

// The user's message as a block filled with the theme's `userMessageBackground`, as wide as its longest line.
export function userBubble({ Box, Text }: Ui, text: string, columns: number, align: "left" | "right"): RenderElement {
  const lines = text.replace(/\s+$/, "").split("\n");
  const inner = Math.max(10, Math.floor(columns * MAX_SHARE) - 2 * PADDING);
  const longest = Math.max(...lines.map((line) => [...line].length));
  const isLeft = align === "left";

  return (
    <Box
      alignSelf={isLeft ? "flex-start" : "flex-end"}
      marginLeft={isLeft ? MARGIN : 0}
      marginRight={isLeft ? 0 : MARGIN}
      width={Math.min(longest, inner) + 2 * PADDING}
      backgroundColor="userMessageBackground"
      paddingX={PADDING}
      flexDirection="column"
    >
      {lines.map((line, i) => (
        <Text key={`line-${i}`}>{line === "" ? " " : line}</Text>
      ))}
    </Box>
  );
}
