import type { ElementTable, RenderElement } from "claude-code";

import { hunksOf } from "./diff";

type Ui = Pick<ElementTable, "Box" | "Text">;

export type Changes = { added: number; removed: number };

const ANSI_TEXT = "#000000";

// Powerline half circles, which Ghostty and kitty draw without any font installed.
const LEFT_CAP = "";
const RIGHT_CAP = "";

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

// The native row with a pill for the lines added and one for the lines removed, on the row's own first line. Fills and
// text are theme tokens, so a pill matches Claude Code's own diff on every theme, colour-blind ones included. On the
// ansi themes the success and error colours are the diff fills' own, so the text is a fixed black, which the terminal's
// own palette cannot wash out as it does white on those fills.
export function withBadges({ Box, Text }: Ui, native: RenderElement, changes: Changes, isAnsi: boolean): RenderElement {
  const plain = isAnsi ? ANSI_TEXT : null;

  const pill = (label: string, fill: string, color: string) => (
    <Text key={label}>
      <Text color={fill}>{LEFT_CAP}</Text>
      <Text color={color} backgroundColor={fill} bold>{` ${label} `}</Text>
      <Text color={fill}>{RIGHT_CAP}</Text>
    </Text>
  );

  return (
    <Box flexDirection="row">
      <Box flexShrink={1}>{native}</Box>
      <Box flexShrink={0} marginTop={1} marginLeft={1} marginRight={1} gap={1}>
        {changes.added > 0 ? pill(`+${changes.added}`, "diffAdded", plain ?? "success") : null}
        {changes.removed > 0 ? pill(`-${changes.removed}`, "diffRemoved", plain ?? "error") : null}
      </Box>
    </Box>
  );
}
