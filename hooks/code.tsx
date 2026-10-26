import type { ElementTable, RenderElement } from "claude-code";

import { fitWidth } from "./fold";
import { codeLines } from "./paint";
import { lineChildren } from "./syntax/runs";
import type { StyledRun } from "./syntax/types";
import { cellWidth } from "./svg-text";

type Ui = Pick<ElementTable, "Box" | "Text">;

// A fenced block as a rounded card: the language dimmed at the top left, then the code as it was written. Native text,
// so it stays selectable, follows the theme and long lines wrap inside the card. Highlighted runs, one list per line,
// colour the code; without them it draws plain. A background fills the card.
export function codeCard(
  { Box, Text }: Ui,
  lang: string,
  code: string,
  runs?: readonly StyledRun[][],
  background?: string,
  fit?: number,
): RenderElement {
  const lines = codeLines(code);
  const widest = Math.max(cellWidth(lang), ...lines.map(cellWidth));

  return (
    <Box
      flexDirection="column"
      alignSelf={fit === undefined ? undefined : "flex-start"}
      width={fitWidth(widest + 2, 0, fit)}
      borderStyle="round"
      borderColor="subtle"
      paddingX={1}
      backgroundColor={background}
    >
      {lang === "" ? null : <Text dimColor>{lang}</Text>}
      {lines.map((line, i) => (
        <Text key={`line-${i}`} wrap="wrap">
          {lineChildren({ Text }, line, runs?.[i])}
        </Text>
      ))}
    </Box>
  );
}
