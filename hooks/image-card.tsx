import type { ElementTable, RenderElement } from "claude-code";

import type { Picture } from "./picture";

type Ui = Pick<ElementTable, "Box" | "Text"> & Partial<Pick<Extract<ElementTable, { Image: unknown }>, "Image">>;

// An image as drawn: its picture, or null where it can only be named.
export type Shown = { id: string; alt: string; picture: Picture | null };

// The images under a row, side by side and wrapping to the next line where one does not fit. An image with no picture, or any image where the terminal has no `Image`
// element, is its name and size in dim text.
export function imageColumn(
  { Box, Text, Image }: Ui,
  shown: readonly Shown[],
  margin: number,
  alignSelf: "flex-start" | "flex-end" = "flex-start",
): RenderElement | null {
  if (shown.length === 0) {
    return null;
  }

  return (
    <Box
      flexDirection="row"
      flexWrap="wrap"
      columnGap={1}
      marginLeft={margin}
      marginRight={margin}
      alignSelf={alignSelf}
    >
      {shown.map(({ id, alt, picture }) =>
        picture === null || Image === undefined ? (
          <Text key={id} dimColor>
            {alt}
          </Text>
        ) : (
          <Box key={id} flexShrink={0}>
            <Image source={{ png: picture.png }} columns={picture.columns} rows={picture.rows} alt={alt} />
          </Box>
        ),
      )}
    </Box>
  );
}
