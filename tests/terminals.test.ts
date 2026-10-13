import type { On } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

import { iconsArePlain, linksArePlain, OFF_TEXT, terminalOff } from "../hooks/gate";
import type { TerminalEnv } from "../hooks/gate";

const NONE: TerminalEnv = {
  force: undefined,
  tmux: undefined,
  program: undefined,
  term: undefined,
  kittyWindow: undefined,
  weztermExecutable: undefined,
  konsoleVersion: undefined,
  ghosttyResources: undefined,
};

type Terminal = {
  name: string;
  env: Partial<TerminalEnv>;
  pictures: boolean;
  nerdIcons: boolean;
  plainLinks: boolean;
};

// The variables each terminal sets, with what Veneer should do in it. Pictures need the kitty graphics protocol with
// Unicode placeholders, which is what Claude Code's own image element sends. iTerm2 speaks the protocol but not the
// placeholders, so it stays on text.
const TERMINALS: Terminal[] = [
  {
    name: "Ghostty",
    env: { program: "ghostty", term: "xterm-ghostty", ghosttyResources: "/r" },
    pictures: true,
    nerdIcons: true,
    plainLinks: false,
  },
  { name: "Ghostty over ssh", env: { term: "xterm-ghostty" }, pictures: true, nerdIcons: true, plainLinks: false },
  {
    name: "Ghostty with TERM overridden",
    env: { program: "ghostty", term: "xterm-256color" },
    pictures: true,
    nerdIcons: true,
    plainLinks: false,
  },
  {
    name: "cmux",
    env: { program: "ghostty", term: "xterm-ghostty", ghosttyResources: "/r" },
    pictures: true,
    nerdIcons: true,
    plainLinks: false,
  },
  { name: "kitty", env: { term: "xterm-kitty", kittyWindow: "1" }, pictures: true, nerdIcons: true, plainLinks: false },
  { name: "kitty over ssh", env: { term: "xterm-kitty" }, pictures: true, nerdIcons: true, plainLinks: false },
  {
    name: "WezTerm",
    env: { program: "WezTerm", term: "xterm-256color", weztermExecutable: "/w" },
    pictures: true,
    nerdIcons: true,
    plainLinks: false,
  },
  {
    name: "WezTerm with its own TERM",
    env: { program: "WezTerm", term: "wezterm" },
    pictures: true,
    nerdIcons: true,
    plainLinks: false,
  },
  { name: "Rio", env: { program: "rio", term: "rio" }, pictures: true, nerdIcons: true, plainLinks: true },
  { name: "Rio over ssh", env: { term: "rio" }, pictures: true, nerdIcons: true, plainLinks: true },
  {
    name: "Warp",
    env: { program: "WarpTerminal", term: "xterm-256color" },
    pictures: true,
    nerdIcons: false,
    plainLinks: false,
  },
  {
    name: "Konsole",
    env: { konsoleVersion: "250800", term: "xterm-256color" },
    pictures: true,
    nerdIcons: false,
    plainLinks: false,
  },
  {
    name: "iTerm2",
    env: { program: "iTerm.app", term: "xterm-256color" },
    pictures: false,
    nerdIcons: false,
    plainLinks: false,
  },
  {
    name: "Terminal.app",
    env: { program: "Apple_Terminal", term: "xterm-256color" },
    pictures: false,
    nerdIcons: false,
    plainLinks: true,
  },
  {
    name: "VS Code",
    env: { program: "vscode", term: "xterm-256color" },
    pictures: false,
    nerdIcons: false,
    plainLinks: false,
  },
  {
    name: "Cursor",
    env: { program: "vscode", term: "xterm-256color" },
    pictures: false,
    nerdIcons: false,
    plainLinks: false,
  },
  {
    name: "Zed",
    env: { program: "zed", term: "xterm-256color" },
    pictures: false,
    nerdIcons: false,
    plainLinks: false,
  },
  { name: "JetBrains IDEs", env: { term: "xterm-256color" }, pictures: false, nerdIcons: false, plainLinks: false },
  { name: "Alacritty", env: { term: "alacritty" }, pictures: false, nerdIcons: false, plainLinks: false },
  { name: "Windows Terminal", env: { term: "xterm-256color" }, pictures: false, nerdIcons: false, plainLinks: false },
  {
    name: "Hyper",
    env: { program: "Hyper", term: "xterm-256color" },
    pictures: false,
    nerdIcons: false,
    plainLinks: false,
  },
  {
    name: "Tabby",
    env: { program: "Tabby", term: "xterm-256color" },
    pictures: false,
    nerdIcons: false,
    plainLinks: false,
  },
  { name: "foot", env: { term: "foot" }, pictures: false, nerdIcons: false, plainLinks: false },
  {
    name: "Contour",
    env: { program: "contour", term: "contour" },
    pictures: false,
    nerdIcons: false,
    plainLinks: false,
  },
  {
    name: "mintty",
    env: { program: "mintty", term: "xterm-256color" },
    pictures: false,
    nerdIcons: false,
    plainLinks: false,
  },
  { name: "GNOME Terminal", env: { term: "xterm-256color" }, pictures: false, nerdIcons: false, plainLinks: false },
  { name: "xterm", env: { term: "xterm-256color" }, pictures: false, nerdIcons: false, plainLinks: false },
  { name: "st", env: { term: "st-256color" }, pictures: false, nerdIcons: false, plainLinks: false },
  {
    name: "rxvt-unicode",
    env: { term: "rxvt-unicode-256color" },
    pictures: false,
    nerdIcons: false,
    plainLinks: false,
  },
  { name: "Linux console", env: { term: "linux" }, pictures: false, nerdIcons: false, plainLinks: false },
  { name: "Termux", env: { term: "xterm-256color" }, pictures: false, nerdIcons: false, plainLinks: false },
];

for (const { name, env, pictures, nerdIcons, plainLinks } of TERMINALS) {
  test(`${name}: pictures ${pictures ? "on" : "off"}, ${nerdIcons ? "Nerd Font" : "Unicode"} icons, ${plainLinks ? "plain" : "linked"} paths`, () => {
    const terminal = { ...NONE, ...env };

    expect(terminalOff(terminal)).toBe(pictures ? null : "terminal");
    expect(iconsArePlain("auto", terminal)).toBe(!nerdIcons);
    expect(linksArePlain("auto", terminal)).toBe(plainLinks);
  });
}

test("a multiplexer turns pictures off in a terminal that would draw them, and a terminal's own variables still pick its icons", () => {
  const ghostty = {
    ...NONE,
    tmux: "/tmp/tmux-1/default,1,0",
    program: "tmux",
    term: "tmux-256color",
    ghosttyResources: "/r",
  };
  const wezterm = {
    ...NONE,
    tmux: "/tmp/tmux-1/default,1,0",
    program: "tmux",
    term: "screen",
    weztermExecutable: "/w",
  };
  const kitty = { ...NONE, tmux: "/tmp/tmux-1/default,1,0", program: "tmux", term: "tmux-256color", kittyWindow: "3" };
  const plain = { ...NONE, tmux: "/tmp/tmux-1/default,1,0", program: "tmux", term: "tmux-256color" };

  for (const inside of [ghostty, wezterm, kitty, plain]) {
    expect(terminalOff(inside)).toBe("tmux");
  }

  expect(iconsArePlain("auto", ghostty)).toBe(false);
  expect(iconsArePlain("auto", wezterm)).toBe(false);
  expect(iconsArePlain("auto", kitty)).toBe(false);
  expect(iconsArePlain("auto", plain)).toBe(true);
});

test("forcing pictures wins over a multiplexer and an unknown terminal", () => {
  expect(terminalOff({ ...NONE, force: "1", tmux: "x" })).toBeNull();
  expect(terminalOff({ ...NONE, force: "1", term: "xterm-256color" })).toBeNull();
  expect(terminalOff({ ...NONE, force: "0", term: "xterm-256color" })).toBe("terminal");
});

test("the icon and link settings override what the terminal would choose", () => {
  const warp = { ...NONE, program: "WarpTerminal" };
  const rio = { ...NONE, program: "rio" };

  expect(iconsArePlain("nerd", warp)).toBe(false);
  expect(iconsArePlain("plain", { ...NONE, program: "ghostty" })).toBe(true);
  expect(linksArePlain("link", rio)).toBe(false);
  expect(linksArePlain("text", warp)).toBe(true);
});

function session(on: On, variables: Record<string, string>, resvgFound: boolean) {
  const toasts: string[] = [];

  mock.clock(on, { now: 10_000 });
  mock.env(on, variables);
  on("store.get", () => ({ value: undefined }));
  on("ui.toast", (_$, e) => {
    toasts.push((e as unknown as { text: string }).text);

    return { value: undefined };
  });
  on("ui.log", () => ({ value: undefined }));
  on("config.list", () => ({ value: [] }));
  on("command.register", () => ({ value: undefined }) as never);
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("classic.SessionStart", () => ({}));
  on("process.run", (_$, e) => {
    const argv = (e as unknown as { argv: string[] }).argv;

    return {
      value: {
        exitCode: argv[0] === "resvg" && !resvgFound ? 127 : 0,
        stdout: "",
        stderr: "",
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    } as never;
  });

  return toasts;
}

const START = { cwd: "/work", surface: "terminal", isInteractive: true } as never;

test("a session in a terminal that draws pictures starts quietly when resvg is installed", async ($, on) => {
  const toasts = session(on, { TERM_PROGRAM: "ghostty", HOME: "/home/a" }, true);

  await $.session.start(START);

  expect(toasts).toEqual([]);
});

test("a session in a terminal without pictures says so once", async ($, on) => {
  const toasts = session(on, { TERM_PROGRAM: "Apple_Terminal", HOME: "/home/a" }, true);

  await $.session.start(START);

  expect(toasts).toEqual([OFF_TEXT.terminal]);
});

test("a session inside tmux says so", async ($, on) => {
  const toasts = session(on, { TERM_PROGRAM: "ghostty", TMUX: "/tmp/tmux-1/default,1,0", HOME: "/home/a" }, true);

  await $.session.start(START);

  expect(toasts).toEqual([OFF_TEXT.tmux]);
});

test("forcing pictures keeps a session inside tmux quiet", async ($, on) => {
  const env = { TMUX: "/tmp/tmux-1/default,1,0", CLAUDE_CODE_FORCE_TERMINAL_IMAGES: "1", HOME: "/home/a" };
  const toasts = session(on, env, true);

  await $.session.start(START);

  expect(toasts).toEqual([]);
});

test("a session in a picture terminal without resvg says to install it", async ($, on) => {
  const toasts = session(on, { TERM_PROGRAM: "WezTerm", HOME: "/home/a" }, false);

  await $.session.start(START);

  expect(toasts).toEqual([OFF_TEXT.resvg]);
});

test("clearing the conversation settles the terminal again without a second notice", async ($, on) => {
  const toasts = session(on, { TERM_PROGRAM: "Apple_Terminal", HOME: "/home/a" }, true);

  await $.classic.SessionStart({ source: "clear" } as never);

  expect(toasts).toEqual([]);
});
