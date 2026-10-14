import { gridCell, gridScene } from "./mermaid-grid";
import type { GridCell, GridLine } from "./mermaid-grid";
import { layered } from "./mermaid-layout";
import type { Direction } from "./mermaid-layout";
import { Draft, elbow, widest, wrapCells } from "./mermaid-scene";
import type { Ctx, Pt, Scene } from "./mermaid-scene";
import { unquote } from "./mermaid-source";
import type { Tone } from "./palette";
import { clipCells } from "./svg-text";

// `order` is where the element or boundary came in the source, which is the order a grid lays them out in.
type Element = {
  id: string;
  label: string;
  chip: string;
  description: string;
  tone: Tone;
  boundary: string;
  order: number;
};
type Boundary = { id: string; label: string; parent: string; order: number };
type Rel = { from: string; to: string; label: string; hasStart: boolean };

export type C4 = {
  title: string;
  isDynamic: boolean;
  shapesInRow: number;
  elements: Element[];
  boundaries: Boundary[];
  rels: Rel[];
};

const MAX_ELEMENTS = 30;
const MAX_TEXT = 30;
const MAX_LINES = 4;
const MAX_LABEL = 40;
const GAP = 5;
const SHAPES_IN_ROW = 4;

const HEAD = /^C4(Context|Container|Component|Dynamic|Deployment)$/i;
const CALL = /^(\w+)\s*\((.*)\)\s*(\{)?$/s;
const KINDS = {
  Person: "Person",
  System: "Software System",
  Container: "Container",
  Component: "Component",
  Node: "Deployment Node",
};
const TONES: Record<keyof typeof KINDS, Tone> = {
  Person: "accent",
  System: "suggestion",
  Container: "planMode",
  Component: "autoAccept",
  Node: "subtle",
};
const BOUNDARIES = /^(Boundary|Enterprise_Boundary|System_Boundary|Container_Boundary)$/;
const NAMED = ["descr", "techn", "type", "label", "tags", "link", "sprite", "c4ShapeInRow", "c4BoundaryInRow"];

// The arguments of a call, split at the commas outside quotes and brackets, each without its quotes. An argument written
// `$name="text"` is named, and the rest are in order.
function argsOf(text: string): { positional: string[]; named: Record<string, string> } {
  const parts: string[] = [];
  let part = "";
  let depth = 0;
  let isQuoted = false;

  for (const char of text) {
    isQuoted = char === '"' ? !isQuoted : isQuoted;
    depth += isQuoted ? 0 : "([{".includes(char) ? 1 : ")]}".includes(char) ? -1 : 0;

    if (char === "," && depth === 0 && !isQuoted) {
      parts.push(part);
      part = "";
    } else {
      part += char;
    }
  }

  const all = [...parts, part].map((entry) => entry.trim());
  const named: Record<string, string> = {};
  const positional: string[] = [];

  for (const entry of all) {
    const pair = /^\$(\w+)\s*=\s*(.*)$/s.exec(entry);

    if (pair !== null && NAMED.includes(pair[1]!)) {
      named[pair[1]!] = unquote(pair[2]!);
    } else if (pair === null) {
      positional.push(unquote(entry));
    }
  }

  return { positional, named };
}

// A `C4Context`, `C4Container`, `C4Component`, `C4Dynamic` or `C4Deployment` diagram read well enough to draw: elements,
// boundaries around them and the relations between them. Null for a relation to an element that is not there.
export function parseC4(lines: readonly string[]): C4 | null {
  const head = HEAD.exec(lines[0] ?? "");

  if (head === null) {
    return null;
  }

  const diagram: C4 = {
    title: "",
    isDynamic: head[1]!.toLowerCase() === "dynamic",
    shapesInRow: SHAPES_IN_ROW,
    elements: [],
    boundaries: [],
    rels: [],
  };
  const open: string[] = [];
  let isPending = false;
  let order = 0;

  for (const line of lines.slice(1)) {
    const title = /^title\s+(.*)$/i.exec(line);
    const call = CALL.exec(line);

    if (title !== null) {
      diagram.title = unquote(title[1]!);
    } else if (line === "{" && isPending) {
      isPending = false;
    } else if (line === "}") {
      open.pop();
    } else if (call !== null) {
      const [, name = "", rest = "", brace] = call;
      const { positional: p, named } = argsOf(rest);
      const at = (i: number, key: string) => named[key] ?? p[i] ?? "";
      const base = /^(Person|System|Container|Component|Deployment_Node|Node)/.exec(name)?.[1];
      const kind = (base === "Deployment_Node" ? "Node" : base) as keyof typeof KINDS | undefined;

      if (BOUNDARIES.test(name) || name === "Deployment_Node" || (kind === "Node" && brace !== undefined)) {
        diagram.boundaries.push({ id: p[0] ?? "", label: at(1, "label"), parent: open.at(-1) ?? "", order: order++ });
        open.push(p[0] ?? "");
        isPending = brace === undefined;
      } else if (kind !== undefined && p.length >= 2) {
        const hasTech = kind === "Container" || kind === "Component" || kind === "Node";
        const tech = hasTech ? at(2, kind === "Node" ? "type" : "techn") : "";
        const description = at(hasTech ? 3 : 2, "descr");
        const flavour = /Db/.test(name) ? " (Database)" : /Queue/.test(name) ? " (Queue)" : "";
        const external = /_Ext$/.test(name);

        diagram.elements.push({
          id: p[0]!,
          label: at(1, "label"),
          chip: `[${external ? "External " : ""}${KINDS[kind]}${flavour}${tech === "" ? "" : `: ${tech}`}]`,
          description,
          tone: external ? "inactive" : TONES[kind],
          boundary: open.at(-1) ?? "",
          order: order++,
        });
      } else if (/^(Rel|BiRel|RelIndex)/.test(name) || /^Rel_/.test(name)) {
        const offset = name === "RelIndex" ? 1 : 0;
        const [from = "", to = ""] = [p[offset], p[offset + 1]];
        const label = named.label ?? p[offset + 2] ?? "";
        const tech = named.techn ?? p[offset + 3] ?? "";
        const isBack = name === "Rel_Back";

        diagram.rels.push({
          from: isBack ? to : from,
          to: isBack ? from : to,
          label: `${label}${tech === "" ? "" : ` [${tech}]`}`,
          hasStart: name === "BiRel",
        });
      } else if (name === "UpdateLayoutConfig") {
        const perRow = Number(at(0, "c4ShapeInRow"));

        diagram.shapesInRow = perRow >= 1 ? Math.floor(perRow) : SHAPES_IN_ROW;
      } else if (!/^(UpdateElementStyle|UpdateRelStyle|AddElementTag|AddRelTag)$/.test(name)) {
        return null;
      }
    } else if (!/^(accTitle|accDescr)\b/i.test(line)) {
      return null;
    }
  }

  const ids = new Set(diagram.elements.map(({ id }) => id));

  return diagram.elements.length === 0 ||
    diagram.elements.length > MAX_ELEMENTS ||
    !diagram.rels.every(({ from, to }) => ids.has(from) && ids.has(to))
    ? null
    : diagram;
}

type Box = { x: number; y: number; w: number; h: number };

// What an element says: its kind, its name and what it does.
const linesOf = ({ chip, label, description }: Element): GridLine[] => [
  { text: chip, tone: "inactive" },
  { text: clipCells(label, MAX_TEXT), bold: true },
  ...(description === "" ? [] : wrapCells(description, MAX_TEXT, MAX_LINES)).map((text): GridLine => ({
    text,
    tone: "inactive",
  })),
];

const altOf = ({ title, elements, rels }: C4): string =>
  `C4 diagram${title === "" ? "" : ` ${title}`}: ${elements.map(({ label }) => label).join(", ")}${rels.map(({ from, to, label }) => `; ${from} to ${to} ${label}`).join("")}`;

// The diagram as a grid in the order of the source, as many shapes in a row as fit, with a box around each boundary.
function gridded(diagram: C4, ctx: Ctx): Scene | null {
  for (let perRow = diagram.shapesInRow; perRow >= 1; perRow--) {
    const build = (parent: string): GridCell => {
      const children = [
        ...diagram.elements
          .filter(({ boundary }) => boundary === parent)
          .map((element) => ({
            order: element.order,
            cell: gridCell({ id: element.id, lines: linesOf(element), tone: element.tone, isRound: true }),
          })),
        ...diagram.boundaries
          .filter((boundary) => boundary.parent === parent)
          .map((boundary) => ({ order: boundary.order, inner: build(boundary.id), boundary }))
          .filter(({ inner }) => inner.children.length > 0)
          .map(({ order, inner, boundary }) => ({
            order,
            cell: { ...inner, id: boundary.id, title: boundary.label, span: inner.columns },
          })),
      ]
        .sort((a, b) => a.order - b.order)
        .map(({ cell }) => cell);

      return gridCell({ id: parent, isBlock: true, columns: Math.min(perRow, Math.max(1, children.length)), children });
    };
    const scene = gridScene(
      build(""),
      diagram.rels.map((rel, i) => ({
        ...rel,
        label: `${diagram.isDynamic ? `${i + 1}. ` : ""}${clipCells(rel.label, MAX_LABEL)}`,
      })),
      ctx,
      { title: diagram.title, alt: altOf(diagram) },
    );

    if (scene !== null) {
      return scene;
    }
  }

  return null;
}

function drawn(diagram: C4, direction: Direction, ctx: Ctx): Scene | null {
  const { elements, rels } = diagram;
  const lines = new Map(elements.map((element) => [element.id, linesOf(element).map(({ text }) => text)]));
  // Left to right, a relation's label sits in the gap between ranks, so the gap is as wide as the longest label.
  const label = (rel: Rel, i: number) => clipCells(`${diagram.isDynamic ? `${i + 1}. ` : ""}${rel.label}`, MAX_LABEL);
  const rank = direction === "right" ? Math.max(GAP, widest(rels.map(label)) + 2) : GAP;
  const layout = layered(
    elements.map(({ id }) => ({ id, w: Math.max(18, widest(lines.get(id)!) + 4), h: lines.get(id)!.length + 2 })),
    rels.map((rel, i) => ({ ...rel, index: i })),
    direction,
    { sibling: GAP + 2, rank },
  );
  const d = new Draft();
  const top = d.heading(diagram.title);
  const left = Math.min(...layout.nodes.map(({ x }) => x));
  const above = Math.min(...layout.nodes.map(({ y }) => y));
  const lift = (p: Pt): Pt => ({ x: p.x - left, y: p.y - above + top });
  const boxes = new Map(
    layout.nodes.map((node): [string, Box] => [
      node.id,
      { x: Math.round(node.x - left), y: Math.round(node.y - above) + top, w: node.w, h: node.h },
    ]),
  );
  const isDown = direction === "down";

  for (const element of elements) {
    const box = boxes.get(element.id)!;

    d.rect(box.x, box.y, box.w, box.h, { stroke: element.tone, round: true });
    linesOf(element).forEach(({ text, tone, bold }, i) =>
      d.text(box.x + box.w / 2, box.y + 1 + i, text, tone ?? "text", { anchor: "middle", bold }),
    );
  }

  layout.routes.forEach((route) => {
    const rel = route.edge as Rel & { index: number };
    const from = boxes.get(rel.from)!;
    const to = boxes.get(rel.to)!;
    const [first, ...rest] = route.points.map(lift);
    const last = rest.at(-1)!;
    const start: Pt = isDown ? { x: first!.x, y: from.y + from.h - 0.5 } : { x: from.x + from.w - 0.5, y: first!.y };
    const end: Pt = isDown ? { x: last.x, y: to.y + 0.5 } : { x: to.x + 0.5, y: last.y };
    const path = elbow([start, ...rest.slice(0, -1), end], isDown);

    d.line(path, "inactive", { arrow: true });

    if (rel.hasStart) {
      d.line([path[1]!, path[0]!], "inactive", { arrow: true });
    }

    const text = label(rel, rel.index);

    if (text !== "") {
      const segments = path.slice(1).map((to2, i) => ({ a: path[i]!, b: to2 }));
      const best = segments.reduce((long, seg) =>
        Math.abs(seg.b.x - seg.a.x) + Math.abs(seg.b.y - seg.a.y) >
        Math.abs(long.b.x - long.a.x) + Math.abs(long.b.y - long.a.y)
          ? seg
          : long,
      );
      const isAcross = best.a.y === best.b.y;

      d.text(
        isAcross ? (best.a.x + best.b.x) / 2 : best.a.x + 1.5,
        Math.floor(isAcross ? best.a.y - 1 : (best.a.y + best.b.y) / 2),
        text,
        "inactive",
        { anchor: isAcross ? "middle" : "start" },
      );
    }
  });

  return d.finish(altOf(diagram), ctx);
}

// A diagram with boundaries is a grid, as Mermaid draws it, since ranks cannot keep a boundary's members together. One
// without is laid out in ranks, left to right or top to bottom, whichever takes the fewer cells where both fit, and is
// a grid only where it is too wide for that.
export function c4Scene(diagram: C4, ctx: Ctx): Scene | null {
  const scenes =
    diagram.boundaries.length > 0
      ? []
      : (["right", "down"] as const)
          .map((direction) => drawn(diagram, direction, ctx))
          .filter((scene): scene is Scene => scene !== null);

  return scenes.length === 0
    ? gridded(diagram, ctx)
    : scenes.reduce((small, scene) => (scene.width * scene.height < small.width * small.height ? scene : small));
}
