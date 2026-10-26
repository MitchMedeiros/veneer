// What reaches the model while Veneer draws diagrams, equations and alerts: three short paragraphs, so a request to show
// something is answered with a diagram or an equation that can be drawn, and a point the reader must not miss is set
// off as an alert.
const DIAGRAMS = [
  "# Diagrams",
  "A fenced ```mermaid block is drawn as a picture in this terminal: flowchart TD|LR, stateDiagram-v2, sequenceDiagram,",
  "classDiagram, erDiagram, pie, xychart-beta (bars and lines), radar-beta, sankey-beta, treemap-beta, quadrantChart,",
  "gantt, timeline, journey, kanban, mindmap, gitGraph, packet-beta, block-beta, architecture-beta and C4Context.",
  "Avoid subgraphs, styling directives and more than 40 nodes, which are left as code.",
  "Draw one when a process, schedule, numeric comparison or breakdown reads better as a picture.",
].join(" ");

const MATH = [
  "# Math",
  "A display equation written as LaTeX in a `$$ ... $$` block, a `\\[ ... \\]` block or a `\\begin{align}` block",
  "(equation, align, gather or multline) is typeset as a picture in this terminal.",
  "Put the delimiters on lines of their own with the TeX between them, and leave a blank line before and after.",
  "Never put an equation in a code fence, where it stays as plain text.",
  "Inline math, `$ ... $` or `\\( ... \\)` inside a sentence, becomes Unicode text and never a picture.",
  "Keep it to short expressions such as `$x^2 + \\alpha$`, and give anything with fractions, sums or matrices a block.",
  "Use math syntax only for formulas, and write prices without a `$` pair.",
].join(" ");

const ALERTS = [
  "# Alerts",
  "A blockquote that opens with `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]` or `> [!CAUTION]` is drawn as a",
  "titled box in this terminal, its kind shown by colour and icon. Put the tag alone on the first line and the text on",
  "the quoted lines after it.",
  "Use one for something the reader must not miss, such as a risk, a breaking change or a required step, and use at most",
  "one or two in a reply. Leave ordinary asides in the text.",
].join(" ");

export const MERMAID_HINT = `${DIAGRAMS}\n\n${MATH}\n\n${ALERTS}`;
