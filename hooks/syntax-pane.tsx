import type { Elements, RenderElement } from "claude-code";

import type { SyntaxPane } from "../types";
import { codeCard } from "./code";
import type { StyledRun } from "./syntax/types";
import { POPULAR_THEMES } from "./syntax-popular";
import { PAGE_SIZE, pageOf } from "./syntax-remote";
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
    label: "python",
    hint: "python",
    code: [
      "# Count the words",
      "def count(text: str) -> dict[str, int]:",
      "    words = text.lower().split()",
      "    return {word: words.count(word) for word in set(words)}",
    ].join("\n"),
  },
];

// Option values for the two rows that are not theme files. A file name cannot hold `::` once cleaned.
export const DEFAULT_THEME = "::default";
export const NEW_THEME = "::new";
export const POPULAR_THEME = "::popular";

// What an option's button key starts with, so the focus hook can tell which row the ring is on.
export const THEME_KEY = "theme:";

// What the buttons of a paged list are keyed with: a row is `CHOICE_KEY` and its number, the rest are named.
export const CHOICE_KEY = "choice:";
export const NEXT_PAGE_KEY = "page:next";
export const PREVIOUS_PAGE_KEY = "page:previous";
export const BACK_KEY = "page:back";

// The keys of the two fields.
export const PATH_KEY = "syntax-path";
export const NAME_KEY = "syntax-name";

// The keys of the pane's focusable elements in the order they are drawn, top to bottom. The arrow keys walk them.
export function paneKeys(pane: SyntaxPane, names: readonly string[], hasFolder: boolean): string[] {
  const themes = [DEFAULT_THEME, ...names].map((value) => `${THEME_KEY}${value}`);

  if (pane.step === "list") {
    return hasFolder ? [...themes, `${THEME_KEY}${POPULAR_THEME}`, `${THEME_KEY}${NEW_THEME}`] : themes;
  }

  if (pane.step === "path") {
    return hasFolder ? [...themes, `${THEME_KEY}${POPULAR_THEME}`, PATH_KEY] : themes;
  }

  if (pane.step === "name") {
    return [NAME_KEY];
  }

  const total = pane.step === "popular" ? POPULAR_THEMES.length : pane.variants.length;
  const { rows, page, pages } = pageOf(Array.from({ length: total }), pane.page);

  return [
    ...rows.map((_, i) => `${CHOICE_KEY}${page * PAGE_SIZE + i}`),
    ...(page < pages - 1 ? [NEXT_PAGE_KEY] : []),
    ...(page > 0 ? [PREVIOUS_PAGE_KEY] : []),
    BACK_KEY,
  ];
}

// What Enter does in each step of the pane.
const HINTS: Record<SyntaxPane["step"], string> = {
  list: "select",
  path: "continue",
  name: "add",
  popular: "select",
  variant: "select",
};

export type SyntaxPaneActions = {
  pick: (value: string) => void;
  submitPath: (path: string) => void;
  submitName: (name: string) => void;
  // The row of a paged list that was chosen, by its position in the whole list.
  choose: (index: number) => void;
  turnPage: (by: number) => void;
  back: () => void;
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
  const isPaged = pane.step === "popular" || pane.step === "variant";
  const choices =
    pane.step === "popular" ? POPULAR_THEMES.map(({ name }) => name) : pane.variants.map(({ label }) => label);
  const { rows, page, pages } = pageOf(choices, pane.page);

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
            {folder === undefined ? null : (
              <Box flexDirection="column">
                <Button key={`${THEME_KEY}${POPULAR_THEME}`} plain onPress={() => actions.pick(POPULAR_THEME)}>
                  + Browse popular themes...
                </Button>
                {pane.step === "path" ? (
                  <Box flexDirection="column">
                    <Text>Theme file or Open VSX extension</Text>
                    <Input
                      key={PATH_KEY}
                      placeholder="~/theme.json or publisher.name"
                      submitLabel="next"
                      autoFocus
                      onSubmit={actions.submitPath}
                    />
                  </Box>
                ) : (
                  <Button key={`${THEME_KEY}${NEW_THEME}`} plain onPress={() => actions.pick(NEW_THEME)}>
                    + New custom theme...
                  </Button>
                )}
              </Box>
            )}
          </Box>
          <Box flexDirection="column">
            {SAMPLES.map((sample, i) => (
              <Box key={`sample-${sample.label}`} flexDirection="column">
                <Text dimColor>{sample.label}</Text>
                {codeCard(ui, "", sample.code, samples[i], background)}
              </Box>
            ))}
          </Box>
        </Box>
      ) : null}
      {isPaged ? (
        <Box flexDirection="column">
          <Text bold>{pane.step === "popular" ? "Popular themes on Open VSX" : `Themes in ${pane.extension}`}</Text>
          {rows.map((label, i) => (
            <Button
              key={`${CHOICE_KEY}${page * PAGE_SIZE + i}`}
              plain
              onPress={() => actions.choose(page * PAGE_SIZE + i)}
            >
              {`${String(page * PAGE_SIZE + i + 1).padStart(String(choices.length).length)}. ${label}`}
            </Button>
          ))}
          <Text dimColor>{`page ${page + 1} of ${pages}`}</Text>
          {page < pages - 1 ? (
            <Button key={NEXT_PAGE_KEY} plain onPress={() => actions.turnPage(1)}>
              Next page
            </Button>
          ) : null}
          {page > 0 ? (
            <Button key={PREVIOUS_PAGE_KEY} plain onPress={() => actions.turnPage(-1)}>
              Previous page
            </Button>
          ) : null}
          <Button key={BACK_KEY} plain onPress={actions.back}>
            Back to themes
          </Button>
        </Box>
      ) : null}
      {pane.step === "name" ? (
        <Input
          key={NAME_KEY}
          label="Name"
          placeholder={importName("", pane.path)}
          submitLabel="add"
          autoFocus
          onSubmit={actions.submitName}
        />
      ) : null}
      <Text dimColor>{`Enter to ${HINTS[pane.step]} · Esc to cancel`}</Text>
    </Box>
  );
}
