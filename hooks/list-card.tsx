import type { ElementTable, RenderElement } from "claude-code";

import type { List } from "./markdown";

type Ui = Pick<ElementTable, "Box" | "Text" | "Markdown">;

const BULLETS = ["•", "◦", "▪"];
const INDENT = 3;

// A list as a row for each item: a mark in the accent colour, a bullet that changes with the depth or the item's number,
// and the item's text, still markdown, beside it. A line of text that wraps stays under the text, not under the mark.
// Numbers are aligned on their dots within each depth.
export function listCard({ Box, Text, Markdown }: Ui, list: List): RenderElement {
  const digits = (depth: number) =>
    Math.max(0, ...list.items.filter((item) => item.depth === depth).map((item) => String(item.number ?? "").length));

  return (
    <Box flexDirection="column">
      {list.items.map((item, i) => {
        const mark =
          item.number === null
            ? `${BULLETS[Math.min(item.depth, BULLETS.length - 1)]} `
            : `${String(item.number).padStart(digits(item.depth))}. `;

        return (
          <Box
            key={`item-${i}`}
            flexDirection="row"
            paddingLeft={item.depth * INDENT}
            marginTop={item.isSpaced && i > 0 ? 1 : 0}
          >
            <Box flexShrink={0}>
              <Text color="claude" bold={item.number !== null}>
                {mark}
              </Text>
            </Box>
            <Box flexShrink={1} flexGrow={1}>
              <Markdown text={item.text} />
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
