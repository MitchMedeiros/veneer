import type { ElementTable, RenderElement } from "claude-code";

import { codeCard } from "./code";
import type { Segment } from "./markdown";
import type { Picture } from "./picture";
import type { StyledRun } from "./syntax/types";

type Ui = Pick<ElementTable, "Box" | "Text" | "Markdown"> &
  Partial<Pick<Extract<ElementTable, { Image: unknown }>, "Image">>;

// Columns the bullet gutter takes, as Claude Code's own reply rows leave.
export const GUTTER = 2;

// Columns left of the bullet, so it lines up with the icons of the tool rows and the edge of the cards.
export const MARGIN = 2;

// The mark before a reply: a four-point star, which any font draws.
export const BULLET = "✦";

// A reply block: its text left to the native `Markdown`, each table and heading as the picture drawn for it. A segment
// without a picture falls back to its own markdown, so one failed picture never hides content. The first block of a
// reply starts with the bullet, in the theme's accent colour. A fence with runs in `fences` is drawn highlighted.
export function replyTree(
  { Box, Text, Markdown, Image }: Ui,
  segments: readonly Segment[],
  pictures: ReadonlyMap<Segment, { picture: Picture; alt: string }>,
  bullet: string | null,
  fences: ReadonlyMap<Segment, StyledRun[][]> = new Map(),
): RenderElement {
  const rows = segments.map((segment, i) => {
    const drawn = pictures.get(segment);

    if (segment.kind === "text") {
      return <Markdown key={`text-${i}`} text={segment.text} />;
    }

    if (segment.kind === "code") {
      return (
        <Box key={`code-${i}`} flexDirection="column" marginTop={i > 0 ? 1 : 0}>
          {codeCard({ Box, Text }, segment.lang, segment.code, fences.get(segment))}
        </Box>
      );
    }

    if (drawn === undefined || Image === undefined) {
      return <Markdown key={`text-${i}`} text={segment.raw} />;
    }

    return (
      <Box
        key={`picture-${i}`}
        marginTop={segment.kind === "heading" && i > 0 ? 1 : 0}
        alignSelf="flex-start"
        flexShrink={0}
      >
        <Image
          key={`image-${i}`}
          source={{ png: drawn.picture.png }}
          columns={drawn.picture.columns}
          rows={drawn.picture.rows}
          alt={drawn.alt}
        />
      </Box>
    );
  });

  return (
    <Box flexDirection="row" marginLeft={MARGIN} marginTop={bullet === null ? 0 : 1}>
      <Box width={GUTTER} flexShrink={0}>
        <Text color="claude">{bullet ?? " "}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {rows}
      </Box>
    </Box>
  );
}
