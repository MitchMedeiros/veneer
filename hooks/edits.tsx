import type { ElementTable, RenderElement } from "claude-code";

import { MARGIN } from "./reply";
import { litOf } from "./tool-row";

type Ui = Pick<ElementTable, "Box" | "Button" | "Text">;

// Nerd Font fold and unfold arrows and a file, then Unicode arrows and a pencil for terminals with no Nerd Font.
const NERD = { collapse: "\u{eaf5}", expand: "\u{eb6f}", file: "\u{f016}" } as const;
const PLAIN = { collapse: "▴", expand: "▾", file: "✎" } as const;

// The button above the prompt that folds every edit and file write, or opens them all again, on the user message
// background. It shows the action a press takes.
export function editsButton(
  { Box, Button, Text }: Ui,
  isCollapsed: boolean,
  isPlain: boolean,
  toggle: () => void,
): RenderElement {
  const glyphs = isPlain ? PLAIN : NERD;
  const lit = litOf("edits:toggle");

  return (
    <Box
      key="veneer:edits"
      alignSelf="flex-start"
      marginLeft={MARGIN}
      paddingX={1}
      backgroundColor="userMessageBackground"
    >
      <Button key="edits:toggle" plain hover={lit} onPress={toggle}>
        <Text dimColor hover={lit}>
          {isCollapsed ? glyphs.expand : glyphs.collapse}
        </Text>
        <Text dimColor hover={lit}>{` ${glyphs.file}`}</Text>
      </Button>
    </Box>
  );
}
