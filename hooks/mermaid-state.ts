import type { Palette } from "../types";
import {
  boxPaint,
  centredText,
  directionOf,
  EDGE_WIDTH,
  finish,
  LABEL,
  labelSvg,
  layered,
  LINE_HEIGHT,
  lineSvg,
  markerAttribute,
  markerDef,
  markerLength,
  rectSvg,
  strokeSvg,
  TEXT,
  textSvg,
  trimmed,
} from "./mermaid-layout";
import type { Direction, GraphEdge, GraphNode } from "./mermaid-layout";
import { sourceLines } from "./mermaid-source";
import type { Font, Sketch } from "./picture";
import { CELL_WIDTH } from "./picture";
import { measure, wrap } from "./svg-text";

const MAX_STATES = 40;
const START = "[*]start";
const END = "[*]end";

type Kind = "state" | "start" | "end" | "choice" | "bar";
type State = { id: string; label: string; kind: Kind; notes: string[] };
type Transition = GraphEdge & { label: string };
type StateDiagram = { direction: Direction; states: State[]; transitions: Transition[] };

const ID = String.raw`\[\*\]|[\w.-]+`;
const TRANSITION = new RegExp(String.raw`^(${ID})\s*-->\s*(${ID})(?:\s*:\s*(.*))?$`);
const DESCRIPTION = /^([\w.-]+)\s*:\s*(.*)$/;
const ALIAS = /^state\s+"([^"]*)"\s+as\s+([\w.-]+)$/;
const SPECIAL = /^state\s+([\w.-]+)\s+<<(choice|fork|join)>>$/;
const PLAIN = /^state\s+([\w.-]+)$/;

// A `stateDiagram` read well enough to draw. Null for composite states, concurrency and anything else this does not
// read, so the diagram is left to the text renderer.
export function parseState(source: string): StateDiagram | null {
  const lines = sourceLines(source);

  if (!/^stateDiagram(-v2)?$/.test(lines[0] ?? "")) {
    return null;
  }

  const states = new Map<string, State>();
  const transitions: Transition[] = [];
  let direction: Direction = "down";
  let inNote = false;

  const meet = (id: string, kind: Kind = "state"): string => {
    const key = id === "[*]" ? (kind === "end" ? END : START) : id;

    if (!states.has(key)) {
      states.set(key, { id: key, label: id === "[*]" ? "" : id, kind: id === "[*]" ? kind : "state", notes: [] });
    }

    return key;
  };

  for (const line of lines.slice(1)) {
    if (inNote) {
      inNote = !/^end\s+note$/i.test(line);
      continue;
    }

    if (/^note\s/i.test(line)) {
      inNote = !line.includes(":");
      continue;
    }

    const move = TRANSITION.exec(line);
    const alias = ALIAS.exec(line);
    const special = SPECIAL.exec(line);
    const plain = PLAIN.exec(line);
    const described = DESCRIPTION.exec(line);

    if (/^direction\s/.test(line)) {
      direction = directionOf(line);
    } else if (move !== null) {
      const from = meet(move[1]!, "start");
      const to = meet(move[2]!, "end");

      transitions.push({ from, to, label: (move[3] ?? "").trim() });
    } else if (alias !== null) {
      meet(alias[2]!);
      states.get(alias[2]!)!.label = alias[1]!;
    } else if (special !== null) {
      meet(special[1]!);
      states.get(special[1]!)!.kind = special[2] === "choice" ? "choice" : "bar";
    } else if (plain !== null) {
      meet(plain[1]!);
    } else if (described !== null) {
      meet(described[1]!);
      states.get(described[1]!)!.notes.push(described[2]!.trim());
    } else {
      return null;
    }
  }

  if (states.size === 0 || states.size > MAX_STATES) {
    return null;
  }

  return { direction, states: [...states.values()], transitions };
}

type Sized = { state: State; lines: string[]; node: GraphNode };

function sizeOf(state: State, direction: Direction): Sized {
  const vertical = direction === "down";

  switch (state.kind) {
    case "start":
      return { state, lines: [], node: { id: state.id, w: 30, h: 30 } };
    case "end":
      return { state, lines: [], node: { id: state.id, w: 38, h: 38 } };
    case "choice":
      return { state, lines: [], node: { id: state.id, w: 50, h: 50 } };
    case "bar":
      return { state, lines: [], node: { id: state.id, w: vertical ? 120 : 12, h: vertical ? 12 : 120 } };
    default: {
      const lines = state.notes.map((note) => wrap(note, 18 * CELL_WIDTH, LABEL, 1)[0]!);
      const widest = Math.max(measure(state.label, TEXT), ...lines.map((line) => measure(line, LABEL)));
      const h = 2 * LINE_HEIGHT + (lines.length === 0 ? 0 : lines.length * LABEL * 1.3 + 12);

      return { state, lines, node: { id: state.id, w: Math.max(120, widest + 2 * CELL_WIDTH), h } };
    }
  }
}

// A state diagram as a picture, or null where it does not fit `available` columns.
export function stateSketch(diagram: StateDiagram, available: number, palette: Palette, font: Font): Sketch | null {
  const sized = diagram.states.map((state) => sizeOf(state, diagram.direction));
  const layout = layered(
    sized.map(({ node }) => node),
    diagram.transitions,
    diagram.direction,
    {
      sibling: 3 * CELL_WIDTH,
      rank: diagram.direction === "down" ? 2.5 * font.cellHeight : 8 * CELL_WIDTH,
      labelSize: LABEL,
    },
  );
  const byId = new Map(sized.map((item) => [item.state.id, item]));
  const arrow = markerLength("arrow");
  const edges = layout.routes
    .map((route) => {
      const { label } = route.edge as Transition;

      return (
        strokeSvg(trimmed(route, 0, arrow), palette.inactive, EDGE_WIDTH, markerAttribute("arrow")) +
        labelSvg(route, label, LABEL, palette.text)
      );
    })
    .join("");
  const nodes = layout.nodes
    .map(({ id, x, y, w, h }) => {
      const { state, lines } = byId.get(id)!;
      const cx = x + w / 2;
      const cy = y + h / 2;

      switch (state.kind) {
        case "start":
          return `<circle cx="${cx}" cy="${cy}" r="${w / 2}" fill="${palette.text}"/>`;
        case "end":
          return (
            `<circle cx="${cx}" cy="${cy}" r="${w / 2 - 1.5}" fill="none" stroke="${palette.text}" stroke-width="3"/>` +
            `<circle cx="${cx}" cy="${cy}" r="${w / 2 - 9}" fill="${palette.text}"/>`
          );
        case "choice":
          return `<path d="M${cx} ${y}L${x + w} ${cy}L${cx} ${y + h}L${x} ${cy}Z" ${boxPaint(palette.error, EDGE_WIDTH)}/>`;
        case "bar":
          return rectSvg(x, y, w, h, 4, `fill="${palette.inactive}"`);
        default: {
          const top = lines.length === 0 ? cy : y + LINE_HEIGHT;

          return (
            rectSvg(x + 1.25, y + 1.25, w - 2.5, h - 2.5, 14, boxPaint(palette.accent, EDGE_WIDTH)) +
            centredText(cx, top, state.label, TEXT, palette.text) +
            (lines.length === 0
              ? ""
              : lineSvg(
                  { x: x + 12, y: y + 2 * LINE_HEIGHT - 6 },
                  { x: x + w - 12, y: y + 2 * LINE_HEIGHT - 6 },
                  palette.accent,
                  1.5,
                ) +
                lines
                  .map((line, n) =>
                    textSvg(
                      x + 18,
                      y + 2 * LINE_HEIGHT + 10 + n * LABEL * 1.3 + LABEL * 0.6,
                      line,
                      LABEL,
                      palette.inactive,
                      "start",
                    ),
                  )
                  .join(""))
          );
        }
      }
    })
    .join("");

  return finish(
    `<defs>${markerDef("arrow", palette.inactive)}</defs>${edges}${nodes}`,
    layout.width,
    layout.height,
    available,
    font,
    diagram.transitions
      .map(({ from, to, label }) => {
        const name = (id: string) => byId.get(id)?.state.label || (id === START ? "start" : "end");

        return `${name(from)} -> ${name(to)}${label === "" ? "" : ` (${label})`}`;
      })
      .join("\n"),
  );
}
