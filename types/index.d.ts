// Why Veneer draws no pictures this session; null when it draws them.
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

// Where the `/syntax` pane is: the list of themes, the steps of importing a theme from a file or from Open VSX, or a
// paged list of the popular extensions or of the themes in one extension.
export type SyntaxPane = {
  step: "list" | "path" | "name" | "popular" | "variant";
  // The theme being imported and its text, from the step that asks for its name on.
  path: string;
  content: string;
  message: string | undefined;
  // The page of a paged list, counting from zero.
  page: number;
  // The extension on Open VSX the variants belong to, as `publisher.name`, and its themes.
  extension: string;
  variants: { label: string; path: string }[];
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
      // The theme the picker's focus is on, shown live in place of the chosen one; null when none.
      syntaxPreview: string | null;
      // The key of the element the picker's focus ring is on; null when none.
      syntaxFocus: string | null;
    };
  }
}
