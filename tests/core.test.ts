import { expect, test } from "claude-code/testing";

import { configOf } from "../hooks/config";
import { iconsArePlain, linksArePlain, terminalOff } from "../hooks/gate";
import { hexOf, paletteOf, parseTheme } from "../hooks/palette";
import { loadPalette } from "../hooks/theme";

const NONE = {
  force: undefined,
  tmux: undefined,
  program: undefined,
  term: undefined,
  kittyWindow: undefined,
  weztermExecutable: undefined,
  ghosttyResources: undefined,
};

test("terminals with the kitty graphics protocol draw pictures; other terminals and tmux do not", () => {
  expect(terminalOff({ ...NONE, program: "ghostty" })).toBeNull();
  expect(terminalOff({ ...NONE, term: "xterm-kitty" })).toBeNull();
  expect(terminalOff({ ...NONE, kittyWindow: "1" })).toBeNull();
  expect(terminalOff({ ...NONE, program: "WezTerm" })).toBe("terminal");
  expect(terminalOff({ ...NONE, weztermExecutable: "/usr/bin/wezterm" })).toBe("terminal");
  expect(terminalOff({ ...NONE, program: "WarpTerminal" })).toBe("terminal");
  expect(terminalOff({ ...NONE, program: "rio" })).toBe("terminal");
  expect(terminalOff({ ...NONE, term: "rio" })).toBe("terminal");
  expect(terminalOff({ ...NONE, program: "iTerm.app" })).toBe("terminal");
  expect(terminalOff({ ...NONE, program: "ghostty", tmux: "/tmp/tmux-1/default,1,0" })).toBe("tmux");
  expect(terminalOff({ ...NONE, tmux: "x", force: "1" })).toBeNull();
});

test("icons are Unicode symbols unless the terminal carries a symbol font or the setting says nerd", () => {
  expect(iconsArePlain("auto", { ...NONE, program: "ghostty" })).toBe(false);
  expect(iconsArePlain("auto", { ...NONE, program: "WezTerm" })).toBe(false);
  expect(iconsArePlain("auto", { ...NONE, program: "rio" })).toBe(false);
  expect(iconsArePlain("auto", { ...NONE, program: "WarpTerminal" })).toBe(true);
  expect(iconsArePlain("auto", { ...NONE, program: "Apple_Terminal" })).toBe(true);
  expect(iconsArePlain("nerd", { ...NONE, program: "WarpTerminal" })).toBe(false);
  expect(iconsArePlain("plain", { ...NONE, program: "ghostty" })).toBe(true);
});

test("paths are plain text in Rio and Terminal.app and links elsewhere, unless the setting says otherwise", () => {
  expect(linksArePlain("auto", { ...NONE, program: "ghostty" })).toBe(false);
  expect(linksArePlain("auto", { ...NONE, program: "WarpTerminal" })).toBe(false);
  expect(linksArePlain("auto", { ...NONE, program: "iTerm.app" })).toBe(false);
  expect(linksArePlain("auto", { ...NONE, program: "Apple_Terminal" })).toBe(true);
  expect(linksArePlain("auto", { ...NONE, program: "rio" })).toBe(true);
  expect(linksArePlain("auto", { ...NONE, term: "rio" })).toBe(true);
  expect(linksArePlain("link", { ...NONE, program: "Apple_Terminal" })).toBe(false);
  expect(linksArePlain("text", { ...NONE, program: "ghostty" })).toBe(true);
});

test("the links setting is auto unless set to link or text", () => {
  expect(configOf({}).links).toBe("auto");
  expect(configOf({ links: "link" }).links).toBe("link");
  expect(configOf({ links: "text" }).links).toBe("text");
  expect(configOf({ links: "both" }).links).toBe("auto");
});

test("theme colours of every accepted form become hex", () => {
  expect(hexOf("#ABC")).toBe("#aabbcc");
  expect(hexOf("#44C0FF")).toBe("#44c0ff");
  expect(hexOf("rgb(55, 55, 55)")).toBe("#373737");
  expect(hexOf("ansi:redBright")).toBe("#f14c4c");
  expect(hexOf("ansi:nope")).toBeNull();
  expect(hexOf("blue")).toBeNull();
  expect(hexOf(12)).toBeNull();
});

test("a theme file lays its overrides over its base preset", () => {
  const theme = parseTheme('{"base":"light","overrides":{"claude":"#8dd8ff","error":"nonsense"}}');

  expect(theme?.base).toBe("light");

  const palette = paletteOf(theme?.base, theme?.overrides);

  expect(palette.accent).toBe("#8dd8ff");
  expect(palette.error).toBe("#ab2b3f");
  expect(palette.text).toBe("#000000");
  expect(parseTheme("not json")).toBeNull();
  expect(parseTheme("[]")?.overrides).toBeUndefined();
});

test("the theme setting picks a custom file, a preset or the terminal background", async () => {
  const files: Record<string, string> = {
    "/home/a/.claude/themes/mine.json": '{"overrides":{"userMessageBackground":"#101010"}}',
  };
  const read = async (path: string) => files[path];

  expect((await loadPalette("custom:mine", "/home/a", undefined, read)).userBackground).toBe("#101010");
  expect((await loadPalette("custom:missing", "/home/a", undefined, read)).text).toBe("#ffffff");
  expect((await loadPalette("custom:../x", "/home/a", undefined, read)).text).toBe("#ffffff");
  expect((await loadPalette("light-ansi", "/home/a", undefined, read)).text).toBe("#000000");
  expect((await loadPalette("auto", "/home/a", "0;15", read)).text).toBe("#000000");
  expect((await loadPalette("auto", "/home/a", "15;0", read)).text).toBe("#ffffff");
});

test("message alignment is left unless set to right", () => {
  expect(configOf({}).align).toBe("left");
  expect(configOf({ messageAlign: "right" }).align).toBe("right");
  expect(configOf({ messageAlign: "middle" }).align).toBe("left");
});

test("blocks take the syntax theme background unless its switch is false", () => {
  expect(configOf({}).syntaxBackground).toBe(true);
  expect(configOf({ syntaxBackground: false }).syntaxBackground).toBe(false);
  expect(configOf({ syntaxBackground: "false" }).syntaxBackground).toBe(false);
});

test("the message bubble and spinner margin are on unless their switch is false", () => {
  expect(configOf({})).toMatchObject({ styleUserMessage: true, styleSpinner: true, fitted: true });
  expect(configOf({ blockWidth: "full" }).fitted).toBe(false);
  expect(configOf({ styleUserMessage: false, styleSpinner: "false" })).toMatchObject({
    styleUserMessage: false,
    styleSpinner: false,
  });
});

test("tool spacing sets the row gap, and with borders off the room a border takes", () => {
  const of = (blockBorders: boolean, toolSpacing = "low") => {
    const { frame, rowGap } = configOf({ blockBorders, toolSpacing });

    return { frame, rowGap };
  };

  expect(of(true)).toEqual({ frame: "bordered", rowGap: 0 });
  expect(of(true, "medium")).toEqual({ frame: "bordered", rowGap: 0 });
  expect(of(true, "high")).toEqual({ frame: "bordered", rowGap: 1 });
  expect(of(false, "low")).toEqual({ frame: "plain", rowGap: 0 });
  expect(of(false, "medium")).toEqual({ frame: "padded", rowGap: 0 });
  expect(of(false, "high")).toEqual({ frame: "padded", rowGap: 1 });
});

test("picture options fall back to their defaults when blank or out of range", () => {
  expect(configOf({}).fontFamily).toMatch(/^Arial, Helvetica Neue,/);
  expect(configOf({}).cellRatio).toBe(2.9);
  expect(configOf({ fontFamily: " Inter ", cellRatio: "2.4" })).toMatchObject({ cellRatio: 2.4 });
  expect(configOf({ fontFamily: " Inter " }).fontFamily).toMatch(/^Inter, Arial,/);
  expect(configOf({ fontFamily: "  ", cellRatio: "40" })).toMatchObject({
    fontFamily: configOf({}).fontFamily,
    cellRatio: 2.9,
  });
});
