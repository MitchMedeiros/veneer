import { renderMermaidAscii } from "./vendor/mermaid-ascii.js";

// A Mermaid diagram drawn in box characters, one string for each line. Null for a kind the renderer does not know (it
// reads flowcharts, state, sequence, class and ER diagrams) or a diagram it cannot read.
export function mermaidText(source: string): string[] | null {
  try {
    const lines = renderMermaidAscii(source)
      .split("\n")
      .map((line) => line.trimEnd());

    while (lines.at(-1) === "") {
      lines.pop();
    }

    return lines.length === 0 ? null : lines;
  } catch {
    return null;
  }
}
