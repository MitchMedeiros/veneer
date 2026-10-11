import type { ElementTable, RenderElement } from "claude-code";

type Ui = Pick<ElementTable, "Box" | "Button" | "Text">;

// Lines drawn before the rest is folded into a count.
export const MAX_LINES = 24;
export const TAB = "    ";

// The line under a folded card that shows the rest when pressed, and folds it again. Null when everything fits. The id
// keeps the key of one card's button apart from another's in the same tree.
export function foldButton(
  { Box, Button, Text }: Ui,
  total: number,
  expanded: boolean,
  toggle: () => void,
  id: string,
) {
  if (total <= MAX_LINES) {
    return null;
  }

  return (
    <Box paddingLeft={1}>
      <Button key={`fold:${id}`} plain onPress={toggle}>
        <Text color="claude">{expanded ? "Show fewer lines" : `Show ${total - MAX_LINES} more lines`}</Text>
      </Button>
    </Box>
  ) as RenderElement;
}
