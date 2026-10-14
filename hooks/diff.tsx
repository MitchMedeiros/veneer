import type { ElementTable, RenderElement } from "claude-code";

import { foldButton, MAX_LINES, TAB } from "./fold";
import { MARGIN } from "./reply";
import { lineChildren } from "./syntax/runs";
import type { StyledRun } from "./syntax/types";

type Ui = Pick<ElementTable, "Box" | "Text" | "Button">;

export type DiffLine = {
  kind: "add" | "remove" | "context";
  text: string;
  oldNumber: number | null;
  newNumber: number | null;
};

export type Diff = { lines: DiffLine[]; breaks: ReadonlySet<number>; created?: boolean };

type Hunk = { oldStart?: number; newStart?: number; lines?: unknown };

// The hunks of an edit's stored result. A newly created file stores no patch, only its content, so that becomes one hunk
// of added lines.
export function hunksOf(output: unknown): Hunk[] | null {
  const result = output as { type?: unknown; content?: unknown; structuredPatch?: unknown } | null | undefined;

  if (Array.isArray(result?.structuredPatch) && result.structuredPatch.length > 0) {
    return result.structuredPatch as Hunk[];
  }

  if (result?.type === "create" && typeof result.content === "string" && result.content !== "") {
    const lines = result.content.replace(/\n$/, "").split("\n");

    return [{ oldStart: 0, newStart: 1, lines: lines.map((line) => `+${line}`) }];
  }

  return null;
}

// The stored patch of an edit as numbered lines, with the indexes where a new hunk starts. Null when it holds none.
export function parseDiff(output: unknown): Diff | null {
  const patch = hunksOf(output);

  if (patch === null) {
    return null;
  }

  const lines: DiffLine[] = [];
  const breaks = new Set<number>();

  for (const hunk of patch) {
    let oldNumber = hunk.oldStart ?? 1;
    let newNumber = hunk.newStart ?? 1;

    if (lines.length > 0) {
      breaks.add(lines.length);
    }

    for (const raw of Array.isArray(hunk.lines) ? hunk.lines : []) {
      if (typeof raw !== "string") {
        continue;
      }

      const text = raw.slice(1).replace(/\t/g, TAB);

      if (raw.startsWith("+")) {
        lines.push({ kind: "add", text, oldNumber: null, newNumber: newNumber++ });
      } else if (raw.startsWith("-")) {
        lines.push({ kind: "remove", text, oldNumber: oldNumber++, newNumber: null });
      } else {
        lines.push({ kind: "context", text, oldNumber: oldNumber++, newNumber: newNumber++ });
      }
    }
  }

  const created = (output as { type?: unknown } | null | undefined)?.type === "create";

  return lines.some((line) => line.kind !== "context") ? { lines, breaks, created } : null;
}

// The edit as a rounded card of numbered lines. A changed line's code is filled with the theme's diff token, so it matches
// Claude Code's own diff on every theme, and the fill starts right of its number. Like Claude Code's own diff there is
// one number column, coloured on changed lines in the line's own fill colour, as the badges are filled: the line's
// new number, or its old one where it was removed. The ansi themes draw the diff without fills, so there the numbers
// and text take the success and error colours. A background fills the card under the lines; changed lines keep their fill.
export function diffCard(
  ui: Ui,
  diff: Diff,
  isAnsi: boolean,
  expanded: boolean,
  toggle: () => void,
  id: string,
  runs: readonly (StyledRun[] | undefined)[] = [],
  background?: string,
): RenderElement {
  const { Box, Text } = ui;
  const shown = expanded ? diff.lines : diff.lines.slice(0, MAX_LINES);
  const numberOf = (line: DiffLine) => line.newNumber ?? line.oldNumber;
  const digits = Math.max(1, ...shown.map((line) => String(numberOf(line) ?? "").length));
  const plainLines = diff.created === true;
  const tone = (kind: DiffLine["kind"]) =>
    plainLines ? undefined : kind === "add" ? "success" : kind === "remove" ? "error" : undefined;
  const fillOf = (kind: DiffLine["kind"]) =>
    isAnsi || plainLines ? undefined : kind === "add" ? "diffAdded" : kind === "remove" ? "diffRemoved" : undefined;
  const numberTone = (kind: DiffLine["kind"]) => (isAnsi ? tone(kind) : fillOf(kind));

  return (
    <Box
      flexDirection="column"
      marginLeft={MARGIN}
      marginRight={MARGIN}
      borderStyle="round"
      borderColor="subtle"
      backgroundColor={background}
    >
      {shown.map((line, i) => (
        <Box key={`line-${i}`} flexDirection="column">
          {diff.breaks.has(i) ? <Text dimColor>{`${" ".repeat(digits + 2)}⋯`}</Text> : null}
          <Box flexDirection="row">
            <Text
              color={numberTone(line.kind)}
              dimColor={line.kind === "context" || plainLines}
            >{` ${String(numberOf(line) ?? "").padStart(digits)} `}</Text>
            <Box flexGrow={1} flexShrink={1} paddingLeft={1} backgroundColor={fillOf(line.kind)}>
              <Text color={isAnsi ? tone(line.kind) : undefined} wrap="wrap">
                {lineChildren(ui, line.text, runs[i])}
              </Text>
            </Box>
          </Box>
        </Box>
      ))}
      {foldButton(ui, diff.lines.length, expanded, toggle, id)}
    </Box>
  );
}
