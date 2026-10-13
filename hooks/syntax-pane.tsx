import type { Elements, RenderElement } from "claude-code";

import type { SyntaxPane } from "../types";
import { codeCard } from "./code";
import type { StyledRun } from "./syntax/types";
import { importName } from "./syntax-themes";

type Ui = Pick<Elements["terminal"], "Box" | "Text" | "Button" | "Input">;

export type Sample = { label: string; hint: string; code: string };

// What the previews under the list show, in the chosen theme. Each stays within five lines.
export const SAMPLES: readonly Sample[] = [
  {
    label: "typescript",
    hint: "typescript",
    code: [
      "// Sum the lengths of the words",
      "export function total(words: string[]): number {",
      '  const empty = words.filter((word) => word !== "");',
      "  return empty.reduce((sum, word) => sum + word.length, 0);",
      "}",
    ].join("\n"),
  },
  {
    label: "python",
    hint: "python",
    code: [
      "# Count the words",
      "def count(text: str) -> dict[str, int]:",
      "    words = text.lower().split()",
      "    return {word: words.count(word) for word in set(words)}",
    ].join("\n"),
  },
  {
    label: "java",
    hint: "java",
    code: [
      "// Greet each name",
      "static void greet(List<String> names) {",
      '    names.forEach(name -> System.out.println("Hello, " + name));',
      "}",
    ].join("\n"),
  },
  {
    label: "bash",
    hint: "shellscript",
    code: [
      "# Count the lines of each file",
      "for file in src/*.ts; do",
      '  echo "$file: $(wc -l < "$file") lines"',
      "done",
    ].join("\n"),
  },
];

// Option values for the two rows that are not theme files. A file name cannot hold `::` once cleaned.
export const DEFAULT_THEME = "::default";
export const NEW_THEME = "::new";

// What an option's button key starts with, so the focus hook can tell which row the ring is on.
export const THEME_KEY = "theme:";

// What Enter does in each step of the pane.
const HINTS: Record<SyntaxPane["step"], string> = { list: "choose", path: "continue", name: "add" };

export type SyntaxPaneActions = {
  pick: (value: string) => void;
  submitPath: (path: string) => void;
  submitName: (name: string) => void;
};

export type SyntaxPaneView = {
  pane: SyntaxPane;
  names: readonly string[];
  active: string;
  // Where themes are kept, or undefined when the folder cannot be found.
  folder: string | undefined;
  // The runs of each of `SAMPLES`, in order; undefined for one that draws plain.
  samples: readonly (readonly StyledRun[][] | undefined)[];
  background: string | undefined;
  // The colours of each theme, by option value, shown beside its name.
  swatches: Readonly<Record<string, readonly string[]>>;
};

// The `/syntax` pane: the themes to choose from, each with a strip of its colours, a preview of the one focused in a
// few languages, and the two steps of adding a theme from a file. A message from the last action shows at the top.
export function syntaxPane(
  ui: Ui,
  { pane, names, active, folder, samples, background, swatches }: SyntaxPaneView,
  actions: SyntaxPaneActions,
): RenderElement {
  const { Box, Text, Button, Input } = ui;
  const current = active === "" ? DEFAULT_THEME : active;
  const themes = [{ value: DEFAULT_THEME, label: "Default" }, ...names.map((name) => ({ value: name, label: name }))];
  const width = Math.max(...themes.map(({ label }) => label.length));

  return (
    <Box flexDirection="column" gap={1} paddingLeft={1}>
      {folder === undefined ? (
        <Text dimColor>The Claude folder could not be found, so only the default is available.</Text>
      ) : null}
      {pane.message === undefined ? null : <Text color="suggestion">{pane.message}</Text>}
      {pane.step === "list" || pane.step === "path" ? (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            <Text bold>Themes</Text>
            {themes.map(({ value, label }) => (
              <Box key={`row-${value}`} flexDirection="row">
                <Text color={value === current ? "suggestion" : "subtle"}>● </Text>
                <Button
                  key={`${THEME_KEY}${value}`}
                  plain
                  autoFocus={value === current && pane.step === "list" ? true : undefined}
                  onPress={() => actions.pick(value)}
                >
                  {label.padEnd(width)}
                </Button>
                <Text>{"  "}</Text>
                {(swatches[value] ?? []).map((color, i) => (
                  <Text key={`swatch-${i}`} color={color}>
                    {"● "}
                  </Text>
                ))}
              </Box>
            ))}
            {folder === undefined ? null : pane.step === "path" ? (
              <Input
                key="syntax-path"
                label="Theme file"
                placeholder="~/path/to/theme.json"
                submitLabel="next"
                autoFocus
                onSubmit={actions.submitPath}
              />
            ) : (
              <Box>
                <Button key={`${THEME_KEY}${NEW_THEME}`} plain onPress={() => actions.pick(NEW_THEME)}>
                  + New custom theme...
                </Button>
              </Box>
            )}
          </Box>
          <Box flexDirection="column">
            <Text dimColor>{`enter to ${HINTS[pane.step]} · esc to cancel`}</Text>
            {SAMPLES.map((sample, i) => (
              <Box key={`sample-${sample.label}`} flexDirection="column">
                <Text dimColor>{sample.label}</Text>
                {codeCard(ui, "", sample.code, samples[i], background)}
              </Box>
            ))}
          </Box>
        </Box>
      ) : null}
      {pane.step === "name" ? (
        <Input
          key="syntax-name"
          label="Name"
          placeholder={importName("", pane.path)}
          submitLabel="add"
          autoFocus
          onSubmit={actions.submitName}
        />
      ) : null}
      {pane.step === "name" ? <Text dimColor>{`enter to ${HINTS.name} · esc to cancel`}</Text> : null}
    </Box>
  );
}
