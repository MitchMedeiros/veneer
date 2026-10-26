import type { ElementTable, RenderElement } from "claude-code";

import { alertCard } from "./alert-card";
import { codeCard } from "./code";
import { copyCorner, copyRow } from "./copy-button";
import type { CopyAction } from "./copy-button";
import { headingCard } from "./heading-card";
import { listCard } from "./list-card";
import type { Segment } from "./markdown";
import { mathCard } from "./math-card";
import { texToText } from "./math-unicode";
import { mermaidCard } from "./mermaid-card";
import type { Row } from "./mermaid-cells";
import type { Picture } from "./picture";
import type { StyledRun } from "./syntax/types";
import { tableCard } from "./table-card";
import { tasksCard } from "./tasks-card";

type Ui = Pick<ElementTable, "Box" | "Text" | "Markdown" | "Button"> &
  Partial<Pick<Extract<ElementTable, { Image: unknown }>, "Image">>;

// Columns the bullet gutter takes, as Claude Code's own reply rows leave.
export const GUTTER = 2;

// Columns left of the bullet, so it lines up with the icons of the tool rows and the edge of the cards.
export const MARGIN = 1;

// The mark before a reply: a four-point star, which any font draws.
export const BULLET = "✦";

// A reply block: its text left to the native `Markdown`, each table and heading as the picture drawn for it. A segment
// without a picture falls back to its own markdown, so one failed picture never hides content. The first block of a
// reply starts with the bullet, in the theme's accent colour. A fence with runs in `fences` is drawn highlighted, on
// the fence background where there is one. A Mermaid fence with no picture is drawn as the characters `diagramOf` gives
// for its source, and stays a code block where it gives none. With `whole`, a copy button copies all of the reply, and shows while the pointer is on the reply's text. It sits in the blank row above a reply that starts with the bullet, and over the top right corner of one that has no blank row above it. A scope around the whole reply would hide the buttons of its blocks.
export function replyTree(
  { Box, Text, Markdown, Button, Image }: Ui,
  segments: readonly Segment[],
  pictures: ReadonlyMap<Segment, { picture: Picture; alt: string }>,
  bullet: string | null,
  fences: ReadonlyMap<Segment, StyledRun[][]> = new Map(),
  fenceBackground: string | undefined,
  copyFor: (index: number, text: string, noun: string) => CopyAction,
  available: number,
  diagramOf: (source: string) => Row[] | null,
  fitted = false,
  whole?: CopyAction,
  isBordered = true,
): RenderElement {
  const isBeside = (segment: Segment | undefined) =>
    segment?.kind === "table" || (segment?.kind === "code" && segment.lang === "mermaid");

  // Whether block `i` and the one after it are both tables or diagrams, which share a line.
  const sharesLine = (i: number) => isBeside(segments[i]) && isBeside(segments[i + 1]);

  // A code block or table: a blank row above it, holding its copy button, and a blank row below it, unless a block
  // follows, whose own blank row above is the gap.
  const framed = (i: number, copy: CopyAction, child: RenderElement, alignSelf?: "flex-start") => {
    const next = segments[i + 1];

    return (
      <Box
        key={`framed-${i}`}
        flexDirection="column"
        alignSelf={alignSelf}
        marginBottom={next === undefined || next.kind === "text" || sharesLine(i) ? 1 : 0}
        hover={{ scope: copy.scope }}
      >
        {copyRow({ Box, Text, Button }, copy)}
        {child}
      </Box>
    );
  };

  const pictureOf = (
    Img: NonNullable<Ui["Image"]>,
    i: number,
    drawn: { picture: Picture; alt: string },
    isSpaced: boolean,
  ) => (
    <Box key={`picture-${i}`} marginTop={isSpaced ? 1 : 0} alignSelf="flex-start" flexShrink={0}>
      <Img
        key={`image-${i}`}
        source={{ png: drawn.picture.png }}
        columns={drawn.picture.columns}
        rows={drawn.picture.rows}
        alt={drawn.alt}
      />
    </Box>
  );

  // A native block with a blank row above it unless it opens the reply, and below it where text follows, which the
  // `Markdown` of that text does not leave.
  const spaced = (i: number, child: RenderElement) => (
    <Box
      key={`block-${i}`}
      flexDirection="column"
      marginTop={i > 0 ? 1 : 0}
      marginBottom={segments[i + 1]?.kind === "text" ? 1 : 0}
    >
      {child}
    </Box>
  );

  const rows = segments.map((segment, i) => {
    const drawn = pictures.get(segment);

    if (segment.kind === "text") {
      return (
        <Box key={`text-${i}`} flexDirection="column" hover={whole === undefined ? undefined : { scope: whole.scope }}>
          <Markdown text={segment.text} />
        </Box>
      );
    }

    if (segment.kind === "alert") {
      return spaced(i, alertCard({ Box, Text, Markdown }, segment, fitted ? available : undefined));
    }

    if (segment.kind === "tasks") {
      return spaced(i, tasksCard({ Box, Text }, segment, fitted ? available : undefined, isBordered));
    }

    if (segment.kind === "list") {
      return spaced(i, listCard({ Box, Text, Markdown }, segment));
    }

    if (segment.kind === "code" && segment.lang === "mermaid") {
      const diagram = drawn === undefined ? diagramOf(segment.code) : null;
      const copy = copyFor(i, segment.code, "Diagram");

      if (drawn !== undefined && Image !== undefined) {
        return framed(i, copy, pictureOf(Image, i, drawn, false), "flex-start");
      }

      if (diagram !== null) {
        return framed(i, copy, mermaidCard({ Box, Text }, diagram, isBordered), "flex-start");
      }
    }

    if (segment.kind === "math") {
      const equation =
        drawn !== undefined && Image !== undefined
          ? pictureOf(Image, i, drawn, false)
          : mathCard({ Box, Text }, segment.tex);

      const copy = {
        ...copyFor(i, texToText(segment.tex), "Equation"),
        also: { label: "LaTeX", onCopy: copyFor(i, segment.tex, "LaTeX").onCopy },
      };

      return framed(i, copy, equation, "flex-start");
    }

    if (segment.kind === "code") {
      return framed(
        i,
        copyFor(i, segment.code, "Code"),
        codeCard(
          { Box, Text },
          segment.lang,
          segment.code,
          fences.get(segment),
          fenceBackground,
          fitted ? available : undefined,
          isBordered,
        ),
        fitted ? "flex-start" : undefined,
      );
    }

    if (drawn === undefined || Image === undefined) {
      if (segment.kind === "table") {
        return framed(
          i,
          copyFor(i, segment.raw, "Table"),
          tableCard({ Box, Text }, segment, available, isBordered),
          "flex-start",
        );
      }

      return (
        <Box key={`heading-${i}`} marginTop={i > 0 ? 1 : 0}>
          {headingCard({ Box, Text }, segment, available)}
        </Box>
      );
    }

    const picture = pictureOf(Image, i, drawn, segment.kind === "heading" && i > 0);

    return segment.kind === "table" ? framed(i, copyFor(i, segment.raw, "Table"), picture, "flex-start") : picture;
  });

  // Tables and diagrams that follow one another share a line and wrap to the next one where a block does not fit.
  const blocks: RenderElement[] = [];

  for (let i = 0; i < rows.length; i++) {
    let end = i;

    while (sharesLine(end)) {
      end++;
    }

    blocks.push(
      end === i ? (
        rows[i]!
      ) : (
        <Box key={`beside-${i}`} flexDirection="row" flexWrap="wrap" columnGap={2} alignItems="flex-start">
          {rows.slice(i, end + 1)}
        </Box>
      ),
    );
    i = end;
  }

  return (
    <Box flexDirection="row" marginLeft={MARGIN} marginRight={MARGIN} marginTop={bullet === null ? 0 : 1}>
      <Box width={GUTTER} flexShrink={0}>
        <Text color="claude">{bullet ?? " "}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {blocks}
        {whole === undefined
          ? null
          : copyCorner({ Box, Text, Button }, whole, bullet === null ? { right: 0 } : { left: -GUTTER, top: -1 })}
      </Box>
    </Box>
  );
}
