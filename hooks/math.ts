import type { Palette } from "../types";
import { CELL_WIDTH, fill, rowsFor, svgDocument } from "./picture";
import type { Font, Sketch } from "./picture";
import { texToSvg } from "./vendor/math-svg.js";

// Type size as a share of the cell height, and the room around an equation.
const SIZE_RATIO = 0.62;
const INDENT = 2 * CELL_WIDTH;
const PAD_RATIO = 0.5;
const UNITS_PER_EM = 1000;

const VIEW_BOX = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/;
const ROOT = /^<svg\b[^>]*>([\s\S]*)<\/svg>$/;

// Display math as a picture, indented, in the theme's text colour and as large as fits `availColumns`. Null where
// MathJax cannot read the TeX, so it is left to the text fallback.
export function mathSketch(tex: string, availColumns: number, palette: Palette, font: Font): Sketch | null {
  let svg: string;

  try {
    svg = texToSvg(tex, true);
  } catch {
    return null;
  }

  const box = VIEW_BOX.exec(svg)?.slice(1).map(Number);
  const body = ROOT.exec(svg.trim())?.[1];

  if (box === undefined || body === undefined || box.length !== 4) {
    return null;
  }

  const [, , boxWidth = 0, boxHeight = 0] = box;
  const em = font.cellHeight * SIZE_RATIO;
  const room = availColumns * CELL_WIDTH - INDENT;
  const scale = Math.min(1, room / ((boxWidth * em) / UNITS_PER_EM));
  const width = (boxWidth * em * scale) / UNITS_PER_EM;
  const height = (boxHeight * em * scale) / UNITS_PER_EM;
  const columns = Math.min(availColumns, Math.ceil((INDENT + width) / CELL_WIDTH));
  const rows = rowsFor(height + font.cellHeight * PAD_RATIO * 2, font.cellHeight);
  const top = (rows * font.cellHeight - height) / 2;
  const ink = body.replaceAll("currentColor", palette.text);
  const nested = `<svg x="${INDENT}" y="${top}" width="${width}" height="${height}" viewBox="${box.join(" ")}" ${fill(palette.text)}>${ink}</svg>`;

  return { svg: svgDocument(columns, rows, font.cellHeight, font.family, nested), columns, rows, alt: tex };
}
