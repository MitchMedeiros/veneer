import { gridCell, gridScene } from "./mermaid-grid";
import type { GridCell, GridEdge } from "./mermaid-grid";
import type { Ctx, Scene } from "./mermaid-scene";
import { unquote } from "./mermaid-source";
import { clipCells } from "./svg-text";

export type Block = { title: string; root: GridCell; edges: GridEdge[] };

const MAX_CELLS = 60;
const MAX_LABEL = 28;
const ARROWS: Record<string, string> = { up: "▴", down: "▾", left: "◂", right: "▸", x: "↔", y: "↕" };

const OPENERS = /^(\[\[|\[\(|\(\[|\(\(|\{\{|\[\/|\[\\|\[|\(|\{|>)(.*?)(\]\]|\)\]|\]\)|\)\)|\}\}|\/\]|\\\]|\]|\)|\})$/s;
const ARROW = /^([\w-]+)<\[(.*?)\]>\((\w+)\)$/s;
const EDGE = /^([\w-]+)\s*(?:--\s*"([^"]*)"\s*-->|--\s+([^">-][^>]*?)\s+-->|-->|---)\s*([\w-]+)$/;

// The words of a statement, split at the spaces outside quotes and brackets.
function wordsOf(line: string): string[] {
  const words: string[] = [];
  let word = "";
  let depth = 0;
  let isQuoted = false;

  for (const char of line) {
    isQuoted = char === '"' ? !isQuoted : isQuoted;
    depth += isQuoted ? 0 : "[({".includes(char) ? 1 : "])}".includes(char) ? -1 : 0;

    if (/\s/.test(char) && depth <= 0 && !isQuoted) {
      words.push(word);
      word = "";
    } else {
      word += char;
    }
  }

  return [...words, word].filter((entry) => entry !== "");
}

const boxOf = (id: string, text: string[], span: number, isRound = false): GridCell =>
  gridCell({ id, lines: text.map((line) => ({ text: clipCells(line, MAX_LABEL) })), span, isRound });

// A `block` diagram read well enough to draw: blocks in a grid with spans, spaces, blocks nested in blocks, block arrows
// and arrows between blocks. Null for a block shape this does not read.
export function parseBlock(lines: readonly string[]): Block | null {
  if (!/^block(-beta)?$/i.test(lines[0] ?? "")) {
    return null;
  }

  const root = gridCell({ id: "", isBlock: true });
  const stack = [root];
  const edges: GridEdge[] = [];

  for (const line of lines.slice(1)) {
    const columns = /^columns\s+(\d+)$/i.exec(line);
    const edge = EDGE.exec(line);
    const open = /^block(?::([\w-]+))?(?::(\d+))?$/i.exec(line);
    const current = stack.at(-1)!;

    if (columns !== null) {
      current.columns = Number(columns[1]);
    } else if (edge !== null) {
      edges.push({ from: edge[1]!, to: edge[4]!, label: unquote(edge[2] ?? edge[3] ?? ""), hasStart: false });
    } else if (open !== null) {
      const block = gridCell({ id: open[1] ?? "", span: Number(open[2] ?? 1), isBlock: true });

      current.children.push(block);
      stack.push(block);
    } else if (line === "end") {
      if (stack.length === 1) {
        return null;
      }

      stack.pop();
    } else if (/^(style|classDef|class|accTitle|accDescr)\b/i.test(line)) {
      continue;
    } else {
      for (const word of wordsOf(line)) {
        const span = /:(\d+)$/.exec(word);
        const body = span === null ? word : word.slice(0, -span[0].length);
        const size = Number(span?.[1] ?? 1);
        const arrow = ARROW.exec(body);

        if (/^space$/i.test(body)) {
          current.children.push(gridCell({ id: "", span: size, isSpace: true }));
          continue;
        }

        if (arrow !== null && ARROWS[arrow[3]!.toLowerCase()] !== undefined) {
          const label = unquote(arrow[2]!);

          current.children.push(
            boxOf(arrow[1]!, [...(label === "" ? [] : [label]), ARROWS[arrow[3]!.toLowerCase()]!], size),
          );
          continue;
        }

        const id = /^[\w-]+/.exec(body)?.[0];
        const shape = id === undefined ? null : OPENERS.exec(body.slice(id.length));

        if (id === undefined || (body.length > id.length && shape === null)) {
          return null;
        }

        current.children.push(
          boxOf(id, [unquote(shape?.[2] ?? id)], size, shape !== null && /^[(]|^\[\(/.test(shape[1]!)),
        );
      }
    }
  }

  const total = (cell: GridCell): number => 1 + cell.children.reduce((sum, child) => sum + total(child), 0);

  return stack.length !== 1 || root.children.length === 0 || total(root) > MAX_CELLS
    ? null
    : { title: "", root, edges };
}

export function blockScene({ root, edges }: Block, ctx: Ctx): Scene | null {
  const names = (cell: GridCell): string[] => [cell.id, ...cell.children.flatMap(names)].filter((id) => id !== "");

  return gridScene(root, edges, ctx, {
    title: "",
    alt: `Block diagram: ${names(root).join(", ")}${edges.map(({ from, to }) => `; ${from} to ${to}`).join("")}`,
  });
}
