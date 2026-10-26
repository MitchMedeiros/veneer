import type { ElementTable, RenderElement } from "claude-code";

import { fitWidth } from "./fold";
import type { Alert, AlertType } from "./markdown";
import { cellWidth } from "./svg-text";

type Ui = Pick<ElementTable, "Box" | "Text" | "Markdown">;

const KINDS: Record<AlertType, { title: string; icon: string; color: string }> = {
  note: { title: "Note", icon: "ℹ", color: "suggestion" },
  tip: { title: "Tip", icon: "✦", color: "success" },
  important: { title: "Important", icon: "❖", color: "claude" },
  warning: { title: "Warning", icon: "▲", color: "warning" },
  caution: { title: "Caution", icon: "✖", color: "error" },
};

// An alert as a rounded card in the colour of its kind: the icon and title on top, and its text, still markdown, below.
// With `fit`, the most columns a card may take, the card is as wide as its longest line where that is narrower.
export function alertCard({ Box, Text, Markdown }: Ui, alert: Alert, fit?: number): RenderElement {
  const { title, icon, color } = KINDS[alert.type];
  const widest = Math.max(...[`${icon} ${title}`, ...alert.text.split("\n")].map(cellWidth));

  return (
    <Box
      flexDirection="column"
      alignSelf={fit === undefined ? undefined : "flex-start"}
      width={fitWidth(widest + 2, 0, fit)}
      borderStyle="round"
      borderColor={color}
      paddingX={1}
    >
      <Text bold color={color}>{`${icon} ${title}`}</Text>
      {alert.text === "" ? null : <Markdown text={alert.text} />}
    </Box>
  );
}
