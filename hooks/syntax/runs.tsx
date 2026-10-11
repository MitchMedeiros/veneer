import type { ElementTable } from "claude-code";

import type { StyledRun } from "./types";

type Ui = Pick<ElementTable, "Text">;

// One line of code as the children of a `Text`: a coloured `Text` per run, or the plain string where the line has no
// runs. An empty line is a space so the row keeps its height.
export function lineChildren({ Text }: Ui, line: string, runs: StyledRun[] | undefined) {
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
    >
      {run.text}
    </Text>
  ));
}
