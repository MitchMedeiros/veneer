import type { ElementTable, RenderElement } from "claude-code";

import { MARGIN } from "./reply";
import { litOf } from "./tool-row";

type Ui = Pick<ElementTable, "Box" | "Button" | "Text">;

// Nerd Font unfold-less and unfold-more arrows, then Unicode corner arrows for terminals with no Nerd Font.
const NERD = { collapse: "\u{f054e}", expand: "\u{f054f}" } as const;
const PLAIN = { collapse: "⇱", expand: "⇲" } as const;

// The button above the prompt that folds every edit and file write, or opens them all again, on the user message
// background. It shows the action a press takes. The padding is part of the button, so a press anywhere on the fill
// counts.
export function editsButton(
  { Box, Button, Text }: Ui,
  isCollapsed: boolean,
  isPlain: boolean,
  toggle: () => void,
): RenderElement {
  const glyphs = isPlain ? PLAIN : NERD;
  const lit = litOf("edits:toggle");

  return (
    <Box key="veneer:edits" alignSelf="flex-start" marginLeft={MARGIN} backgroundColor="userMessageBackground">
      <Button key="edits:toggle" plain hover={lit} onPress={toggle}>
        <Text dimColor hover={lit}>{` ${isCollapsed ? glyphs.expand : glyphs.collapse} `}</Text>
      </Button>
    </Box>
  );
}
