import type { ElementTable, RenderElement } from "claude-code";

import { codeLines } from "./paint";
import { lineChildren } from "./syntax/runs";
import type { StyledRun } from "./syntax/types";

type Ui = Pick<ElementTable, "Box" | "Text">;

// A fenced block as a rounded card: the language dimmed at the top left, then the code as it was written. Native text,
// so it stays selectable, follows the theme and long lines wrap inside the card. Highlighted runs, one list per line,
// colour the code; without them it draws plain.
export function codeCard({ Box, Text }: Ui, lang: string, code: string, runs?: readonly StyledRun[][]): RenderElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
      {lang === "" ? null : <Text dimColor>{lang}</Text>}
      {codeLines(code).map((line, i) => (
        <Text key={`line-${i}`} wrap="wrap">
          {lineChildren({ Text }, line, runs?.[i])}
        </Text>
      ))}
    </Box>
  );
}
