import { atom, read, update } from "claude-code";
import type { EngineInterface, PluginOptions, Register, RenderElement, Timer } from "claude-code";

import type { Off, Palette, SettingsPane, SyntaxPane, Tab } from "../types";
import { configOf } from "./config";
import type { Backdrop, Config } from "./config";
import { iconsArePlain, linksArePlain, OFF_TEXT, terminalOff } from "./gate";
import { changeCounts, withBadges } from "./badge";
import type { PillLook } from "./badge";
import { diffCard, parseDiff } from "./diff";
import { bandButtons } from "./edits";
import { firstRow, forgetRows, lastRow, noteRow } from "./transcript";
import { MAX_LINES } from "./fold";
import { callIdOf, hiddenIdOf, toolGroup } from "./group";
import { headingSketch } from "./heading";
import { mathSketch } from "./math";
import {
  altOf,
  draftImageIds,
  imageSketch,
  imagesOf,
  pastedImagesOf,
  PASTED_MARKER,
  shrinkFactor,
  sizeOfFound,
  treeBytes,
  withoutMarkers,
} from "./image";
import type { Found } from "./image";
import { imageColumn } from "./image-card";
import type { Shown } from "./image-card";
import { hasDrawn, splitReply } from "./markdown";
import type { Segment } from "./markdown";
import { outputCard, parseOutput } from "./output";
import { baseOf } from "./palette";
import { cellHeightOf, hashOf, MAX_COLUMNS, pictureFor } from "./picture";
import type { Font, Picture, PictureIo, Sketch } from "./picture";
import { CARD_COLUMNS } from "./mermaid-card";
import { diagramSketch, diagramText } from "./mermaid-diagram";
import { MERMAID_HINT } from "./mermaid-hint";
import { BULLET, GUTTER, MARGIN, replyTree } from "./reply";
import { commandOfCall, pathOfCall, rememberInput } from "./calls";
import { filePathOf, outputFill, paintCommand, paintDiff, paintFences, paintLines, paintOutput } from "./paint";
import type { Painter } from "./paint";
import { highlight, themeBackground, themeSwatch } from "./syntax/highlight";
import type { SyntaxIo } from "./syntax/highlight";
import {
  DEFAULT_THEME,
  NEW_THEME,
  paneKeys,
  PATH_KEY,
  POPULAR_THEME,
  SAMPLES,
  syntaxPane,
  THEME_KEY,
} from "./syntax-pane";
import { POPULAR_THEMES } from "./syntax-popular";
import { fileUrl, flattenTheme, needsStrings, OPEN_VSX_ORIGIN, parseExtensionId, themesOf } from "./syntax-remote";
import type { ExtensionId, ThemeChoice } from "./syntax-remote";
import {
  baseNameOf,
  configDirOf,
  expandHome,
  importName,
  themeNames,
  themeProblem,
  themesDirOf,
  THEME_EXTENSION,
  uniqueName,
} from "./syntax-themes";
import {
  fieldOf,
  groupSettings,
  isTyped,
  nextValue,
  parseSettingChange,
  SETTING_KEY,
  SETTINGS_PREFIX,
  settingsKeys,
  settingsPane,
  valueText,
} from "./settings-pane";
import type { Setting } from "./settings-pane";
import { PANE_ID, tabbed, tabKeys } from "./pane-tabs";
import { tableSketch } from "./table";
import { toolRow } from "./tool-row";
import type { Plain } from "./tool-row";
import { loadPalette } from "./theme";
import { userBubble } from "./user-message";

const NOTICE_MS = 6000;

// Why Veneer is off this session; null when it draws.
const offAtom = atom({ plugin: "veneer", key: "off" } as const, null as Off | null);
// Whether the icons are Unicode symbols, because the terminal has no Nerd Font to draw them or the setting says so.
const plainIconsAtom = atom({ plugin: "veneer", key: "plainIcons" } as const, false);
// Whether a file path is plain text, because Claude Code would print its address beside a link in this terminal.
const plainLinksAtom = atom({ plugin: "veneer", key: "plainLinks" } as const, false);
// The tool calls whose diff card shows every line.
const expandedAtom = atom({ plugin: "veneer", key: "expanded" } as const, [] as string[]);
// Whether the diff cards of edits and file writes are folded away. Each session takes the last choice from the store when
// it starts and keeps its own after that.
const editsCollapsedAtom = atom({ plugin: "veneer", key: "editsCollapsed" } as const, false);
// The tool calls whose diff card is the opposite of `editsCollapsedAtom`, because the person pressed its row.
const flippedEditsAtom = atom({ plugin: "veneer", key: "flippedEdits" } as const, [] as string[]);
const paletteAtom = atom({ plugin: "veneer", key: "palette" } as const, baseOf("dark") as Palette);
// The syntax theme chosen with /syntax, by file name without `.json`; empty is the shipped default. Kept in the store.
const syntaxAtom = atom({ plugin: "veneer", key: "syntax" } as const, "");
const LIST_PANE: SyntaxPane = {
  step: "list",
  path: "",
  content: "",
  message: undefined,
  page: 0,
  extension: "",
  variants: [],
};
const syntaxPaneAtom = atom({ plugin: "veneer", key: "syntaxPane" } as const, LIST_PANE);
// The theme the picker's focus is on. It shows in place of the chosen one until the pane closes, as Claude's own theme
// picker does; null when nothing is previewed.
const syntaxPreviewAtom = atom({ plugin: "veneer", key: "syntaxPreview" } as const, null as string | null);
// The tab of the pane that is open.
const tabAtom = atom({ plugin: "veneer", key: "tab" } as const, "settings" as Tab);
// The element the pane's focus ring is on, which the arrow keys move from when the pane would scroll.
const focusAtom = atom({ plugin: "veneer", key: "focus" } as const, null as string | null);
// The numbers of the images pasted into the prompt box and not yet sent.
const draftImagesAtom = atom({ plugin: "veneer", key: "draftImages" } as const, [] as string[]);

// The plugin's settings as they stand, by field name. Hooks read them from here so a change made in the `/veneer` pane or
// in `/config` shows at once.
const optionsAtom = atom({ plugin: "veneer", key: "options" } as const, {} as PluginOptions);
const CLOSED_SETTINGS: SettingsPane = { editing: null, message: undefined };
const settingsPaneAtom = atom({ plugin: "veneer", key: "settingsPane" } as const, CLOSED_SETTINGS);

// The slash commands: each opens the pane, on the tab it names.
const SYNTAX_COMMAND = "syntax";
const SETTINGS_COMMAND = "veneer-settings";
// What the pane asks for, as a request: rows when seated above the prompt, columns when docked beside the transcript.
const PANE_ROWS = 24;
const PANE_COLUMNS = 72;
const SYNTAX_KEY = "syntaxTheme";
const EDITS_KEY = "editsCollapsed";
const MAX_REDIRECTS = 3;

// Opens a folded entry, or folds an open one again.
function flip($: EngineInterface, id: string): void {
  void update($, expandedAtom, (ids) => (ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]));
}

// Folds every edit card, or opens them all, for this session and as the choice later sessions start from. A card
// pressed on its own row is set back to follow the rest.
async function setEditsCollapsed($: EngineInterface, collapsed: boolean): Promise<void> {
  await update($, editsCollapsedAtom, () => collapsed);
  await update($, flippedEditsAtom, () => []);
  await $.store.set(EDITS_KEY, collapsed);
}

// Starts a session from the last choice, which a session already running does not follow when another changes it.
async function seedEdits($: EngineInterface): Promise<void> {
  const collapsed = (await $.store.get(EDITS_KEY)) === true;

  await update($, editsCollapsedAtom, () => collapsed);
  await update($, flippedEditsAtom, () => []);
}

// Scrolls the transcript until its first or newest row shows, with that row at the edge it belongs to.
async function scrollTranscript($: EngineInterface, end: "top" | "bottom"): Promise<void> {
  const id = end === "top" ? firstRow() : lastRow();

  if (id === undefined) {
    $.ui.toast("The transcript has nothing to scroll to yet.", { timeoutMs: NOTICE_MS });

    return;
  }

  const { deny } = await $.ui
    .scroll({ to: { requestId: id }, block: end === "top" ? "start" : "end" })
    .catch((error: unknown) => ({ deny: error instanceof Error ? error.message : String(error) }));

  if (deny !== undefined) {
    $.ui.toast(`Could not scroll to the ${end}: ${deny}`, { timeoutMs: NOTICE_MS });
  }
}

function flipEdit($: EngineInterface, id: string): void {
  void update($, flippedEditsAtom, (ids) => (ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]));
}

async function themeFile($: EngineInterface, path: string): Promise<string | undefined> {
  return $.fs.read(path).catch(() => undefined);
}

async function refreshPalette($: EngineInterface, theme?: unknown): Promise<void> {
  const setting = theme ?? (await $.config.list()).find((row) => row.key === "theme")?.value;
  const palette = await loadPalette(setting, await $.env.get("HOME"), await $.env.get("COLORFGBG"), (path) =>
    themeFile($, path),
  );

  await update($, paletteAtom, () => palette);
}

const pictureIo = ($: EngineInterface): PictureIo => ({
  run: async (argv, stdin) => (await $.process.run(argv, { stdin, timeoutMs: 5000 }).catch(() => null))?.exitCode === 0,
  readBase64: (path) =>
    $.fs.read(path, { as: "bytes" }).then(
      (file) => file.base64,
      () => undefined,
    ),
});

// The folder the person's syntax themes are kept in, or undefined when no Claude folder can be found.
async function themesFolder($: EngineInterface): Promise<string | undefined> {
  const [configDir, home] = await Promise.all([$.env.get("CLAUDE_CONFIG_DIR"), $.env.get("HOME")]);
  const root = configDirOf(configDir, home);

  return root === undefined ? undefined : themesDirOf(root);
}

// The folder the saved themes are kept in and their names.
async function savedThemes($: EngineInterface): Promise<{ folder: string | undefined; names: string[] }> {
  const folder = await themesFolder($);

  return { folder, names: folder === undefined ? [] : themeNames(await $.fs.list(folder).catch(() => [])) };
}

// The chosen syntax theme as a file path, empty for the shipped one, with what reads files.
async function syntaxOf($: EngineInterface): Promise<{ io: SyntaxIo; themePath: string }> {
  const [preview, chosen] = await Promise.all([read($, syntaxPreviewAtom), read($, syntaxAtom)]);
  const name = preview ?? chosen;
  const folder = name === "" ? undefined : await themesFolder($);
  const io: SyntaxIo = { root: $.plugin.root, read: (path) => $.fs.read(path).catch(() => undefined) };

  return { io, themePath: folder === undefined ? "" : `${folder}/${name}${THEME_EXTENSION}` };
}

// Highlights code with the syntax theme.
async function painterFor($: EngineInterface): Promise<Painter> {
  const { io, themePath } = await syntaxOf($);

  return (hint, code) => highlight(io, themePath, hint, code);
}

// The fill the syntax theme sets behind a kind of card; undefined when that card has the switch off or the theme sets none.
async function backgroundFor($: EngineInterface, config: Config, card: Backdrop): Promise<string | undefined> {
  if (!config.backgrounds[card]) {
    return undefined;
  }

  const { io, themePath } = await syntaxOf($);

  return themeBackground(io, themePath);
}

async function showPane($: EngineInterface, pane: Partial<SyntaxPane>): Promise<void> {
  await update($, syntaxPaneAtom, (current) => ({ ...current, ...pane }));
}

// Makes a theme the chosen one, now and in later sessions. Empty chooses the shipped default.
async function chooseTheme($: EngineInterface, name: string): Promise<void> {
  await (name === "" ? $.store.delete(SYNTAX_KEY) : $.store.set(SYNTAX_KEY, name));
  await update($, syntaxAtom, () => name);
}

// Chooses a theme and closes the picker, which ends the preview.
async function chooseAndClose($: EngineInterface, name: string): Promise<void> {
  await chooseTheme($, name);
  await $.ui.close({ id: PANE_ID });
}

type Fetched = { ok: boolean; status: number; text: string };

// A text file from the network, with the redirects Open VSX answers file addresses with followed by hand in case the
// host does not follow them. Undefined when the network cannot be reached.
async function fetchText($: EngineInterface, url: string): Promise<Fetched | undefined> {
  let target = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await $.http.fetch(target).catch(() => undefined);
    const location = response?.headers.location;

    if (response === undefined || response.status < 300 || response.status >= 400 || location === undefined) {
      return response;
    }

    target = location.startsWith("/") ? `${OPEN_VSX_ORIGIN}${location}` : location;

    if (!target.startsWith("https://")) {
      return undefined;
    }
  }

  return undefined;
}

// The text of a file inside an extension on Open VSX, or undefined when there is none.
async function extensionFile($: EngineInterface, extension: ExtensionId, path: string): Promise<string | undefined> {
  const file = await fetchText($, fileUrl(extension, path));

  return file?.ok ? file.text : undefined;
}

// Reads the themes an extension on Open VSX holds. One theme is fetched at once; several are offered to choose from.
async function loadExtension($: EngineInterface, extension: ExtensionId): Promise<void> {
  const label = `${extension.publisher}.${extension.name}`;

  await showPane($, { message: `Fetching ${label} from Open VSX...` });

  const manifest = await fetchText($, fileUrl(extension, "package.json"));

  if (manifest === undefined) {
    return showPane($, { message: "Could not reach Open VSX." });
  }

  if (!manifest.ok) {
    return showPane($, {
      message:
        manifest.status === 404 ? `Open VSX has no extension ${label}.` : `Open VSX answered ${manifest.status}.`,
    });
  }

  let themes = themesOf(manifest.text);

  if (needsStrings(themes)) {
    const strings = await extensionFile($, extension, "package.nls.json");

    themes = themesOf(manifest.text, strings);
  }

  const [only, ...others] = themes;

  if (only === undefined) {
    return showPane($, { message: `${label} has no color themes.` });
  }

  await (others.length === 0
    ? loadVariant($, extension, only)
    : showPane($, { step: "variant", extension: label, variants: themes, page: 0, message: undefined }));
}

// Fetches one theme of an extension on Open VSX, folds in the files it includes, and asks what to call it.
async function loadVariant($: EngineInterface, extension: ExtensionId, theme: ThemeChoice): Promise<void> {
  await showPane($, { message: `Fetching ${theme.label}...` });

  const text = await extensionFile($, extension, theme.path);

  if (text === undefined) {
    return showPane($, { message: `Could not fetch ${theme.label} from Open VSX.` });
  }

  const content = await flattenTheme(text, theme.path, (path) => extensionFile($, extension, path.slice(1)));
  const problem = content === undefined ? "That file is not valid JSON." : themeProblem(content);

  await (problem === undefined
    ? showPane($, { step: "name", path: theme.label, content: content ?? "", message: undefined })
    : showPane($, { message: problem }));
}

// First step of adding a theme: an extension on Open VSX, or the file the person named.
async function readThemeSource($: EngineInterface, input: string): Promise<void> {
  const extension = parseExtensionId(input);

  await (extension === undefined ? readThemeFile($, input) : loadExtension($, extension));
}

// The row of a paged list that was chosen: an extension from the popular list, or one theme of an extension.
async function chooseRow($: EngineInterface, index: number): Promise<void> {
  const pane = await read($, syntaxPaneAtom);

  if (pane.step === "popular") {
    const extension = parseExtensionId(POPULAR_THEMES[index]?.id ?? "");

    return extension === undefined ? undefined : loadExtension($, extension);
  }

  const extension = parseExtensionId(pane.extension);
  const theme = pane.variants[index];

  return extension === undefined || theme === undefined ? undefined : loadVariant($, extension, theme);
}

// First step of adding a theme from a file: the file the person named, kept if it reads as a theme.
async function readThemeFile($: EngineInterface, input: string): Promise<void> {
  const path = expandHome(input.trim(), await $.env.get("HOME"));
  const text = path === "" ? undefined : await $.fs.read(path).catch(() => undefined);
  const problem = text === undefined ? `Could not read ${path === "" ? "an empty path" : path}.` : themeProblem(text);

  await (problem === undefined
    ? showPane($, { step: "name", path, content: text ?? "", message: undefined })
    : showPane($, { message: problem }));
}

// Last step of adding a theme: copies the file into the themes folder under the name asked for, or its own name, with a
// number added when that name is taken, and chooses it.
async function importTheme($: EngineInterface, requested: string): Promise<void> {
  const { path, content } = await read($, syntaxPaneAtom);
  const folder = await themesFolder($);

  if (folder === undefined) {
    return showPane($, { step: "list", message: "The Claude folder could not be found." });
  }

  const taken = themeNames(await $.fs.list(folder).catch(() => []));
  const name = uniqueName(importName(requested, path), taken);

  try {
    await $.fs.write(`${folder}/${name}${THEME_EXTENSION}`, content);
  } catch {
    return showPane($, { message: `Could not write ${name}${THEME_EXTENSION} to ${folder}.` });
  }

  await showPane($, LIST_PANE);
  await chooseAndClose($, name);
  $.ui.toast(`Added ${name} from ${baseNameOf(path)}.`);
}

// Whether a block of a reply is drawn as a picture: a table, a heading, an equation or a Mermaid fence, unless the settings leave
// graphics to native drawing.
function wantsPicture(segment: Segment, config: Config): segment is Exclude<Segment, { kind: "text" }> {
  return (
    !config.nativeGraphics &&
    (segment.kind === "table" ||
      segment.kind === "heading" ||
      segment.kind === "math" ||
      (segment.kind === "code" && segment.lang === "mermaid"))
  );
}

// The picture a block of a reply is drawn as, or null where it stays text.
function sketchOf(
  segment: Exclude<Segment, { kind: "text" }>,
  available: number,
  palette: Palette,
  font: Font,
): Sketch | null {
  switch (segment.kind) {
    case "table":
      return tableSketch(segment, available, palette, font);
    case "heading":
      return headingSketch(segment, available, palette, font);
    case "math":
      return mathSketch(segment.tex, available, palette, font);
    case "code":
      return diagramSketch(segment.code, available, palette, font);
  }
}

const MAX_SHRINKS = 3;
const MEMORY_REDUCED = 50;
const reduced = new Set<string>();

// The images as drawn under a row or a group: a picture each where pictures work, else the name and size. The pictures
// of one call share the engine's size limit, so they are drawn again smaller until they fit, and the person is told once.
async function shownImages(
  $: EngineInterface,
  found: readonly Found[],
  config: Config,
  columns: number,
  canDraw: boolean,
): Promise<Shown[]> {
  const isOff = canDraw ? (await read($, offAtom)) !== null : true;
  const text = (image: Found): Shown => ({ id: image.id, alt: altOf(image, sizeOfFound(image)), picture: null });

  if (isOff || found.length === 0) {
    return found.map(text);
  }

  const font = { family: config.fontFamily, cellHeight: cellHeightOf(config.cellRatio) };
  const available = Math.min(MAX_COLUMNS, columns - 2 * MARGIN);
  const dir = await pictureDir($);
  const io = pictureIo($);
  const look = `${dir}|${font.family}|${font.cellHeight}`;
  const draw = (image: Found, width: number, rows: number) =>
    pictureFor(
      io,
      dir,
      `${look}|${width}|${rows}|image|${image.id}`,
      () => imageSketch(image, width, rows, font.cellHeight, font),
      font,
    );
  let pictures = await Promise.all(found.map((image) => draw(image, available, config.imageRows)));

  for (let pass = 0; pass < MAX_SHRINKS; pass++) {
    const factor = shrinkFactor(treeBytes(pictures));

    if (factor === 1) {
      break;
    }

    const key = found.map(({ id }) => id).join("|");

    if (!reduced.has(key)) {
      reduced.add(key);
      $.ui.toast("Veneer made images smaller to fit Claude Code's size limit.", { timeoutMs: NOTICE_MS });

      if (reduced.size > MEMORY_REDUCED) {
        reduced.delete(reduced.values().next().value as string);
      }
    }

    const current = pictures;

    pictures = await Promise.all(
      found.map((image, at) => {
        const picture = current[at];

        return picture === null || picture === undefined
          ? null
          : draw(
              image,
              Math.max(1, Math.floor(picture.columns * factor)),
              Math.max(1, Math.floor(picture.rows * factor)),
            );
      }),
    );
  }

  const fits = shrinkFactor(treeBytes(pictures)) === 1;

  return found.map((image, at) => {
    const picture = fits ? pictures[at] : null;

    return picture === null || picture === undefined ? text(image) : { id: image.id, alt: picture.alt, picture };
  });
}

const pasted = new Map<string, Found[]>();
const MEMORY_PASTED = 20;

// The images pasted into a prompt row, looked up once per row.
async function pastedOf($: EngineInterface, requestId: string, text: string): Promise<Found[]> {
  const known = pasted.get(requestId);

  if (known !== undefined) {
    return known;
  }

  const found = pastedImagesOf(await $.session.messages({ as: "api" }), text, requestId);

  if (found === null) {
    return [];
  }

  pasted.set(requestId, found);

  if (pasted.size > MEMORY_PASTED) {
    pasted.delete(pasted.keys().next().value as string);
  }

  return found;
}

const DRAFT_POLL_MS = 400;
// Where Claude Code keeps a pasted image from the moment it is pasted: `<root>/claude-<uid>/<project>/<session>/images`.
const IMAGE_ROOT = "/tmp/";
const MEMORY_DRAFT_FILES = 4;
const draftPaths = new Map<string, string>();
const draftFiles = new Map<string, Found>();
let draftWatch: Timer | undefined;

// Keeps `draftImagesAtom` equal to the images the prompt box holds. A paste fires no `prompt.edit`, so the box is read
// on a timer.
function watchDraft($: EngineInterface): void {
  draftWatch ??= $.clock.every(DRAFT_POLL_MS, () => {
    void (async () => {
      const ids = draftImageIds((await $.prompt.read()).text);
      const shown = await read($, draftImagesAtom);

      if (ids.join() !== shown.join()) {
        await update($, draftImagesAtom, () => ids);
      }
    })().catch(() => null);
  });
}

// The pasted images of the draft as the files Claude Code wrote them to; the few read last are kept so a redraw does not
// read them again.
async function draftImagesOf($: EngineInterface, ids: readonly string[]): Promise<Found[]> {
  const session = await $.session.id();
  const keyOf = (id: string) => `${session}/${id}`;

  if (ids.some((id) => !draftPaths.has(keyOf(id)))) {
    const run = await $.process
      .run(["find", IMAGE_ROOT, "-maxdepth", "5", "-path", `*/${session}/images/*.png`], { timeoutMs: 3000 })
      .catch(() => null);

    for (const path of run?.stdout.split("\n") ?? []) {
      const name = path.slice(path.lastIndexOf("/") + 1, -".png".length);

      if (name !== "") {
        draftPaths.set(keyOf(name), path);
      }
    }
  }

  const found = await Promise.all(
    ids.map(async (id): Promise<Found[]> => {
      const key = keyOf(id);
      const held = draftFiles.get(key);
      const path = draftPaths.get(key);

      if (held !== undefined) {
        return [held];
      }

      const file = path === undefined ? undefined : await $.fs.read(path, { as: "bytes" }).catch(() => undefined);

      if (file === undefined) {
        return [];
      }

      const image = { id: `draft#${key}`, base64: file.base64, mediaType: "image/png", name: `Image ${id}` };

      draftFiles.set(key, image);

      if (draftFiles.size > MEMORY_DRAFT_FILES) {
        draftFiles.delete(draftFiles.keys().next().value as string);
      }

      return [image];
    }),
  );

  return found.flat();
}

async function pictureDir($: EngineInterface): Promise<string> {
  return `${((await $.env.get("TMPDIR")) ?? "/tmp").replace(/[\\/]+$/, "")}/veneer-pictures`;
}

// Creates the picture folder and drops pictures a week old.
async function prepareFolder($: EngineInterface): Promise<void> {
  const dir = await pictureDir($);

  await $.process.run(["mkdir", "-p", dir], { timeoutMs: 2000 }).catch(() => null);
  await $.process
    .run(["find", dir, "-type", "f", "-name", "*.png", "-mtime", "+7", "-delete"], { timeoutMs: 5000 })
    .catch(() => null);
}

// What this terminal cannot draw: icons by the setting and the terminal, links wherever pictures are off.
async function plainOf($: EngineInterface): Promise<Plain> {
  const [icons, links] = await Promise.all([read($, plainIconsAtom), read($, plainLinksAtom)]);

  return { icons, links };
}

// How the counts of an edit are drawn as pills, or undefined while the setting leaves them plain text. Rounded ends need
// a symbol font, so a terminal without one gets square ends.
async function pillsFor($: EngineInterface): Promise<PillLook | undefined> {
  const { changeStyle } = await configNow($);

  if (changeStyle === "text") {
    return undefined;
  }

  const [palette, plain] = await Promise.all([read($, paletteAtom), plainOf($)]);

  return { isAnsi: palette.isAnsi, hasRoundEnds: changeStyle === "rounded" && !plain.icons };
}

async function settle($: EngineInterface, { icons, links }: Pick<Config, "icons" | "links">): Promise<Off | null> {
  const env = {
    force: await $.env.get("CLAUDE_CODE_FORCE_TERMINAL_IMAGES"),
    tmux: await $.env.get("TMUX"),
    program: await $.env.get("TERM_PROGRAM"),
    term: await $.env.get("TERM"),
    kittyWindow: await $.env.get("KITTY_WINDOW_ID"),
    weztermExecutable: await $.env.get("WEZTERM_EXECUTABLE"),
    ghosttyResources: await $.env.get("GHOSTTY_RESOURCES_DIR"),
  };
  const terminal = terminalOff(env);
  const probe =
    terminal === null ? await $.process.run(["resvg", "--version"], { timeoutMs: 2000 }).catch(() => null) : null;
  const off = terminal ?? (probe?.exitCode === 0 ? null : "resvg");

  await update($, offAtom, () => off);
  await update($, plainIconsAtom, () => iconsArePlain(icons, env));
  await update($, plainLinksAtom, () => linksArePlain(links, env));

  const chosen = await $.store.get(SYNTAX_KEY);

  await update($, syntaxAtom, () => (typeof chosen === "string" ? chosen : ""));
  await $.command
    .register({ name: PANE_ID, description: "Change Veneer's settings and syntax theme" })
    .catch(() => null);
  await $.command.register({ name: SETTINGS_COMMAND, description: "Change Veneer's settings" }).catch(() => null);
  await $.command.register({ name: SYNTAX_COMMAND, description: "Choose the syntax theme for code" }).catch(() => null);
  await refreshPalette($);

  if (off === null) {
    await prepareFolder($);
  }

  return off;
}

const configNow = async ($: EngineInterface): Promise<Config> => configOf(await read($, optionsAtom));

// Takes the settings as `/config` holds them, which may be newer than the ones the plugin was registered with.
async function seedOptions($: EngineInterface, options: PluginOptions): Promise<void> {
  const rows = await $.config.list().catch(() => []);
  const current = rows
    .filter(({ key }) => key.startsWith(SETTINGS_PREFIX))
    .map(({ key, value }) => [fieldOf(key), value] as const);

  await update($, optionsAtom, () => ({ ...options, ...Object.fromEntries(current) }));
}

async function settingsOf($: EngineInterface): Promise<Setting[]> {
  return (await $.config.list()).filter(({ key }) => key.startsWith(SETTINGS_PREFIX));
}

async function showSettings($: EngineInterface, pane: Partial<SettingsPane>): Promise<void> {
  await update($, settingsPaneAtom, (current) => ({ ...current, ...pane }));
}

// Writes one setting the way `/config` does and takes it into effect. The terminal is settled again where the setting
// decides what it draws with.
async function writeSetting(
  $: EngineInterface,
  setting: Setting,
  value: Setting["value"],
): Promise<string | undefined> {
  const { deny } = await $.config.set({ key: setting.key, value }).catch((error: unknown) => ({ deny: String(error) }));

  if (deny !== undefined) {
    return `${setting.label} was not changed: ${deny}`;
  }

  const field = fieldOf(setting.key);

  await update($, optionsAtom, (current) => ({ ...current, [field]: value }));

  if (field === "icons" || field === "links") {
    await settle($, await configNow($));
  }

  return undefined;
}

async function applySetting($: EngineInterface, setting: Setting, value: Setting["value"]): Promise<void> {
  await showSettings($, { editing: null, message: await writeSetting($, setting, value) });
}

// `/veneer <setting> <value>`: changes one setting without opening the pane. Bare `/veneer` opens the pane.
async function runSettingsCommand($: EngineInterface, args: string): Promise<{ text?: string }> {
  if (args.trim() === "") {
    return openPane($, "settings");
  }

  const edits = /^edits(?:\s+(collapse|expand))?$/i.exec(args.trim());

  if (edits !== null) {
    const collapsed =
      edits[1] === undefined ? !(await read($, editsCollapsedAtom)) : edits[1].toLowerCase() === "collapse";

    await setEditsCollapsed($, collapsed);

    return { text: collapsed ? "Edits are collapsed." : "Edits are expanded." };
  }

  const change = parseSettingChange(await settingsOf($), args);

  if ("error" in change) {
    return { text: change.error };
  }

  const failure = await writeSetting($, change.setting, change.value);

  return {
    text: failure ?? `${change.setting.label} set to ${valueText({ ...change.setting, value: change.value })}.`,
  };
}

// A press on a setting: a switch or a choice moves on, and a typed setting turns into a field.
async function changeSetting($: EngineInterface, setting: Setting): Promise<void> {
  await (isTyped(setting)
    ? showSettings($, { editing: setting.key, message: undefined })
    : applySetting($, setting, nextValue(setting)));
}

async function submitSetting($: EngineInterface, setting: Setting, text: string): Promise<void> {
  const value = setting.kind === "number" ? Number(text) : text.trim();

  await (Number.isNaN(value)
    ? showSettings($, { editing: null, message: `${setting.label} takes a number.` })
    : applySetting($, setting, value));
}

// Shows a tab from its first step: no field open, no import half done, no theme previewed.
async function switchTab($: EngineInterface, tab: Tab): Promise<void> {
  await update($, tabAtom, () => tab);
  await showPane($, LIST_PANE);
  await showSettings($, CLOSED_SETTINGS);
  await update($, syntaxPreviewAtom, () => null);
}

async function openPane($: EngineInterface, tab: Tab): Promise<{ text?: string }> {
  await switchTab($, tab);

  const opened = await $.ui.open({
    id: PANE_ID,
    title: "Veneer",
    focus: true,
    closeOnEscape: true,
    rows: PANE_ROWS,
    columns: PANE_COLUMNS,
  });

  return opened.isPlaced ? {} : { text: "The Veneer pane could not be shown: " + opened.reason };
}

export const register: Register = (on, options) => {
  on("session.start", async ($, e, next) => {
    forgetRows();
    await seedOptions($, options);
    await seedEdits($);

    const off = await settle($, await configNow($));

    if (off !== null) {
      $.ui.toast(OFF_TEXT[off], { timeoutMs: NOTICE_MS });
    }

    watchDraft($);

    return next(e);
  });

  // A reload of the mod starts no session, so the first edit to the prompt box starts the watch.
  on("prompt.edit", ($, e, next) => {
    watchDraft($);

    return next(e);
  });

  // /clear, /resume and /branch reset the session's state and skip session.start.
  on("classic.SessionStart", { source: ["clear", "resume", "fork"] }, async ($, e, next) => {
    forgetRows();
    await seedOptions($, options);
    await seedEdits($);
    await settle($, await configNow($));

    return next(e);
  });

  on("prompt.compose", async ($, e, next) => {
    const result = await next(e);
    const isHeadless = e.surfaces.length === 0 || e.traits.includes("bare") || e.traits.includes("print");

    return isHeadless || !(await configNow($)).diagramHint
      ? result
      : { sections: [...result.sections, { id: "veneer:diagrams", text: MERMAID_HINT, scope: "session" as const }] };
  });

  on("ui.render", { component: "UserMessage" }, async ($, e, next) => {
    noteRow(e.requestId);

    const { text, origin } = e.props;
    const config = await configNow($);
    const hasImages = config.images && text.includes(PASTED_MARKER);

    if (
      e.surface !== "terminal" ||
      (!config.styleUserMessage && !hasImages) ||
      origin.kind !== "composer" ||
      text.trim() === ""
    ) {
      return next(e);
    }

    const found = hasImages ? await pastedOf($, e.requestId, text) : [];
    const words = found.length > 0 ? withoutMarkers(text) : text;
    const native = await next(words === text || words === "" ? e : { ...e, props: { ...e.props, text: words } });

    if (native.type !== "engine") {
      return native;
    }

    const ui = $.ui.resolve(e);
    const columns = e.viewport?.columns ?? 100;
    const withImages = async (row: RenderElement | null): Promise<RenderElement> => {
      if (found.length === 0) {
        return row ?? native;
      }

      const { Box } = ui;
      const shown = await shownImages($, found, config, columns, "Image" in ui);

      return (
        <Box flexDirection="column">
          {row}
          {imageColumn(ui, shown, MARGIN, config.align === "right" ? "flex-end" : "flex-start")}
        </Box>
      );
    };

    if (words === "") {
      return withImages(null);
    }

    if (!config.styleUserMessage) {
      return withImages(native);
    }

    const copy = {
      scope: `bubble:${e.requestId}`,
      isPlain: await read($, plainIconsAtom),
      onCopy: async () => {
        const { isCopied } = await $.ui.copy({ text: words, surface: e.surface });

        $.ui.toast(isCopied ? "Message copied" : "Copy failed");
      },
    };

    return withImages(userBubble(ui, words, columns, config.align, copy));
  });

  on("ui.render", { component: "AssistantMessage" }, async ($, e, next) => {
    noteRow(e.requestId);

    const native = await next(e);
    const { text, isFirstOfReply, isSummary } = e.props;

    // A tree another mod returned is theirs; only core's own drawing is replaced.
    if (e.surface !== "terminal" || native.type !== "engine" || isSummary === true || text.trim() === "") {
      return native;
    }

    const ui = $.ui.resolve(e);
    const segments = splitReply(text);
    const bullet = isFirstOfReply ? BULLET : null;
    const hasPictures = "Image" in ui && hasDrawn(segments);
    const hasCode = segments.some((segment) => segment.kind === "code");
    const [config, isPlain, off] = await Promise.all([
      configNow($),
      read($, plainIconsAtom),
      hasPictures ? read($, offAtom) : null,
    ]);
    const isPictured = hasPictures && off === null;
    const [fences, fenceBackground, palette, dir] = await Promise.all([
      hasCode ? painterFor($).then((paint) => paintFences(paint, segments)) : undefined,
      hasCode ? backgroundFor($, config, "fences") : undefined,
      isPictured ? read($, paletteAtom) : undefined,
      isPictured ? pictureDir($) : undefined,
    ]);
    const copyFor = (index: number, source: string, noun: string) => ({
      scope: `copy:${e.requestId}:${index}`,
      isPlain,
      onCopy: async () => {
        const { isCopied } = await $.ui.copy({ text: source, surface: e.surface });

        $.ui.toast(isCopied ? `${noun} copied` : "Copy failed");
      },
    });
    const drawn = new Map<Segment, { picture: Picture; alt: string }>();
    const width = (e.viewport?.columns ?? 100) - GUTTER - 2 * MARGIN;
    const diagramOf = (source: string) =>
      diagramText(source, { columns: width - CARD_COLUMNS, ratio: config.cellRatio });

    if (!isPictured || palette === undefined || dir === undefined) {
      return replyTree(ui, segments, drawn, bullet, fences, fenceBackground, copyFor, width, diagramOf);
    }

    const font = { family: config.fontFamily, cellHeight: cellHeightOf(config.cellRatio) };
    const available = Math.min(MAX_COLUMNS, width);
    const io = pictureIo($);
    const look = `${dir}|${available}|${font.family}|${font.cellHeight}|${hashOf(JSON.stringify(palette))}`;

    await Promise.all(
      segments.map(async (segment) => {
        if (!wantsPicture(segment, config)) {
          return;
        }

        const picture = await pictureFor(
          io,
          dir,
          `${look}|${segment.kind}|${segment.raw}`,
          () => sketchOf(segment, available, palette, font),
          font,
        );

        if (picture !== null) {
          drawn.set(segment, { picture, alt: picture.alt });
        }
      }),
    );

    return replyTree(ui, segments, drawn, bullet, fences, fenceBackground, copyFor, width, diagramOf);
  });

  on("ui.render", { component: "ToolUse" }, async ($, e, next) => {
    noteRow(e.requestId);

    if (e.props.tool === "Bash" || e.props.tool === "Read") {
      rememberInput(e.props.tool_use_id, e.props.input);
    }

    const native = await next(e);
    const { isRunning, isErrored, output } = e.props;

    if (e.surface !== "terminal" || native.type !== "engine") {
      return native;
    }

    const ui = $.ui.resolve(e);
    const changes = !isRunning && !isErrored ? changeCounts(output) : null;
    const [commandRuns, plain, cwd, pills, { rowGap }] = await Promise.all([
      e.props.tool === "Bash" ? painterFor($).then((paint) => paintCommand(paint, e.props)) : undefined,
      plainOf($),
      $.session.cwd(),
      changes === null ? undefined : pillsFor($),
      configNow($),
    ]);
    const id = e.props.tool_use_id;
    const press = changes === null ? undefined : () => flipEdit($, id);
    const row = toolRow(ui, e.props, cwd, commandRuns, plain, press, rowGap) ?? native;

    return changes === null ? row : withBadges(ui, row, changes, pills, rowGap);
  });

  on("ui.render", { component: "ToolResult" }, async ($, e, next) => {
    const native = await next(e);

    if (e.surface !== "terminal" || native.type !== "engine" || e.props.isErrored) {
      return native;
    }

    const found = imagesOf(e.props, pathOfCall(e.props.tool_use_id));

    if (found.length > 0) {
      const config = await configNow($);

      if (!config.images) {
        return native;
      }

      const ui = $.ui.resolve(e);
      const { Box } = ui;
      const shown = await shownImages($, found, config, e.viewport?.columns ?? 100, "Image" in ui);

      return (
        <Box flexDirection="column">
          {native}
          {imageColumn(ui, shown, MARGIN)}
        </Box>
      );
    }

    const { tool, output } = e.props;
    const diff = parseDiff(output);
    const lines = diff === null ? parseOutput(tool, output, await $.session.cwd()) : null;

    if (diff === null && lines === null) {
      return native;
    }

    const id = e.props.tool_use_id;

    if (diff !== null) {
      const [collapsed, flipped] = await Promise.all([read($, editsCollapsedAtom), read($, flippedEditsAtom)]);

      if (collapsed !== flipped.includes(id)) {
        const { Box } = $.ui.resolve(e);

        return <Box />;
      }
    }

    const path = tool === "Read" || diff !== null ? filePathOf(output) : undefined;
    const [config, open, paint, palette] = await Promise.all([
      configNow($),
      read($, expandedAtom),
      path !== undefined || tool === "Bash" || tool === "Grep" ? painterFor($) : undefined,
      diff === null ? undefined : read($, paletteAtom),
    ]);
    const expanded = open.includes(id);
    const toggle = () => flip($, id);
    const ui = $.ui.resolve(e);
    // A folded card shows its first lines only, so only those are tokenized; unfolding paints the rest.
    const visible = expanded ? Infinity : MAX_LINES;

    if (diff === null) {
      const shown = lines ?? [];

      if (paint === undefined) {
        return outputCard(ui, shown, expanded, toggle, id);
      }

      const [painted, background] = await Promise.all([
        path === undefined
          ? paintOutput(paint, tool, commandOfCall(id), shown)
          : paintLines(paint, path, shown.slice(0, visible)).then((head) => [...head, ...shown.slice(visible)]),
        backgroundFor($, config, path === undefined ? "output" : "reads"),
      ]);

      return outputCard(ui, painted, expanded, toggle, id, outputFill(background, path !== undefined, painted));
    }

    const [runs, background] = await Promise.all([
      path === undefined || paint === undefined
        ? []
        : paintDiff(paint, path, { ...diff, lines: diff.lines.slice(0, visible) }),
      backgroundFor($, config, "diffs"),
    ]);

    return diffCard(ui, diff, palette?.isAnsi ?? false, expanded, toggle, id, runs, background);
  });

  on("ui.render", { component: "Spinner" }, async ($, e, next) => {
    const native = await next(e);

    if (e.surface !== "terminal" || !(await configNow($)).styleSpinner || native.type !== "engine") {
      return native;
    }

    const { Box } = $.ui.resolve(e);

    return (
      <Box marginLeft={MARGIN} marginRight={MARGIN}>
        {native}
      </Box>
    );
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const native = await next(e);

    if (e.surface !== "terminal" || e.props.hasSurvey || native.type !== "engine") {
      return native;
    }

    const [ids, config, collapsed, plain] = await Promise.all([
      read($, draftImagesAtom),
      configNow($),
      read($, editsCollapsedAtom),
      plainOf($),
    ]);
    const ui = $.ui.resolve(e);
    const { Box } = ui;
    const button = bandButtons(ui, collapsed, plain.icons, {
      toggleEdits: () => void setEditsCollapsed($, !collapsed),
      scrollTop: () => void scrollTranscript($, "top"),
      scrollBottom: () => void scrollTranscript($, "bottom"),
    });
    const fit = { ...config, imageRows: Math.min(config.imageRows, Math.max(2, e.props.maxRows - 2)) };
    const pictures =
      ids.length === 0 || !config.images
        ? null
        : imageColumn(
            ui,
            await shownImages($, await draftImagesOf($, ids), fit, e.props.bodyColumns, "Image" in ui),
            MARGIN,
          );

    return (
      <Box flexDirection="column">
        {pictures ?? native}
        {button}
      </Box>
    );
  });

  on("ui.render", { component: "ToolGroup" }, async ($, e, next) => {
    noteRow(e.requestId);

    const native = await next(e);

    if (e.surface !== "terminal" || native.type !== "engine" || e.props.isExpanded) {
      return native;
    }

    const [config, expandedIds, cwd] = await Promise.all([configNow($), read($, expandedAtom), $.session.cwd()]);
    const open = new Set(expandedIds);
    const { calls } = e.props;
    const showsRows = calls.length === 1 || open.has(`group:${e.requestId}`);
    const paint =
      showsRows && calls.some((call) => call.tool === "Bash" || call.tool === "Grep") ? await painterFor($) : undefined;
    const commandRuns = await Promise.all(
      calls.map((call) => (paint === undefined ? undefined : paintCommand(paint, call))),
    );
    const paintedOutput = await Promise.all(
      calls.map(async (call) => {
        const lines =
          paint === undefined || call.isRunning ? null : parseOutput(call.tool, call.output, cwd, call.isErrored);
        const command = (call.input as { command?: unknown } | null | undefined)?.command;

        return paint === undefined || lines === null || call.isErrored
          ? undefined
          : paintOutput(paint, call.tool, typeof command === "string" ? command : undefined, lines);
      }),
    );

    const ui = $.ui.resolve(e);
    const columns = e.viewport?.columns ?? 100;
    const foundIn = calls.map((call, i) => {
      const path = (call.input as { file_path?: unknown } | null | undefined)?.file_path;

      return {
        id: callIdOf(call, e.requestId, i),
        found: showsRows && config.images ? imagesOf(call, typeof path === "string" ? path : undefined) : [],
      };
    });
    const imageCalls = new Set(foundIn.filter(({ found }) => found.length > 0).map(({ id }) => id));
    const drawn = foundIn.map(({ id, found }) => (open.has(hiddenIdOf(id)) ? [] : found));
    const [reads, output, plain, shown] = await Promise.all([
      paint === undefined ? undefined : backgroundFor($, config, "reads"),
      paint === undefined ? undefined : backgroundFor($, config, "output"),
      plainOf($),
      shownImages($, drawn.flat(), config, columns, "Image" in ui),
    ]);
    let taken = 0;
    const images = drawn.map((found) => {
      const column = imageColumn(ui, shown.slice(taken, taken + found.length), 2);

      taken += found.length;

      return column;
    });

    return toolGroup(
      ui,
      calls,
      e.requestId,
      cwd,
      { open, toggle: (id) => flip($, id) },
      commandRuns,
      paintedOutput,
      paint === undefined ? {} : { reads, output },
      plain,
      images,
      imageCalls,
      config.rowGap,
    );
  });

  on("command.run", { command: PANE_ID }, ($, e) => runSettingsCommand($, e.args));

  on("command.run", { command: SETTINGS_COMMAND }, ($, e) => runSettingsCommand($, e.args));

  on("command.run", { command: SYNTAX_COMMAND }, ($) => openPane($, "syntax"));

  // The picker previews the theme its focus is on; the preview ends with the pane, however it closes. Moving the focus
  // off a field puts the row it replaced back.
  on("ui.focus", { component: "Pane", requestId: PANE_ID }, async ($, e, next) => {
    const result = await next(e);
    const value = e.element?.startsWith(THEME_KEY) ? e.element.slice(THEME_KEY.length) : undefined;

    if (result.deny === undefined) {
      await update($, focusAtom, () => e.element ?? null);

      const { editing } = await read($, settingsPaneAtom);

      if (e.element !== undefined && editing !== null && e.element !== `${SETTING_KEY}${editing}`) {
        await showSettings($, { editing: null });
      }

      if (e.element !== undefined && e.element !== PATH_KEY && (await read($, syntaxPaneAtom)).step === "path") {
        await showPane($, LIST_PANE);
      }

      await update($, syntaxPreviewAtom, () =>
        value === undefined || value === NEW_THEME || value === POPULAR_THEME
          ? null
          : value === DEFAULT_THEME
            ? ""
            : value,
      );
    }

    return result;
  });

  on("ui.close", { id: PANE_ID }, async ($, e, next) => {
    await update($, syntaxPreviewAtom, () => null);
    await update($, focusAtom, () => null);
    await showSettings($, CLOSED_SETTINGS);

    return next(e);
  });

  // Where the pane is taller than its room the engine scrolls it on an arrow key and the focus stays put. A single-row
  // move by the keys walks the focus instead, which brings its element into view; past either end, and for the wheel and
  // the page keys, the pane scrolls as before.
  on("ui.scroll", { requestId: PANE_ID }, async ($, e, next) => {
    if (e.origin.kind !== "person" || e.pointer !== undefined || Math.abs(e.by) !== 1) {
      return next(e);
    }

    const rows =
      (await read($, tabAtom)) === "settings"
        ? settingsKeys(groupSettings(await settingsOf($)))
        : paneKeys(await read($, syntaxPaneAtom), (await savedThemes($)).names, (await themesFolder($)) !== undefined);
    const keys = [...tabKeys, ...rows];
    const focused = await read($, focusAtom);
    const target = keys[(focused === null ? -1 : keys.indexOf(focused)) + e.by];

    if (target === undefined) {
      return next(e);
    }

    await $.ui.focus({ requestId: PANE_ID, key: target }).catch(() => null);

    return {};
  });

  on("ui.render", { component: "Pane", requestId: PANE_ID }, async ($, e, next) => {
    if (e.surface !== "terminal") {
      return next(e);
    }

    const ui = $.ui.resolve(e);
    const tab = await read($, tabAtom);
    const select = (chosen: Tab) => void switchTab($, chosen);

    if (tab === "settings") {
      // Read for its dependency: the pane draws again when a setting changes.
      await read($, optionsAtom);

      const { editing, message } = await read($, settingsPaneAtom);

      return tabbed(
        ui,
        tab,
        select,
        settingsPane(
          ui,
          {
            groups: groupSettings(await settingsOf($)),
            editing,
            focused: (await read($, focusAtom))?.slice(SETTING_KEY.length) ?? null,
            message,
          },
          {
            change: (setting) => void changeSetting($, setting),
            submit: (setting, text) => void submitSetting($, setting, text),
          },
        ),
      );
    }

    const config = await configNow($);
    const { folder, names } = await savedThemes($);
    const active = await read($, syntaxAtom);
    const paint = await painterFor($);
    const { io } = await syntaxOf($);
    const swatches = Object.fromEntries(
      await Promise.all(
        [DEFAULT_THEME, ...names].map(async (value) => [
          value,
          await themeSwatch(
            io,
            value === DEFAULT_THEME || folder === undefined ? "" : `${folder}/${value}${THEME_EXTENSION}`,
          ),
        ]),
      ),
    );

    return tabbed(
      ui,
      tab,
      select,
      syntaxPane(
        ui,
        {
          pane: await read($, syntaxPaneAtom),
          names,
          swatches,
          active,
          folder,
          samples: await Promise.all(SAMPLES.map(async ({ hint, code }) => (await paint(hint, code)) ?? undefined)),
          background: await backgroundFor($, config, "fences"),
        },
        {
          pick: (value) => {
            if (value === NEW_THEME) {
              void showPane($, { step: "path", message: undefined });
            } else if (value === POPULAR_THEME) {
              void showPane($, { step: "popular", page: 0, message: undefined });
            } else {
              void chooseAndClose($, value === DEFAULT_THEME ? "" : value);
            }
          },
          submitPath: (path) => void readThemeSource($, path),
          submitName: (name) => void importTheme($, name),
          choose: (index) => void chooseRow($, index),
          turnPage: (by) => void update($, syntaxPaneAtom, (current) => ({ ...current, page: current.page + by })),
          back: () => void showPane($, LIST_PANE),
        },
      ),
    );
  });

  on("config.set", async ($, e, next) => {
    const result = await next(e);

    if (e.key === "theme" && result.deny === undefined) {
      await refreshPalette($, result.value);
    }

    if (e.key.startsWith(SETTINGS_PREFIX) && result.deny === undefined) {
      const field = fieldOf(e.key);

      await update($, optionsAtom, (current) => ({ ...current, [field]: result.value }));

      if (field === "icons" || field === "links") {
        await settle($, await configNow($));
      }
    }

    return result;
  });
};
