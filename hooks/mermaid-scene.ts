import type { Tone } from "./palette";
import { cellWidth, wrapWith } from "./svg-text";

// A diagram drawn once, in terminal cells, and then rendered twice: as a picture (mermaid-scene-svg.ts) and as text
// (mermaid-cells.ts). A coordinate is a fractional column and row, so cell `i` spans `i` to `i + 1` and its middle is
// `i + 0.5`. Lines and box borders that sit on a middle land on the same cells in both renderings.

export type Pt = { x: number; y: number };
export type Anchor = "start" | "middle" | "end";

// What a diagram is laid out for: the columns it may take and a cell's height over its width, which shapes circles.
export type Ctx = { columns: number; ratio: number };

// A primitive one rendering draws and the other leaves out, for detail that suits only one of them.
type Only = { only?: "picture" | "text" };

export type DotShape = "circle" | "diamond" | "square" | "cross";

export type Prim = Only &
  (
    | { kind: "text"; x: number; y: number; text: string; tone: Tone; anchor: Anchor; bold: boolean }
    | {
        kind: "rect";
        x: number;
        y: number;
        w: number;
        h: number;
        stroke?: Tone;
        fill?: Tone;
        opacity: number;
        round: boolean;
      }
    | { kind: "poly"; points: Pt[]; stroke?: Tone; fill?: Tone; opacity: number }
    | { kind: "line"; points: Pt[]; tone: Tone; dash: boolean; arrow: boolean }
    | { kind: "dot"; x: number; y: number; tone: Tone; shape: DotShape }
  );

export type Scene = { width: number; height: number; prims: Prim[]; alt: string };

// One entry of a key: what it is called, its colour and numbers to show beside it.
export type KeyItem = { label: string; tone: Tone; cells?: readonly string[] };

// More rows than this stops being easier to read than the source.
export const MAX_ROWS = 150;

// The fill at which text paints a shape solid, and the lighter one at which it shades it; a fainter tint is left to the
// picture.
export const SOLID = 0.5;
export const SHADED = 0.3;

const SERIES: readonly Tone[] = [
  "suggestion",
  "success",
  "warning",
  "accent",
  "autoAccept",
  "planMode",
  "error",
  "inactive",
];

// The colour of the `i`th series, section or branch of a diagram.
export const seriesTone = (i: number): Tone => SERIES[i % SERIES.length]!;

type Options = Only & { anchor?: Anchor; bold?: boolean };

// The primitives of a diagram as its layout places them, in the order they are painted.
export class Draft {
  readonly prims: Prim[] = [];

  text(
    x: number,
    y: number,
    text: string,
    tone: Tone = "text",
    { anchor = "start", bold = false, only }: Options = {},
  ) {
    if (text !== "") {
      this.prims.push({ kind: "text", x, y, text, tone, anchor, bold, only });
    }
  }

  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    {
      stroke,
      fill,
      opacity = 1,
      round = false,
      only,
    }: Only & { stroke?: Tone; fill?: Tone; opacity?: number; round?: boolean },
  ) {
    this.prims.push({ kind: "rect", x, y, w, h, stroke, fill, opacity, round, only });
  }

  poly(points: Pt[], { stroke, fill, opacity = 1, only }: Only & { stroke?: Tone; fill?: Tone; opacity?: number }) {
    this.prims.push({ kind: "poly", points, stroke, fill, opacity, only });
  }

  line(
    points: Pt[],
    tone: Tone,
    { dash = false, arrow = false, only }: Only & { dash?: boolean; arrow?: boolean } = {},
  ) {
    this.prims.push({ kind: "line", points, tone, dash, arrow, only });
  }

  // A marker centred on (`x`, `y`), which text puts in the cell that holds that point.
  dot(x: number, y: number, tone: Tone, shape: DotShape = "circle", only?: Only["only"]) {
    this.prims.push({ kind: "dot", x, y, tone, shape, only });
  }

  // A key to the colours as a column: a swatch, a name and any numbers, which line up in columns of their own. Returns
  // the rows it took.
  legend(items: readonly KeyItem[], x: number, y: number): number {
    const names = widest(items.map(({ label }) => label));
    const columns = Math.max(0, ...items.map(({ cells }) => cells?.length ?? 0));
    const widths = Array.from({ length: columns }, (_, c) => widest(items.map(({ cells }) => cells?.[c] ?? "")));

    items.forEach(({ label, tone, cells }, row) => {
      this.dot(x + 0.5, y + row + 0.5, tone, "square");
      this.text(x + 2, y + row, label);

      let at = x + 2 + names + 2;

      widths.forEach((width, c) => {
        at += width;
        this.text(at, y + row, cells?.[c] ?? "", "inactive", { anchor: "end" });
        at += 2;
      });
    });

    return items.length;
  }

  // The same key as a row, run on to further rows where it is wider than `width`. Returns the rows it took.
  swatches(items: readonly KeyItem[], x: number, y: number, width: number): number {
    let at = 0;
    let row = 0;

    for (const { label, tone } of items) {
      const size = cellWidth(label) + 4;

      if (at > 0 && at + size > width) {
        at = 0;
        row++;
      }

      this.dot(x + at + 0.5, y + row + 0.5, tone, "square");
      this.text(x + at + 2, y + row, label);
      at += size;
    }

    return row + 1;
  }

  // A bold title in the top row and a blank row under it; the row the diagram starts at.
  heading(title: string): number {
    this.text(0, 0, title, "text", { bold: true });

    return title === "" ? 0 : 2;
  }

  // The finished scene, moved to the top left corner of its own cells, or null where it is wider than `ctx` allows or
  // taller than a picture may be.
  finish(alt: string, ctx: Ctx): Scene | null {
    const extents = this.prims.map(extentOf);

    if (extents.length === 0) {
      return null;
    }

    const left = Math.floor(Math.min(...extents.map((e) => e.x0)));
    const top = Math.floor(Math.min(...extents.map((e) => e.y0)));
    const width = Math.ceil(Math.max(...extents.map((e) => e.x1)) - left);
    const height = Math.ceil(Math.max(...extents.map((e) => e.y1)) - top);

    if (width < 1 || width > ctx.columns || height > MAX_ROWS) {
      return null;
    }

    return { width, height, prims: this.prims.map((prim) => moved(prim, -left, -top)), alt };
  }
}

type Extent = { x0: number; y0: number; x1: number; y1: number };

function extentOf(prim: Prim): Extent {
  switch (prim.kind) {
    case "text": {
      const width = cellWidth(prim.text);
      const x0 = prim.anchor === "start" ? prim.x : prim.anchor === "end" ? prim.x - width : prim.x - width / 2;

      return { x0, y0: prim.y, x1: x0 + width, y1: prim.y + 1 };
    }
    case "rect":
      return { x0: prim.x, y0: prim.y, x1: prim.x + prim.w, y1: prim.y + prim.h };
    case "dot":
      return { x0: prim.x - 0.5, y0: prim.y - 0.5, x1: prim.x + 0.5, y1: prim.y + 0.5 };
    default: {
      const xs = prim.points.map((p) => p.x);
      const ys = prim.points.map((p) => p.y);

      return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    }
  }
}

function moved(prim: Prim, dx: number, dy: number): Prim {
  const shift = (p: Pt): Pt => ({ x: p.x + dx, y: p.y + dy });

  switch (prim.kind) {
    case "line":
    case "poly":
      return { ...prim, points: prim.points.map(shift) };
    default:
      return { ...prim, x: prim.x + dx, y: prim.y + dy };
  }
}

// The text wrapped to `width` columns on at most `maxLines` lines.
export const wrapCells = (text: string, width: number, maxLines: number): string[] =>
  wrapWith(text, width, maxLines, cellWidth);

// The widest of some lines, in columns.
export const widest = (lines: readonly string[]): number => Math.max(0, ...lines.map(cellWidth));

// The middle of cell `i`.
export const mid = (i: number): number => Math.floor(i) + 0.5;

const STEPS = [1, 2, 2.5, 5, 10];

// Round numbers from at or below `min` to at or above `max`, about `count` of them.
export function niceTicks(min: number, max: number, count: number): { lo: number; hi: number; ticks: number[] } {
  const span = max - min || Math.abs(max) || 1;
  const rough = span / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = (STEPS.find((candidate) => candidate * power >= rough) ?? 10) * power;
  // A range of one number is widened by a step each way, so there is something to draw it against.
  const lo = Math.floor(min / step + 1e-9) * step - (min === max ? step : 0);
  const hi = Math.ceil(max / step - 1e-9) * step + (min === max ? step : 0);
  const ticks: number[] = [];

  for (let value = lo; value <= hi + step / 2; value += step) {
    ticks.push(Math.round(value / step) * step);
  }

  return { lo, hi, ticks };
}

// A number as short as it can be written: no trailing zeros, at most two decimals.
export const formatNumber = (value: number): string => String(Math.round(value * 100) / 100);

// From the size at which a number is shortened: the unit it is divided by and the letter that stands for it.
const UNITS = [
  [1e9, 1e9, "G"],
  [1e6, 1e6, "M"],
  [1e4, 1e3, "k"],
] as const;

// A number for an axis, with thousands, millions and billions shortened to a letter.
export function compactNumber(value: number): string {
  const [, unit, suffix] = UNITS.find(([limit]) => Math.abs(value) >= limit) ?? [0, 1, ""];

  return `${formatNumber(value / unit)}${suffix}`;
}

// A way through the waypoints of a layout that turns only at right angles, bending halfway between each pair along the
// direction the ranks run, with every point on the middle of a cell.
export function elbow(points: readonly Pt[], isDown: boolean): Pt[] {
  const snapped = points.map((p) => ({ x: mid(p.x), y: mid(p.y) }));
  const path: Pt[] = [];

  snapped.forEach((to, i) => {
    const from = snapped[i - 1];

    if (from !== undefined && from.x !== to.x && from.y !== to.y) {
      path.push(isDown ? { x: from.x, y: mid((from.y + to.y) / 2) } : { x: mid((from.x + to.x) / 2), y: from.y });
      path.push(isDown ? { x: to.x, y: mid((from.y + to.y) / 2) } : { x: mid((from.x + to.x) / 2), y: to.y });
    }

    path.push(to);
  });

  return path.filter((p, i) => i === 0 || p.x !== path[i - 1]!.x || p.y !== path[i - 1]!.y);
}

// A polygon for a slice of an ellipse centred on (`cx`, `cy`), from angle `from` to `to` in radians clockwise from the
// top; with `inner` above zero, the ring slice outside that fraction of the radius.
export function slice(cx: number, cy: number, rx: number, ry: number, from: number, to: number, inner = 0): Pt[] {
  const steps = Math.max(2, Math.ceil(((to - from) / (Math.PI * 2)) * 120));
  const at = (angle: number, scale: number): Pt => ({
    x: cx + Math.sin(angle) * rx * scale,
    y: cy - Math.cos(angle) * ry * scale,
  });
  const arc = Array.from({ length: steps + 1 }, (_, i) => at(from + ((to - from) * i) / steps, 1));

  if (inner > 0) {
    return [...arc, ...arc.map((_, i) => at(to - ((to - from) * i) / steps, inner))];
  }

  return Math.abs(to - from) >= Math.PI * 2 - 1e-9 ? arc : [at(from, 0), ...arc];
}
