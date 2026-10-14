import type { Off } from "../types";

// The variables that say what the terminal is; each read where `$.env.get` can name it.
export type TerminalEnv = {
  force: string | undefined;
  tmux: string | undefined;
  program: string | undefined;
  term: string | undefined;
  kittyWindow: string | undefined;
  weztermExecutable: string | undefined;
  ghosttyResources: string | undefined;
};

export const OFF_TEXT: Record<Off, string> = {
  tmux: "Images are not supported in this tmux session. Falling back to text replacements.",
  terminal: "Images are not supported in this session. Falling back to text replacements.",
  resvg: "Images need resvg (brew install resvg). Falling back to text replacements.",
};

// Terminals that carry their own symbol font, by `TERM_PROGRAM` and by `TERM`.
const SYMBOL_PROGRAMS = new Set(["ghostty", "WezTerm", "rio"]);
const SYMBOL_TERMS = new Set(["xterm-ghostty", "xterm-kitty", "wezterm", "rio"]);

// Claude Code draws pictures with kitty Unicode placeholders and turns them on only in kitty and Ghostty. WezTerm, Rio
// and Warp show an image's alt text instead.
const PICTURE_PROGRAMS = new Set(["ghostty"]);
const PICTURE_TERMS = new Set(["xterm-ghostty", "xterm-kitty"]);

// Pictures are drawn in kitty and Ghostty, and not inside a multiplexer unless forced.
export function terminalOff(env: TerminalEnv): Off | null {
  if (env.force === "1") {
    return null;
  }

  if (env.tmux) {
    return "tmux";
  }

  const draws =
    PICTURE_PROGRAMS.has(env.program ?? "") ||
    PICTURE_TERMS.has(env.term ?? "") ||
    env.kittyWindow !== undefined ||
    env.ghosttyResources !== undefined;

  return draws ? null : "terminal";
}

// Terminals that carry their own symbol font, so the Nerd Font icons draw with nothing installed. Ghostty's resources
// folder variable, like the kitty and WezTerm ones, outlives a multiplexer that rewrites `TERM_PROGRAM` and `TERM`.
export const hasSymbolFont = (env: TerminalEnv): boolean =>
  SYMBOL_PROGRAMS.has(env.program ?? "") ||
  SYMBOL_TERMS.has(env.term ?? "") ||
  env.kittyWindow !== undefined ||
  env.weztermExecutable !== undefined ||
  env.ghosttyResources !== undefined;

// Terminals where a file path is shown in full as plain text and not as a link. Claude Code prints the address beside the
// text of a link in a terminal it does not know to open links. Rio finds the path in the text and opens it itself, and
// Terminal.app opens neither a link nor a path.
const PLAIN_LINK_PROGRAMS = new Set(["rio", "Apple_Terminal"]);

// Whether a file path is plain text: always when the setting is `text`, never when it is `link`, and by the terminal when
// it is `auto`.
export const linksArePlain = (setting: "auto" | "link" | "text", env: TerminalEnv): boolean =>
  setting === "text" || (setting === "auto" && (PLAIN_LINK_PROGRAMS.has(env.program ?? "") || env.term === "rio"));

// The icons to draw: Nerd Font ones when the setting is `nerd`, or `auto` in a terminal with its own symbol font.
export const iconsArePlain = (setting: "auto" | "nerd" | "plain", env: TerminalEnv): boolean =>
  setting === "plain" || (setting === "auto" && !hasSymbolFont(env));
