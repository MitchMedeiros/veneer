import { Draft, formatNumber, seriesTone } from "./mermaid-scene";
import type { Ctx, Scene } from "./mermaid-scene";
import { titleOf, unquote } from "./mermaid-source";
import type { Tone } from "./palette";
import { cellWidth, clipCells } from "./svg-text";

type Item = { name: string; value: number; children: Item[] };
export type Treemap = { title: string; items: Item[] };

const MAX_LEAVES = 80;
const MAX_WIDTH = 90;
const MIN_WIDTH = 24;
const TINT = 0.14;

const NODE = /^"([^"]*)"\s*(?::\s*(-?[\d,]*\.?\d+))?\s*(?::::\s*\w+)?$/;

// A `treemap` read well enough to draw: sections with no value, whose size is that of what they hold, and leaves with
// one, nested by indentation. Null for a line this does not read.
export function parseTreemap(lines: readonly string[], indents: readonly number[]): Treemap | null {
  if (!/^treemap(-beta)?$/i.test(lines[0] ?? "")) {
    return null;
  }

  const treemap: Treemap = { title: "", items: [] };
  const stack: { indent: number; item: Item; hasValue: boolean }[] = [];
  let leaves = 0;

  for (const [i, line] of lines.slice(1).entries()) {
    const title = titleOf(line);
    const node = NODE.exec(line);
    const indent = indents[i + 1] ?? 0;

    if (title !== null) {
      treemap.title = title;
      continue;
    }

    if (node === null) {
      if (/^(accTitle|accDescr|classDef)\b/i.test(line)) {
        continue;
      }

      return null;
    }

    const hasValue = node[2] !== undefined;
    const item: Item = {
      name: unquote(node[1]!),
      value: hasValue ? Number(node[2]!.replace(/,/g, "")) : 0,
      children: [],
    };

    while (stack.length > 0 && stack.at(-1)!.indent >= indent) {
      stack.pop();
    }

    (stack.length === 0 ? treemap.items : stack.at(-1)!.item.children).push(item);
    stack.push({ indent, item, hasValue });
    leaves += hasValue ? 1 : 0;
  }

  const total = (item: Item): number =>
    item.children.length === 0
      ? item.value
      : (item.value = item.children.reduce((sum, child) => sum + total(child), 0));
  const sum = treemap.items.reduce((acc, item) => acc + total(item), 0);

  return sum <= 0 || leaves > MAX_LEAVES ? null : treemap;
}

type Box = { x: number; y: number; w: number; h: number };

// The boxes that fill `box` with areas in proportion to `values`, each as close to square as can be had, in the order of
// the values.
function squarify(values: readonly number[], box: Box): Box[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  const areas = values.map((value) => (value / total) * box.w * box.h);
  const order = values.map((_, i) => i).sort((a, b) => values[b]! - values[a]!);
  const boxes: Box[] = Array.from({ length: values.length }, () => box);
  const rest = { ...box };
  let row: number[] = [];

  const worst = (members: readonly number[], side: number): number => {
    const area = members.reduce((sum, i) => sum + areas[i]!, 0);
    const sizes = members.map((i) => areas[i]!);

    return Math.max(
      (side * side * Math.max(...sizes)) / (area * area),
      (area * area) / (side * side * Math.min(...sizes)),
    );
  };

  const lay = () => {
    const area = row.reduce((sum, i) => sum + areas[i]!, 0);

    if (rest.w >= rest.h) {
      const width = area / rest.h;
      let y = rest.y;

      for (const i of row) {
        boxes[i] = { x: rest.x, y, w: width, h: areas[i]! / width };
        y += areas[i]! / width;
      }

      rest.x += width;
      rest.w -= width;
    } else {
      const height = area / rest.w;
      let x = rest.x;

      for (const i of row) {
        boxes[i] = { x, y: rest.y, w: areas[i]! / height, h: height };
        x += areas[i]! / height;
      }

      rest.y += height;
      rest.h -= height;
    }

    row = [];
  };

  for (const i of order) {
    const side = Math.min(rest.w, rest.h);

    if (row.length > 0 && worst([...row, i], side) > worst(row, side)) {
      lay();
    }

    row.push(i);
  }

  lay();

  return boxes;
}

type Region = { x0: number; x1: number; y0: number; y1: number };

export function treemapScene({ title, items }: Treemap, ctx: Ctx): Scene | null {
  const width = Math.min(MAX_WIDTH, ctx.columns);

  if (width < MIN_WIDTH) {
    return null;
  }

  const height = Math.max(9, Math.round((width * 0.5) / ctx.ratio));
  const d = new Draft();
  const top = d.heading(title);

  // Tiles share their border lines: a tile covers the cells from one line to the next, and the next tile starts on the
  // line this one ends on.
  const fill = (list: readonly Item[], region: Region, tone: (i: number) => Tone) => {
    const kept = list.filter(({ value }) => value > 0);
    const physical: Box = { x: 0, y: 0, w: region.x1 - region.x0, h: (region.y1 - region.y0) * ctx.ratio };

    squarify(
      kept.map(({ value }) => value),
      physical,
    ).forEach((box, i) => {
      const item = kept[i]!;
      const tile: Region = {
        x0: Math.round(region.x0 + box.x),
        x1: Math.round(region.x0 + box.x + box.w),
        y0: Math.round(region.y0 + box.y / ctx.ratio),
        y1: Math.round(region.y0 + (box.y + box.h) / ctx.ratio),
      };
      const color = tone(i);
      const across = tile.x1 - tile.x0 + 1;
      const down = tile.y1 - tile.y0 + 1;
      const isSection = item.children.length > 0 && across >= 6 && down >= 5;

      d.rect(
        tile.x0,
        tile.y0,
        across,
        down,
        isSection ? { stroke: color } : { stroke: color, fill: color, opacity: TINT },
      );

      if (across >= 4 && down >= 3) {
        const label = `${item.name}`;
        const value = formatNumber(item.value);
        const room = across - 2;
        const named = cellWidth(label) + 1 + cellWidth(value) <= room;

        d.text(tile.x0 + 1, tile.y0 + 1, clipCells(named ? `${label} ${value}` : label, room), "text", {
          bold: isSection,
        });

        if (!isSection && !named && down >= 4) {
          d.text(tile.x0 + 1, tile.y0 + 2, clipCells(value, room), "inactive");
        }
      }

      if (isSection) {
        // A single section on its own is a frame, so what it holds takes the colours.
        fill(
          item.children,
          { x0: tile.x0, x1: tile.x1, y0: tile.y0 + 2, y1: tile.y1 },
          kept.length === 1 ? seriesTone : () => color,
        );
      }
    });
  };

  fill(items, { x0: 0, x1: width - 1, y0: top, y1: top + height - 1 }, seriesTone);

  return d.finish(
    `Treemap${title === "" ? "" : ` ${title}`}: ${items.map((item) => `${item.name} ${formatNumber(item.value)}`).join(", ")}`,
    ctx,
  );
}
