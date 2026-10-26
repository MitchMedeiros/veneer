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
  suggestion: string;
  warning: string;
  planMode: string;
  autoAccept: string;
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

// Where the `/veneer` pane is: the setting being typed, if any, and a message from the last change.
export type SettingsPane = {
  editing: string | null;
  message: string | undefined;
};

// The tabs of the `/veneer` pane.
export type Tab = "settings" | "syntax";

declare module "claude-code" {
  interface PluginState {
    veneer: {
      // The plugin's settings as they stand, by field name, kept current as they change.
      options: Record<string, string | number | boolean | readonly string[]>;
      settingsPane: SettingsPane;
      // The tab of the pane that is open.
      tab: Tab;
      // The key of the element the pane's focus ring is on; null when none.
      focus: string | null;
      off: Off | null;
      // Whether the icons are Unicode symbols and not Nerd Font glyphs.
      plainIcons: boolean;
      // Whether file paths are plain text and not links.
      plainLinks: boolean;
      palette: Palette;
      expanded: string[];
      // The file name, without `.json`, of the chosen syntax theme; empty for the shipped default.
      syntax: string;
      syntaxPane: SyntaxPane;
      // The theme the picker's focus is on, shown live in place of the chosen one; null when none.
      syntaxPreview: string | null;
      // The numbers of the images pasted into the prompt box and not yet sent, in the order the draft holds them.
      draftImages: string[];
      // Whether the diff cards of edits and file writes are folded away in this session.
      editsCollapsed: boolean;
      // The tool calls whose diff card is the opposite of `editsCollapsed`, because the person pressed its row.
      flippedEdits: string[];
      // Whether the groups that hold edits, and the Read rows in them, are opened by the expand button.
      groupsExpanded: boolean;
      // The groups and Read rows that `groupsExpanded` opens but were pressed shut.
      flippedGroups: string[];
    };
  }
}
