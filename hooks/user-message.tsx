import type { ElementTable, RenderElement } from "claude-code";

import { copyRow } from "./copy-button";
import type { CopyAction } from "./copy-button";

type Ui = Pick<ElementTable, "Box" | "Text" | "Button">;

// A bubble is at most this share of the window wide, as the desktop's is.
const MAX_SHARE = 0.75;
const MARGIN = 1;
const PADDING_X = 1;
const FILL = "userMessageBackground";
const ACCENT = "claude";
const MENTION = "suggestion";

// An @file mention: an @ at the start of a word followed by a path. Splitting on it leaves the mentions at odd indices.
const FILE_MENTION = /((?<!\S)@[\w./~-]*[\w/~-])/;

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

// The user's message as a block filled with the theme's `userMessageBackground`, as wide as its longest line. A copy
// button waits above it and shows while the pointer is over the bubble or the button.
export function userBubble(
  { Box, Text, Button }: Ui,
  text: string,
  columns: number,
  align: "left" | "right",
  copy: CopyAction,
): RenderElement {
  const isLeft = align === "left";
  const inner = Math.max(10, Math.floor(columns * MAX_SHARE) - 2 * PADDING_X - 2);
  const rows = text
    .replace(/\s+$/, "")
    .split("\n")
    .flatMap((line) => wrapLine(line, inner));
  const content = Math.min(inner, Math.max(...rows.map((row) => [...row].length)));
  const leftColor = isLeft ? ACCENT : FILL;
  const rightColor = isLeft ? FILL : ACCENT;
  const body = (row: string) =>
    row.split(FILE_MENTION).map((part, i) =>
      i % 2 === 1 ? (
        <Text key={`mention-${i}`} color={MENTION} backgroundColor={FILL} bold>
          {part}
        </Text>
      ) : (
        part
      ),
    );
  const side = (glyphs: typeof TOP) => (
    <Text>
      <Text color={leftColor}>{glyphs.left}</Text>
      <Text color={FILL}>{glyphs.middle.repeat(content + 2 * PADDING_X)}</Text>
      <Text color={rightColor}>{glyphs.right}</Text>
    </Text>
  );

  const bubble = (
    <Box key="bubble" flexDirection="column" hover={{ scope: copy.scope }}>
      {side(TOP)}
      {rows.map((row, i) => (
        <Text key={`line-${i}`}>
          <Text color={leftColor}>{LEFT_CAP}</Text>
          <Text color="text" backgroundColor={FILL}>
            {" ".repeat(PADDING_X)}
            {body(row)}
            {" ".repeat(Math.max(0, content - [...row].length) + PADDING_X)}
          </Text>
          <Text color={rightColor}>{RIGHT_CAP}</Text>
        </Text>
      ))}
      {side(BOTTOM)}
    </Box>
  );

  return (
    <Box alignSelf={isLeft ? "flex-start" : "flex-end"} marginLeft={MARGIN} marginRight={MARGIN} flexDirection="column">
      {copyRow({ Box, Text, Button }, copy)}
      {bubble}
    </Box>
  );
}
