import { Draft, formatNumber, seriesTone, slice, widest } from "./mermaid-scene";
import type { Ctx, Scene } from "./mermaid-scene";
import { numberOf, titleOf, unquote } from "./mermaid-source";

type Slice = { label: string; value: number };
export type Pie = { title: string; slices: Slice[] };

const MAX_SLICES = 24;
const RADIUS = 6;
const MIN_RADIUS = 3;
const GAP = 4;

const HEAD = /^pie(?:\s+showData)?(?:\s+title\s+(.*))?$/i;
const SLICE = /^"([^"]*)"\s*:\s*(\d+(?:\.\d+)?)$/;

// A `pie` read well enough to draw, its slices from the largest down as Mermaid draws them. Null for a value that is
// not a positive number or a line this does not read.
export function parsePie(lines: readonly string[]): Pie | null {
  const head = HEAD.exec(lines[0] ?? "");

  if (head === null) {
    return null;
  }

  let title = unquote(head[1] ?? "");
  const slices: Slice[] = [];

  for (const line of lines.slice(1)) {
    const own = titleOf(line);
    const match = SLICE.exec(line);
    const value = numberOf(match?.[2] ?? "");

    if (own !== null) {
      title = own;
    } else if (match !== null && value !== null) {
      slices.push({ label: unquote(match[1]!), value });
    } else if (!/^(showData|accTitle|accDescr)\b/i.test(line)) {
      return null;
    }
  }

  const drawn = slices.filter(({ value }) => value > 0).sort((a, b) => b.value - a.value);

  return drawn.length === 0 || drawn.length > MAX_SLICES ? null : { title, slices: drawn };
}

const percent = (share: number): string => `${formatNumber(Math.round(share * 1000) / 10)}%`;

export function pieScene({ title, slices }: Pie, { columns, ratio }: Ctx): Scene | null {
  const total = slices.reduce((sum, { value }) => sum + value, 0);
  const items = slices.map(({ label, value }, i) => ({
    label,
    tone: seriesTone(i),
    cells: [formatNumber(value), percent(value / total)],
  }));
  const key =
    widest(items.map(({ label }) => label)) +
    widest(items.map(({ cells }) => cells[0]!)) +
    widest(items.map(({ cells }) => cells[1]!)) +
    8;
  const across = (radius: number) => Math.ceil(radius * ratio) * 2;
  let radius = RADIUS;

  while (radius > MIN_RADIUS && across(radius) > columns) {
    radius--;
  }

  const d = new Draft();
  const top = d.heading(title);
  const rx = across(radius) / 2;
  const isBeside = across(radius) + GAP + key <= columns;
  let start = 0;

  slices.forEach(({ value }, i) => {
    const sweep = (value / total) * Math.PI * 2;

    d.poly(slice(rx, top + radius, rx, radius, start, start + sweep), { fill: seriesTone(i) });
    start += sweep;
  });

  if (isBeside) {
    d.legend(items, across(radius) + GAP, top + Math.max(0, Math.floor((radius * 2 - items.length) / 2)));
  } else {
    d.legend(items, 0, top + radius * 2 + 1);
  }

  return d.finish(
    `Pie chart${title === "" ? "" : ` ${title}`}: ${items.map(({ label, cells }) => `${label} ${cells[0]} (${cells[1]})`).join(", ")}`,
    { columns, ratio },
  );
}
