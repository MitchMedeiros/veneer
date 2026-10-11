import type { ElementTable, RenderElement } from "claude-code";

type Ui = Pick<ElementTable, "Box" | "Text">;

// A bubble is at most this share of the window wide, as the desktop's is.
const MAX_SHARE = 0.75;
const MARGIN = 1;
const PADDING_X = 1;
const FILL = "userMessageBackground";

// Half blocks that make the padding in halves: half a row above and below, and half a column more at each side.
// The corners are quarter blocks, so the half rows start and end exactly where the half-column caps do.
const TOP = { left: "▗", middle: "▄", right: "▖" };
const BOTTOM = { left: "▝", middle: "▀", right: "▘" };
const LEFT_CAP = "▐";
const RIGHT_CAP = "▌";

// The line cut into rows of at most `width` characters, at a space where there is one.
function wrapLine(line: string, width: number): string[] {
  const chars = [...line];
  const rows: string[] = [];
  let start = 0;

  while (chars.length - start > width) {
    const room = chars.slice(start, start + width + 1);
    const space = room.lastIndexOf(" ");
    const cut = space > 0 ? space : width;

    rows.push(chars.slice(start, start + cut).join(""));
    start += cut + (space > 0 ? 1 : 0);
  }

  return [...rows, chars.slice(start).join("")];
}

// The user's message as a block filled with the theme's `userMessageBackground`, as wide as its longest line.
export function userBubble({ Box, Text }: Ui, text: string, columns: number, align: "left" | "right"): RenderElement {
  const inner = Math.max(10, Math.floor(columns * MAX_SHARE) - 2 * PADDING_X - 2);
  const rows = text
    .replace(/\s+$/, "")
    .split("\n")
    .flatMap((line) => wrapLine(line, inner));
  const content = Math.min(inner, Math.max(...rows.map((row) => [...row].length)));
  const isLeft = align === "left";
  const edge = (glyphs: typeof TOP) => (
    <Text color={FILL}>{`${glyphs.left}${glyphs.middle.repeat(content + 2 * PADDING_X)}${glyphs.right}`}</Text>
  );

  return (
    <Box
      alignSelf={isLeft ? "flex-start" : "flex-end"}
      marginLeft={isLeft ? MARGIN : 0}
      marginRight={isLeft ? 0 : MARGIN}
      flexDirection="column"
    >
      {edge(TOP)}
      {rows.map((row, i) => (
        <Text key={`line-${i}`}>
          <Text color={FILL}>{LEFT_CAP}</Text>
          <Text color="text" backgroundColor={FILL}>
            {`${" ".repeat(PADDING_X)}${row.padEnd(content)}${" ".repeat(PADDING_X)}`}
          </Text>
          <Text color={FILL}>{RIGHT_CAP}</Text>
        </Text>
      ))}
      {edge(BOTTOM)}
    </Box>
  );
}
