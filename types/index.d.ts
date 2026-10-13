// Why Veneer draws nothing this session; null when it draws.
export type Off = "tmux" | "terminal" | "resvg";

// The colours pictures need as hex. Native rows use theme keys and need none of this.
export type Palette = {
  text: string;
  inactive: string;
  subtle: string;
  accent: string;
  border: string;
  success: string;
  error: string;
  userBackground: string;
  // The terminal's own 16 colours: a theme token there can equal the diff fill, so text needs a different one.
  isAnsi: boolean;
};

// Where the `/syntax` pane is: the list of themes, or one of the two steps of importing a theme file.
export type SyntaxPane = {
  step: "list" | "path" | "name";
  // The theme file being imported and its text, from the step that asks for its path on.
  path: string;
  content: string;
  message: string | undefined;
};

declare module "claude-code" {
  interface PluginState {
    veneer: {
      off: Off | null;
      palette: Palette;
      expanded: string[];
      // The file name, without `.json`, of the chosen syntax theme; empty for the shipped default.
      syntax: string;
      syntaxPane: SyntaxPane;
    };
  }
}
