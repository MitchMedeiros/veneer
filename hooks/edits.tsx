import type { ElementTable, RenderElement } from "claude-code";

import { MARGIN } from "./reply";
import { litOf } from "./tool-row";

type Ui = Pick<ElementTable, "Box" | "Button" | "Text">;

// Nerd Font unfold arrows and vertical-align marks, then Unicode corner arrows and heavy triangles for terminals with no
// Nerd Font.
const NERD = { collapse: "\u{f054e}", expand: "\u{f054f}", top: "\u{f0623}", bottom: "\u{f0621}" } as const;
const PLAIN = { collapse: "⇱", expand: "⇲", top: "▲", bottom: "▼" } as const;

export type BandActions = { toggleEdits: () => void; scrollTop: () => void; scrollBottom: () => void };

// One icon on the user message background. The padding is part of the button, so a press anywhere on the fill counts.
function bandButton({ Box, Button, Text }: Ui, key: string, glyph: string, onPress: () => void): RenderElement {
  const lit = litOf(`band:${key}`);

  return (
    <Box key={`veneer:${key}`} alignSelf="flex-start" backgroundColor="userMessageBackground">
      <Button key={key} plain hover={lit} onPress={onPress}>
        <Text dimColor hover={lit}>{` ${glyph} `}</Text>
      </Button>
    </Box>
  );
}

// The buttons above the prompt: one folds every edit and file write, or opens them all again, and shows the action a
// press takes; the other two scroll the transcript to its top and its bottom.
export function bandButtons(ui: Ui, isCollapsed: boolean, isPlain: boolean, actions: BandActions): RenderElement {
  const { Box } = ui;
  const glyphs = isPlain ? PLAIN : NERD;

  return (
    <Box flexDirection="row" gap={1} marginLeft={MARGIN}>
      {bandButton(ui, "edits:toggle", isCollapsed ? glyphs.expand : glyphs.collapse, actions.toggleEdits)}
      {bandButton(ui, "scroll:top", glyphs.top, actions.scrollTop)}
      {bandButton(ui, "scroll:bottom", glyphs.bottom, actions.scrollBottom)}
    </Box>
  );
}
