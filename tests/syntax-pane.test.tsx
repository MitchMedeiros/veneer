import type { On, RenderElement } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

import { NEW_THEME } from "../hooks/syntax-pane";

const NATIVE: RenderElement = { type: "engine", ref: 0 };

const GRAMMARS: Record<string, unknown> = {
  "/grammars/index.json": {
    languages: { toy: { scopeName: "source.toy", file: "toy.json", aliases: [], extensions: ["toy"] } },
    scopes: { "source.toy": "toy.json" },
  },
  "/grammars/toy.json": { scopeName: "source.toy", patterns: [{ match: "/\\blet\\b/u", name: "keyword.toy" }] },
  "/themes/default.json": { tokenColors: [{ scope: "keyword", settings: { foreground: "#ff0000" } }] },
};

const THEME = (color: string) =>
  JSON.stringify({
    colors: { "editor.background": "#202020" },
    tokenColors: [{ scope: "keyword", settings: { foreground: color } }],
  });

// The plugin's store in the world of the running test.
let store = new Map<string, unknown>();
// How many times the pane was closed in it.
let closed = 0;

// A world with a Claude folder in memory. `files` holds themes by absolute path and is written to by the plugin.
function world(on: On, files: Map<string, string>, env: Record<string, string> = { HOME: "/home/a" }) {
  mock.clock(on, { now: 10_000 });
  store = new Map<string, unknown>();
  closed = 0;

  on("store.get", (_$, e) => ({ value: store.get((e as unknown as { key: string }).key) }));
  on("store.set", (_$, e) => {
    const { key, value } = e as unknown as { key: string; value: unknown };

    store.set(key, value);

    return { value: undefined };
  });
  on("store.delete", (_$, e) => {
    store.delete((e as unknown as { key: string }).key);

    return { value: undefined };
  });
  mock.env(on, env);
  on("ui.toast", () => ({ value: undefined }));
  on("ui.log", () => ({ value: undefined }));
  on("ui.render", () => NATIVE);
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("ui.close", () => {
    closed += 1;

    return { value: undefined };
  });
  on("ui.focus", () => ({}));
  on("session.cwd", () => ({ value: "/work" }));
  on("fs.read", (_$, e) => {
    const path = (e as unknown as { path: string }).path;
    const grammar = Object.entries(GRAMMARS).find(([name]) => path.endsWith(name));
    const text = files.get(path) ?? (grammar === undefined ? undefined : JSON.stringify(grammar[1]));

    if (text === undefined) {
      throw new Error("ENOENT");
    }

    return { value: text };
  });
  on("fs.write", (_$, e) => {
    const { path, text } = e as unknown as { path: string; text: string };

    files.set(path, text);

    return { value: undefined };
  });
  on("fs.list", (_$, e) => {
    const folder = `${(e as unknown as { path: string }).path}/`;
    const names = [...files.keys()].filter(
      (path) => path.startsWith(folder) && !path.slice(folder.length).includes("/"),
    );

    if (names.length === 0) {
      throw new Error("ENOENT");
    }

    return {
      value: names.map((path) => ({
        name: path.slice(folder.length),
        kind: "file",
        size: 0,
        mtimeMs: 0,
        isLink: false,
      })),
    };
  });
}

const pane = {
  plugin: "veneer",
  viewport: { columns: 100, rows: 30 },
  surface: "terminal",
  component: "Pane",
  requestId: "syntax",
  props: { title: "Syntax theme", isFocused: true, bodyColumns: 80, placement: "dock" },
} as never;

const reply = (id: string) =>
  ({
    plugin: "veneer",
    viewport: { columns: 100, rows: 30 },
    surface: "terminal",
    component: "AssistantMessage",
    requestId: id,
    props: { text: "```toy\nlet x\n```\n", isFirstOfReply: true, isSummary: false },
  }) as never;

type Painted = { findAll: (match: object) => Promise<{ props?: { color?: string } }[]> };

// The colours the keyword `let` was drawn in, where it was coloured at all.
const keywordColors = async (ui: Painted): Promise<(string | undefined)[]> =>
  (await ui.findAll({ type: "Text", text: "let" })).flatMap((node) => (node.props?.color ? [node.props.color] : []));

const FOLDER = "/home/a/.claude/veneer/themes";

test("the /syntax command opens the pane", async ($, on) => {
  world(on, new Map());

  const result = await $.command.run({
    command: "syntax",
    args: "",
    origin: { kind: "composer" },
    presentation: { isFullscreen: true, columns: 100 },
  });

  expect(result.text).toBeUndefined();
});

test("picking a theme from the Claude folder colours code with it and is remembered", async ($, on) => {
  const files = new Map([[`${FOLDER}/xenon.json`, THEME("#00ff00")]]);

  world(on, files);

  const ui = await $.ui.mount(pane);

  expect(await ui.find({ key: "theme:xenon" })).toBeDefined();

  await $.ui.press({ plugin: "veneer", key: "theme:xenon" });

  expect(store.get("syntaxTheme")).toBe("xenon");
  expect(await keywordColors(await $.ui.mount(reply("p1")))).toEqual(["#00ff00"]);
});

test("moving the focus previews a theme without choosing it, and the add row ends the preview", async ($, on) => {
  world(on, new Map([[`${FOLDER}/xenon.json`, THEME("#00ff00")]]));
  await $.ui.mount(pane);

  const focus = (element: string) =>
    $.ui.focus({ component: "Pane", requestId: "syntax", plugin: "veneer", element, origin: { kind: "person" } });

  await focus("theme:xenon");

  expect(await keywordColors(await $.ui.mount(reply("v1")))).toEqual(["#00ff00"]);
  expect(store.get("syntaxTheme")).toBeUndefined();

  await focus(`theme:${NEW_THEME}`);

  expect(await keywordColors(await $.ui.mount(reply("v2")))).toEqual(["#ff0000"]);
});

test("pressing a theme chooses it and closes the pane", async ($, on) => {
  world(on, new Map([[`${FOLDER}/xenon.json`, THEME("#00ff00")]]));

  await $.ui.mount(pane);
  await $.ui.press({ plugin: "veneer", key: "theme:xenon" });

  expect(closed).toBe(1);
});

test("a folder named by CLAUDE_CONFIG_DIR is used in place of the home folder", async ($, on) => {
  const files = new Map([["/cfg/veneer/themes/blue.json", THEME("#0000ff")]]);

  world(on, files, { HOME: "/home/a", CLAUDE_CONFIG_DIR: "/cfg" });
  await $.ui.mount(pane);
  await $.ui.press({ plugin: "veneer", key: "theme:blue" });

  expect(await keywordColors(await $.ui.mount(reply("p2")))).toEqual(["#0000ff"]);
});

test("choosing the default again clears the choice", async ($, on) => {
  world(on, new Map([[`${FOLDER}/xenon.json`, THEME("#00ff00")]]));
  await $.ui.mount(pane);
  await $.ui.press({ plugin: "veneer", key: "theme:xenon" });
  await $.ui.press({ plugin: "veneer", key: "theme:::default" });

  expect(store.get("syntaxTheme")).toBeUndefined();
  expect(await keywordColors(await $.ui.mount(reply("p3")))).toEqual(["#ff0000"]);
});

test("a theme file is added by path and name, copied into the folder and chosen", async ($, on) => {
  const files = new Map([["/elsewhere/midnight.json", THEME("#123456")]]);

  world(on, files);
  await $.ui.mount(pane);
  await $.ui.press({ plugin: "veneer", key: `theme:${NEW_THEME}` });
  await $.ui.input({ plugin: "veneer", key: "syntax-path", text: "/elsewhere/midnight.json" });
  await $.ui.input({ plugin: "veneer", key: "syntax-name", text: "My Theme" });

  expect(files.get(`${FOLDER}/My Theme.json`)).toBe(THEME("#123456"));
  expect(store.get("syntaxTheme")).toBe("My Theme");
});

test("a blank name keeps the file's own name and a taken name gets a number", async ($, on) => {
  const files = new Map([
    ["/elsewhere/midnight.json", THEME("#123456")],
    [`${FOLDER}/midnight.json`, THEME("#654321")],
  ]);

  world(on, files);
  await $.ui.mount(pane);
  await $.ui.press({ plugin: "veneer", key: `theme:${NEW_THEME}` });
  await $.ui.input({ plugin: "veneer", key: "syntax-path", text: "/elsewhere/midnight.json" });
  await $.ui.input({ plugin: "veneer", key: "syntax-name", text: "" });

  expect(files.get(`${FOLDER}/midnight1.json`)).toBe(THEME("#123456"));
  expect(files.get(`${FOLDER}/midnight.json`)).toBe(THEME("#654321"));
  expect(store.get("syntaxTheme")).toBe("midnight1");
});

test("a path that is not a theme is refused and nothing is copied", async ($, on) => {
  const files = new Map([["/elsewhere/notes.json", '{"hello":1}']]);

  world(on, files);
  await $.ui.mount(pane);
  await $.ui.press({ plugin: "veneer", key: `theme:${NEW_THEME}` });
  await $.ui.input({ plugin: "veneer", key: "syntax-path", text: "/elsewhere/notes.json" });
  await $.ui.input({ plugin: "veneer", key: "syntax-path", text: "/elsewhere/missing.json" });

  expect([...files.keys()]).toEqual(["/elsewhere/notes.json"]);
  expect(store.get("syntaxTheme")).toBeUndefined();
});
