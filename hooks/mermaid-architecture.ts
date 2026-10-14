import { Draft, mid, seriesTone, widest } from "./mermaid-scene";
import type { Ctx, Pt, Scene } from "./mermaid-scene";
import { unquote } from "./mermaid-source";
import { clipCells } from "./svg-text";

type Side = "T" | "B" | "L" | "R";
type Node = { id: string; label: string; icon: string; group: string; isJunction: boolean };
type Group = { id: string; label: string; parent: string };
type Edge = { from: string; to: string; fromSide: Side; toSide: Side; hasStart: boolean; hasEnd: boolean };

export type Architecture = { title: string; groups: Group[]; nodes: Node[]; edges: Edge[] };

const MAX_NODES = 40;
const MAX_LABEL = 22;
const NODE_HEIGHT = 4;
const GAP_X = 10;
const GAP_Y = 5;
const PAD_X = 3;
const PAD_TOP = 3;
const PAD_BOTTOM = 1;
const DIRECTION: Record<Side, Pt> = { T: { x: 0, y: -1 }, B: { x: 0, y: 1 }, L: { x: -1, y: 0 }, R: { x: 1, y: 0 } };

const DECLARATION = /^(group|service)\s+([\w-]+)(?:\(([^)]*)\))?(?:\[([^\]]*)\])?(?:\s+in\s+([\w-]+))?$/i;
const JUNCTION = /^junction\s+([\w-]+)(?:\s+in\s+([\w-]+))?$/i;
const EDGE = /^([\w-]+)(?:\{group\})?:([TBLR])\s*(<)?--(>)?\s*([TBLR]):([\w-]+)(?:\{group\})?$/;

// An `architecture` diagram read well enough to draw: groups, services and junctions, and the edges between the sides
// of them. Null for a group, service or edge that names one not declared.
export function parseArchitecture(lines: readonly string[]): Architecture | null {
  if (!/^architecture(-beta)?$/i.test(lines[0] ?? "")) {
    return null;
  }

  const diagram: Architecture = { title: "", groups: [], nodes: [], edges: [] };

  for (const line of lines.slice(1)) {
    const declaration = DECLARATION.exec(line);
    const junction = JUNCTION.exec(line);
    const edge = EDGE.exec(line);

    if (declaration !== null) {
      const [, kind = "", id = "", icon = "", label = "", parent = ""] = declaration;

      if (kind.toLowerCase() === "group") {
        diagram.groups.push({ id, label: unquote(label || id), parent });
      } else {
        diagram.nodes.push({ id, label: unquote(label || id), icon, group: parent, isJunction: false });
      }
    } else if (junction !== null) {
      diagram.nodes.push({ id: junction[1]!, label: "", icon: "", group: junction[2] ?? "", isJunction: true });
    } else if (edge !== null) {
      diagram.edges.push({
        from: edge[1]!,
        to: edge[6]!,
        fromSide: edge[2] as Side,
        toSide: edge[5] as Side,
        hasStart: edge[3] !== undefined,
        hasEnd: edge[4] !== undefined,
      });
    } else if (!/^(accTitle|accDescr|title)\b/i.test(line)) {
      return null;
    }
  }

  const ids = new Set(diagram.nodes.map(({ id }) => id));
  const groups = new Set(diagram.groups.map(({ id }) => id));
  const isKnown =
    diagram.edges.every(({ from, to }) => ids.has(from) && ids.has(to)) &&
    diagram.nodes.every(({ group }) => group === "" || groups.has(group)) &&
    diagram.groups.every(({ parent }) => parent === "" || groups.has(parent));

  return isKnown && diagram.nodes.length > 0 && diagram.nodes.length <= MAX_NODES ? diagram : null;
}

type Rect = { x: number; y: number; w: number; h: number };

// Where each node sits on a grid: the first at the origin and each one joined to a placed node on the side its edge
// leaves from, or the next free cell along that side.
function gridOf({ nodes, edges }: Architecture): Map<string, Pt> {
  const at = new Map<string, Pt>();
  const taken = (p: Pt) => [...at.values()].some((other) => other.x === p.x && other.y === p.y);
  const put = (id: string, from: Pt, side: Side) => {
    const step = DIRECTION[side];
    let spot = { x: from.x + step.x, y: from.y + step.y };

    while (taken(spot)) {
      spot = { x: spot.x + step.x, y: spot.y + step.y };
    }

    at.set(id, spot);
  };

  // Nodes with no edge to a placed one start a new group of their own, to the right of everything placed so far.
  for (const node of nodes) {
    if (!at.has(node.id)) {
      at.set(node.id, { x: Math.max(-1, ...[...at.values()].map(({ x }) => x)) + 1, y: 0 });
    }

    for (let pass = 0; pass < nodes.length; pass++) {
      for (const { from, to, fromSide, toSide } of edges) {
        const a = at.get(from);
        const b = at.get(to);

        if (a !== undefined && b === undefined) {
          put(to, a, fromSide);
        } else if (b !== undefined && a === undefined) {
          put(from, b, toSide);
        }
      }
    }
  }

  const left = Math.min(...[...at.values()].map(({ x }) => x));
  const top = Math.min(...[...at.values()].map(({ y }) => y));

  return new Map([...at].map(([id, { x, y }]) => [id, { x: x - left, y: y - top }]));
}

export function architectureScene(diagram: Architecture, ctx: Ctx): Scene | null {
  const { groups, nodes, edges } = diagram;
  const grid = gridOf(diagram);
  // Every service is as wide as the widest, so edges between them run straight. The width is odd, so there is a middle
  // cell for an edge to meet and the label to centre on.
  const wanted = Math.max(
    10,
    ...nodes
      .filter(({ isJunction }) => !isJunction)
      .map((node) => widest([clipCells(node.label, MAX_LABEL), node.icon]) + 4),
  );
  const width = wanted % 2 === 0 ? wanted + 1 : wanted;
  const sizes = new Map(
    nodes.map((node) => [node.id, { w: node.isJunction ? 1 : width, h: node.isJunction ? 1 : NODE_HEIGHT }] as const),
  );
  const depth = (id: string): number => {
    const group = groups.find((candidate) => candidate.id === id);

    return group === undefined || group.parent === "" ? 0 : 1 + depth(group.parent);
  };
  const levels = Math.max(0, ...groups.map(({ id }) => depth(id))) + 1;
  const columns = Math.max(...[...sizes.values()].map(({ w }) => w)) + GAP_X + 2 * PAD_X * (levels - 1);
  const rows = NODE_HEIGHT + GAP_Y + (PAD_TOP + PAD_BOTTOM) * (levels - 1);
  const margin = { x: PAD_X * levels, y: PAD_TOP * levels };
  const rects = new Map<string, Rect>();

  for (const node of nodes) {
    const { w, h } = sizes.get(node.id)!;
    const cell = grid.get(node.id)!;

    rects.set(node.id, {
      x: margin.x + cell.x * columns + Math.floor((columns - w) / 2),
      y: margin.y + cell.y * rows + Math.floor((rows - h) / 2),
      w,
      h,
    });
  }

  const d = new Draft();
  const ordered = [...groups].sort((a, b) => depth(a.id) - depth(b.id));

  // A group is the box around what it holds, a group inside it included, so the deepest are measured first.
  for (const group of [...ordered].reverse()) {
    const inside = [
      ...nodes.filter(({ group: parent }) => parent === group.id).map((node) => rects.get(node.id)!),
      ...groups.filter(({ parent }) => parent === group.id).flatMap((child) => rects.get(`group:${child.id}`) ?? []),
    ];

    if (inside.length > 0) {
      const x0 = Math.min(...inside.map(({ x }) => x)) - PAD_X;
      const y0 = Math.min(...inside.map(({ y }) => y)) - PAD_TOP;

      rects.set(`group:${group.id}`, {
        x: x0,
        y: y0,
        w: Math.max(...inside.map(({ x, w }) => x + w)) + PAD_X - x0,
        h: Math.max(...inside.map(({ y, h }) => y + h)) + PAD_BOTTOM - y0,
      });
    }
  }

  for (const group of ordered) {
    const rect = rects.get(`group:${group.id}`);

    if (rect !== undefined) {
      d.rect(rect.x, rect.y, rect.w, rect.h, { stroke: "subtle", round: true });
      d.text(rect.x + 2, rect.y + 1, clipCells(group.label, rect.w - 4), seriesTone(groups.indexOf(group)), {
        bold: true,
      });
    }
  }

  for (const node of nodes) {
    const rect = rects.get(node.id)!;

    if (node.isJunction) {
      d.dot(rect.x + 0.5, rect.y + 0.5, "inactive");
      continue;
    }

    d.rect(rect.x, rect.y, rect.w, rect.h, { stroke: "suggestion", round: true });
    d.text(rect.x + rect.w / 2, rect.y + 1, clipCells(node.label, rect.w - 2), "text", {
      anchor: "middle",
      bold: true,
    });
    d.text(rect.x + rect.w / 2, rect.y + 2, node.icon, "inactive", { anchor: "middle" });
  }

  for (const edge of edges) {
    const path = pathOf(rects.get(edge.from)!, edge.fromSide, rects.get(edge.to)!, edge.toSide);

    d.line(path, "inactive", { arrow: edge.hasEnd });

    if (edge.hasStart) {
      d.line([path[1]!, path[0]!], "inactive", { arrow: true });
    }
  }

  return d.finish(
    `Architecture diagram: ${nodes.map(({ label, id }) => label || id).join(", ")}${edges.map(({ from, to }) => `; ${from} to ${to}`).join("")}`,
    ctx,
  );
}

// The middle of a side of a box, on the cells of its border.
const borderOf = (rect: Rect, side: Side): Pt => {
  const cx = mid(rect.x + Math.floor(rect.w / 2));
  const cy = mid(rect.y + Math.floor(rect.h / 2));

  return side === "L"
    ? { x: rect.x + 0.5, y: cy }
    : side === "R"
      ? { x: rect.x + rect.w - 0.5, y: cy }
      : side === "T"
        ? { x: cx, y: rect.y + 0.5 }
        : { x: cx, y: rect.y + rect.h - 0.5 };
};

// An edge from one side of a box to a side of another that turns only at right angles: a step out of each side, and the
// corner between the two steps.
function pathOf(a: Rect, aSide: Side, b: Rect, bSide: Side): Pt[] {
  const from = borderOf(a, aSide);
  const to = borderOf(b, bSide);
  const out = DIRECTION[aSide];
  const into = DIRECTION[bSide];
  const first = { x: from.x + out.x, y: from.y + out.y };
  const last = { x: to.x + into.x, y: to.y + into.y };
  const corner: Pt = out.x !== 0 ? { x: last.x, y: first.y } : { x: first.x, y: last.y };

  return [from, first, corner, last, to].filter(
    (p, i, all) => i === 0 || p.x !== all[i - 1]!.x || p.y !== all[i - 1]!.y,
  );
}
