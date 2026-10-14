import { Draft, formatNumber, seriesTone, widest } from "./mermaid-scene";
import type { Ctx, Pt, Scene } from "./mermaid-scene";
import { numberOf } from "./mermaid-source";

type Link = { source: string; target: string; value: number };
export type Sankey = { title: string; links: Link[] };

const MAX_LINKS = 60;
const MAX_NODES = 30;
const BAR = 2;
const GAP_ROWS = 1;
const MIN_SPAN = 8;
const MAX_SPAN = 30;
const MIN_HEIGHT = 12;
const MAX_HEIGHT = 24;
const SWEEPS = 4;
const SAMPLES = 24;
const SHADE = 0.45;

// The fields of one line of comma separated values, a field in double quotes keeping its commas and `""` for a quote.
export function csvOf(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let isQuoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;

    if (char === '"' && isQuoted && line[i + 1] === '"') {
      field += '"';
      i++;
    } else if (char === '"') {
      isQuoted = !isQuoted;
    } else if (char === "," && !isQuoted) {
      fields.push(field.trim());
      field = "";
    } else {
      field += char;
    }
  }

  return [...fields, field.trim()];
}

// A `sankey` read well enough to draw. Null for a line that is not `source,target,value` with a positive value, or
// flows that loop back.
export function parseSankey(lines: readonly string[]): Sankey | null {
  if (!/^sankey(-beta)?$/i.test(lines[0] ?? "")) {
    return null;
  }

  const links: Link[] = [];

  for (const line of lines.slice(1)) {
    const [source = "", target = "", amount = "", ...rest] = csvOf(line);
    const value = numberOf(amount);

    if (rest.length > 0 || source === "" || target === "" || value === null || value <= 0) {
      if (links.length === 0 && /^source$/i.test(source)) {
        continue;
      }

      return null;
    }

    links.push({ source, target, value });
  }

  const names = new Set(links.flatMap(({ source, target }) => [source, target]));

  return links.length === 0 || links.length > MAX_LINKS || names.size > MAX_NODES || hasLoop(links)
    ? null
    : { title: "", links };
}

function hasLoop(links: readonly Link[]): boolean {
  const state = new Map<string, "open" | "done">();
  const visit = (name: string): boolean => {
    if (state.get(name) === "open") {
      return true;
    }

    if (state.get(name) === "done") {
      return false;
    }

    state.set(name, "open");

    const isLoop = links.filter(({ source }) => source === name).some(({ target }) => visit(target));

    state.set(name, "done");

    return isLoop;
  };

  return links.some(({ source }) => visit(source));
}

type Node = { name: string; index: number; rank: number; value: number; y: number; h: number };

const smooth = (t: number): number => t * t * (3 - 2 * t);

export function sankeyScene({ links }: Sankey, ctx: Ctx): Scene | null {
  const names = [...new Set(links.flatMap(({ source, target }) => [source, target]))];
  const nodes: Node[] = names.map((name, index) => ({
    name,
    index,
    rank: 0,
    value: Math.max(
      links.filter(({ source }) => source === name).reduce((sum, { value }) => sum + value, 0),
      links.filter(({ target }) => target === name).reduce((sum, { value }) => sum + value, 0),
    ),
    y: 0,
    h: 0,
  }));
  const byName = new Map(nodes.map((node) => [node.name, node]));

  for (let pass = 0; pass < nodes.length; pass++) {
    for (const { source, target } of links) {
      byName.get(target)!.rank = Math.max(byName.get(target)!.rank, byName.get(source)!.rank + 1);
    }
  }

  const last = Math.max(...nodes.map(({ rank }) => rank));

  for (const node of nodes) {
    if (!links.some(({ source }) => source === node.name)) {
      node.rank = last;
    }
  }

  const columns = Array.from({ length: last + 1 }, (_, rank) => nodes.filter((node) => node.rank === rank));
  const height = Math.max(
    MIN_HEIGHT,
    Math.min(MAX_HEIGHT, 2 * Math.max(...columns.map((column) => column.length)) + 8),
  );
  const scale = Math.min(
    ...columns.map(
      (column) => (height - (column.length - 1) * GAP_ROWS) / column.reduce((sum, { value }) => sum + value, 0),
    ),
  );

  nodes.forEach((node) => (node.h = Math.max(0.25, node.value * scale)));

  const place = () =>
    columns.forEach((column) => {
      const total = column.reduce((sum, { h }) => sum + h, 0) + (column.length - 1) * GAP_ROWS;
      let y = (height - total) / 2;

      for (const node of column) {
        node.y = y;
        y += node.h + GAP_ROWS;
      }
    });

  place();

  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    const forward = sweep % 2 === 0;

    for (const column of forward ? columns.slice(1) : columns.slice(0, -1).reverse()) {
      const centre = (node: Node) => {
        const near = links
          .filter((link) => (forward ? link.target : link.source) === node.name)
          .map((link) => byName.get(forward ? link.source : link.target)!);

        return near.length === 0 ? node.y : near.reduce((sum, other) => sum + other.y + other.h / 2, 0) / near.length;
      };
      const wanted = new Map(column.map((node) => [node, centre(node)]));

      column.sort((a, b) => wanted.get(a)! - wanted.get(b)!);
    }

    place();
  }

  const labels = (column: readonly Node[]) => column.map(({ name, value }) => `${name} ${formatNumber(value)}`);
  const left = widest(labels(columns[0]!)) + 1;
  const right = widest(labels(columns[last]!)) + 1;
  const span = Math.min(MAX_SPAN, Math.floor((ctx.columns - left - right - BAR * (last + 1)) / Math.max(1, last)));

  if (span < MIN_SPAN) {
    return null;
  }

  const xOf = (node: Node) => left + node.rank * (BAR + span);
  const out = new Map<Link, number>();
  const into = new Map<Link, number>();

  for (const node of nodes) {
    let offset = 0;

    for (const link of links
      .filter(({ source }) => source === node.name)
      .sort((a, b) => byName.get(a.target)!.y - byName.get(b.target)!.y)) {
      out.set(link, offset);
      offset += link.value * scale;
    }

    offset = 0;

    for (const link of links
      .filter(({ target }) => target === node.name)
      .sort((a, b) => byName.get(a.source)!.y - byName.get(b.source)!.y)) {
      into.set(link, offset);
      offset += link.value * scale;
    }
  }

  const d = new Draft();

  for (const link of links) {
    const from = byName.get(link.source)!;
    const to = byName.get(link.target)!;
    const thickness = link.value * scale;
    const x0 = xOf(from) + BAR;
    const x1 = xOf(to);
    const edge = (shift: number): Pt[] =>
      Array.from({ length: SAMPLES + 1 }, (_, i) => {
        const t = i / SAMPLES;
        const y0 = from.y + out.get(link)! + shift;
        const y1 = to.y + into.get(link)! + shift;

        return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * smooth(t) };
      });

    d.poly([...edge(0), ...edge(thickness).reverse()], { fill: seriesTone(from.index), opacity: SHADE });
  }

  for (const node of nodes) {
    d.rect(xOf(node), node.y, BAR, node.h, { fill: seriesTone(node.index) });
  }

  for (const node of nodes) {
    d.text(
      node.rank === 0 ? xOf(node) - 1 : xOf(node) + BAR + 1,
      Math.floor(node.y + node.h / 2),
      `${node.name} ${formatNumber(node.value)}`,
      "text",
      { anchor: node.rank === 0 ? "end" : "start" },
    );
  }

  return d.finish(
    `Sankey diagram: ${links.map(({ source, target, value }) => `${source} to ${target} ${formatNumber(value)}`).join("; ")}`,
    ctx,
  );
}
