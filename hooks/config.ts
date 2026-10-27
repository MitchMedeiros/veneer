import type { PluginOptions } from "claude-code";

import type { Frame } from "./fold";

export type Config = {
  align: "left" | "right";
  fontFamily: string;
  cellRatio: number;
  // Whether code, read, output and diff blocks take the syntax theme's `editor.background`.
  syntaxBackground: boolean;
  icons: "auto" | "nerd" | "plain";
  links: "auto" | "link" | "text";
  nativeGraphics: boolean;
  images: boolean;
  imageRows: number;
  diagramHint: boolean;
  frame: Frame;
  styleUserMessage: boolean;
  styleSpinner: boolean;
  changeStyle: "text" | "rounded" | "square";
  // The blank rows above each tool row and group line: 0 for low and medium spacing, 1 for high.
  rowGap: 0 | 1;
  // Whether code, read, output and diff blocks are as wide as their longest line rather than the whole window.
  fitted: boolean;
};

// Medium and high spacing keep the room a border takes where borders are off, so blocks sit as far apart either way.
const frameOf = (hasBorders: boolean, spacing: unknown): Frame =>
  hasBorders ? "bordered" : spacing === "medium" || spacing === "high" ? "padded" : "plain";

// A switch that is on unless set to false, as a boolean or as the text a settings file may hold.
const onUnlessFalse = (value: unknown): boolean => value !== false && value !== "false";

// Tried in order after the configured font, so a blank or unknown name still draws in a sans-serif face.
const FALLBACK_FONTS = [
  "Arial",
  "Helvetica Neue",
  "Helvetica",
  "Segoe UI",
  "Liberation Sans",
  "DejaVu Sans",
  "Noto Sans",
  "Roboto",
];
const DEFAULT_RATIO = 2.9;

// A terminal cell's height over its width; anything outside what real terminals use keeps the default.
const ratioOf = (value: unknown): number => {
  const ratio = Number(value);

  return ratio >= 1 && ratio <= 6 ? ratio : DEFAULT_RATIO;
};

const DEFAULT_IMAGE_ROWS = 14;

// The tallest an image draws, in rows; anything outside 2 to 250 keeps the default.
const imageRowsOf = (value: unknown): number => {
  const rows = Math.floor(Number(value));

  return rows >= 2 && rows <= 250 ? rows : DEFAULT_IMAGE_ROWS;
};

export const configOf = (options: PluginOptions): Config => ({
  align: options.messageAlign === "right" ? "right" : "left",
  fontFamily: [typeof options.fontFamily === "string" ? options.fontFamily.trim() : "", ...FALLBACK_FONTS]
    .filter((font) => font !== "")
    .join(", "),
  cellRatio: ratioOf(options.cellRatio),
  syntaxBackground: onUnlessFalse(options.syntaxBackground),
  icons: options.icons === "nerd" || options.icons === "plain" ? options.icons : "auto",
  links: options.links === "link" || options.links === "text" ? options.links : "auto",
  nativeGraphics: options.nativeGraphics === true || options.nativeGraphics === "true",
  images: onUnlessFalse(options.images),
  imageRows: imageRowsOf(options.imageRows),
  diagramHint: onUnlessFalse(options.diagramHint),
  frame: frameOf(onUnlessFalse(options.blockBorders), options.toolSpacing),
  styleUserMessage: onUnlessFalse(options.styleUserMessage),
  styleSpinner: onUnlessFalse(options.styleSpinner),
  changeStyle: options.changeStyle === "rounded" || options.changeStyle === "square" ? options.changeStyle : "text",
  rowGap: options.toolSpacing === "high" ? 1 : 0,
  fitted: options.blockWidth !== "full",
});
