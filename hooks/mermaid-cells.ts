import { SHADED, SOLID } from "./mermaid-scene";
import type { DotShape, Prim, Pt, Scene } from "./mermaid-scene";
import { TOKENS } from "./palette";
import type { Tone } from "./palette";
import { cellWidth } from "./svg-text";

// A scene drawn as text: rows of runs, each run in one theme colour. Shapes fill in eighths of a cell high, straight
// lines join into box characters, and slanting lines are braille dots, so the same scene reads as a chart in a plain
// terminal.

export type Run = { text: string; color?: string; back?: string; bold?: boolean };
export type Row = Run[];

const SUB = 8;

const UP = 1;
const DOWN = 2;
const LEFT = 4;
const RIGHT = 8;

const LINES = new Map<number, string>([
  [UP, "│"],
  [DOWN, "│"],
  [UP | DOWN, "│"],
  [LEFT, "─"],
  [RIGHT, "─"],
  [LEFT | RIGHT, "─"],
  [DOWN | RIGHT, "┌"],
  [DOWN | LEFT, "┐"],
  [UP | RIGHT, "└"],
  [UP | LEFT, "┘"],
  [UP | DOWN | RIGHT, "├"],
  [UP | DOWN | LEFT, "┤"],
  [DOWN | LEFT | RIGHT, "┬"],
  [UP | LEFT | RIGHT, "┴"],
  [UP | DOWN | LEFT | RIGHT, "┼"],
]);

const ROUND = new Map<number, string>([
  [DOWN | RIGHT, "╭"],
  [DOWN | LEFT, "╮"],
  [UP | RIGHT, "╰"],
  [UP | LEFT, "╯"],
]);

const LOWER = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
const GLYPHS: Record<DotShape, string> = { circle: "●", diamond: "◆", square: "■", cross: "×" };
const BRAILLE = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
];

type Cell = {
  char?: string;
  charTone?: Tone;
  isBold?: boolean;
  isTail?: boolean;
  mask: number;
  isRound: boolean;
  lineTone?: Tone;
  dash?: string;
  dashTone?: Tone;
  dots: number;
  dotTone?: Tone;
  shade?: Tone;
  fill: (Tone | null)[];
};

type Look = { text: string; fg?: Tone; bg?: Tone; isBold?: boolean };

const mode = (tones: readonly (Tone | null)[]): Tone | null => {
  const counts = new Map<Tone | null, number>();

  for (const tone of tones) {
    counts.set(tone, (counts.get(tone) ?? 0) + 1);
  }

  return [...counts.entries()].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
};

// A cell's eighths as a character and its colours: the split between two tones that misplaces the fewest eighths.
function blockOf(fill: readonly (Tone | null)[]): Look {
  let best = { k: 0, miss: Infinity };

  for (let k = 1; k < SUB; k++) {
    const above = mode(fill.slice(0, k));
    const below = mode(fill.slice(k));
    const miss = fill.filter((tone, i) => tone !== (i < k ? above : below)).length;

    if (miss < best.miss) {
      best = { k, miss };
    }
  }

  const above = mode(fill.slice(0, best.k));
  const below = mode(fill.slice(best.k));
  const rows = SUB - best.k;

  if (above === below) {
    return above === null ? { text: " " } : { text: " ", bg: above };
  }

  if (below !== null) {
    return above === null ? { text: LOWER[rows]!, fg: below } : { text: LOWER[rows]!, fg: below, bg: above };
  }

  if (best.k >= 6) {
    return { text: " ", bg: above! };
  }

  return best.k >= 2 ? { text: "▀", fg: above! } : { text: " " };
}

const isInside = (points: readonly Pt[], x: number, y: number): boolean => {
  let inside = false;

  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;

    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }

  return inside;
};

class Canvas {
  private readonly cells = new Map<number, Cell>();

  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  at(x: number, y: number): Cell | undefined {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return undefined;
    }

    const key = y * this.width + x;
    let cell = this.cells.get(key);

    if (cell === undefined) {
      cell = { mask: 0, isRound: false, dots: 0, fill: Array<Tone | null>(SUB).fill(null) };
      this.cells.set(key, cell);
    }

    return cell;
  }

  peek(x: number, y: number): Cell | undefined {
    return this.cells.get(y * this.width + x);
  }

  // Text clears whatever was under it, so a label stays readable over a fill or a line.
  text(x: number, y: number, text: string, tone: Tone, isBold: boolean, anchor: "start" | "middle" | "end") {
    const width = cellWidth(text);
    let at = Math.round(anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2);

    for (const char of text) {
      const size = cellWidth(char);

      for (let i = 0; i < size; i++) {
        const cell = this.at(at + i, y);

        if (cell !== undefined) {
          Object.assign(cell, {
            char: i === 0 ? char : "",
            charTone: tone,
            isBold,
            isTail: i > 0,
            mask: 0,
            dash: undefined,
            dots: 0,
            fill: Array<Tone | null>(SUB).fill(null),
          });
        }
      }

      at += size;
    }
  }

  glyph(x: number, y: number, char: string, tone: Tone) {
    const cell = this.at(Math.floor(x), Math.floor(y));

    if (cell !== undefined) {
      Object.assign(cell, { char, charTone: tone, mask: 0, dash: undefined, dots: 0 });
    }
  }

  // Fills the eighths of a cell that `covers` says are inside; a cell filled all but an edge clears what was drawn in it.
  fill(x: number, y: number, covers: (k: number) => boolean, tone: Tone) {
    const cell = this.at(x, y);

    if (cell === undefined) {
      return;
    }

    for (let k = 0; k < SUB; k++) {
      if (covers(k)) {
        cell.fill[k] = tone;
      }
    }

    if (cell.fill.filter((value) => value === tone).length >= SUB - 2) {
      Object.assign(cell, { char: undefined, mask: 0, dash: undefined, dots: 0, shade: undefined });
    }
  }

  // Shades the cells whose middle is inside, with a light block in the colour.
  shade(isInside: (x: number, y: number) => boolean, x0: number, y0: number, x1: number, y1: number, tone: Tone) {
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        const cell = isInside(x + 0.5, y + 0.5) ? this.at(x, y) : undefined;

        if (cell !== undefined) {
          cell.shade = tone;
        }
      }
    }
  }

  fillRect(x0: number, y0: number, x1: number, y1: number, tone: Tone) {
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
      for (let x = Math.ceil(x0 - 0.5); x < Math.ceil(x1 - 0.5); x++) {
        this.fill(x, y, (k) => y + (k + 0.5) / SUB >= y0 && y + (k + 0.5) / SUB < y1, tone);
      }
    }
  }

  fillPoly(points: readonly Pt[], tone: Tone) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);

    for (let y = Math.floor(Math.min(...ys)); y < Math.ceil(Math.max(...ys)); y++) {
      for (let x = Math.floor(Math.min(...xs)); x < Math.ceil(Math.max(...xs)); x++) {
        this.fill(x, y, (k) => isInside(points, x + 0.5, y + (k + 0.5) / SUB), tone);
      }
    }
  }

  private join(x: number, y: number, bits: number, tone: Tone) {
    const cell = this.at(x, y);

    if (cell !== undefined && cell.char === undefined) {
      cell.mask |= bits;
      cell.lineTone = tone;
    }
  }

  private run(from: number, to: number): [number, number] {
    const lo = Math.floor(Math.min(from, to));
    const hi = Math.ceil(Math.max(from, to)) - 1;

    return [lo, Math.max(lo, hi)];
  }

  across(y: number, from: number, to: number, tone: Tone, dash: boolean) {
    const [lo, hi] = this.run(from, to);

    for (let x = lo; x <= hi; x++) {
      if (dash) {
        this.dashed(x, y, "╌", tone);
      } else {
        this.join(x, y, (x > lo ? LEFT : 0) | (x < hi ? RIGHT : 0), tone);
      }
    }
  }

  down(x: number, from: number, to: number, tone: Tone, dash: boolean) {
    const [lo, hi] = this.run(from, to);

    for (let y = lo; y <= hi; y++) {
      if (dash) {
        this.dashed(x, y, "╎", tone);
      } else {
        this.join(x, y, (y > lo ? UP : 0) | (y < hi ? DOWN : 0), tone);
      }
    }
  }

  private dashed(x: number, y: number, char: string, tone: Tone) {
    const cell = this.at(x, y);

    if (cell !== undefined && cell.mask === 0 && cell.char === undefined) {
      cell.dash = char;
      cell.dashTone = tone;
    }
  }

  // A slanting line as braille dots, two across and four down in each cell.
  slant(a: Pt, b: Pt, tone: Tone) {
    let x = Math.floor(a.x * 2);
    let y = Math.floor(a.y * 4);
    const endX = Math.floor(b.x * 2);
    const endY = Math.floor(b.y * 4);
    const dx = Math.abs(endX - x);
    const dy = -Math.abs(endY - y);
    const stepX = x < endX ? 1 : -1;
    const stepY = y < endY ? 1 : -1;
    let error = dx + dy;

    for (;;) {
      const cell = this.at(Math.floor(x / 2), Math.floor(y / 4));

      if (cell !== undefined && cell.char === undefined) {
        cell.dots |= BRAILLE[x % 2 === 0 ? 0 : 1]![((y % 4) + 4) % 4]!;
        cell.dotTone = tone;
      }

      if (x === endX && y === endY) {
        return;
      }

      const twice = 2 * error;

      if (twice >= dy) {
        error += dy;
        x += stepX;
      }

      if (twice <= dx) {
        error += dx;
        y += stepY;
      }
    }
  }

  path(points: readonly Pt[], tone: Tone, dash: boolean) {
    points.slice(1).forEach((to, i) => {
      const from = points[i]!;

      if (from.y === to.y) {
        this.across(Math.floor(from.y), from.x, to.x, tone, dash);
      } else if (from.x === to.x) {
        this.down(Math.floor(from.x), from.y, to.y, tone, dash);
      } else {
        this.slant(from, to, tone);
      }
    });
  }

  private look(cell: Cell): Look {
    const [first] = cell.fill;
    const back = cell.fill.every((tone) => tone === first) ? (first ?? undefined) : undefined;

    if (cell.char !== undefined) {
      return { text: cell.char, fg: cell.charTone, bg: back, isBold: cell.isBold };
    }

    if (cell.mask !== 0) {
      const text = (cell.isRound ? ROUND.get(cell.mask) : undefined) ?? LINES.get(cell.mask) ?? "─";

      return { text, fg: cell.lineTone, bg: back };
    }

    if (cell.dash !== undefined) {
      return { text: cell.dash, fg: cell.dashTone, bg: back };
    }

    if (cell.dots !== 0) {
      return { text: String.fromCodePoint(0x2800 + cell.dots), fg: cell.dotTone, bg: back };
    }

    if (cell.shade !== undefined && cell.fill.every((tone) => tone === null)) {
      return { text: "░", fg: cell.shade };
    }

    return blockOf(cell.fill);
  }

  rows(): Row[] {
    return Array.from({ length: this.height }, (_, y) => {
      const runs: Run[] = [];

      for (let x = 0; x < this.width; x++) {
        const cell = this.peek(x, y);

        if (cell?.isTail === true) {
          continue;
        }

        const { text, fg, bg, isBold } = cell === undefined ? ({ text: " " } as Look) : this.look(cell);
        const color = fg === undefined ? undefined : TOKENS[fg];
        const back = bg === undefined ? undefined : TOKENS[bg];
        const last = runs.at(-1);

        if (last !== undefined && last.color === color && last.back === back && last.bold === isBold) {
          last.text += text;
        } else {
          runs.push({ text, color, back, bold: isBold });
        }
      }

      const end = runs.at(-1);

      if (end !== undefined && end.back === undefined && end.text.trim() === "") {
        runs.pop();
      }

      return runs.map(({ text, color, back, bold }) => ({
        text,
        ...(color === undefined ? {} : { color }),
        ...(back === undefined ? {} : { back }),
        ...(bold === true ? { bold } : {}),
      }));
    });
  }
}

function paint(canvas: Canvas, prim: Prim) {
  switch (prim.kind) {
    case "text":
      canvas.text(prim.x, Math.floor(prim.y), prim.text, prim.tone, prim.bold, prim.anchor);
      break;
    case "dot":
      canvas.glyph(prim.x, prim.y, GLYPHS[prim.shape], prim.tone);
      break;
    case "line": {
      canvas.path(prim.points, prim.tone, prim.dash);

      const [from, to] = prim.points.slice(-2);

      if (prim.arrow && from !== undefined && to !== undefined) {
        const isAcross = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
        const head = isAcross ? (to.x >= from.x ? "▸" : "◂") : to.y >= from.y ? "▾" : "▴";

        canvas.glyph(to.x, to.y, head, prim.tone);
      }

      break;
    }
    case "poly": {
      if (prim.fill !== undefined && prim.opacity >= SOLID) {
        canvas.fillPoly(prim.points, prim.fill);
      } else if (prim.fill !== undefined && prim.opacity >= SHADED) {
        const xs = prim.points.map((p) => p.x);
        const ys = prim.points.map((p) => p.y);

        canvas.shade(
          (x, y) => isInside(prim.points, x, y),
          Math.min(...xs),
          Math.min(...ys),
          Math.max(...xs),
          Math.max(...ys),
          prim.fill,
        );
      }

      if (prim.stroke !== undefined) {
        canvas.path([...prim.points, prim.points[0]!], prim.stroke, false);
      }

      break;
    }
    case "rect": {
      if (prim.fill !== undefined && prim.opacity >= SOLID) {
        canvas.fillRect(prim.x, prim.y, prim.x + prim.w, prim.y + prim.h, prim.fill);
      } else if (prim.fill !== undefined && prim.opacity >= SHADED) {
        const inside = (x: number, y: number) =>
          x >= prim.x && x < prim.x + prim.w && y >= prim.y && y < prim.y + prim.h;

        canvas.shade(inside, prim.x, prim.y, prim.x + prim.w, prim.y + prim.h, prim.fill);
      }

      if (prim.stroke !== undefined) {
        const x0 = Math.floor(prim.x);
        const y0 = Math.floor(prim.y);
        const x1 = Math.ceil(prim.x + prim.w) - 1;
        const y1 = Math.ceil(prim.y + prim.h) - 1;

        canvas.across(y0, x0, x1 + 1, prim.stroke, false);
        canvas.across(y1, x0, x1 + 1, prim.stroke, false);
        canvas.down(x0, y0, y1 + 1, prim.stroke, false);
        canvas.down(x1, y0, y1 + 1, prim.stroke, false);

        if (prim.round) {
          for (const [x, y] of [
            [x0, y0],
            [x1, y0],
            [x0, y1],
            [x1, y1],
          ] as const) {
            const cell = canvas.at(x, y);

            if (cell !== undefined) {
              cell.isRound = true;
            }
          }
        }
      }

      break;
    }
  }
}

// The scene as text, one row of runs for each row of cells.
export function cellRows(scene: Scene): Row[] {
  const canvas = new Canvas(scene.width, scene.height);

  for (const prim of scene.prims) {
    if (prim.only !== "picture") {
      paint(canvas, prim);
    }
  }

  return canvas.rows();
}
