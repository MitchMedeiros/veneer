import type { Palette } from "../types";
import { classSketch, parseClass } from "./mermaid-class";
import { erSketch, parseEr } from "./mermaid-er";
import { flowSketch, parseFlow } from "./mermaid-flowchart";
import { parseSequence, sequenceSketch } from "./mermaid-sequence";
import { parseState, stateSketch } from "./mermaid-state";
import type { Font, Sketch } from "./picture";

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

  return er === null ? null : erSketch(er, available, palette, font);
}
