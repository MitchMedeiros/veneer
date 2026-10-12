import type { ElementTable } from "claude-code";

import type { StyledRun } from "./types";

type Ui = Pick<ElementTable, "Text">;

// One line of code as the children of a `Text`: a coloured `Text` per run, or the plain string where the line has no
// runs. An empty line is a space so the row keeps its height. A `hover` is put on every run, for a line inside a button,
// which turns each piece to its own colour under the pointer.
export function lineChildren(
  { Text }: Ui,
  line: string,
  runs: StyledRun[] | undefined,
  hover?: Parameters<typeof Text>[0]["hover"],
) {
  if (runs === undefined || runs.length === 0) {
    return line === "" ? " " : line;
  }

  return runs.map((run, i) => (
    <Text
      key={`run-${i}`}
      color={run.color}
      bold={run.bold}
      italic={run.italic}
      underline={run.underline}
      strikethrough={run.strikethrough}
      hover={hover}
    >
      {run.text}
    </Text>
  ));
}
