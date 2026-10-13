import type { Off } from "../types";

// The variables that say what the terminal is; each read where `$.env.get` can name it.
export type TerminalEnv = {
  force: string | undefined;
  tmux: string | undefined;
  program: string | undefined;
  term: string | undefined;
  kittyWindow: string | undefined;
};

export const OFF_TEXT: Record<Off, string> = {
  tmux: "Images are not supported in this tmux session. Falling back to text replacements.",
  terminal: "Images are not supported in this session. Falling back to text replacements.",
  resvg: "Images need resvg (brew install resvg). Falling back to text replacements.",
};

// Claude Code draws pictures only for kitty and Ghostty, and not inside a multiplexer unless forced.
export function terminalOff(env: TerminalEnv): Off | null {
  if (env.force === "1") {
    return null;
  }

  if (env.tmux) {
    return "tmux";
  }

  const draws =
    env.program === "ghostty" ||
    env.term === "xterm-ghostty" ||
    env.term === "xterm-kitty" ||
    env.kittyWindow !== undefined;

  return draws ? null : "terminal";
}
