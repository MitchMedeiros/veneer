import type { ElementTable, RenderElement } from "claude-code";

import { fitWidth, foldButton, TAB } from "./fold";
import type { Fold } from "./fold";
import { MARGIN } from "./reply";
import { lineChildren } from "./syntax/runs";
import type { StyledRun } from "./syntax/types";
import { cellWidth } from "./svg-text";
import { shortPath } from "./tool-row";

type Ui = Pick<ElementTable, "Box" | "Text" | "Button">;

export type OutputLine = { text: string; number?: number; tone?: "error"; runs?: StyledRun[] };

const ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");

const CWD_NOTICE = /^Shell cwd was reset to .*$/gm;

const linesOf = (text: string, tone?: "error"): OutputLine[] => {
  const clean = text.replace(ESCAPE, "").replace(CWD_NOTICE, "").replace(/\s+$/, "");

  return clean === "" ? [] : clean.split("\n").map((line) => ({ text: line.replace(/\t/g, TAB), tone }));
};

const field = (value: unknown, key: string): unknown => (value as Record<string, unknown> | null | undefined)?.[key];

const textOf = (value: unknown, key: string): string => {
  const found = field(value, key);

  return typeof found === "string" ? found : "";
};

// A finished tool's stored result as the lines its card shows, or null for a tool with no card or an empty result.
export function parseOutput(tool: string, output: unknown, cwd: string, isErrored = false): OutputLine[] | null {
  let lines: OutputLine[] = [];

  if (isErrored) {
    lines = typeof output === "string" ? linesOf(output, "error") : [];
  } else if (tool === "Bash") {
    lines = [...linesOf(textOf(output, "stdout")), ...linesOf(textOf(output, "stderr"), "error")];
  } else if (tool === "Read" && field(output, "type") === "text") {
    const file = field(output, "file");
    const start = Number(field(file, "startLine")) || 1;

    lines = linesOf(textOf(file, "content")).map((line, i) => ({ ...line, number: start + i }));
  } else if (tool === "Grep" || tool === "Glob") {
    const names = field(output, "filenames");
    const content = textOf(output, "content");

    lines =
      content !== ""
        ? linesOf(content)
        : Array.isArray(names)
          ? names.map((name) => ({ text: shortPath(String(name), cwd) }))
          : [];
  }

  return lines.length === 0 ? null : lines;
}

export const outputText = (lines: readonly OutputLine[]): string => lines.map((line) => line.text).join("\n");

// The result as a rounded card of lines, the same shape as the diff card, with a numbered column where lines carry
// numbers and the error colour on what a command wrote to stderr. A background fills the card.
export function outputCard(
  ui: Ui,
  lines: OutputLine[],
  fold: Fold,
  id: string,
  background?: string,
  fit?: number,
): RenderElement {
  const { Box, Text } = ui;
  const shown = lines.slice(0, fold.limit);
  const digitsOf = (of: readonly OutputLine[]) => Math.max(0, ...of.map((line) => String(line.number ?? "").length));
  const digits = digitsOf(shown);
  const gutter = digitsOf(lines) > 0 ? digitsOf(lines) + 2 : 0;
  const widest = Math.max(0, ...lines.map((line) => cellWidth(line.text)));

  return (
    <Box
      flexDirection="column"
      alignSelf={fit === undefined ? undefined : "flex-start"}
      width={fitWidth(gutter + 1 + widest, lines.length, fit)}
      marginLeft={MARGIN}
      marginRight={MARGIN}
      borderStyle="round"
      borderColor="subtle"
      backgroundColor={background}
    >
      {shown.map((line, i) => (
        <Box key={`line-${i}`} flexDirection="row">
          {digits > 0 ? <Text dimColor>{` ${String(line.number ?? "").padStart(digits)} `}</Text> : null}
          <Box flexGrow={1} flexShrink={1} paddingLeft={1}>
            <Text color={line.tone} wrap="wrap">
              {lineChildren(ui, line.text, line.runs)}
            </Text>
          </Box>
        </Box>
      ))}
      {foldButton(ui, lines.length, fold, id)}
    </Box>
  );
}
