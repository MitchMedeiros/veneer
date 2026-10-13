import type { ElementTable, RenderElement } from "claude-code";

type Ui = Pick<ElementTable, "Box" | "Text" | "Button">;

// What one copy button copies. The scope joins it to the hover group of the block it sits above.
export type CopyAction = { scope: string; onCopy: () => void };

const COPY_ICON = "\u{f0c5}";
const FILL = "userMessageBackground";

// The row above a block, left-aligned, holding a button that shows while the pointer is over the block or the button.
// The row is always there, so showing the button moves nothing, and it shares the hover group, so the pointer can travel
// from the block up to the button without the button hiding. The button is one plain block of text, so the highlight a
// button takes under the pointer covers all of it.
export function copyRow({ Box, Text, Button }: Ui, copy: CopyAction): RenderElement {
  return (
    <Box key="copy-row" height={1} justifyContent="flex-start" hover={{ scope: copy.scope }}>
      <Box key="copy" display="none" hover={{ scope: copy.scope, display: "flex" }}>
        <Button key={`${copy.scope}:copy`} plain onPress={copy.onCopy}>
          <Text color="text" backgroundColor={FILL}>{` ${COPY_ICON}  Copy `}</Text>
        </Button>
      </Box>
    </Box>
  );
}
