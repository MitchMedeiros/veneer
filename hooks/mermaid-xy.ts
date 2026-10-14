import { compactNumber, Draft, formatNumber, mid, niceTicks, seriesTone, widest } from "./mermaid-scene";
import type { Ctx, Scene } from "./mermaid-scene";
import { listOf, numberOf, titleOf, unquote } from "./mermaid-source";
import { clipCells } from "./svg-text";

type Series = { kind: "bar" | "line"; name: string; values: number[] };

export type Xy = {
  title: string;
  isHorizontal: boolean;
  xTitle: string;
  yTitle: string;
  categories: string[];
  xRange: [number, number] | undefined;
  yRange: [number, number] | undefined;
  series: Series[];
};

type Axis = { title: string; items?: string[]; range?: [number, number] };

const MAX_POINTS = 60;
const PLOT_ROWS = 14;
const MAX_SLOT = 14;
const TICKS = 5;
const MAX_LABEL = 18;
const MAX_VALUE_COLUMNS = 64;

const HEAD = /^xychart(?:-beta)?(\s+horizontal)?$/i;
const AXIS = /^([xy])-axis\b\s*(.*)$/i;
const SERIES = /^(bar|line)\s*(?:"([^"]*)"\s*)?\[(.*)\]$/i;
const RANGE = /^(.*?)\s*([-+]?\d*\.?\d+)\s*-->\s*([-+]?\d*\.?\d+)$/;

function axisOf(text: string): Axis | null {
  const list = /^(.*?)\s*\[(.*)\]$/s.exec(text);

  if (list !== null) {
    return { title: unquote(list[1]!), items: listOf(list[2]!) };
  }

  const range = RANGE.exec(text);
  const low = numberOf(range?.[2] ?? "");
  const high = numberOf(range?.[3] ?? "");

  if (range !== null && low !== null && high !== null) {
    return { title: unquote(range[1]!), range: [low, high] };
  }

  return /-->|\[|\]/.test(text) ? null : { title: unquote(text) };
}

// An `xychart` read well enough to draw. Null for an axis or series this does not read.
export function parseXy(lines: readonly string[]): Xy | null {
  const head = HEAD.exec(lines[0] ?? "");

  if (head === null) {
    return null;
  }

  const xy: Xy = {
    title: "",
    isHorizontal: head[1] !== undefined,
    xTitle: "",
    yTitle: "",
    categories: [],
    xRange: undefined,
    yRange: undefined,
    series: [],
  };

  for (const line of lines.slice(1)) {
    const title = titleOf(line);
    const axis = AXIS.exec(line);
    const series = SERIES.exec(line);

    if (title !== null) {
      xy.title = title;
    } else if (axis !== null) {
      const read = axisOf(axis[2]!);

      if (read === null) {
        return null;
      }

      if (axis[1]!.toLowerCase() === "x") {
        xy.xTitle = read.title;
        xy.categories = read.items ?? [];
        xy.xRange = read.range;
      } else if (read.items === undefined) {
        xy.yTitle = read.title;
        xy.yRange = read.range;
      } else {
        return null;
      }
    } else if (series !== null) {
      const values = listOf(series[3]!).map(numberOf);

      if (values.some((value) => value === null)) {
        return null;
      }

      xy.series.push({
        kind: series[1]!.toLowerCase() as Series["kind"],
        name: series[2] ?? "",
        values: values as number[],
      });
    } else if (!/^(accTitle|accDescr)\b/i.test(line)) {
      return null;
    }
  }

  const points = Math.max(0, ...xy.series.map(({ values }) => values.length));

  return points === 0 || points > MAX_POINTS ? null : xy;
}

// The labels along the category axis: those named, or the numbers of a range spread evenly, or counting from one.
function labelsOf(xy: Xy, count: number): string[] {
  if (xy.categories.length > 0) {
    return Array.from({ length: count }, (_, i) => xy.categories[i] ?? "");
  }

  const [from, to] = xy.xRange ?? [1, count];

  return Array.from({ length: count }, (_, i) =>
    formatNumber(count === 1 ? from : from + ((to - from) * i) / (count - 1)),
  );
}

// The span the value axis covers and where its ticks fall: the range given, or one that holds the data and zero for
// bars.
function spanOf(xy: Xy): { lo: number; hi: number; ticks: number[] } {
  const values = xy.series.flatMap(({ values: list }) => list);
  const hasBars = xy.series.some(({ kind }) => kind === "bar");
  const low = xy.yRange?.[0] ?? Math.min(...values, hasBars ? 0 : Infinity);
  const high = xy.yRange?.[1] ?? Math.max(...values, hasBars ? 0 : -Infinity);
  const nice = niceTicks(Math.min(low, high), Math.max(low, high), TICKS);

  if (xy.yRange === undefined) {
    return nice;
  }

  const [lo, hi] = [Math.min(...xy.yRange), Math.max(...xy.yRange)];

  return { lo, hi, ticks: nice.ticks.filter((tick) => tick >= lo && tick <= hi) };
}

const nameOf = ({ kind, name }: Series, i: number, all: readonly Series[]): string => {
  const same = all.filter((other) => other.kind === kind);

  return name !== "" ? name : same.length === 1 ? kind : `${kind} ${same.indexOf(all[i]!) + 1}`;
};

export function xyScene(xy: Xy, ctx: Ctx): Scene | null {
  const count = Math.max(...xy.series.map(({ values }) => values.length));
  const labels = labelsOf(xy, count);
  const { lo, hi, ticks } = spanOf(xy);
  const bars = xy.series.filter(({ kind }) => kind === "bar");
  const tickText = ticks.map(compactNumber);
  const d = new Draft();
  const top = d.heading(xy.title);
  const share = (v: number) => (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo || 1);
  const legend = xy.series.flatMap(({ name }, i) => (name === "" ? [] : [{ label: name, tone: seriesTone(i) }]));
  let bottom: number;

  if (xy.isHorizontal) {
    const names = labels.map((label) => clipCells(label, MAX_LABEL));
    const left = widest(names);
    const axisX = left + 1;
    const x0 = axisX + 1;
    const width = Math.min(MAX_VALUE_COLUMNS, ctx.columns - x0 - 4);
    const slot = Math.max(2, bars.length + 1);
    const base = top + (xy.yTitle === "" ? 0 : 1);
    const height = count * slot;
    const at = (v: number) => x0 + share(v) * width;
    const zero = at(Math.max(lo, Math.min(0, hi)));

    if (width < 8) {
      return null;
    }

    if (xy.yTitle !== "") {
      d.text(x0, top, xy.yTitle, "inactive");
    }

    ticks.forEach((tick, i) => {
      const x = Math.min(x0 + width - 1, Math.floor(at(tick)));

      d.line(
        [
          { x: mid(x), y: base },
          { x: mid(x), y: base + height },
        ],
        "subtle",
        { dash: true },
      );
      d.text(mid(x), base + height + 1, tickText[i]!, "inactive", { anchor: "middle" });
    });
    d.line(
      [
        { x: mid(axisX), y: base },
        { x: mid(axisX), y: base + height + 0.5 },
      ],
      "inactive",
    );
    d.line(
      [
        { x: mid(axisX), y: base + height + 0.5 },
        { x: x0 + width, y: base + height + 0.5 },
      ],
      "inactive",
    );
    names.forEach((name, i) =>
      d.text(left, base + i * slot + Math.floor((slot - 1) / 2), name, "text", { anchor: "end" }),
    );

    xy.series.forEach((series, s) => {
      const tone = seriesTone(s);
      const barIndex = bars.indexOf(series);

      if (series.kind === "bar") {
        series.values.forEach((v, i) => {
          const from = Math.min(zero, at(v));
          const row = base + i * slot + barIndex;

          d.rect(from, row, Math.max(Math.abs(at(v) - zero), 0.5), 1, { fill: tone });
          d.text(Math.max(zero, at(v)) + 1, row, compactNumber(v), "inactive");
        });
      } else {
        const points = series.values.map((v, i) => ({ x: mid(Math.floor(at(v))), y: base + i * slot + slot / 2 }));

        d.line(points, tone);
        points.forEach(({ x, y }) => d.dot(x, y, tone));
      }
    });
    bottom = base + height + 2;
    d.text(x0 + width / 2, bottom, xy.xTitle, "inactive", { anchor: "middle" });
    bottom += xy.xTitle === "" ? 0 : 1;
  } else {
    const left = widest(tickText);
    const axisX = left + 1;
    const x0 = axisX + 1;
    const slot = Math.min(MAX_SLOT, Math.floor((ctx.columns - x0) / count));
    const width = slot * count;
    const base = top + (xy.yTitle === "" ? 1 : 2);
    const intervals = ticks.length - 1;
    // Rows that put every tick on a row of its own, so a bar the height of a tick ends on its gridline.
    const isEven = intervals > 0 && Math.abs(ticks[0]! - lo) + Math.abs(ticks.at(-1)! - hi) < (hi - lo) * 1e-6;
    const plot = isEven ? Math.max(intervals, Math.round(PLOT_ROWS / intervals) * intervals) : PLOT_ROWS;
    const y = (v: number) => base + 0.5 + (1 - share(v)) * plot;
    const zero = y(Math.max(lo, Math.min(0, hi)));
    const gap = slot >= 6 ? 2 : slot >= 4 ? 1 : 0;
    const span = slot - gap;
    const each = Math.max(1, Math.floor(span / Math.max(1, bars.length)));
    const group = Math.min(span, each * bars.length);
    const barX = (i: number, barIndex: number) =>
      x0 + i * slot + Math.floor(gap / 2) + Math.floor((span - group) / 2) + barIndex * each;
    // The value over each bar of a chart with one series of bars, with the columns that text covers and a margin.
    const marks =
      bars.length === 1
        ? bars[0]!.values.flatMap((v, i) => {
            const text = compactNumber(v);
            const x = barX(i, 0) + each / 2;
            const start = Math.round(x - text.length / 2);

            return each < text.length
              ? []
              : [{ text, x, row: Math.floor(Math.min(zero, y(v))) - 1, from: start - 1, to: start + text.length + 1 }];
          })
        : [];

    if (slot < 3) {
      return null;
    }

    if (xy.yTitle !== "") {
      d.text(0, top, xy.yTitle, "inactive");
    }

    ticks.forEach((tick, i) => {
      const row = Math.floor(y(tick));
      let from = x0 + 1;

      d.text(left, row, tickText[i]!, "inactive", { anchor: "end" });
      d.line(
        [
          { x: mid(axisX), y: mid(row) },
          { x: mid(axisX) + 1, y: mid(row) },
        ],
        "inactive",
      );

      // A gridline stops short of the value a bar carries on its row, so the label is not struck through.
      const stops = marks.filter((mark) => mark.row === row).sort((a, b) => a.from - b.from);

      for (const stop of [...stops, { from: x0 + width, to: x0 + width }]) {
        if (stop.from > from) {
          d.line(
            [
              { x: from, y: mid(row) },
              { x: stop.from, y: mid(row) },
            ],
            "subtle",
            { dash: true },
          );
        }

        from = Math.max(from, stop.to);
      }
    });
    d.line(
      [
        { x: mid(axisX), y: base },
        { x: mid(axisX), y: base + plot + 0.5 },
      ],
      "inactive",
    );
    d.line(
      [
        { x: mid(axisX), y: base + plot + 0.5 },
        { x: x0 + width, y: base + plot + 0.5 },
      ],
      "inactive",
    );

    xy.series.forEach((series, s) => {
      const tone = seriesTone(s);
      const barIndex = bars.indexOf(series);

      if (series.kind === "bar") {
        series.values.forEach((v, i) => {
          const from = Math.min(zero, y(v));

          d.rect(barX(i, barIndex), from, each, Math.max(Math.abs(y(v) - zero), 0.125), { fill: tone });
        });
      } else {
        const points = series.values.map((v, i) => ({ x: mid(x0 + i * slot + Math.floor((slot - 1) / 2)), y: y(v) }));

        // Text puts a marker in the cell that holds its point, so its line runs through the middle of that cell.
        d.line(points, tone, { only: "picture" });
        d.line(
          points.map((point) => ({ x: point.x, y: mid(point.y) })),
          tone,
          { only: "text" },
        );
        points.forEach(({ x, y: at }) => d.dot(x, at, tone));
      }
    });
    marks.forEach(({ text, x, row }) => d.text(x, row, text, "inactive", { anchor: "middle" }));
    labels.forEach((label, i) =>
      d.text(x0 + i * slot + slot / 2, base + plot + 1, clipCells(label, slot - 1), "text", { anchor: "middle" }),
    );
    bottom = base + plot + 2;

    if (xy.xTitle !== "") {
      d.text(x0 + width / 2, bottom, xy.xTitle, "inactive", { anchor: "middle" });
      bottom++;
    }
  }

  if (legend.length > 0) {
    d.swatches(legend, 0, bottom + 1, ctx.columns);
  }

  return d.finish(
    `Chart${xy.title === "" ? "" : ` ${xy.title}`}: ${xy.series
      .map(
        (series, i) =>
          `${nameOf(series, i, xy.series)} ${series.values.map((v, n) => `${labels[n]} ${formatNumber(v)}`).join(", ")}`,
      )
      .join("; ")}`,
    ctx,
  );
}
