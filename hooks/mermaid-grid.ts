import { Draft, mid, widest } from "./mermaid-scene";
import type { Ctx, Pt, Scene } from "./mermaid-scene";
import type { Tone } from "./palette";

// Boxes in a grid of columns, some holding grids of their own, and arrows between them: what a block diagram is, and
// what a C4 diagram is where its relations leave it too wide to lay out in ranks.

export type GridLine = { text: string; tone?: Tone; bold?: boolean };

export type GridCell = {
  id: string;
  // What a box says, a row for each line; a container says nothing and has a `title` on its top border instead.
  lines: readonly GridLine[];
  title: string;
  span: number;
  tone: Tone;
  isRound: boolean;
  isSpace: boolean;
  isBlock: boolean;
  // The columns a container is divided into; none given, its children make one row.
  columns: number;
  children: GridCell[];
};

export type GridEdge = { from: string; to: string; label: string; hasStart: boolean };

type Rect = { x: number; y: number; w: number; h: number };

const MIN_BOX = 8;
const PAD_X = 2;
const PAD_Y = 2;
const MAX_GAP = 16;
const GAP_Y = 3;

export const gridCell = (cell: Partial<GridCell> & Pick<GridCell, "id">): GridCell => ({
  lines: [],
  title: "",
  span: 1,
  tone: "suggestion",
  isRound: false,
  isSpace: false,
  isBlock: false,
  columns: 0,
  children: [],
  ...cell,
});

const columnsOf = (cell: GridCell): number =>
  cell.columns > 0
    ? cell.columns
    : Math.max(
        1,
        cell.children.reduce((sum, child) => sum + child.span, 0),
      );

// The rows a container's children fall into: each row holds children until their spans fill its columns.
function rowsOf(cell: GridCell): GridCell[][] {
  const rows: GridCell[][] = [[]];
  let used = 0;

  for (const child of cell.children) {
    const span = Math.min(child.span, columnsOf(cell));

    if (used + span > columnsOf(cell)) {
      rows.push([]);
      used = 0;
    }

    rows.at(-1)!.push(child);
    used += span;
  }

  return rows.filter((row) => row.length > 0);
}

const naturalWidth = (cell: GridCell, gap: number): number => {
  if (!cell.isBlock) {
    return Math.max(MIN_BOX, widest(cell.lines.map(({ text }) => text)) + 4);
  }

  const columns = columnsOf(cell);
  const unit = Math.max(
    MIN_BOX,
    ...cell.children.map((child) => {
      const span = Math.min(child.span, columns);

      return Math.ceil((naturalWidth(child, gap) - (span - 1) * gap) / span);
    }),
  );

  return unit * columns + (columns - 1) * gap + 2 * PAD_X;
};

const heightOf = (cell: GridCell): number =>
  cell.isBlock
    ? rowsOf(cell).reduce((sum, row) => sum + Math.max(...row.map(heightOf)), 0) +
      (rowsOf(cell).length - 1) * GAP_Y +
      2 * PAD_Y
    : Math.max(1, cell.lines.length) + 2;

// A way from the border of one box to the border of another that turns only at right angles: straight across where they
// share a row, and otherwise out of the side that faces the other box into the gap between rows and along it.
function routeOf(a: Rect, b: Rect): Pt[] {
  const from = { x: mid(a.x + Math.floor(a.w / 2)), y: mid(a.y + Math.floor(a.h / 2)) };
  const to = { x: mid(b.x + Math.floor(b.w / 2)), y: mid(b.y + Math.floor(b.h / 2)) };

  if (a.y === b.y) {
    const isRight = b.x > a.x;

    return [
      { x: isRight ? a.x + a.w - 0.5 : a.x + 0.5, y: from.y },
      { x: isRight ? b.x + 0.5 : b.x + b.w - 0.5, y: to.y },
    ];
  }

  const isBelow = b.y > a.y;
  const channel = isBelow ? mid(a.y + a.h) : mid(a.y - 2);

  return [
    { x: from.x, y: isBelow ? a.y + a.h - 0.5 : a.y + 0.5 },
    { x: from.x, y: channel },
    { x: to.x, y: channel },
    { x: to.x, y: isBelow ? b.y + 0.5 : b.y + b.h - 0.5 },
  ].filter((p, i, all) => i === 0 || p.x !== all[i - 1]!.x || p.y !== all[i - 1]!.y);
}

// The grid drawn under a `title`, or null where it does not fit the columns or an arrow joins a box that is not there.
export function gridScene(
  root: GridCell,
  edges: readonly GridEdge[],
  ctx: Ctx,
  { title, alt }: { title: string; alt: string },
): Scene | null {
  // Room beside a box for the text of an arrow that runs across to the next one, where there is room to spare.
  const wanted = Math.min(MAX_GAP, Math.max(4, ...edges.map(({ label }) => (label === "" ? 0 : widest([label]) + 2))));
  const gap = [wanted, 4, 2].find((candidate) => naturalWidth(root, candidate) - 2 * PAD_X <= ctx.columns);

  if (gap === undefined) {
    return null;
  }

  const d = new Draft();
  const places = new Map<string, Rect>();
  const width = naturalWidth(root, gap) - 2 * PAD_X;

  // Each container hands its children columns of equal width, a child with a span taking that many and the gaps between.
  const place = (cell: GridCell, rect: Rect, isRoot: boolean) => {
    const columns = columnsOf(cell);
    const inset = isRoot ? 0 : PAD_X;
    const unit = Math.floor((rect.w - 2 * inset - (columns - 1) * gap) / columns);
    let y = rect.y + (isRoot ? 0 : PAD_Y);

    for (const row of rowsOf(cell)) {
      let column = 0;
      const height = Math.max(...row.map(heightOf));

      for (const child of row) {
        const span = Math.min(child.span, columns);
        const box: Rect = {
          x: rect.x + inset + column * (unit + gap),
          y,
          w: span * unit + (span - 1) * gap,
          h: heightOf(child),
        };

        if (!child.isSpace) {
          if (child.id !== "") {
            places.set(child.id, box);
          }

          d.rect(box.x, box.y, box.w, box.h, {
            stroke: child.isBlock ? "subtle" : child.tone,
            round: child.isBlock || child.isRound,
          });

          if (child.isBlock) {
            d.text(box.x + 2, box.y, child.title === "" ? "" : ` ${child.title} `, "inactive", { bold: true });
            place(child, box, false);
          } else {
            child.lines.forEach(({ text, tone, bold }, n) =>
              d.text(box.x + box.w / 2, box.y + 1 + n, text, tone ?? "text", { anchor: "middle", bold }),
            );
          }
        }

        column += span;
      }

      y += height + GAP_Y;
    }
  };

  const top = d.heading(title);

  place(root, { x: 0, y: top, w: width, h: 0 }, true);

  for (const { from, to, label, hasStart } of edges) {
    const a = places.get(from);
    const b = places.get(to);

    if (a === undefined || b === undefined) {
      return null;
    }

    const path = routeOf(a, b);

    d.line(path, "inactive", { arrow: true });

    if (hasStart) {
      d.line([path[1]!, path[0]!], "inactive", { arrow: true });
    }

    if (label !== "") {
      const longest = path
        .slice(1)
        .map((end, i) => ({ a: path[i]!, b: end }))
        .reduce((best, seg) =>
          Math.abs(seg.b.x - seg.a.x) + Math.abs(seg.b.y - seg.a.y) >
          Math.abs(best.b.x - best.a.x) + Math.abs(best.b.y - best.a.y)
            ? seg
            : best,
        );

      // Across, the text sits above the line; down, beside it.
      if (longest.a.y === longest.b.y) {
        d.text((longest.a.x + longest.b.x) / 2, Math.floor(longest.a.y) - 1, label, "inactive", { anchor: "middle" });
      } else {
        d.text(longest.a.x + 1.5, Math.floor((longest.a.y + longest.b.y) / 2), label, "inactive");
      }
    }
  }

  return d.finish(alt, ctx);
}
