import type { Palette } from "../types";
import {
  boxPaint,
  centredText,
  DASHED,
  directionOf,
  EDGE_WIDTH,
  finish,
  LABEL,
  labelSvg,
  layered,
  lineSvg,
  rectSvg,
  strokeSvg,
  TEXT,
  textSvg,
  trimmed,
} from "./mermaid-layout";
import type { Direction, GraphEdge, GraphNode, Point, Route } from "./mermaid-layout";
import { sourceLines } from "./mermaid-source";
import type { Font, Sketch } from "./picture";
import { CELL_WIDTH } from "./picture";
import { measure } from "./svg-text";

const ROW = 40;
const HEAD = 60;
const PAD = 20;
const COLUMN_GAP = 24;
const MIN_WIDTH = 150;
const SYMBOL_WIDTH = 2;
const MAX_ENTITIES = 30;
const MAX_ATTRIBUTES = 14;

type Cardinality = "one" | "zeroOne" | "many" | "zeroMany";
type Attribute = { type: string; name: string; keys: string };
type Entity = { id: string; label: string; attributes: Attribute[] };
type Relationship = GraphEdge & {
  label: string;
  fromCardinality: Cardinality;
  toCardinality: Cardinality;
  isDashed: boolean;
};
type ErDiagram = { direction: Direction; entities: Entity[]; relationships: Relationship[] };

const LEFT: Record<string, Cardinality> = { "||": "one", "|o": "zeroOne", "}|": "many", "}o": "zeroMany" };
const RIGHT: Record<string, Cardinality> = { "||": "one", "o|": "zeroOne", "|{": "many", "o{": "zeroMany" };

const NAME = String.raw`[\w-]+(?:\[[^\]]*\])?`;
const RELATIONSHIP = new RegExp(
  String.raw`^(${NAME})\s+(\|\||\|o|\}\||\}o)(--|\.\.)(\|\||o\||\|\{|o\{)\s+(${NAME})\s*:\s*(.*)$`,
);
const OPEN = new RegExp(String.raw`^(${NAME})\s*\{$`);
const ATTRIBUTE = /^(\S+)\s+(\S+)(?:\s+((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*))?(?:\s+"[^"]*")?$/;

// An `erDiagram` read well enough to draw. Null for anything else this does not read, so the diagram is left to the
// text renderer.
export function parseEr(source: string): ErDiagram | null {
  const lines = sourceLines(source);

  if (lines[0] !== "erDiagram") {
    return null;
  }

  const entities = new Map<string, Entity>();
  const relationships: Relationship[] = [];
  let direction: Direction = "down";
  let inside: Entity | null = null;

  const meet = (written: string): Entity => {
    const [id = "", alias] = written.split("[");
    const label = alias === undefined ? id : alias.replace(/\]$/, "").replace(/^"(.*)"$/, "$1");

    if (!entities.has(id)) {
      entities.set(id, { id, label, attributes: [] });
    } else if (alias !== undefined) {
      entities.get(id)!.label = label;
    }

    return entities.get(id)!;
  };

  for (const line of lines.slice(1)) {
    if (inside !== null) {
      const attribute = ATTRIBUTE.exec(line);

      if (line === "}") {
        inside = null;
      } else if (attribute === null) {
        return null;
      } else {
        inside.attributes.push({
          type: attribute[1]!,
          name: attribute[2]!,
          keys: (attribute[3] ?? "").replace(/\s+/g, ""),
        });
      }

      continue;
    }

    const relationship = RELATIONSHIP.exec(line);
    const open = OPEN.exec(line);

    if (/^direction\s/.test(line)) {
      direction = directionOf(line);
    } else if (relationship !== null) {
      const [, from = "", left = "", dash = "", right = "", to = "", label = ""] = relationship;

      relationships.push({
        from: meet(from).id,
        to: meet(to).id,
        label: label.trim().replace(/^"(.*)"$/, "$1"),
        fromCardinality: LEFT[left]!,
        toCardinality: RIGHT[right]!,
        isDashed: dash === "..",
      });
    } else if (open !== null) {
      inside = meet(open[1]!);
    } else if (/^[\w-]+(\[[^\]]*\])?$/.test(line)) {
      meet(line);
    } else {
      return null;
    }
  }

  if (inside !== null || entities.size === 0 || entities.size > MAX_ENTITIES) {
    return null;
  }

  return { direction, entities: [...entities.values()], relationships };
}

type Sized = { entity: Entity; attributes: Attribute[]; columns: number[]; node: GraphNode };

function sizeOf(entity: Entity): Sized {
  const attributes =
    entity.attributes.length <= MAX_ATTRIBUTES
      ? entity.attributes
      : [...entity.attributes.slice(0, MAX_ATTRIBUTES - 1), { type: "…", name: "", keys: "" }];
  const columns = (["type", "name", "keys"] as const).map((field) =>
    Math.max(0, ...attributes.map((attribute) => measure(attribute[field], LABEL))),
  );
  const used = columns.filter((width) => width > 0);
  const body = used.reduce((sum, width) => sum + width, 0) + COLUMN_GAP * Math.max(0, used.length - 1);
  const w = Math.max(MIN_WIDTH, measure(entity.label, TEXT) + 2 * PAD, body + 2 * PAD);
  const h = HEAD + (attributes.length === 0 ? 0 : attributes.length * ROW + 16);

  return { entity, attributes, columns, node: { id: entity.id, w: Math.ceil(w / 10) * 10, h } };
}

// The mark for a cardinality at the end of a relationship, drawn from the node border out along `dir`, and how far out it
// reaches. The route is drawn from there.
function symbol(kind: Cardinality, at: Point, dir: Point, color: string): { svg: string; length: number } {
  const side = { x: -dir.y, y: dir.x };
  const point = (along: number, across = 0): Point => ({
    x: at.x + dir.x * along + side.x * across,
    y: at.y + dir.y * along + side.y * across,
  });
  const bar = (along: number) => lineSvg(point(along, -10), point(along, 10), color, SYMBOL_WIDTH);
  const stub = (to: number) => lineSvg(point(0), point(to), color, SYMBOL_WIDTH);
  const foot = (apex: number) =>
    lineSvg(point(apex), point(0, -12), color, SYMBOL_WIDTH) + lineSvg(point(apex), point(0, 12), color, SYMBOL_WIDTH);
  const ring = (along: number) => {
    const c = point(along);

    return `<circle cx="${c.x}" cy="${c.y}" r="8" fill="none" stroke="${color}" stroke-width="${SYMBOL_WIDTH}"/>`;
  };

  switch (kind) {
    case "one":
      return { svg: stub(36) + bar(14) + bar(26), length: 36 };
    case "zeroOne":
      return { svg: stub(20) + bar(12) + ring(28), length: 36 };
    case "many":
      return { svg: stub(40) + foot(26) + bar(36), length: 40 };
    case "zeroMany":
      return { svg: stub(24) + foot(24) + ring(40), length: 48 };
  }
}

// An ER diagram as a picture, or null where it does not fit `available` columns.
export function erSketch(diagram: ErDiagram, available: number, palette: Palette, font: Font): Sketch | null {
  const sized = diagram.entities.map(sizeOf);
  const layout = layered(
    sized.map(({ node }) => node),
    diagram.relationships,
    diagram.direction,
    {
      sibling: 3 * CELL_WIDTH,
      rank: diagram.direction === "down" ? 3.5 * font.cellHeight : 14 * CELL_WIDTH,
      labelSize: LABEL,
    },
  );
  const byId = new Map(sized.map((item) => [item.entity.id, item]));
  const edges = layout.routes
    .map((route: Route) => {
      const relationship = route.edge as Relationship;
      const from = symbol(relationship.fromCardinality, route.points[0]!, route.startDir, palette.inactive);
      const to = symbol(
        relationship.toCardinality,
        route.points.at(-1)!,
        { x: -route.endDir.x, y: -route.endDir.y },
        palette.inactive,
      );

      return (
        from.svg +
        to.svg +
        strokeSvg(
          trimmed(route, from.length, to.length),
          palette.inactive,
          EDGE_WIDTH,
          relationship.isDashed ? DASHED : "",
        ) +
        labelSvg(route, relationship.label, LABEL, palette.inactive)
      );
    })
    .join("");
  const nodes = layout.nodes
    .map(({ id, x, y, w, h }) => {
      const { entity, attributes, columns } = byId.get(id)!;
      const used = columns.map((width, i) => ({ width, i })).filter(({ width }) => width > 0);
      let left = x + PAD;
      const starts = new Map<number, number>();

      for (const { width, i } of used) {
        starts.set(i, left);
        left += width + COLUMN_GAP;
      }

      const cell = (text: string, column: number, row: number, color: string) =>
        text === "" || !starts.has(column)
          ? ""
          : textSvg(
              starts.get(column)!,
              y + HEAD + 8 + row * ROW + ROW / 2 + LABEL * 0.35,
              text,
              LABEL,
              color,
              "start",
            );

      return (
        rectSvg(x + 1.25, y + 1.25, w - 2.5, h - 2.5, 10, boxPaint(palette.accent, EDGE_WIDTH)) +
        centredText(x + w / 2, y + HEAD / 2 + 2, entity.label, TEXT, palette.text, ` font-weight="bold"`) +
        (attributes.length === 0
          ? ""
          : lineSvg({ x: x + 1.25, y: y + HEAD }, { x: x + w - 1.25, y: y + HEAD }, palette.accent, 1.5) +
            attributes
              .map(
                (attribute, row) =>
                  cell(attribute.type, 0, row, palette.inactive) +
                  cell(attribute.name, 1, row, palette.text) +
                  cell(attribute.keys, 2, row, palette.success),
              )
              .join(""))
      );
    })
    .join("");

  return finish(
    edges + nodes,
    layout.width,
    layout.height,
    available,
    font,
    diagram.relationships
      .map(({ from, to, label }) => `${from} -> ${to}${label === "" ? "" : ` (${label})`}`)
      .join("\n"),
  );
}
