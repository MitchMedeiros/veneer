import type { ElementTable, RenderElement } from "claude-code";

type Ui = Pick<ElementTable, "Box" | "Text" | "Button">;

// What one copy button copies. The scope joins it to the hover group of the block it sits above. A plain button, for
// terminals that draw no Nerd Font icons, has a Unicode symbol for its icon. `also` is a second button beside it, named
// by its label, for a block that has more than one form to copy.
export type CopyAction = {
  scope: string;
  onCopy: () => void;
  isPlain?: boolean;
  also?: { label: string; onCopy: () => void };
};

type Corner = { left?: number; right?: number; top?: number };

const COPY_ICON = "\u{f0c5}";
const PLAIN_ICON = "❐";
const FILL = "userMessageBackground";

// The button itself, hidden until the pointer is over its hover group. It is one plain block of text, so the highlight a
// button takes under the pointer covers all of it.
function copyButton({ Box, Text, Button }: Ui, copy: CopyAction, corner?: Corner): RenderElement {
  return (
    <Box
      key="copy"
      display="none"
      hover={{ scope: copy.scope, display: "flex" }}
      position={corner === undefined ? undefined : "absolute"}
      top={corner === undefined ? undefined : (corner.top ?? 0)}
      left={corner?.left}
      right={corner?.right}
      gap={1}
    >
      <Button key={`${copy.scope}:copy`} plain onPress={copy.onCopy}>
        <Text color="text" backgroundColor={FILL}>
          {` ${copy.isPlain === true ? PLAIN_ICON : COPY_ICON}  Copy `}
        </Text>
      </Button>
      {copy.also === undefined ? null : (
        <Button key={`${copy.scope}:also`} plain onPress={copy.also.onCopy}>
          <Text color="text" backgroundColor={FILL}>
            {` Copy ${copy.also.label} `}
          </Text>
        </Button>
      )}
    </Box>
  );
}

// The button over a top corner of its parent, which holds the hover group: the columns in from the parent's left or
// right edge, whichever is given, and the rows down from its top, which is negative for the row above. It takes no room,
// so the block under it keeps every row.
export const copyCorner = (ui: Ui, copy: CopyAction, corner: Corner): RenderElement => copyButton(ui, copy, corner);

// A card with its copy button over its top left corner, both in the one hover group. The button comes after the card
// because an absolute element is painted over the siblings before it only. `left` is the columns the card is
// set in from the left, so the button lines up with the card's edge. A fitted card is only as wide as it needs, and so is
// its frame, so the pointer shows the button only where it is on the card.
export function withCopy(ui: Ui, copy: CopyAction, child: RenderElement, left = 0, isFitted = false): RenderElement {
  const { Box } = ui;

  return (
    <Box
      key={`copy-frame:${copy.scope}`}
      flexDirection="column"
      alignSelf={isFitted ? "flex-start" : undefined}
      hover={{ scope: copy.scope }}
    >
      {child}
      {copyCorner(ui, copy, { left })}
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
