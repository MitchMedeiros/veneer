import { expect, test } from "claude-code/testing";

import { stub } from "./helpers";

const call = (tool: string, input: unknown, output: unknown, id: string) => ({
  tool_use_id: id,
  tool,
  input,
  output,
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
});

const group = (id: string, isExpanded = false, count = 3) =>
  ({
    plugin: "veneer",
    viewport: { columns: 100, rows: 30 },
    surface: "terminal",
    component: "ToolGroup",
    requestId: id,
    props: {
      isActive: false,
      isExpanded,
      calls: [
        call("Bash", { command: "ls" }, { stdout: "a\nhidden", stderr: "" }, "c1"),
        call("Read", { file_path: "/work/a.ts" }, { type: "text", file: { content: "x", startLine: 1 } }, "c2"),
        call("Read", { file_path: "/work/b.ts" }, { type: "text", file: { content: "y", startLine: 1 } }, "c3"),
      ].slice(0, count),
    },
  }) as never;

test("a group is one line of counts per tool, closed", async ($, on) => {
  stub(on);

  const ui = await $.ui.mount(group("g1"));

  expect(await ui.find({ type: "Text", text: "Command " })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "Read " })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "2  " })).toBeDefined();
  expect(await ui.find({ type: "Link" })).toBeUndefined();
});

test("pressing the line opens a row for each call, and again closes them", async ($, on) => {
  stub(on);

  const ui = await $.ui.mount(group("g2"));

  await ui.press({ key: "group:g2" });
  expect(await ui.find({ type: "Link" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "  ls" })).toBeDefined();

  await ui.press({ key: "group:g2" });
  expect(await ui.find({ type: "Link" })).toBeUndefined();
});

test("pressing a row opens its output card", async ($, on) => {
  stub(on);

  const ui = await $.ui.mount(group("g3"));

  await ui.press({ key: "group:g3" });
  expect(await ui.find({ type: "Text", text: "hidden" })).toBeUndefined();

  await ui.press({ key: "row:call:c1" });
  expect(await ui.find({ type: "Text", text: "hidden" })).toBeDefined();
});

test("a group of one call is its row, with no count line to open", async ($, on) => {
  stub(on);

  const ui = await $.ui.mount(group("g5", false, 1));

  expect(await ui.find({ type: "Text", text: "Command" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "  ls" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "Command " })).toBeUndefined();
});

test("a group the engine already expanded keeps the native drawing", async ($, on) => {
  stub(on);

  const ui = await $.ui.mount(group("g4", true));

  expect(await ui.find({ type: "Text", text: "Command " })).toBeUndefined();
});
