import type { Palette } from "../types";
import {
  centredText,
  DASHED,
  directionOf,
  EDGE_WIDTH,
  finish,
  LABEL,
  labelSvg,
  layered,
  LINE_HEIGHT,
  markerAttribute,
  markerDef,
  markerLength,
  boxPaint,
  rectSvg,
  strokeSvg,
  TEXT,
  trimmed,
} from "./mermaid-layout";
import type { Direction, GraphNode } from "./mermaid-layout";
import { sourceLines, unquote } from "./mermaid-source";
import { CELL_WIDTH } from "./picture";
import type { Font, Sketch } from "./picture";
import { measure, wrap } from "./svg-text";

type Shape = "box" | "round" | "diamond";
type FlowNode = { id: string; label: string; shape: Shape };

type FlowEdge = {
  from: string;
  to: string;
  label: string;
  line: "solid" | "dotted" | "thick";
  isArrow: boolean;
};

type Flow = { direction: Direction; nodes: FlowNode[]; edges: FlowEdge[] };

// Past this a picture stops being easier to read than the source.
const MAX_NODES = 40;
const NODE_PAD = CELL_WIDTH;
const MIN_NODE = 6 * CELL_WIDTH;
const MAX_NODE = 36 * CELL_WIDTH;
const MAX_NODE_LINES = 2;

// Lines that say nothing about the shape of the graph.
const IGNORED = /^(classDef\s|class\s|style\s|linkStyle\s|click\s|accTitle|accDescr)/;

// A node with its optional label: `A`, `A[Box]`, `A(Round)`, `A{Choice}`, and the doubled forms Mermaid draws as
// circles, stadiums, subroutines and hexagons.
const NODE =
  /^([A-Za-z0-9_]+)\s*(?:\(\((.*?)\)\)|\(\[(.*?)\]\)|\[\[(.*?)\]\]|\{\{(.*?)\}\}|\[(.*?)\]|\((.*?)\)|\{(.*?)\})?/;

// An edge: `-->`, `---`, `-.->`, `==>`, with a label as `-->|yes|` or `-- yes -->`.
const EDGE =
  /^(?:(-->|---|-\.->|-\.-|==>|===)\s*(?:\|([^|]*)\|)?|(--|-\.|==)\s*([^|>-][^>]*?)\s*(-->|---|\.->|\.-|==>|===))\s*/;

type Read = { node: FlowNode; hasLabel: boolean; rest: string };

function readNode(text: string): Read | null {
  const match = NODE.exec(text);

  if (match === null) {
    return null;
  }

  const [whole, id = ""] = match;
  const groups = match.slice(2);
  const at = groups.findIndex((group) => group !== undefined);
  const shape: Shape = at === 3 || at === 6 ? "diamond" : at === 0 || at === 1 || at === 5 ? "round" : "box";

  // `A[(Database)]` is a cylinder, drawn here as a plain box.
  const label = at === -1 ? id : unquote(groups[at] ?? "").replace(/^\((.*)\)$/, "$1");

  return {
    node: { id, label, shape },
    hasLabel: at !== -1,
    rest: text.slice(whole.length).trim(),
  };
}

// A `graph` or `flowchart` read well enough to draw. Null for anything past that, such as subgraphs, so the diagram is
// left to the text renderer.
export function parseFlow(source: string): Flow | null {
  const [first = "", ...lines] = sourceLines(source);
  const [head = "", ...inline] = first.split(";");

  if (!/^(flowchart|graph)\b/.test(head.trim())) {
    return null;
  }

  const statements = [...inline, ...lines]
    .flatMap((line) => line.split(";"))
    .map((line) => line.trim())
    .filter((line) => line !== "" && !IGNORED.test(line));
  const nodes = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];

  const meet = ({ node, hasLabel }: Read) => {
    // A later bare mention keeps the label an earlier one gave.
    if (!nodes.has(node.id) || hasLabel) {
      nodes.set(node.id, node);
    }
  };

  for (const statement of statements) {
    if (/^(subgraph\b|end$|direction\s)/.test(statement)) {
      return null;
    }

    const start = readNode(statement);

    if (start === null) {
      return null;
    }

    meet(start);

    let read: Read = start;

    while (read.rest !== "") {
      const edge = EDGE.exec(read.rest);
      const next: Read | null = edge === null ? null : readNode(read.rest.slice(edge[0].length));

      if (edge === null || next === null) {
        return null;
      }

      const arrow = edge[1] ?? edge[5] ?? "";

      meet(next);
      edges.push({
        from: read.node.id,
        to: next.node.id,
        label: unquote(edge[2] ?? edge[4] ?? ""),
        line: arrow.includes(".") ? "dotted" : arrow.includes("=") ? "thick" : "solid",
        isArrow: arrow.endsWith(">"),
      });
      read = next;
    }
  }

  if (nodes.size === 0 || nodes.size > MAX_NODES) {
    return null;
  }

  return { direction: directionOf(head), nodes: [...nodes.values()], edges };
}

type Sized = { node: FlowNode; lines: string[]; size: GraphNode };

function sizeOf(node: FlowNode): Sized {
  const w = Math.min(MAX_NODE, Math.max(MIN_NODE, Math.ceil(measure(node.label, TEXT)) + 2 * NODE_PAD));
  const lines = wrap(node.label, w - 2 * NODE_PAD, TEXT, MAX_NODE_LINES);

  return { node, lines, size: { id: node.id, w, h: (lines.length + 1) * LINE_HEIGHT } };
}

const accentOf = ({ shape }: FlowNode, palette: Palette): string =>
  shape === "round" ? palette.success : shape === "diamond" ? palette.error : palette.accent;

// A flowchart as a picture, or null where it does not fit `available` columns.
export function flowSketch(flow: Flow, available: number, palette: Palette, font: Font): Sketch | null {
  const sized = flow.nodes.map(sizeOf);
  const layout = layered(
    sized.map(({ size }) => size),
    flow.edges,
    flow.direction,
    {
      sibling: 3 * CELL_WIDTH,
      rank: flow.direction === "down" ? 2.5 * font.cellHeight : 8 * CELL_WIDTH,
      labelSize: LABEL,
    },
  );
  const byId = new Map(sized.map((item) => [item.node.id, item]));
  const arrow = markerLength("arrow");
  const edges = layout.routes
    .map((route) => {
      const edge = route.edge as FlowEdge;
      const width = edge.line === "thick" ? EDGE_WIDTH * 1.8 : EDGE_WIDTH;

      return (
        strokeSvg(
          trimmed(route, 0, edge.isArrow ? arrow : 0),
          palette.inactive,
          width,
          (edge.line === "dotted" ? DASHED : "") + (edge.isArrow ? markerAttribute("arrow") : ""),
        ) + labelSvg(route, edge.label, LABEL, palette.text)
      );
    })
    .join("");
  const nodes = layout.nodes
    .map(({ id, x, y, w, h }) => {
      const { node, lines } = byId.get(id)!;
      const paint = boxPaint(accentOf(node, palette), EDGE_WIDTH);
      const top = y + EDGE_WIDTH / 2;
      const slant = Math.min(h / 2, w / 4);
      const shape =
        node.shape === "diamond"
          ? `<path d="M${x} ${y + h / 2}L${x + slant} ${top}H${x + w - slant}L${x + w} ${y + h / 2}L${x + w - slant} ${y + h - EDGE_WIDTH / 2}H${x + slant}Z" ${paint}/>`
          : rectSvg(
              x + EDGE_WIDTH / 2,
              top,
              w - EDGE_WIDTH,
              h - EDGE_WIDTH,
              node.shape === "round" ? (h - EDGE_WIDTH) / 2 : 14,
              paint,
            );
      const text = lines
        .map((line, n) =>
          centredText(x + w / 2, y + h / 2 + (n - (lines.length - 1) / 2) * LINE_HEIGHT, line, TEXT, palette.text),
        )
        .join("");

      return shape + text;
    })
    .join("");
  const label = (id: string) => byId.get(id)?.node.label ?? id;

  return finish(
    `<defs>${markerDef("arrow", palette.inactive)}</defs>${edges}${nodes}`,
    layout.width,
    layout.height,
    available,
    font,
    flow.edges
      .map((edge) => `${label(edge.from)} -> ${label(edge.to)}${edge.label === "" ? "" : ` (${edge.label})`}`)
      .join("\n"),
  );
}
