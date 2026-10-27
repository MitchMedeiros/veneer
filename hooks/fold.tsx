import type { ElementTable, RenderElement } from "claude-code";

type Ui = Pick<ElementTable, "Box" | "Button" | "Text">;

// Lines drawn before the rest is folded into a count, and the lines each press of the more button adds.
export const MAX_LINES = 24;
export const TAB = "    ";

// The columns the fold buttons take, so a fitted card with a fold line is never narrower than its buttons.
const FOLD_WIDTH = 38;
const BORDER = 2;

// How a card is framed: a rounded border, a blank row above and below that stands in for a border that is off, or
// nothing.
export type Frame = "bordered" | "padded" | "plain";

// The props that frame a card.
export const borderOf = (frame: Frame) =>
  frame === "bordered"
    ? ({ borderStyle: "round", borderColor: "subtle" } as const)
    : frame === "padded"
      ? ({ paddingY: 1 } as const)
      : {};

// The width of a fitted card whose content is `content` columns wide, or undefined where that is not narrower than the
// `cap` columns it may take, so the card then fills its parent as an unfitted one does. A card with no border is two
// columns narrower.
export function fitWidth(
  content: number,
  total: number,
  cap: number | undefined,
  frame: Frame = "bordered",
): number | undefined {
  const width = Math.max(content, total > MAX_LINES ? FOLD_WIDTH : 0) + (frame === "bordered" ? BORDER : 0);

  return cap === undefined || width >= cap ? undefined : width;
}

// How far a card is open: the lines it draws, and the presses that draw one step more or one step fewer.
export type Fold = { limit: number; more: () => void; less: () => void };

const stepId = (id: string, step: number): string => `${id}#${step}`;

// The lines a card draws, from the step ids of `id` that are in `open`. Steps count up from one and stop at the first
// that is missing.
export function limitOf(open: { has: (id: string) => boolean }, id: string): number {
  let steps = 0;

  while (open.has(stepId(id, steps + 1))) {
    steps += 1;
  }

  return MAX_LINES * (steps + 1);
}

// The fold of a card, kept as step ids in the same set of open entries as everything else. `toggle` flips one id.
export function foldOf(open: { has: (id: string) => boolean }, toggle: (id: string) => void, id: string): Fold {
  const limit = limitOf(open, id);
  const steps = limit / MAX_LINES - 1;

  return { limit, more: () => toggle(stepId(id, steps + 1)), less: () => toggle(stepId(id, steps)) };
}

// The line under a folded card that shows more of it when pressed, and shows fewer once it is partly open. Null when
// everything fits. The id keeps the key of one card's buttons apart from another's in the same tree.
export function foldButton({ Box, Button, Text }: Ui, total: number, fold: Fold, id: string) {
  if (total <= MAX_LINES) {
    return null;
  }

  const hidden = Math.min(MAX_LINES, total - fold.limit);

  return (
    <Box paddingLeft={1} gap={2}>
      {hidden > 0 ? (
        <Button key={`fold:${id}`} plain onPress={fold.more}>
          <Text color="claude">{`Show ${hidden} more line${hidden === 1 ? "" : "s"}`}</Text>
        </Button>
      ) : null}
      {fold.limit > MAX_LINES ? (
        <Button key={`unfold:${id}`} plain onPress={fold.less}>
          <Text color="claude">Show fewer lines</Text>
        </Button>
      ) : null}
    </Box>
  ) as RenderElement;
}
