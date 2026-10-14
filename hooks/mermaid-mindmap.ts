import { Draft, mid, seriesTone, widest, wrapCells } from "./mermaid-scene";
import type { Ctx, Scene } from "./mermaid-scene";
import { plain } from "./mermaid-source";
import type { Tone } from "./palette";

type Node = { label: string; children: Node[] };
export type Mindmap = { title: string; root: Node };

const MAX_NODES = 60;
const GAP = 6;
const WRAPS = [32, 28, 24, 20, 16, 12];
const MAX_LINES = 3;
const SHAPES = [
  /^\S*?\(\((.*)\)\)$/s,
  /^\S*?\)\)(.*)\(\($/s,
  /^\S*?\)(.*)\($/s,
  /^\S*?\{\{(.*)\}\}$/s,
  /^\S*?\((.*)\)$/s,
  /^\S*?\[(.*)\]$/s,
];

const labelOf = (line: string): string =>
  plain(SHAPES.map((shape) => shape.exec(line)?.[1]).find((text) => text !== undefined) ?? line);

// A `mindmap` read well enough to draw: one root and the nodes nested under it by indentation. Null for a second root or
// no nodes.
export function parseMindmap(lines: readonly string[], indents: readonly number[]): Mindmap | null {
  if (!/^mindmap$/i.test(lines[0] ?? "")) {
    return null;
  }

  const stack: { indent: number; node: Node }[] = [];
  let root: Node | undefined;
  let count = 0;

  for (const [i, line] of lines.slice(1).entries()) {
    if (/^(::icon\(|:::|accTitle|accDescr)/i.test(line)) {
      continue;
    }

    const node: Node = { label: labelOf(line), children: [] };
    const indent = indents[i + 1] ?? 0;

    while (stack.length > 0 && stack.at(-1)!.indent >= indent) {
      stack.pop();
    }

    if (stack.length === 0) {
      if (root !== undefined) {
        return null;
      }

      root = node;
    } else {
      stack.at(-1)!.node.children.push(node);
    }

    stack.push({ indent, node });
    count++;
  }

  return root === undefined || count > MAX_NODES ? null : { title: "", root };
}

type Placed = { node: Node; depth: number; row: number; lines: string[]; tone: Tone; children: Placed[] };

// The tree with each node's text wrapped to `wrap` columns and its row: leaves one under another and each parent level
// with the middle of its children.
function place(node: Node, depth: number, tone: Tone, wrap: number, next: { row: number }): Placed {
  const lines = wrapCells(node.label, wrap, MAX_LINES);
  const children = node.children.map((child, i) =>
    place(child, depth + 1, depth === 0 ? seriesTone(i) : tone, wrap, next),
  );
  const row = children.length === 0 ? next.row : Math.floor((children[0]!.row + children.at(-1)!.row) / 2);

  if (children.length === 0) {
    next.row += lines.length;
  }

  return { node, depth, row, lines, tone, children };
}

const walk = (placed: Placed): Placed[] => [placed, ...placed.children.flatMap(walk)];

export function mindmapScene({ root }: Mindmap, ctx: Ctx): Scene | null {
  for (const wrap of WRAPS) {
    const tree = place(root, 0, "accent", wrap, { row: 0 });
    const all = walk(tree);
    const depths = Math.max(...all.map(({ depth }) => depth));
    const widths = Array.from({ length: depths + 1 }, (_, depth) =>
      Math.max(...all.filter((item) => item.depth === depth).map(({ lines }) => widest(lines) + (depth === 0 ? 4 : 0))),
    );
    const starts = widths.map((_, depth) => widths.slice(0, depth).reduce((sum, width) => sum + width + GAP, 0));

    if (starts[depths]! + widths[depths]! > ctx.columns) {
      continue;
    }

    const d = new Draft();
    const rootWidth = widths[0]!;

    d.rect(0, tree.row - 1, rootWidth, tree.lines.length + 2, { stroke: "accent", round: true });
    tree.lines.forEach((line, n) => d.text(2, tree.row + n, line, "text", { bold: true }));

    for (const parent of all) {
      if (parent.children.length === 0) {
        continue;
      }

      const spine = starts[parent.depth + 1]! - 3;
      const first = parent.depth === 0 ? rootWidth - 1 : starts[parent.depth]! + widest(parent.lines) + 1;
      const rows = [parent.row, ...parent.children.map((child) => child.row)];
      const tone = parent.depth === 0 ? "accent" : parent.children[0]!.tone;

      d.line(
        [
          { x: first + 0.5, y: mid(parent.row) },
          { x: mid(spine), y: mid(parent.row) },
        ],
        tone,
      );
      d.line(
        [
          { x: mid(spine), y: mid(Math.min(...rows)) },
          { x: mid(spine), y: mid(Math.max(...rows)) },
        ],
        tone,
      );

      for (const child of parent.children) {
        d.line(
          [
            { x: spine + 0.5, y: mid(child.row) },
            { x: starts[child.depth]! - 1, y: mid(child.row) },
          ],
          child.tone,
        );
      }
    }

    for (const item of all.slice(1)) {
      item.lines.forEach((line, n) =>
        d.text(starts[item.depth]!, item.row + n, line, item.depth === 1 ? item.tone : "text", {
          bold: item.depth === 1,
        }),
      );
    }

    return d.finish(`Mind map: ${all.map(({ node }) => node.label).join(", ")}`, ctx);
  }

  return null;
}
