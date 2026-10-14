import { Draft, formatNumber, seriesTone, widest } from "./mermaid-scene";
import type { Ctx, Pt, Scene } from "./mermaid-scene";
import { numberOf, titleOf, unquote } from "./mermaid-source";
import { clipCells } from "./svg-text";

type Axis = { id: string; label: string };
type Curve = { id: string; label: string; values: number[] };

export type Radar = {
  title: string;
  axes: Axis[];
  curves: Curve[];
  min: number;
  max: number | undefined;
  ticks: number;
  isPolygon: boolean;
  hasLegend: boolean;
};

const MAX_AXES = 12;
const MAX_CURVES = 8;
const MAX_LABEL = 16;
const MAX_ROWS = 9;
const MIN_ROWS = 4;
const RING_STEPS = 72;

// The items of a list whose items hold lists of their own, split at the commas outside every bracket and quote.
function itemsOf(text: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let isQuoted = false;
  let item = "";

  for (const char of text) {
    isQuoted = char === '"' ? !isQuoted : isQuoted;
    depth += isQuoted ? 0 : "[{".includes(char) ? 1 : "]}".includes(char) ? -1 : 0;

    if (char === "," && depth === 0 && !isQuoted) {
      items.push(item.trim());
      item = "";
    } else {
      item += char;
    }
  }

  return [...items, item.trim()].filter((entry) => entry !== "");
}

const ENTRY = /^([\w-]+)\s*(?:\[\s*("[^"]*"|[^\]]*)\s*\])?\s*(?:\{(.*)\})?$/s;

// A `radar-beta` read well enough to draw. Null for a curve with a value missing or not a number, or a line this does
// not read.
export function parseRadar(lines: readonly string[]): Radar | null {
  if (!/^radar(-beta)?$/i.test(lines[0] ?? "")) {
    return null;
  }

  const radar: Radar = {
    title: "",
    axes: [],
    curves: [],
    min: 0,
    max: undefined,
    ticks: 5,
    isPolygon: false,
    hasLegend: true,
  };

  for (const line of lines.slice(1)) {
    const title = titleOf(line);
    const [, word = "", rest = ""] = /^(axis|curve|max|min|ticks|graticule|showLegend)\s+(.*)$/i.exec(line) ?? [];
    const setting = word.toLowerCase();

    if (title !== null) {
      radar.title = title;
    } else if (setting === "axis") {
      for (const item of itemsOf(rest)) {
        const entry = ENTRY.exec(item);

        if (entry === null) {
          return null;
        }

        radar.axes.push({ id: entry[1]!, label: unquote(entry[2] ?? entry[1]!) });
      }
    } else if (setting === "curve") {
      for (const item of itemsOf(rest)) {
        const entry = ENTRY.exec(item);

        if (entry === null || entry[3] === undefined) {
          return null;
        }

        const values = readValues(entry[3], radar.axes);

        if (values === null) {
          return null;
        }

        radar.curves.push({ id: entry[1]!, label: unquote(entry[2] ?? entry[1]!), values });
      }
    } else if (setting === "max" || setting === "min" || setting === "ticks") {
      const value = numberOf(rest);

      if (value === null) {
        return null;
      }

      if (setting === "ticks") {
        radar.ticks = Math.max(1, Math.min(10, Math.round(value)));
      } else {
        radar[setting] = value;
      }
    } else if (setting === "graticule") {
      radar.isPolygon = rest.trim().toLowerCase() === "polygon";
    } else if (setting === "showlegend") {
      radar.hasLegend = rest.trim().toLowerCase() !== "false";
    } else if (!/^(accTitle|accDescr)\b/i.test(line)) {
      return null;
    }
  }

  const { axes, curves } = radar;

  return axes.length < 3 || axes.length > MAX_AXES || curves.length === 0 || curves.length > MAX_CURVES ? null : radar;
}

// A curve's values in the order of the axes: a plain list, or `axis: value` pairs in any order.
function readValues(text: string, axes: readonly Axis[]): number[] | null {
  const parts = text.split(",").map((part) => part.trim());
  const pairs = parts.map((part) => /^([\w-]+)\s*:\s*(.+)$/.exec(part));

  if (pairs.every((pair) => pair !== null)) {
    const byAxis = new Map(pairs.map((pair) => [pair![1]!, numberOf(pair![2]!)]));
    const values = axes.map(({ id }) => byAxis.get(id) ?? null);

    return values.some((value) => value === null) ? null : (values as number[]);
  }

  const values = parts.map(numberOf);

  return values.length !== axes.length || values.some((value) => value === null) ? null : (values as number[]);
}

export function radarScene(radar: Radar, ctx: Ctx): Scene | null {
  const { axes, curves, min, ticks } = radar;
  const max = radar.max ?? Math.max(...curves.flatMap(({ values }) => values));
  const labels = axes.map(({ label }) => clipCells(label, MAX_LABEL));
  const room = widest(labels) + 2;
  let radius = MAX_ROWS;

  while (radius > MIN_ROWS && 2 * (Math.ceil(radius * ctx.ratio) + room) > ctx.columns) {
    radius--;
  }

  const rx = Math.ceil(radius * ctx.ratio);

  if (2 * (rx + room) > ctx.columns || max <= min) {
    return null;
  }

  const d = new Draft();
  const top = d.heading(radar.title);
  const cx = room + rx;
  const cy = top + radius + 2;
  const angle = (i: number) => (Math.PI * 2 * i) / axes.length;
  const around = (turn: number, share: number): Pt => ({
    x: cx + Math.sin(turn * Math.PI * 2) * rx * share,
    y: cy - Math.cos(turn * Math.PI * 2) * radius * share,
  });
  const at = (i: number, share: number): Pt => around(i / axes.length, share);
  const ring = (share: number): Pt[] => {
    const count = radar.isPolygon ? axes.length : RING_STEPS;

    return Array.from({ length: count }, (_, i) => around(i / count, share));
  };

  // Dotted rings crowd the dotted curves, so text keeps the outer ring and the one halfway to it.
  const isShown = (step: number) => step === ticks || step === Math.round(ticks / 2);

  for (let step = 1; step <= ticks; step++) {
    d.poly(ring(step / ticks), { stroke: "subtle", only: isShown(step) ? undefined : "picture" });
  }

  // The spoke that points straight up would be a box line in text, so it starts a hair off centre to be dotted like the
  // others.
  axes.forEach((_, i) => d.line([{ x: cx + 0.01, y: cy }, at(i, 1)], "subtle"));

  curves.forEach(({ values }, c) => {
    const tone = seriesTone(c);
    const points = values.map((value, i) => at(i, Math.min(1, Math.max(0, (value - min) / (max - min)))));

    d.poly(points, { stroke: tone, fill: tone, opacity: 0.25 });
    points.forEach((point) => d.dot(point.x, point.y, tone, "circle", "text"));
  });

  axes.forEach((_, i) => {
    const sin = Math.sin(angle(i));
    const isEnd = Math.abs(sin) < 0.3;
    const spot = at(i, 1);
    const side = isEnd ? "middle" : sin > 0 ? "start" : "end";
    const row = Math.floor(spot.y) - (isEnd ? Math.sign(Math.cos(angle(i))) : 0);

    d.text(spot.x + (side === "start" ? 2 : side === "end" ? -2 : 0), row, labels[i]!, "text", { anchor: side });
  });

  let bottom = cy + radius + 2;

  if (radar.hasLegend) {
    bottom += d.swatches(
      curves.map(({ label }, c) => ({ label, tone: seriesTone(c) })),
      0,
      bottom,
      ctx.columns,
    );
  }

  d.text(0, bottom, `scale ${formatNumber(min)} to ${formatNumber(max)}`, "inactive");

  return d.finish(
    `Radar chart${radar.title === "" ? "" : ` ${radar.title}`}: ${curves
      .map(
        ({ label, values }) =>
          `${label} ${axes.map(({ label: axis }, i) => `${axis} ${formatNumber(values[i]!)}`).join(", ")}`,
      )
      .join("; ")}`,
    ctx,
  );
}
