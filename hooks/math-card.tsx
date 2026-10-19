import type { ElementTable, RenderElement } from "claude-code";

import { texToText } from "./math-unicode";

type Ui = Pick<ElementTable, "Box" | "Text">;

// Display math as native text, indented, in the form `texToText` gives. It is what stays where the equation cannot be
// drawn as a picture.
export function mathCard({ Box, Text }: Ui, tex: string): RenderElement {
  return (
    <Box paddingLeft={2}>
      <Text wrap="wrap">{texToText(tex)}</Text>
    </Box>
  );
}
