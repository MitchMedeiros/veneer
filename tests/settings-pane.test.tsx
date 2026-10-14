import type { On } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

import { fieldOf, groupSettings, nextValue, parseSettingChange, settingsKeys, valueText } from "../hooks/settings-pane";
import type { Setting } from "../hooks/settings-pane";
import { NATIVE } from "./helpers";

const row = (field: string, extra: Partial<Setting>): Setting => ({
  key: `veneer.${field}`,
  label: field,
  kind: "boolean",
  value: true,
  isLocked: false,
  ...extra,
});

const ROWS: Setting[] = [
  row("styleSpinner", {}),
  row("icons", { kind: "choice", value: "auto", options: ["auto", "nerd", "plain"] }),
  row("cellRatio", { kind: "text", value: "2.9" }),
  row("brandNew", {}),
];

// The values the plugin wrote through `config.set`.
let written: { key: string; value: unknown }[] = [];
// How many scrolls reached the engine.
let scrolled = 0;

function world(on: On, rows: Setting[] = ROWS, deny?: string) {
  mock.clock(on, { now: 10_000 });
  written = [];
  scrolled = 0;

  mock.env(on, { HOME: "/home/a" });
  on("ui.toast", () => ({ value: undefined }));
  on("ui.log", () => ({ value: undefined }));
  on("ui.render", () => NATIVE);
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("ui.focus", () => ({}));
  on("ui.scroll", () => {
    scrolled += 1;

    return {};
  });
  on("store.get", () => ({ value: undefined }));
  on("process.run", () => ({ value: { exitCode: 1 } as never }));
  on("config.list", () => ({ value: rows as never }));
  on("config.set", (_$, e) => {
    written.push({ key: e.key, value: e.value });

    return deny === undefined ? { value: e.value } : { deny };
  });
}

const pane = {
  plugin: "veneer",
  viewport: { columns: 100, rows: 30 },
  surface: "terminal",
  component: "Pane",
  requestId: "veneer",
  props: { title: "Veneer settings", isFocused: true, bodyColumns: 80, placement: "dock" },
} as never;

test("settings are grouped, and one no group names goes last", async () => {
  const groups = groupSettings(ROWS);

  expect(groups.map(({ title }) => title)).toEqual(["Styling", "Rendering", "Mod Compatibility", "Other"]);
  expect(groups[3]?.settings.map(({ key }) => fieldOf(key))).toEqual(["brandNew"]);
});

test("a press moves a switch to the opposite and a choice to the next option, wrapping round", async () => {
  expect(nextValue(row("a", { value: true }))).toBe(false);
  expect(nextValue(row("a", { value: false }))).toBe(true);

  const icons = row("icons", { kind: "choice", options: ["auto", "nerd", "plain"] });

  expect(nextValue({ ...icons, value: "auto" })).toBe("nerd");
  expect(nextValue({ ...icons, value: "plain" })).toBe("auto");
});

test("a value reads as on or off for a switch and as itself otherwise", async () => {
  expect(valueText(row("a", { value: false }))).toBe("off");
  expect(valueText(row("a", { kind: "text", value: "" }))).toBe("(none)");
  expect(valueText(row("a", { kind: "text", value: "Inter" }))).toBe("Inter");
});

test("the /veneer command opens the pane", async ($, on) => {
  world(on);

  const result = await $.command.run({
    command: "veneer",
    args: "",
    origin: { kind: "composer" },
    presentation: { isFullscreen: true, columns: 100 },
  });

  expect(result.text).toBeUndefined();
});

test("a typed setting is found by its title or its key and its value read by the kind", () => {
  const rows = [
    row("nativeGraphics", { label: "Text-based graphics" }),
    row("icons", { label: "Icons", kind: "choice", value: "auto", options: ["auto", "nerd", "plain"] }),
    row("cellRatio", { label: "Cell proportion", kind: "number", value: 2.9 }),
  ];

  expect(parseSettingChange(rows, "text-based graphics off")).toEqual({ setting: rows[0], value: false });
  expect(parseSettingChange(rows, "nativeGraphics ON")).toEqual({ setting: rows[0], value: true });
  expect(parseSettingChange(rows, "icons Nerd")).toEqual({ setting: rows[1], value: "nerd" });
  expect(parseSettingChange(rows, "cell-proportion 1.9")).toEqual({ setting: rows[2], value: 1.9 });
  expect(parseSettingChange(rows, "icons fancy")).toEqual({ error: "Icons takes auto, nerd, plain." });
  expect(parseSettingChange(rows, "cellRatio wide")).toEqual({ error: "Cell proportion takes a number." });
  expect(parseSettingChange(rows, "nativeGraphics")).toEqual({ error: "Text-based graphics takes on or off." });
  expect(parseSettingChange(rows, "colour red")).toEqual({
    error: 'No Veneer setting is named "colour red". Run /veneer to see them.',
  });
});

test("/veneer with a setting and a value writes it without opening the pane", async ($, on) => {
  world(on);

  const result = await $.command.run({
    command: "veneer",
    args: "icons nerd",
    origin: { kind: "composer" },
    presentation: { isFullscreen: true, columns: 100 },
  });

  expect(written).toEqual([{ key: "veneer.icons", value: "nerd" }]);
  expect(result.text).toBe("icons set to nerd.");
});

test("pressing a switch writes the opposite value", async ($, on) => {
  world(on);
  await $.ui.mount(pane);
  await $.ui.press({ plugin: "veneer", key: "setting:veneer.styleSpinner" });

  expect(written).toEqual([{ key: "veneer.styleSpinner", value: false }]);
});

test("pressing a choice writes its next option", async ($, on) => {
  world(on);
  await $.ui.mount(pane);
  await $.ui.press({ plugin: "veneer", key: "setting:veneer.icons" });

  expect(written).toEqual([{ key: "veneer.icons", value: "nerd" }]);
});

test("pressing a typed setting writes nothing until a value is submitted", async ($, on) => {
  world(on);
  await $.ui.mount(pane);
  await $.ui.press({ plugin: "veneer", key: "setting:veneer.cellRatio" });

  expect(written).toEqual([]);
});

test("a locked setting is left alone", async ($, on) => {
  world(on, [row("styleSpinner", { isLocked: true })]);
  await $.ui.mount(pane);
  await $.ui.press({ plugin: "veneer", key: "setting:veneer.styleSpinner" });

  expect(written).toEqual([]);
});

const focus = (element: string) =>
  ({
    component: "Pane",
    requestId: "veneer",
    plugin: "veneer",
    element,
    origin: { kind: "person" },
  }) as never;

const scroll = (by: number, extra: object = {}) =>
  ({
    component: "Pane",
    requestId: "veneer",
    offset: 0,
    by,
    bodyRows: 10,
    contentRows: 40,
    origin: { kind: "person" },
    ...extra,
  }) as never;

test("moving the focus off the field for a typed setting puts its row back", async ($, on) => {
  world(on);

  const ui = await $.ui.mount(pane);

  await $.ui.press({ plugin: "veneer", key: "setting:veneer.cellRatio" });

  expect(await ui.find({ type: "Input" })).toBeDefined();

  await $.ui.focus(focus("setting:veneer.icons"));

  expect(await ui.find({ type: "Input" })).toBeUndefined();
  expect(await ui.find({ key: "setting:veneer.cellRatio" })).toBeDefined();
});

test("the arrow keys walk the settings in the order they are drawn", () => {
  expect(settingsKeys(groupSettings(ROWS))).toEqual([
    "setting:veneer.cellRatio",
    "setting:veneer.icons",
    "setting:veneer.styleSpinner",
    "setting:veneer.brandNew",
  ]);
});

test("a single arrow step walks the focus down the pane instead of scrolling it", async ($, on) => {
  world(on);
  await $.ui.mount(pane);
  await $.ui.scroll(scroll(1));
  await $.ui.focus(focus("setting:veneer.icons"));
  await $.ui.scroll(scroll(1));
  await $.ui.scroll(scroll(-1));

  expect(scrolled).toBe(0);

  await $.ui.focus(focus("tab:settings"));
  await $.ui.scroll(scroll(-1));

  expect(scrolled).toBe(1);

  await $.ui.focus(focus("setting:veneer.brandNew"));
  await $.ui.scroll(scroll(1));

  expect(scrolled).toBe(2);
});

test("the wheel, the page keys and a scroll another plugin asks for scroll the pane as the engine does", async ($, on) => {
  world(on);
  await $.ui.mount(pane);
  await $.ui.scroll(scroll(1, { pointer: { column: 3, row: 2 } }));
  await $.ui.scroll(scroll(10));
  await $.ui.scroll(scroll(1, { origin: { kind: "plugin", name: "other" } }));

  expect(scrolled).toBe(3);
});

const run = (command: string) =>
  ({ command, args: "", origin: { kind: "composer" }, presentation: { isFullscreen: true, columns: 100 } }) as never;

test("/veneer and /veneer-settings open the General tab and /syntax the Syntax tab", async ($, on) => {
  world(on);

  const ui = await $.ui.mount(pane);

  await $.command.run(run("syntax"));

  expect(await ui.find({ key: "theme:::default" })).toBeDefined();

  await $.command.run(run("veneer-settings"));

  expect(await ui.find({ key: "theme:::default" })).toBeUndefined();
  expect(await ui.find({ key: "setting:veneer.icons" })).toBeDefined();

  await $.command.run(run("syntax"));
  await $.command.run(run("veneer"));

  expect(await ui.find({ key: "setting:veneer.icons" })).toBeDefined();
});

test("pressing a tab shows its body and leaves any open field behind", async ($, on) => {
  world(on);

  const ui = await $.ui.mount(pane);

  await $.ui.press({ plugin: "veneer", key: "setting:veneer.cellRatio" });

  expect(await ui.find({ type: "Input" })).toBeDefined();

  await $.ui.press({ plugin: "veneer", key: "tab:syntax" });

  expect(await ui.find({ key: "theme:::default" })).toBeDefined();
  expect(await ui.find({ key: "setting:veneer.icons" })).toBeUndefined();

  await $.ui.press({ plugin: "veneer", key: "tab:settings" });

  expect(await ui.find({ type: "Input" })).toBeUndefined();
  expect(await ui.find({ key: "setting:veneer.cellRatio" })).toBeDefined();
});

test("the arrow keys walk the tab buttons before the rows of the tab", async ($, on) => {
  world(on);
  await $.ui.mount(pane);
  await $.ui.focus(focus("tab:settings"));
  await $.ui.scroll(scroll(1));
  await $.ui.scroll(scroll(1));

  expect(scrolled).toBe(0);
});

test("a value typed into a text setting is written trimmed", async ($, on) => {
  world(on);
  await $.ui.mount(pane);
  await $.ui.press({ plugin: "veneer", key: "setting:veneer.cellRatio" });
  await $.ui.input({ plugin: "veneer", key: "setting:veneer.cellRatio", text: " 3.2 " });

  expect(written).toEqual([{ key: "veneer.cellRatio", value: "3.2" }]);
});

test("a value typed into a number setting is written as a number, and text that is not one is refused", async ($, on) => {
  world(on, [row("cellRatio", { kind: "number", value: 2.9 })]);

  const ui = await $.ui.mount(pane);

  await $.ui.press({ plugin: "veneer", key: "setting:veneer.cellRatio" });
  await $.ui.input({ plugin: "veneer", key: "setting:veneer.cellRatio", text: "tall" });

  expect(written).toEqual([]);
  expect(await ui.find({ type: "Text", text: "cellRatio takes a number." })).toBeDefined();

  await $.ui.press({ plugin: "veneer", key: "setting:veneer.cellRatio" });
  await $.ui.input({ plugin: "veneer", key: "setting:veneer.cellRatio", text: "4" });

  expect(written).toEqual([{ key: "veneer.cellRatio", value: 4 }]);
});

test("a change the engine refuses shows its reason", async ($, on) => {
  world(on, ROWS, "set by policy");

  const ui = await $.ui.mount(pane);

  await $.ui.press({ plugin: "veneer", key: "setting:veneer.styleSpinner" });

  expect(await ui.find({ type: "Text", text: "styleSpinner was not changed: set by policy" })).toBeDefined();
});

const spinner = (id: string) =>
  ({
    plugin: "veneer",
    viewport: { columns: 100, rows: 30 },
    surface: "terminal",
    component: "Spinner",
    requestId: id,
    props: { word: "Wrangling", message: null, suffix: "…", mode: "responding" },
  }) as never;

test("a setting changed in the pane takes effect on the next draw", async ($, on) => {
  world(on);

  expect(await (await $.ui.mount(spinner("s1"))).drawn()).toMatchObject({ type: "Box" });

  await $.ui.mount(pane);
  await $.ui.press({ plugin: "veneer", key: "setting:veneer.styleSpinner" });

  expect(await (await $.ui.mount(spinner("s2"))).drawn()).toEqual(NATIVE);
});

test("a setting changed in /config takes effect on the next draw", async ($, on) => {
  world(on);
  await $.config.set({
    key: "veneer.styleSpinner",
    value: false,
    previous: true,
    provider: { kind: "composer" },
    origin: { kind: "composer" },
  } as never);

  expect(await (await $.ui.mount(spinner("s3"))).drawn()).toEqual(NATIVE);
});
