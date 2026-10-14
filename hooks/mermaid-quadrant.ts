import { Draft, mid } from "./mermaid-scene";
import type { Ctx, Scene } from "./mermaid-scene";
import { numberOf, titleOf, unquote } from "./mermaid-source";
import type { Tone } from "./palette";
import { cellWidth, clipCells } from "./svg-text";

type Point = { name: string; x: number; y: number };

export type Quadrant = {
  title: string;
  xAxis: [string, string];
  yAxis: [string, string];
  // The names of quadrants one to four: top right, top left, bottom left and bottom right.
  names: [string, string, string, string];
  points: Point[];
};

const MAX_POINTS = 40;
const MAX_WIDTH = 56;
const MIN_WIDTH = 24;
const TONES: readonly [Tone, Tone, Tone, Tone] = ["success", "suggestion", "error", "warning"];

const AXIS = /^([xy])-axis\s+(.*?)(?:\s*-->\s*(.*))?$/i;
const NAME = /^quadrant-([1-4])\s+(.*)$/i;
const POINT = /^(.+?)(?::::\w+)?\s*:\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\](?:\s+[\w-]+\s*:.*)?$/;

// A `quadrantChart` read well enough to draw. Null for a point outside zero to one or a line this does not read.
export function parseQuadrant(lines: readonly string[]): Quadrant | null {
  if (lines[0] !== "quadrantChart") {
    return null;
  }

  const chart: Quadrant = {
    title: "",
    xAxis: ["", ""],
    yAxis: ["", ""],
    names: ["", "", "", ""],
    points: [],
  };

  for (const line of lines.slice(1)) {
    const title = titleOf(line);
    const axis = AXIS.exec(line);
    const name = NAME.exec(line);
    const point = POINT.exec(line);
    const x = numberOf(point?.[2] ?? "");
    const y = numberOf(point?.[3] ?? "");

    if (title !== null) {
      chart.title = title;
    } else if (axis !== null) {
      chart[axis[1]!.toLowerCase() === "x" ? "xAxis" : "yAxis"] = [unquote(axis[2]!), unquote(axis[3] ?? "")];
    } else if (name !== null) {
      chart.names[Number(name[1]) - 1] = unquote(name[2]!);
    } else if (point !== null && x !== null && y !== null && x >= 0 && x <= 1 && y >= 0 && y <= 1) {
      chart.points.push({ name: unquote(point[1]!), x, y });
    } else if (!/^(accTitle|accDescr)\b/i.test(line)) {
      return null;
    }
  }

  return chart.points.length > MAX_POINTS ? null : chart;
}

type Span = { row: number; from: number; to: number };

export function quadrantScene(chart: Quadrant, ctx: Ctx): Scene | null {
  const width = Math.min(MAX_WIDTH, ctx.columns - 2) & ~1;
  const height = Math.max(9, Math.round(width / ctx.ratio)) | 1;

  if (width < MIN_WIDTH) {
    return null;
  }

  const d = new Draft();
  const [xLow, xHigh] = chart.xAxis;
  const [yLow, yHigh] = chart.yAxis;
  let top = d.heading(chart.title);

  if (yHigh !== "") {
    d.text(width / 2, top, yHigh, "inactive", { anchor: "middle" });
    top++;
  }

  const centreX = width / 2;
  const centreY = top + (height - 1) / 2;

  [
    { x: centreX + 0.5, y: top + 0.5, tone: TONES[0] },
    { x: 0.5, y: top + 0.5, tone: TONES[1] },
    { x: 0.5, y: centreY + 0.5, tone: TONES[2] },
    { x: centreX + 0.5, y: centreY + 0.5, tone: TONES[3] },
  ].forEach(({ x, y, tone }) =>
    d.rect(x, y, width / 2, (height - 1) / 2, { fill: tone, opacity: 0.07, only: "picture" }),
  );
  d.rect(0, top, width + 1, height, { stroke: "subtle" });
  d.line(
    [
      { x: mid(centreX), y: top + 0.5 },
      { x: mid(centreX), y: top + height - 0.5 },
    ],
    "subtle",
  );
  d.line(
    [
      { x: 0.5, y: mid(centreY) },
      { x: width + 0.5, y: mid(centreY) },
    ],
    "subtle",
  );

  const quadrantTitles: readonly [number, number][] = [
    [centreX, top],
    [0, top],
    [0, centreY],
    [centreX, centreY],
  ];

  chart.names.forEach((name, i) => {
    const [x, y] = quadrantTitles[i]!;

    d.text(x + width / 4 + 0.5, y + 1, clipCells(name, width / 2 - 2), TONES[i], { anchor: "middle", bold: true });
  });

  const taken: Span[] = chart.names.flatMap((name, i) =>
    name === ""
      ? []
      : [{ row: quadrantTitles[i]![1] + 1, from: quadrantTitles[i]![0] + 1, to: quadrantTitles[i]![0] + width / 2 }],
  );

  for (const point of chart.points) {
    const x = Math.min(width - 1, Math.round(point.x * width));
    const y = Math.min(top + height - 2, Math.max(top + 1, Math.round(top + (1 - point.y) * (height - 1))));
    const tone = TONES[point.x >= 0.5 ? (point.y >= 0.5 ? 0 : 3) : point.y >= 0.5 ? 1 : 2];
    const size = cellWidth(point.name);
    const candidates: Span[] = [
      { row: y, from: x + 2, to: x + 1 + size },
      { row: y, from: x - 1 - size, to: x - 2 },
      { row: y - 1, from: x - Math.floor(size / 2), to: x - Math.floor(size / 2) + size - 1 },
      { row: y + 1, from: x - Math.floor(size / 2), to: x - Math.floor(size / 2) + size - 1 },
    ];
    const clear = (span: Span) =>
      span.from > 0 &&
      span.to < width &&
      span.row !== Math.floor(centreY) &&
      !(span.from <= Math.floor(centreX) && Math.floor(centreX) <= span.to) &&
      !taken.some((other) => other.row === span.row && span.from <= other.to && other.from <= span.to);
    const spot = candidates.find(clear) ?? candidates[0]!;

    taken.push({ row: y, from: x - 1, to: x + 1 }, spot);
    d.dot(mid(x), mid(y), tone);
    d.text(spot.from, spot.row, point.name);
  }

  const bottom = top + height;

  if (yLow !== "") {
    d.text(width / 2, bottom, yLow, "inactive", { anchor: "middle" });
  }

  const axisRow = bottom + (yLow === "" ? 0 : 1);

  d.text(0, axisRow, xLow, "inactive");
  d.text(width + 1, axisRow, xHigh, "inactive", { anchor: "end" });

  return d.finish(
    `Quadrant chart${chart.title === "" ? "" : ` ${chart.title}`}: ${chart.points.map((p) => `${p.name} at ${p.x}, ${p.y}`).join("; ")}`,
    ctx,
  );
}
