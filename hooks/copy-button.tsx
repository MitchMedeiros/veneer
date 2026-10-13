import type { ElementTable, RenderElement } from "claude-code";

type Ui = Pick<ElementTable, "Box" | "Text" | "Button">;

// What one copy button copies. The scope joins it to the hover group of the block it sits above. A plain button, for
// terminals that draw no Nerd Font icons, has a Unicode symbol for its icon.
export type CopyAction = { scope: string; onCopy: () => void; isPlain?: boolean };

const COPY_ICON = "\u{f0c5}";
const PLAIN_ICON = "❐";
const FILL = "userMessageBackground";

// The button itself, hidden until the pointer is over its hover group. It is one plain block of text, so the highlight a
// button takes under the pointer covers all of it.
function copyButton({ Box, Text, Button }: Ui, copy: CopyAction): RenderElement {
  return (
    <Box key="copy" display="none" hover={{ scope: copy.scope, display: "flex" }}>
      <Button key={`${copy.scope}:copy`} plain onPress={copy.onCopy}>
        <Text color="text" backgroundColor={FILL}>
          {` ${copy.isPlain === true ? PLAIN_ICON : COPY_ICON}  Copy `}
        </Text>
      </Button>
    </Box>
  );
}

// The row above a block, left-aligned, holding the button. The row is always there, so showing the button moves
// nothing, and it shares the hover group, so the pointer can travel from the block up to the button without the button
// hiding.
export function copyRow(ui: Ui, copy: CopyAction): RenderElement {
  const { Box } = ui;

  return (
    <Box key="copy-row" height={1} justifyContent="flex-start" hover={{ scope: copy.scope }}>
      {copyButton(ui, copy)}
    </Box>
  );
}
