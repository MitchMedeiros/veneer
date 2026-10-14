// What reaches the model while Veneer draws diagrams: one short paragraph, so a request to show something is answered
// with a diagram that can be drawn.
export const MERMAID_HINT = [
  "# Diagrams",
  "A fenced ```mermaid block is drawn as a picture in this terminal: flowchart TD|LR, stateDiagram-v2, sequenceDiagram,",
  "classDiagram, erDiagram, pie, xychart-beta (bars and lines), radar-beta, sankey-beta, treemap-beta, quadrantChart,",
  "gantt, timeline, journey, kanban, mindmap, gitGraph, packet-beta, block-beta, architecture-beta and C4Context.",
  "Avoid subgraphs, styling directives and more than 40 nodes, which are left as code.",
  "Draw one when a process, schedule, numeric comparison or breakdown reads better as a picture.",
].join(" ");
