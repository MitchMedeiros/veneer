import {
  DASHED,
  EDGE_WIDTH,
  markerAttribute,
  markerDef,
  markerLength,
  pathSvg,
  rectSvg,
  textSvg,
} from "./mermaid-layout";
import type { Pt, Prim, Scene } from "./mermaid-scene";
import type { Tone } from "./palette";
import type { Palette } from "../types";
import { CELL_WIDTH, fill, MAX_CELLS, svgDocument } from "./picture";
import type { Font, Sketch } from "./picture";

// A scene as a picture: one cell is `CELL_WIDTH` pixels across and a font's cell height down, and text is sized to a
// row, so the picture lines up with the cells the text rendering of the same scene would use.

const TEXT_OF_ROW = 0.58;
const TEXT_OF_CELL = 1.75;
const DOT = 0.4;
const LABEL_BASELINE = 0.35;

const num = (value: number): number => Math.round(value * 10) / 10;

export function sceneSketch(scene: Scene, palette: Palette, font: Font): Sketch | null {
  if (scene.height > MAX_CELLS) {
    return null;
  }

  const sx = CELL_WIDTH;
  const sy = font.cellHeight;
  const size = Math.min(sy * TEXT_OF_ROW, sx * TEXT_OF_CELL);
  const px = (p: Pt): Pt => ({ x: num(p.x * sx), y: num(p.y * sy) });
  const color = (tone: Tone): string => palette[tone];
  const arrows = new Set<Tone>();

  const draw = (prim: Prim): string => {
    switch (prim.kind) {
      case "text":
        return textSvg(
          prim.x * sx,
          (prim.y + 0.5) * sy + size * LABEL_BASELINE,
          prim.text,
          size,
          color(prim.tone),
          prim.anchor,
          prim.bold ? ' font-weight="bold"' : "",
        );
      case "rect": {
        const paint = `${prim.fill === undefined ? 'fill="none"' : fill(color(prim.fill), prim.opacity)}${prim.stroke === undefined ? "" : ` stroke="${color(prim.stroke)}" stroke-width="${EDGE_WIDTH}"`}`;

        // A border runs through the middle of the cells it occupies, as box characters do.
        return prim.stroke === undefined
          ? rectSvg(prim.x * sx, prim.y * sy, prim.w * sx, prim.h * sy, 0, paint)
          : rectSvg(
              (prim.x + 0.5) * sx,
              (prim.y + 0.5) * sy,
              Math.max(0, prim.w - 1) * sx,
              Math.max(0, prim.h - 1) * sy,
              prim.round ? sx * 0.7 : 0,
              paint,
            );
      }
      case "poly": {
        const points = prim.points.map((p) => px(p));
        const d = `M${points.map(({ x, y }) => `${x} ${y}`).join("L")}Z`;
        const paint = `${prim.fill === undefined ? 'fill="none"' : fill(color(prim.fill), prim.opacity)}${prim.stroke === undefined ? "" : ` stroke="${color(prim.stroke)}" stroke-width="${EDGE_WIDTH}" stroke-linejoin="round"`}`;

        return `<path d="${d}" ${paint}/>`;
      }
      case "line": {
        const points = prim.points.map((p) => px(p));
        const last = points.at(-1);
        const before = points.at(-2);

        // The path stops short of its end, where the arrowhead's tip lands.
        if (prim.arrow && last !== undefined && before !== undefined) {
          const length = Math.hypot(last.x - before.x, last.y - before.y) || 1;
          const back = markerLength("arrow") / length;

          points[points.length - 1] = {
            x: num(last.x - (last.x - before.x) * Math.min(1, back)),
            y: num(last.y - (last.y - before.y) * Math.min(1, back)),
          };
          arrows.add(prim.tone);
        }

        const d = `M${points.map(({ x, y }) => `${x} ${y}`).join("L")}`;
        const extra = `${prim.dash ? DASHED : ""}${prim.arrow ? markerAttribute("arrow", `arrow-${prim.tone}`) : ""} stroke-linejoin="round"`;

        return pathSvg(d, color(prim.tone), EDGE_WIDTH, extra);
      }
      case "dot": {
        const cx = prim.x * sx;
        const cy = prim.y * sy;
        const r = sx * DOT;
        const paint = fill(color(prim.tone));

        switch (prim.shape) {
          case "diamond":
            return `<path d="M${num(cx - r * 1.3)} ${num(cy)}L${num(cx)} ${num(cy - r * 1.3)}L${num(cx + r * 1.3)} ${num(cy)}L${num(cx)} ${num(cy + r * 1.3)}Z" ${paint}/>`;
          case "square":
            return rectSvg(cx - r, cy - r, r * 2, r * 2, 2, paint);
          case "cross":
            return pathSvg(
              `M${num(cx - r)} ${num(cy - r)}L${num(cx + r)} ${num(cy + r)}M${num(cx + r)} ${num(cy - r)}L${num(cx - r)} ${num(cy + r)}`,
              color(prim.tone),
              EDGE_WIDTH,
            );
          default:
            return `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" ${paint}/>`;
        }
      }
    }
  };

  const body = scene.prims
    .filter((prim) => prim.only !== "text")
    .map(draw)
    .join("");
  const defs = [...arrows].map((tone) => markerDef("arrow", color(tone), `arrow-${tone}`)).join("");

  return {
    svg: svgDocument(scene.width, scene.height, sy, font.family, `<defs>${defs}</defs>${body}`),
    columns: scene.width,
    rows: scene.height,
    alt: scene.alt,
  };
}
