import type { Palette } from "../types";
import { architectureScene, parseArchitecture } from "./mermaid-architecture";
import { blockScene, parseBlock } from "./mermaid-block";
import { c4Scene, parseC4 } from "./mermaid-c4";
import { classSketch, parseClass } from "./mermaid-class";
import { cellRows } from "./mermaid-cells";
import type { Row } from "./mermaid-cells";
import { erSketch, parseEr } from "./mermaid-er";
import { flowSketch, parseFlow } from "./mermaid-flowchart";
import { ganttScene, parseGantt } from "./mermaid-gantt";
import { gitScene, parseGit } from "./mermaid-git";
import { journeyScene, parseJourney } from "./mermaid-journey";
import { kanbanScene, parseKanban } from "./mermaid-kanban";
import { mindmapScene, parseMindmap } from "./mermaid-mindmap";
import { parsePacket, packetScene } from "./mermaid-packet";
import { parsePie, pieScene } from "./mermaid-pie";
import { parseQuadrant, quadrantScene } from "./mermaid-quadrant";
import { parseRadar, radarScene } from "./mermaid-radar";
import { parseSankey, sankeyScene } from "./mermaid-sankey";
import { sceneSketch } from "./mermaid-scene-svg";
import type { Ctx, Scene } from "./mermaid-scene";
import { parseSequence, sequenceSketch } from "./mermaid-sequence";
import { frontmatterOf, indentedLines } from "./mermaid-source";
import { parseState, stateSketch } from "./mermaid-state";
import { parseTimeline, timelineScene } from "./mermaid-timeline";
import { parseTreemap, treemapScene } from "./mermaid-treemap";
import { parseXy, xyScene } from "./mermaid-xy";
import { mermaidText } from "./mermaid-text";
import { CELL_WIDTH } from "./picture";
import type { Font, Sketch } from "./picture";

type Source = { lines: string[]; indents: number[] };
type Entry = { head: RegExp; scene: (source: Source, title: string, ctx: Ctx) => Scene | null };

// A kind that is read into a model with a title and laid out as a scene. The title a frontmatter gives names a diagram
// that did not name itself.
function kind<T extends { title: string }>(
  head: RegExp,
  parse: (lines: string[], indents: number[]) => T | null,
  scene: (model: T, ctx: Ctx) => Scene | null,
): Entry {
  return {
    head,
    scene: ({ lines, indents }, title, ctx) => {
      const model = parse(lines, indents);

      return model === null ? null : scene(model.title === "" ? { ...model, title } : model, ctx);
    },
  };
}

const KINDS: readonly Entry[] = [
  kind(/^pie\b/i, parsePie, pieScene),
  kind(/^xychart/i, parseXy, xyScene),
  kind(/^gantt\b/i, parseGantt, ganttScene),
  kind(/^timeline\b/i, parseTimeline, timelineScene),
  kind(/^journey\b/i, parseJourney, journeyScene),
  kind(/^kanban\b/i, parseKanban, kanbanScene),
  kind(/^mindmap\b/i, parseMindmap, mindmapScene),
  kind(/^quadrantChart\b/i, parseQuadrant, quadrantScene),
  kind(/^radar/i, parseRadar, radarScene),
  kind(/^sankey/i, parseSankey, sankeyScene),
  kind(/^treemap/i, parseTreemap, treemapScene),
  kind(/^packet/i, parsePacket, packetScene),
  kind(/^block/i, parseBlock, blockScene),
  kind(/^gitGraph/, parseGit, gitScene),
  kind(/^architecture/i, parseArchitecture, architectureScene),
  kind(/^C4/i, parseC4, c4Scene),
];

// A Mermaid diagram of a kind drawn as a scene, or null for any other kind, one this cannot read or one that does not
// fit the columns.
export function sceneOf(source: string, ctx: Ctx): Scene | null {
  const { title, body } = frontmatterOf(source);
  const lines = indentedLines(body);

  return KINDS.find(({ head }) => head.test(lines.lines[0] ?? ""))?.scene(lines, title, ctx) ?? null;
}

// A Mermaid diagram as a picture. Null for a kind this does not draw, or a diagram it cannot read or fit, which is left
// to the text renderer.
export function diagramSketch(source: string, available: number, palette: Palette, font: Font): Sketch | null {
  const flow = parseFlow(source);

  if (flow !== null) {
    return flowSketch(flow, available, palette, font);
  }

  const state = parseState(source);

  if (state !== null) {
    return stateSketch(state, available, palette, font);
  }

  const sequence = parseSequence(source);

  if (sequence !== null) {
    return sequenceSketch(sequence, available, palette, font);
  }

  const classes = parseClass(source);

  if (classes !== null) {
    return classSketch(classes, available, palette, font);
  }

  const er = parseEr(source);

  if (er !== null) {
    return erSketch(er, available, palette, font);
  }

  const scene = sceneOf(source, { columns: available, ratio: font.cellHeight / CELL_WIDTH });

  return scene === null ? null : sceneSketch(scene, palette, font);
}

const MEMORY = 48;
const memory = new Map<string, Row[] | null>();

// A Mermaid diagram in terminal characters, one row of coloured runs for each line: the kinds drawn as scenes in
// theme colours, and flowcharts, state, sequence, class and ER diagrams in the plain box characters of the bundled
// renderer. Null for a diagram neither reads.
export function diagramText(source: string, ctx: Ctx): Row[] | null {
  const key = `${ctx.columns}|${ctx.ratio}|${source}`;

  if (memory.has(key)) {
    return memory.get(key) ?? null;
  }

  const scene = sceneOf(source, ctx);
  const lines = scene === null ? mermaidText(source) : null;
  const rows = scene === null ? (lines?.map((text) => [{ text }]) ?? null) : cellRows(scene);

  if (memory.size >= MEMORY) {
    memory.delete(memory.keys().next().value as string);
  }

  memory.set(key, rows);

  return rows;
}
