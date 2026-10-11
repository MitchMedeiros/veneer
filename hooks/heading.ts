import type { Palette } from "../types";
import type { Heading } from "./markdown";
import { CELL_WIDTH, fill, svgDocument } from "./picture";
import type { Font, Sketch } from "./picture";
import { escapeXml, measure, wrap } from "./svg-text";

// Type size by heading level; each fits one cell row at the default proportion.
const SIZES = [46, 40, 34, 31];

// A heading as a one-row picture, as wide as its text up to `availColumns`.
export function headingSketch(heading: Heading, availColumns: number, palette: Palette, font: Font): Sketch {
  const size = SIZES[heading.level - 1] ?? SIZES[SIZES.length - 1]!;
  const width = Math.min(availColumns * CELL_WIDTH, Math.ceil(measure(heading.text, size) * 1.06) + CELL_WIDTH);
  const columns = Math.max(1, Math.ceil(width / CELL_WIDTH));
  const [text = ""] = wrap(heading.text, columns * CELL_WIDTH, size, 1);
  const body = `<text x="0" y="${font.cellHeight / 2 + size * 0.35}" font-size="${size}" font-weight="bold" ${fill(heading.level <= 2 ? palette.accent : palette.text)}>${escapeXml(text)}</text>`;

  return { svg: svgDocument(columns, 1, font.cellHeight, font.family, body), columns, rows: 1, alt: heading.text };
}
