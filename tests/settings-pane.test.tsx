import type { On } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

import { fieldOf, groupSettings, nextValue, settingsKeys, valueText } from "../hooks/settings-pane";
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

test("/veneer and /veneer-settings open the Settings tab and /syntax the Syntax theme tab", async ($, on) => {
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
