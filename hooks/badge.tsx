import type { ElementTable, RenderElement } from "claude-code";

import { hunksOf } from "./diff";

type Ui = Pick<ElementTable, "Box" | "Text">;

export type Changes = { added: number; removed: number };

const ANSI_TEXT = "#000000";

// Powerline half circles, which Ghostty and kitty draw without any font installed.
const LEFT_CAP = "\u{e0b6}";
const RIGHT_CAP = "\u{e0b4}";

// Added and removed line counts from an edit's stored result, or null when it holds no change.
export function changeCounts(output: unknown): Changes | null {
  const patches = hunksOf(output);

  if (patches === null) {
    return null;
  }

  const lines = patches.flatMap((patch) => (Array.isArray(patch?.lines) ? (patch.lines as unknown[]) : []));
  const added = lines.filter((line) => typeof line === "string" && line.startsWith("+")).length;
  const removed = lines.filter((line) => typeof line === "string" && line.startsWith("-")).length;

  return added + removed === 0 ? null : { added, removed };
}

// How a count is drawn as a pill: on an ansi theme or not, and with rounded ends or square ones.
export type PillLook = { isAnsi: boolean; hasRoundEnds: boolean };

// The native row with the count of lines added and the count removed after it, on the row's own first line. Fills and
// text are theme tokens, so they match Claude Code's own diff on every theme, colour-blind ones included. Given `pills`,
// each count is a filled pill. On the ansi themes the success and error colours are the diff fills' own, so the text is a
// fixed black, which the terminal's own palette cannot wash out as it does white on those fills. The rounded ends are
// Powerline glyphs, which a terminal with no symbol font cannot draw. A pill fills its whole cell, so the pills of
// neighbouring rows touch whatever the line spacing. `gap` is the blank rows above the row, which the counts keep.
export function withBadges(
  { Box, Text }: Ui,
  native: RenderElement,
  changes: Changes,
  pills?: PillLook,
  gap = 0,
): RenderElement {
  const ansiText = pills?.isAnsi ? ANSI_TEXT : null;

  const count = (label: string, fill: string, tone: string) =>
    pills === undefined ? (
      <Text key={label} color={tone} bold>
        {label}
      </Text>
    ) : (
      <Text key={label}>
        {pills.hasRoundEnds ? <Text color={fill}>{LEFT_CAP}</Text> : null}
        <Text color={ansiText ?? tone} backgroundColor={fill} bold>{` ${label} `}</Text>
        {pills.hasRoundEnds ? <Text color={fill}>{RIGHT_CAP}</Text> : null}
      </Text>
    );

  return (
    <Box flexDirection="row">
      <Box flexShrink={1}>{native}</Box>
      <Box
        flexShrink={0}
        marginTop={gap}
        marginLeft={1}
        marginRight={1}
        gap={pills !== undefined && !pills.hasRoundEnds ? 0 : 1}
      >
        {changes.added > 0 ? count(`+${changes.added}`, "diffAdded", "success") : null}
        {changes.removed > 0 ? count(`-${changes.removed}`, "diffRemoved", "error") : null}
      </Box>
    </Box>
  );
}
