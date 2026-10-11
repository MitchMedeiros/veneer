import type { ElementTable, RenderElement } from "claude-code";

import { codeCard } from "./code";
import type { Segment } from "./markdown";
import type { Picture } from "./picture";

type Ui = Pick<ElementTable, "Box" | "Text" | "Markdown"> & Pick<Extract<ElementTable, { Image: unknown }>, "Image">;

// Columns the bullet gutter takes, as Claude Code's own reply rows leave.
export const GUTTER = 2;

// A reply block: its text left to the native `Markdown`, each table and heading as the picture drawn for it. A segment
// without a picture falls back to its own markdown, so one failed picture never hides content.
export function replyTree(
  { Box, Text, Markdown, Image }: Ui,
  segments: readonly Segment[],
  pictures: ReadonlyMap<Segment, { picture: Picture; alt: string }>,
  hasBullet: boolean,
): RenderElement {
  const rows = segments.map((segment, i) => {
    const drawn = pictures.get(segment);

    if (segment.kind === "text") {
      return <Markdown key={`text-${i}`} text={segment.text} />;
    }

    if (segment.kind === "code") {
      return (
        <Box key={`code-${i}`} flexDirection="column" marginTop={i > 0 ? 1 : 0}>
          {codeCard({ Box, Text }, segment.lang, segment.code)}
        </Box>
      );
    }

    if (drawn === undefined) {
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
    <Box flexDirection="row">
      <Box width={GUTTER} flexShrink={0}>
        <Text>{hasBullet ? "⏺" : " "}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {rows}
      </Box>
    </Box>
  );
}
