import { Draft, seriesTone } from "./mermaid-scene";
import type { Ctx, Scene } from "./mermaid-scene";
import { titleOf } from "./mermaid-source";
import { cellWidth, clipCells } from "./svg-text";

type Field = { start: number; end: number; label: string };
export type Packet = { title: string; fields: Field[] };

const BITS_PER_ROW = 32;
const MAX_ROWS = 16;
const ROW_HEIGHT = 4;

const FIELD = /^(?:(\d+)(?:\s*-\s*(\d+))?|\+(\d+))\s*:\s*"([^"]*)"$/;

// A `packet` read well enough to draw: fields given as a bit, a range of bits or a number of bits after the last field,
// laid end to end from bit zero as Mermaid asks. Null for a gap, an overlap or a line this does not read.
export function parsePacket(lines: readonly string[]): Packet | null {
  if (!/^packet(-beta)?$/i.test(lines[0] ?? "")) {
    return null;
  }

  const packet: Packet = { title: "", fields: [] };
  let next = 0;

  for (const line of lines.slice(1)) {
    const title = titleOf(line);
    const field = FIELD.exec(line);

    if (title !== null) {
      packet.title = title;
    } else if (field !== null) {
      const start = field[3] === undefined ? Number(field[1]) : next;
      const end =
        field[3] !== undefined ? next + Number(field[3]) - 1 : field[2] === undefined ? start : Number(field[2]);

      if (start !== next || end < start || (field[3] !== undefined && Number(field[3]) < 1)) {
        return null;
      }

      packet.fields.push({ start, end, label: field[4]! });
      next = end + 1;
    } else if (!/^(accTitle|accDescr)\b/i.test(line)) {
      return null;
    }
  }

  return packet.fields.length === 0 || Math.ceil(next / BITS_PER_ROW) > MAX_ROWS ? null : packet;
}

export function packetScene({ title, fields }: Packet, ctx: Ctx): Scene | null {
  const perBit = Math.floor((ctx.columns - 1) / BITS_PER_ROW);

  if (perBit < 1) {
    return null;
  }

  const d = new Draft();
  const top = d.heading(title);

  fields.forEach((field, index) => {
    const tone = seriesTone(index);

    for (let row = Math.floor(field.start / BITS_PER_ROW); row <= Math.floor(field.end / BITS_PER_ROW); row++) {
      const first = Math.max(field.start, row * BITS_PER_ROW);
      const last = Math.min(field.end, row * BITS_PER_ROW + BITS_PER_ROW - 1);
      const x0 = (first - row * BITS_PER_ROW) * perBit;
      const x1 = (last - row * BITS_PER_ROW + 1) * perBit;
      const y = top + row * ROW_HEIGHT;
      const numbers = [String(first), String(last)];
      const width = x1 - x0 + 1;

      d.rect(x0, y + 1, width, 3, { stroke: tone });
      d.text(x0 + width / 2, y + 2, clipCells(field.label, width - 2), "text", { anchor: "middle" });

      if (first === last || width < cellWidth(numbers[0]!) + cellWidth(numbers[1]!) + 2) {
        d.text(x0 + width / 2, y, numbers[0]!, "inactive", { anchor: "middle" });
      } else {
        d.text(x0 + 1, y, numbers[0]!, "inactive");
        d.text(x1, y, numbers[1]!, "inactive", { anchor: "end" });
      }
    }
  });

  return d.finish(
    `Packet${title === "" ? "" : ` ${title}`}: ${fields.map(({ start, end, label }) => `${label} bits ${start} to ${end}`).join(", ")}`,
    ctx,
  );
}
