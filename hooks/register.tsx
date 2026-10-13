import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import type { Off, Palette, SyntaxPane } from "../types";
import { configOf } from "./config";
import type { Backdrop, Config } from "./config";
import { iconsArePlain, linksArePlain, OFF_TEXT, terminalOff } from "./gate";
import { changeCounts, withBadges } from "./badge";
import { diffCard, parseDiff } from "./diff";
import { toolGroup } from "./group";
import { headingSketch } from "./heading";
import { hasDrawn, splitReply } from "./markdown";
import type { Segment } from "./markdown";
import { outputCard, parseOutput } from "./output";
import { baseOf } from "./palette";
import { cellHeightOf, MAX_COLUMNS, rasterize } from "./picture";
import type { Picture, PictureIo } from "./picture";
import { BULLET, GUTTER, MARGIN, replyTree } from "./reply";
import { commandOfCall, rememberInput } from "./calls";
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
// The element the picker's focus ring is on, which the arrow keys move from when the pane would scroll.
const syntaxFocusAtom = atom({ plugin: "veneer", key: "syntaxFocus" } as const, null as string | null);

const SYNTAX_PANE = "syntax";
// What the pane asks for, as a request: rows when seated above the prompt, columns when docked beside the transcript.
const PANE_ROWS = 22;
const PANE_COLUMNS = 72;
const SYNTAX_KEY = "syntaxTheme";
const MAX_REDIRECTS = 3;

// Opens a folded entry, or folds an open one again.
function flip($: EngineInterface, id: string): void {
  void update($, expandedAtom, (ids) => (ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]));
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
  const root = configDirOf(await $.env.get("CLAUDE_CONFIG_DIR"), await $.env.get("HOME"));

  return root === undefined ? undefined : themesDirOf(root);
}

// The folder the saved themes are kept in and their names.
async function savedThemes($: EngineInterface): Promise<{ folder: string | undefined; names: string[] }> {
  const folder = await themesFolder($);

  return { folder, names: folder === undefined ? [] : themeNames(await $.fs.list(folder).catch(() => [])) };
}

// The chosen syntax theme as a file path, empty for the shipped one, with what reads files.
async function syntaxOf($: EngineInterface): Promise<{ io: SyntaxIo; themePath: string }> {
  const name = (await read($, syntaxPreviewAtom)) ?? (await read($, syntaxAtom));
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
  await $.ui.close({ id: SYNTAX_PANE });
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
  return { icons: await read($, plainIconsAtom), links: await read($, plainLinksAtom) };
}

async function settle($: EngineInterface, { icons, links }: Pick<Config, "icons" | "links">): Promise<Off | null> {
  const env = {
    force: await $.env.get("CLAUDE_CODE_FORCE_TERMINAL_IMAGES"),
    tmux: await $.env.get("TMUX"),
    program: await $.env.get("TERM_PROGRAM"),
    term: await $.env.get("TERM"),
    kittyWindow: await $.env.get("KITTY_WINDOW_ID"),
    weztermExecutable: await $.env.get("WEZTERM_EXECUTABLE"),
    konsoleVersion: await $.env.get("KONSOLE_VERSION"),
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
  await $.command.register({ name: SYNTAX_PANE, description: "Choose the syntax theme for code" }).catch(() => null);
  await refreshPalette($);

  if (off === null) {
    await prepareFolder($);
  }

  return off;
}

export const register: Register = (on, options) => {
  const config = configOf(options);

  on("session.start", async ($, e, next) => {
    const off = await settle($, config);

    if (off !== null) {
      $.ui.toast(OFF_TEXT[off], { timeoutMs: NOTICE_MS });
    }

    return next(e);
  });

  // /clear, /resume and /branch reset the session's state and skip session.start.
  on("classic.SessionStart", { source: ["clear", "resume", "fork"] }, async ($, e, next) => {
    await settle($, config);

    return next(e);
  });

  on("ui.render", { component: "UserMessage" }, async ($, e, next) => {
    const { text, origin } = e.props;

    if (e.surface !== "terminal" || !config.styleUserMessage || origin.kind !== "composer" || text.trim() === "") {
      return next(e);
    }

    const native = await next(e);

    if (native.type !== "engine") {
      return native;
    }

    const copy = {
      scope: `bubble:${e.requestId}`,
      isPlain: await read($, plainIconsAtom),
      onCopy: async () => {
        const { isCopied } = await $.ui.copy({ text, surface: e.surface });

        $.ui.toast(isCopied ? "Message copied" : "Copy failed");
      },
    };

    return userBubble($.ui.resolve(e), text, e.viewport?.columns ?? 100, config.align, copy);
  });

  on("ui.render", { component: "AssistantMessage" }, async ($, e, next) => {
    const native = await next(e);
    const { text, isFirstOfReply, isSummary } = e.props;

    // A tree another mod returned is theirs; only core's own drawing is replaced.
    if (e.surface !== "terminal" || native.type !== "engine" || isSummary === true || text.trim() === "") {
      return native;
    }

    const ui = $.ui.resolve(e);
    const segments = splitReply(text);
    const bullet = isFirstOfReply ? BULLET : null;
    const isPlain = await read($, plainIconsAtom);
    const copyFor = (index: number, source: string, noun: string) => ({
      scope: `copy:${e.requestId}:${index}`,
      isPlain,
      onCopy: async () => {
        const { isCopied } = await $.ui.copy({ text: source, surface: e.surface });

        $.ui.toast(isCopied ? `${noun} copied` : "Copy failed");
      },
    });
    const drawn = new Map<Segment, { picture: Picture; alt: string }>();
    const fences = segments.some((segment) => segment.kind === "code")
      ? await paintFences(await painterFor($), segments)
      : undefined;
    const fenceBackground = fences === undefined ? undefined : await backgroundFor($, config, "fences");
    const width = (e.viewport?.columns ?? 100) - GUTTER - 2 * MARGIN;

    if (!("Image" in ui) || !hasDrawn(segments) || (await read($, offAtom)) !== null) {
      return replyTree(ui, segments, drawn, bullet, fences, fenceBackground, copyFor, width);
    }

    const palette = await read($, paletteAtom);
    const font = { family: config.fontFamily, cellHeight: cellHeightOf(config.cellRatio) };
    const available = Math.min(MAX_COLUMNS, width);
    const dir = await pictureDir($);
    const io = pictureIo($);

    await Promise.all(
      segments.map(async (segment) => {
        if (
          segment.kind === "text" ||
          segment.kind === "code" ||
          (segment.kind === "table" && config.nativeTables) ||
          (segment.kind === "heading" && config.nativeHeadings)
        ) {
          return;
        }

        const sketch =
          segment.kind === "table"
            ? tableSketch(segment, available, palette, font)
            : headingSketch(segment, available, palette, font);
        const picture = await rasterize(io, dir, sketch, font);

        if (picture !== null) {
          drawn.set(segment, { picture, alt: sketch.alt });
        }
      }),
    );

    return replyTree(ui, segments, drawn, bullet, fences, fenceBackground, copyFor, width);
  });

  on("ui.render", { component: "ToolUse" }, async ($, e, next) => {
    if (e.props.tool === "Bash") {
      rememberInput(e.props.tool_use_id, e.props.input);
    }

    const native = await next(e);
    const { isRunning, isErrored, output } = e.props;

    if (e.surface !== "terminal" || native.type !== "engine") {
      return native;
    }

    const ui = $.ui.resolve(e);
    const commandRuns = e.props.tool === "Bash" ? await paintCommand(await painterFor($), e.props) : undefined;
    const plain = await plainOf($);
    const row = toolRow(ui, e.props, await $.session.cwd(), commandRuns, plain) ?? native;
    const changes = !isRunning && !isErrored ? changeCounts(output) : null;

    return changes === null ? row : withBadges(ui, row, changes, (await read($, paletteAtom)).isAnsi, plain.icons);
  });

  on("ui.render", { component: "ToolResult" }, async ($, e, next) => {
    const native = await next(e);

    if (e.surface !== "terminal" || native.type !== "engine" || e.props.isErrored) {
      return native;
    }

    const { tool, output } = e.props;
    const diff = parseDiff(output);
    const lines = diff === null ? parseOutput(tool, output, await $.session.cwd()) : null;

    if (diff === null && lines === null) {
      return native;
    }

    const id = e.props.tool_use_id;
    const expanded = (await read($, expandedAtom)).includes(id);
    const toggle = () => flip($, id);
    const ui = $.ui.resolve(e);
    const path = tool === "Read" || diff !== null ? filePathOf(output) : undefined;

    const paint = path !== undefined || tool === "Bash" || tool === "Grep" ? await painterFor($) : undefined;

    if (diff === null) {
      const shown = lines ?? [];

      if (paint === undefined) {
        return outputCard(ui, shown, expanded, toggle, id);
      }

      const painted =
        path === undefined
          ? await paintOutput(paint, tool, commandOfCall(id), shown)
          : await paintLines(paint, path, shown);
      const background = await backgroundFor($, config, path === undefined ? "output" : "reads");

      return outputCard(ui, painted, expanded, toggle, id, outputFill(background, path !== undefined, painted));
    }

    const runs = path === undefined || paint === undefined ? [] : await paintDiff(paint, path, diff);

    return diffCard(
      ui,
      diff,
      (await read($, paletteAtom)).isAnsi,
      expanded,
      toggle,
      id,
      runs,
      await backgroundFor($, config, "diffs"),
    );
  });

  on("ui.render", { component: "Spinner" }, async ($, e, next) => {
    const native = await next(e);

    if (e.surface !== "terminal" || !config.styleSpinner || native.type !== "engine") {
      return native;
    }

    const { Box } = $.ui.resolve(e);

    return (
      <Box marginLeft={MARGIN} marginRight={MARGIN}>
        {native}
      </Box>
    );
  });

  on("ui.render", { component: "ToolGroup" }, async ($, e, next) => {
    const native = await next(e);

    if (e.surface !== "terminal" || native.type !== "engine" || e.props.isExpanded) {
      return native;
    }

    const open = new Set(await read($, expandedAtom));
    const cwd = await $.session.cwd();
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

    return toolGroup(
      $.ui.resolve(e),
      calls,
      e.requestId,
      cwd,
      { open, toggle: (id) => flip($, id) },
      commandRuns,
      paintedOutput,
      paint === undefined
        ? {}
        : { reads: await backgroundFor($, config, "reads"), output: await backgroundFor($, config, "output") },
      await plainOf($),
    );
  });

  on("command.run", { command: SYNTAX_PANE }, async ($) => {
    await showPane($, LIST_PANE);

    const opened = await $.ui.open({
      id: SYNTAX_PANE,
      title: "Syntax theme",
      focus: true,
      closeOnEscape: true,
      rows: PANE_ROWS,
      columns: PANE_COLUMNS,
    });

    return opened.isPlaced ? {} : { text: "The syntax theme pane could not be shown: " + opened.reason };
  });

  // The picker previews the theme its focus is on; the preview ends with the pane, however it closes.
  on("ui.focus", { component: "Pane", requestId: SYNTAX_PANE }, async ($, e, next) => {
    const result = await next(e);
    const value = e.element?.startsWith(THEME_KEY) ? e.element.slice(THEME_KEY.length) : undefined;

    if (result.deny === undefined) {
      await update($, syntaxFocusAtom, () => e.element ?? null);

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

  on("ui.close", { id: SYNTAX_PANE }, async ($, e, next) => {
    await update($, syntaxPreviewAtom, () => null);
    await update($, syntaxFocusAtom, () => null);

    return next(e);
  });

  // Where the pane is taller than its room the engine scrolls it on an arrow key and the focus stays put. A single-row
  // move by the keys walks the focus instead, which brings its element into view; past either end, and for the wheel and
  // the page keys, the pane scrolls as before.
  on("ui.scroll", { requestId: SYNTAX_PANE }, async ($, e, next) => {
    if (e.origin.kind !== "person" || e.pointer !== undefined || Math.abs(e.by) !== 1) {
      return next(e);
    }

    const { names } = await savedThemes($);
    const keys = paneKeys(await read($, syntaxPaneAtom), names, (await themesFolder($)) !== undefined);
    const focused = await read($, syntaxFocusAtom);
    const target = keys[(focused === null ? -1 : keys.indexOf(focused)) + e.by];

    if (target === undefined) {
      return next(e);
    }

    await $.ui.focus({ requestId: SYNTAX_PANE, key: target }).catch(() => null);

    return {};
  });

  on("ui.render", { component: "Pane", requestId: SYNTAX_PANE }, async ($, e, next) => {
    if (e.surface !== "terminal") {
      return next(e);
    }

    const ui = $.ui.resolve(e);
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

    return syntaxPane(
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
    );
  });

  on("config.set", async ($, e, next) => {
    const result = await next(e);

    if (e.key === "theme" && result.deny === undefined) {
      await refreshPalette($, result.value);
    }

    return result;
  });
};
