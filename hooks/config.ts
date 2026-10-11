import type { PluginOptions } from "claude-code";

export type Config = {
  align: "left" | "right";
  fontFamily: string;
  cellRatio: number;
  syntaxTheme: string;
};

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
});
