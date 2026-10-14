import type { Palette } from "../types";
import {
  boxPaint,
  centredText,
  DASHED,
  DETAIL,
  directionOf,
  EDGE_WIDTH,
  endText,
  finish,
  LABEL,
  labelSvg,
  layered,
  lineSvg,
  markerAttribute,
  markerDef,
  markerLength,
  rectSvg,
  reversed,
  strokeSvg,
  TEXT,
  textSvg,
  trimmed,
} from "./mermaid-layout";
import type { Direction, GraphEdge, GraphNode, MarkerKind } from "./mermaid-layout";
import { sourceLines } from "./mermaid-source";
import type { Font, Sketch } from "./picture";
import { CELL_WIDTH } from "./picture";
import { measure } from "./svg-text";

const ROW = 40;
const PAD = 24;
const MIN_WIDTH = 150;
const MAX_CLASSES = 30;
const MAX_MEMBERS = 12;

type ClassBox = { id: string; label: string; annotation: string; fields: string[]; methods: string[] };
type Relation = GraphEdge & {
  label: string;
  fromCount: string;
  toCount: string;
  marker: { at: "from" | "to"; kind: MarkerKind } | null;
  isDashed: boolean;
};
type ClassDiagram = { direction: Direction; classes: ClassBox[]; relations: Relation[] };

const ARROWS: Record<string, { at: "from" | "to"; kind: MarkerKind } | null> = {
  "<|--": { at: "from", kind: "triangle" },
  "*--": { at: "from", kind: "diamondFilled" },
  "o--": { at: "from", kind: "diamond" },
  "<--": { at: "from", kind: "open" },
  "--|>": { at: "to", kind: "triangle" },
  "--*": { at: "to", kind: "diamondFilled" },
  "--o": { at: "to", kind: "diamond" },
  "-->": { at: "to", kind: "open" },
  "..|>": { at: "to", kind: "triangle" },
  "<|..": { at: "from", kind: "triangle" },
  "..>": { at: "to", kind: "open" },
  "<..": { at: "from", kind: "open" },
  "--": null,
  "..": null,
};

const ID = String.raw`[\w~.]+`;
const RELATION = new RegExp(
  String.raw`^(${ID})\s*(?:"([^"]*)"\s*)?(<\|--|\*--|o--|<--|--\|>|--\*|--o|-->|\.\.\|>|<\|\.\.|\.\.>|<\.\.|--|\.\.)\s*(?:"([^"]*)"\s*)?(${ID})(?:\s*:\s*(.*))?$`,
);
const OPEN = new RegExp(String.raw`^class\s+(${ID})\s*(?:\{\s*)?$`);
const ANNOTATION = /^<<\s*(.*?)\s*>>$/;

// Generics are written `List~int~` and drawn `List<int>`.
const generic = (text: string): string => text.replace(/~([^~]*)~/g, "<$1>").trim();

// A `classDiagram` read well enough to draw. Null for namespaces and anything else this does not read, so the diagram
// is left to the text renderer.
export function parseClass(source: string): ClassDiagram | null {
  const lines = sourceLines(source);

  if (!/^classDiagram(-v2)?$/.test(lines[0] ?? "")) {
    return null;
  }

  const classes = new Map<string, ClassBox>();
  const relations: Relation[] = [];
  let direction: Direction = "down";
  let inside: ClassBox | null = null;

  const meet = (id: string): ClassBox => {
    if (!classes.has(id)) {
      classes.set(id, { id, label: generic(id), annotation: "", fields: [], methods: [] });
    }

    return classes.get(id)!;
  };

  const add = (box: ClassBox, text: string) => {
    const annotation = ANNOTATION.exec(text);

    if (annotation !== null) {
      box.annotation = `<<${annotation[1]}>>`;
    } else if (text.includes("(")) {
      box.methods.push(generic(text));
    } else if (text !== "") {
      box.fields.push(generic(text));
    }
  };

  for (const line of lines.slice(1)) {
    if (inside !== null) {
      if (line === "}") {
        inside = null;
      } else {
        add(inside, line);
      }

      continue;
    }

    const relation = RELATION.exec(line);
    const open = OPEN.exec(line);

    if (/^direction\s/.test(line)) {
      direction = directionOf(line);
    } else if (relation !== null) {
      const [, from = "", fromCount = "", arrow = "", toCount = "", to = "", label = ""] = relation;

      meet(from);
      meet(to);
      relations.push({
        from,
        to,
        label: generic(label),
        fromCount,
        toCount,
        marker: ARROWS[arrow] ?? null,
        isDashed: arrow.includes("."),
      });
    } else if (open !== null) {
      const box = meet(open[1]!);

      inside = line.endsWith("{") ? box : null;
    } else if (/^[\w~.]+\s*:/.test(line)) {
      add(meet(line.slice(0, line.indexOf(":")).trim()), line.slice(line.indexOf(":") + 1).trim());
    } else if (!/^note\b/i.test(line)) {
      return null;
    }
  }

  if (inside !== null || classes.size === 0 || classes.size > MAX_CLASSES) {
    return null;
  }

  return { direction, classes: [...classes.values()], relations };
}

type Sized = { box: ClassBox; fields: string[]; methods: string[]; node: GraphNode; head: number };

const clip = (members: readonly string[]): string[] =>
  members.length <= MAX_MEMBERS ? [...members] : [...members.slice(0, MAX_MEMBERS - 1), "…"];

function sizeOf(box: ClassBox): Sized {
  const fields = clip(box.fields);
  const methods = clip(box.methods);
  const head = (box.annotation === "" ? 0 : 32) + 60;
  const section = (rows: readonly string[]) => (rows.length === 0 ? 0 : rows.length * ROW + 16);
  const hasBody = fields.length + methods.length > 0;
  const w = Math.max(
    MIN_WIDTH,
    measure(box.label, TEXT) + 2 * PAD,
    ...[...fields, ...methods].map((row) => measure(row, LABEL) + 2 * PAD),
    box.annotation === "" ? 0 : measure(box.annotation, DETAIL) + 2 * PAD,
  );
  const h = head + (hasBody ? Math.max(section(fields), 16) + Math.max(section(methods), 16) : 0);

  return { box, fields, methods, head, node: { id: box.id, w: Math.ceil(w / 10) * 10, h } };
}

// A class diagram as a picture, or null where it does not fit `available` columns.
export function classSketch(diagram: ClassDiagram, available: number, palette: Palette, font: Font): Sketch | null {
  const sized = diagram.classes.map(sizeOf);
  const layout = layered(
    sized.map(({ node }) => node),
    diagram.relations,
    diagram.direction,
    {
      sibling: 3 * CELL_WIDTH,
      rank: diagram.direction === "down" ? 3 * font.cellHeight : 10 * CELL_WIDTH,
      labelSize: LABEL,
    },
  );
  const byId = new Map(sized.map((item) => [item.box.id, item]));
  const kinds = new Set<MarkerKind>();
  const edges = layout.routes
    .map((route) => {
      const relation = route.edge as Relation;
      const { marker } = relation;
      const dash = relation.isDashed ? DASHED : "";
      const walk = marker?.at === "from" ? reversed(route) : route;
      const length = marker === null ? 0 : markerLength(marker.kind);
      const counts =
        marker?.at === "from" ? [relation.toCount, relation.fromCount] : [relation.fromCount, relation.toCount];

      if (marker !== null) {
        kinds.add(marker.kind);
      }

      return (
        strokeSvg(
          trimmed(walk, 0, length),
          palette.inactive,
          EDGE_WIDTH,
          dash + (marker === null ? "" : markerAttribute(marker.kind)),
        ) +
        endText(walk.points[0]!, walk.startDir, 34, counts[0]!, DETAIL, palette.inactive) +
        endText(
          walk.points.at(-1)!,
          { x: -walk.endDir.x, y: -walk.endDir.y },
          34,
          counts[1]!,
          DETAIL,
          palette.inactive,
        ) +
        labelSvg(route, relation.label, LABEL, palette.inactive)
      );
    })
    .join("");
  const nodes = layout.nodes
    .map(({ id, x, y, w, h }) => {
      const { box, fields, methods, head } = byId.get(id)!;
      const top = box.annotation === "" ? 0 : 32;
      const rows = (members: readonly string[], from: number) =>
        members
          .map((row, n) =>
            textSvg(x + PAD, y + from + 8 + n * ROW + ROW / 2 + LABEL * 0.35, row, LABEL, palette.text, "start"),
          )
          .join("");
      const fieldsHeight = fields.length === 0 ? 16 : fields.length * ROW + 16;
      const hasBody = fields.length + methods.length > 0;

      return (
        rectSvg(x + 1.25, y + 1.25, w - 2.5, h - 2.5, 10, boxPaint(palette.accent, EDGE_WIDTH)) +
        (box.annotation === "" ? "" : centredText(x + w / 2, y + 24, box.annotation, DETAIL, palette.inactive)) +
        centredText(x + w / 2, y + top + 30, box.label, TEXT, palette.text, ` font-weight="bold"`) +
        (hasBody
          ? lineSvg({ x: x + 1.25, y: y + head }, { x: x + w - 1.25, y: y + head }, palette.accent, 1.5) +
            lineSvg(
              { x: x + 1.25, y: y + head + fieldsHeight },
              { x: x + w - 1.25, y: y + head + fieldsHeight },
              palette.accent,
              1.5,
            ) +
            rows(fields, head) +
            rows(methods, head + fieldsHeight)
          : "")
      );
    })
    .join("");
  const defs = [...kinds].map((kind) => markerDef(kind, palette.inactive)).join("");

  return finish(
    `<defs>${defs}</defs>${edges}${nodes}`,
    layout.width,
    layout.height,
    available,
    font,
    diagram.relations.map(({ from, to, label }) => `${from} -> ${to}${label === "" ? "" : ` (${label})`}`).join("\n"),
  );
}
