import type { PluginOptions } from "claude-code";

export type Config = {
  align: "left" | "right";
  fontFamily: string;
  cellRatio: number;
  syntaxTheme: string;
  backgrounds: Record<Backdrop, boolean>;
};

// The cards that may take the syntax theme's `editor.background`.
export type Backdrop = "fences" | "reads" | "output" | "diffs";

const BACKDROP_OPTIONS = {
  fences: "fenceBackground",
  reads: "readBackground",
  output: "outputBackground",
  diffs: "diffBackground",
} as const satisfies Record<Backdrop, string>;

// A switch that is on unless set to false, as a boolean or as the text a settings file may hold.
const onUnlessFalse = (value: unknown): boolean => value !== false && value !== "false";

const DEFAULT_FONT = "Helvetica Neue";
const DEFAULT_RATIO = 2.9;

// A terminal cell's height over its width; anything outside what real terminals use keeps the default.
const ratioOf = (value: unknown): number => {
  const ratio = Number(value);

  return ratio >= 1 && ratio <= 6 ? ratio : DEFAULT_RATIO;
};

export const configOf = (options: PluginOptions): Config => ({
  align: options.messageAlign === "right" ? "right" : "left",
  fontFamily:
    typeof options.fontFamily === "string" && options.fontFamily.trim() !== ""
      ? options.fontFamily.trim()
      : DEFAULT_FONT,
  cellRatio: ratioOf(options.cellRatio),
  syntaxTheme: typeof options.syntaxTheme === "string" ? options.syntaxTheme.trim() : "",
  backgrounds: Object.fromEntries(
    Object.entries(BACKDROP_OPTIONS).map(([card, option]) => [card, onUnlessFalse(options[option])]),
  ) as Record<Backdrop, boolean>,
});
