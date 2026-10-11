import type { Palette } from "../types";
import type { Align, Table } from "./markdown";
import { CELL_WIDTH, fill, svgDocument } from "./picture";
import type { Font, Sketch } from "./picture";
import { escapeXml, measure, wrap } from "./svg-text";

const SIZE = 38;
const PAD_X = 2 * CELL_WIDTH;
const COL_GAP = 3 * CELL_WIDTH;
const MIN_COL = 4 * CELL_WIDTH;
const MAX_CELL_LINES = 4;
const HEADER_WEIGHT = 1.06;
const RULE_HEIGHT = 2;
const BORDER = 2;
const RADIUS = 24;

// Columns that fit their fair share keep their natural width; the rest share what is left in proportion to how much
// they hold, and wrap.
export function fitColumns(natural: readonly number[], room: number): number[] {
  const total = natural.reduce((sum, w) => sum + w, 0);

  if (total <= room) {
    return [...natural];
  }

  const fair = room / natural.length;
  const fixed = natural.reduce((sum, w) => sum + (w <= fair ? w : 0), 0);
  const flexTotal = natural.reduce((sum, w) => sum + (w > fair ? w : 0), 0);
  const flexRoom = Math.max(0, room - fixed);

  return natural.map((w) => (w <= fair ? w : Math.max(MIN_COL, (flexRoom * w) / flexTotal)));
}

const anchorOf = (align: Align): string => (align === "right" ? "end" : align === "center" ? "middle" : "start");

const xOf = (left: number, width: number, align: Align): number =>
  align === "right" ? left + width : align === "center" ? left + width / 2 : left;

// A table as a rounded card over whole cell rows. Every row is a cell row taller than its text, so the text has room
// above and below; long cells wrap so nothing is hidden. The card is only as wide as its columns need, up to
// `availColumns`.
export function tableSketch(table: Table, availColumns: number, palette: Palette, font: Font): Sketch {
  const natural = table.header.map((header, col) =>
    Math.max(
      MIN_COL,
      Math.ceil(
        Math.max(measure(header, SIZE) * HEADER_WEIGHT, ...table.rows.map((row) => measure(row[col] ?? "", SIZE))),
      ),
    ),
  );
  const gaps = COL_GAP * (natural.length - 1);
  const content = 2 * PAD_X + gaps + natural.reduce((sum, w) => sum + w, 0);
  const columns = Math.min(availColumns, Math.ceil(content / CELL_WIDTH));
  const width = columns * CELL_WIDTH;
  const widths = fitColumns(natural, width - 2 * PAD_X - gaps);
  const lefts = widths.map((_, i) => PAD_X + widths.slice(0, i).reduce((sum, w) => sum + w + COL_GAP, 0));
  const cellH = font.cellHeight;
  const baseline = (top: number, lines: number, line: number) =>
    top + ((lines + 1) * cellH) / 2 + (line - (lines - 1) / 2) * cellH + SIZE * 0.35;

  const header = table.header
    .map((cell, i) => {
      const [text = ""] = wrap(cell, widths[i] ?? MIN_COL, SIZE, 1);
      const align = table.align[i] ?? "left";

      return `<text x="${xOf(lefts[i] ?? 0, widths[i] ?? 0, align)}" y="${baseline(0, 1, 0)}" text-anchor="${anchorOf(align)}" font-weight="bold" ${fill(palette.accent)}>${escapeXml(text)}</text>`;
    })
    .join("");

  let top = 2 * cellH;
  const body = table.rows
    .map((row, r) => {
      const cells = row.map((cell, i) => wrap(cell, widths[i] ?? MIN_COL, SIZE, MAX_CELL_LINES));
      const lines = Math.max(1, ...cells.map((cell) => cell.length));
      const band =
        r % 2 === 1
          ? `<rect x="0" y="${top}" width="${width}" height="${(lines + 1) * cellH}" ${fill(palette.text, 0.05)}/>`
          : "";
      const text = cells
        .map((cell, i) => {
          const align = table.align[i] ?? "left";

          return cell
            .map(
              (line, n) =>
                `<text x="${xOf(lefts[i] ?? 0, widths[i] ?? 0, align)}" y="${baseline(top, lines, n)}" text-anchor="${anchorOf(align)}" ${fill(palette.text)}>${escapeXml(line)}</text>`,
            )
            .join("");
        })
        .join("");

      top += (lines + 1) * cellH;

      return band + text;
    })
    .join("");

  const rows = top / cellH;
  const height = rows * cellH;
  const rule = `<rect x="${PAD_X}" y="${2 * cellH - RULE_HEIGHT}" width="${width - 2 * PAD_X}" height="${RULE_HEIGHT}" ${fill(palette.subtle)}/>`;
  const card = `<rect x="${BORDER / 2}" y="${BORDER / 2}" width="${width - BORDER}" height="${height - BORDER}" rx="${RADIUS}" fill="none" stroke="${palette.subtle}" stroke-width="${BORDER}"/>`;
  const clip = `<clipPath id="card"><rect width="${width}" height="${height}" rx="${RADIUS}"/></clipPath>`;

  return {
    svg: svgDocument(
      columns,
      rows,
      cellH,
      font.family,
      `${clip}<g clip-path="url(#card)" font-size="${SIZE}">${header}${rule}${body}</g>${card}`,
    ),
    columns,
    rows,
    alt: [table.header.join(" | "), ...table.rows.map((row) => row.join(" | "))].join("\n"),
  };
}
