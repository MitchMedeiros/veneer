import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import type { Off, Palette } from "../types";
import { configOf } from "./config";
import { OFF_TEXT, terminalOff } from "./gate";
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
import { filePathOf, paintCommand, paintDiff, paintFences, paintLines, paintOutput } from "./paint";
import type { Painter } from "./paint";
import { highlight } from "./syntax/highlight";
import type { SyntaxIo } from "./syntax/highlight";
import { tableSketch } from "./table";
import { toolRow } from "./tool-row";
import { loadPalette } from "./theme";
import { userBubble } from "./user-message";

const NOTICE_MS = 6000;

// Why Veneer is off this session; null when it draws.
const offAtom = atom({ plugin: "veneer", key: "off" } as const, null as Off | null);
// The tool calls whose diff card shows every line.
const expandedAtom = atom({ plugin: "veneer", key: "expanded" } as const, [] as string[]);
const paletteAtom = atom({ plugin: "veneer", key: "palette" } as const, baseOf("dark") as Palette);

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

// Highlights code with the theme file the person set, or the shipped one. A path may start with `~/`.
async function painterFor($: EngineInterface, setting: string): Promise<Painter> {
  const home = await $.env.get("HOME");
  const themePath = setting.startsWith("~/") && home !== undefined ? `${home}${setting.slice(1)}` : setting;
  const io: SyntaxIo = { root: $.plugin.root, read: (path) => $.fs.read(path).catch(() => undefined) };

  return (hint, code) => highlight(io, themePath, hint, code);
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

async function settle($: EngineInterface): Promise<Off | null> {
  const terminal = terminalOff({
    force: await $.env.get("CLAUDE_CODE_FORCE_TERMINAL_IMAGES"),
    tmux: await $.env.get("TMUX"),
    program: await $.env.get("TERM_PROGRAM"),
    term: await $.env.get("TERM"),
    kittyWindow: await $.env.get("KITTY_WINDOW_ID"),
  });
  const probe =
    terminal === null ? await $.process.run(["resvg", "--version"], { timeoutMs: 2000 }).catch(() => null) : null;
  const off = terminal ?? (probe?.exitCode === 0 ? null : "resvg");

  await update($, offAtom, () => off);

  if (off === null) {
    await refreshPalette($);
    await prepareFolder($);
  }

  return off;
}

export const register: Register = (on, options) => {
  const config = configOf(options);

  on("session.start", async ($, e, next) => {
    const off = await settle($);

    if (off !== null) {
      $.ui.toast(OFF_TEXT[off], { timeoutMs: NOTICE_MS });
    }

    return next(e);
  });

  // /clear, /resume and /branch reset the session's state and skip session.start.
  on("classic.SessionStart", { source: ["clear", "resume", "fork"] }, async ($, e, next) => {
    await settle($);

    return next(e);
  });

  on("ui.render", { component: "UserMessage" }, async ($, e, next) => {
    const { text, origin } = e.props;

    if (
      e.surface !== "terminal" ||
      origin.kind !== "composer" ||
      text.trim() === "" ||
      (await read($, offAtom)) !== null
    ) {
      return next(e);
    }

    return userBubble($.ui.resolve(e), text, e.viewport?.columns ?? 100, config.align);
  });

  on("ui.render", { component: "AssistantMessage" }, async ($, e, next) => {
    const native = await next(e);
    const { text, isFirstOfReply, isSummary } = e.props;

    // A tree another mod returned is theirs; only core's own drawing is replaced.
    if (
      e.surface !== "terminal" ||
      native.type !== "engine" ||
      isSummary === true ||
      text.trim() === "" ||
      (await read($, offAtom)) !== null
    ) {
      return native;
    }

    const ui = $.ui.resolve(e);
    const segments = splitReply(text);
    const bullet = isFirstOfReply ? BULLET : null;
    const drawn = new Map<Segment, { picture: Picture; alt: string }>();
    const fences = segments.some((segment) => segment.kind === "code")
      ? await paintFences(await painterFor($, config.syntaxTheme), segments)
      : undefined;

    if (!("Image" in ui) || !hasDrawn(segments)) {
      return replyTree(ui, segments, drawn, bullet, fences);
    }

    const palette = await read($, paletteAtom);
    const font = { family: config.fontFamily, cellHeight: cellHeightOf(config.cellRatio) };
    const available = Math.min(MAX_COLUMNS, (e.viewport?.columns ?? 100) - GUTTER - MARGIN);
    const dir = await pictureDir($);
    const io = pictureIo($);

    await Promise.all(
      segments.map(async (segment) => {
        if (segment.kind === "text" || segment.kind === "code") {
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

    return replyTree(ui, segments, drawn, bullet, fences);
  });

  on("ui.render", { component: "ToolUse" }, async ($, e, next) => {
    if (e.props.tool === "Bash") {
      rememberInput(e.props.tool_use_id, e.props.input);
    }

    const native = await next(e);
    const { isRunning, isErrored, output } = e.props;

    if (e.surface !== "terminal" || native.type !== "engine" || (await read($, offAtom)) !== null) {
      return native;
    }

    const ui = $.ui.resolve(e);
    const commandRuns =
      e.props.tool === "Bash" ? await paintCommand(await painterFor($, config.syntaxTheme), e.props) : undefined;
    const row = toolRow(ui, e.props, await $.session.cwd(), commandRuns) ?? native;
    const changes = !isRunning && !isErrored ? changeCounts(output) : null;

    return changes === null ? row : withBadges(ui, row, changes, (await read($, paletteAtom)).isAnsi);
  });

  on("ui.render", { component: "ToolResult" }, async ($, e, next) => {
    const native = await next(e);

    if (
      e.surface !== "terminal" ||
      native.type !== "engine" ||
      e.props.isErrored ||
      (await read($, offAtom)) !== null
    ) {
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

    const paint =
      path !== undefined || tool === "Bash" || tool === "Grep" ? await painterFor($, config.syntaxTheme) : undefined;

    if (diff === null) {
      const shown = lines ?? [];

      if (paint === undefined) {
        return outputCard(ui, shown, expanded, toggle, id);
      }

      const painted =
        path === undefined
          ? await paintOutput(paint, tool, commandOfCall(id), shown)
          : await paintLines(paint, path, shown);

      return outputCard(ui, painted, expanded, toggle, id);
    }

    const runs = path === undefined || paint === undefined ? [] : await paintDiff(paint, path, diff);

    return diffCard(ui, diff, (await read($, paletteAtom)).isAnsi, expanded, toggle, id, runs);
  });

  on("ui.render", { component: "Spinner" }, async ($, e, next) => {
    const native = await next(e);

    if (e.surface !== "terminal" || native.type !== "engine" || (await read($, offAtom)) !== null) {
      return native;
    }

    const { Box } = $.ui.resolve(e);

    return <Box marginLeft={MARGIN}>{native}</Box>;
  });

  on("ui.render", { component: "ToolGroup" }, async ($, e, next) => {
    const native = await next(e);

    if (
      e.surface !== "terminal" ||
      native.type !== "engine" ||
      e.props.isExpanded ||
      (await read($, offAtom)) !== null
    ) {
      return native;
    }

    const open = new Set(await read($, expandedAtom));
    const cwd = await $.session.cwd();
    const { calls } = e.props;
    const showsRows = calls.length === 1 || open.has(`group:${e.requestId}`);
    const paint =
      showsRows && calls.some((call) => call.tool === "Bash" || call.tool === "Grep")
        ? await painterFor($, config.syntaxTheme)
        : undefined;
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
    );
  });

  on("config.set", async ($, e, next) => {
    const result = await next(e);

    if (e.key === "theme" && result.deny === undefined && (await read($, offAtom)) === null) {
      await refreshPalette($, result.value);
    }

    return result;
  });
};
