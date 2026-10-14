import { Draft, seriesTone, wrapCells } from "./mermaid-scene";
import type { Ctx, Scene } from "./mermaid-scene";
import { plain, unquote } from "./mermaid-source";
import type { Tone } from "./palette";

type Card = { text: string; ticket: string; assigned: string; priority: string };
type Column = { name: string; cards: Card[] };
export type Kanban = { title: string; columns: Column[] };

const MAX_CARDS = 60;
const MAX_WIDTH = 34;
const MIN_WIDTH = 18;
const STACKED_WIDTH = 60;
const GAP = 2;
const MAX_TEXT_LINES = 4;

const NODE = /^(?:[\w-]+)?(?:\[(.*?)\])?\s*(?:@\{(.*)\})?$/s;
const PRIORITY: Record<string, Tone> = {
  "very high": "error",
  high: "warning",
  low: "success",
  "very low": "inactive",
};

// The `key: value` pairs of a card's `@{ ... }`, values with or without quotes.
function metadataOf(text: string): Record<string, string> {
  return Object.fromEntries(
    [...text.matchAll(/(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|([^,}]+))/g)].map((pair) => [
      pair[1]!,
      plain(pair[2] ?? pair[3] ?? pair[4] ?? ""),
    ]),
  );
}

// A `kanban` read well enough to draw: the columns at the first indent and the cards under them. Null for a card with no
// column or a line this does not read.
export function parseKanban(lines: readonly string[], indents: readonly number[]): Kanban | null {
  if (lines[0] !== "kanban") {
    return null;
  }

  const kanban: Kanban = { title: "", columns: [] };
  const base = indents[1] ?? 0;

  for (const [i, line] of lines.slice(1).entries()) {
    const node = NODE.exec(line);
    const bare = /^[\w-]+$/.test(line) ? unquote(line) : "";
    const label = unquote(node?.[1] ?? bare);
    const isColumn = (indents[i + 1] ?? 0) <= base;

    if (node === null || label === "") {
      if (/^(accTitle|accDescr)\b/i.test(line)) {
        continue;
      }

      return null;
    }

    if (isColumn) {
      kanban.columns.push({ name: label, cards: [] });
    } else if (kanban.columns.length > 0) {
      const meta = metadataOf(node[2] ?? "");

      kanban.columns.at(-1)!.cards.push({
        text: label,
        ticket: meta.ticket ?? "",
        assigned: meta.assigned ?? "",
        priority: meta.priority ?? "",
      });
    } else {
      return null;
    }
  }

  const cards = kanban.columns.reduce((sum, column) => sum + column.cards.length, 0);

  return kanban.columns.length === 0 || cards > MAX_CARDS ? null : kanban;
}

export function kanbanScene({ title, columns }: Kanban, ctx: Ctx): Scene | null {
  const side = Math.min(MAX_WIDTH, Math.floor((ctx.columns - GAP * (columns.length - 1)) / columns.length));
  const isStacked = side < MIN_WIDTH;
  const width = isStacked ? Math.min(STACKED_WIDTH, ctx.columns) : side;
  const d = new Draft();
  let top = d.heading(title);

  columns.forEach((column, c) => {
    const x = isStacked ? 0 : c * (width + GAP);
    const tone = seriesTone(c);
    let y = top;

    d.text(x, y, column.name, tone, { bold: true });
    d.text(x + width, y, String(column.cards.length), "inactive", { anchor: "end" });
    d.line(
      [
        { x: x + 0.5, y: y + 1.5 },
        { x: x + width - 0.5, y: y + 1.5 },
      ],
      "subtle",
    );
    y += 3;

    for (const card of column.cards) {
      const lines = wrapCells(card.text, width - 4, MAX_TEXT_LINES);
      const meta = [card.ticket, card.assigned === "" ? "" : `@${card.assigned}`]
        .filter((text) => text !== "")
        .join("  ");
      const rows = lines.length + (meta === "" ? 0 : 1) + (card.priority === "" ? 0 : 1);
      const urgency = PRIORITY[card.priority.toLowerCase()];

      d.rect(x, y, width, rows + 2, { stroke: urgency ?? "subtle", round: true });
      lines.forEach((line, n) => d.text(x + 2, y + 1 + n, line));

      let row = y + 1 + lines.length;

      if (meta !== "") {
        d.text(x + 2, row, meta, "inactive");
        row++;
      }

      if (card.priority !== "") {
        d.text(x + 2, row, card.priority, urgency ?? "inactive", { bold: true });
      }

      y += rows + 2;
    }

    if (isStacked) {
      top = y + 1;
    }
  });

  return d.finish(
    `Kanban${title === "" ? "" : ` ${title}`}: ${columns
      .map((column) => `${column.name} ${column.cards.map((card) => card.text).join(", ")}`)
      .join("; ")}`,
    ctx,
  );
}
