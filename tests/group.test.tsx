import { expect, mock, test } from "claude-code/testing";

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

test("pressing the row of an image Read folds its image away, and again shows it", async ($, on) => {
  stub(on);

  const image = call(
    "Read",
    { file_path: "/work/shot.png" },
    {
      type: "image",
      file: { base64: "AAAA", type: "image/png", dimensions: { displayWidth: 400, displayHeight: 300 } },
    },
    "c1",
  );
  const ui = await $.ui.mount({
    ...(group("g6", false, 1) as object),
    props: { isActive: false, isExpanded: false, calls: [image] },
  } as never);

  expect(await ui.find({ type: "Text", text: "shot.png · 400×300" })).toBeDefined();

  await ui.press({ key: "row:call:c1" });
  expect(await ui.find({ type: "Text", text: "shot.png · 400×300" })).toBeUndefined();

  await ui.press({ key: "row:call:c1" });
  expect(await ui.find({ type: "Text", text: "shot.png · 400×300" })).toBeDefined();
});

test("a group the engine expanded is still drawn as the summary line", async ($, on) => {
  stub(on);

  const ui = await $.ui.mount(group("g4", true));

  expect(await ui.find({ type: "Text", text: "Command " })).toBeDefined();
});

test("an edit in a group shows its diff card with change counts, and pressing its row folds the card away", async ($, on) => {
  stub(on);

  const patch = { structuredPatch: [{ oldStart: 1, newStart: 1, lines: [" one", "-two", "+TWO"] }] };
  const ui = await $.ui.mount({
    plugin: "veneer",
    viewport: { columns: 100, rows: 30 },
    surface: "terminal",
    component: "ToolGroup",
    requestId: "g6",
    props: {
      isActive: false,
      isExpanded: false,
      calls: [
        call("Edit", { file_path: "/work/a.ts" }, patch, "e1"),
        call("Write", { file_path: "/work/b.ts" }, patch, "e2"),
      ],
    },
  } as never);

  await ui.press({ key: "group:g6" });
  expect(await ui.find({ type: "Text", text: "TWO" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "+1" })).toBeDefined();

  await ui.press({ key: "row:call:e1" });
  expect(await ui.find({ type: "Text", text: "TWO" })).toBeDefined();

  await ui.press({ key: "row:call:e2" });
  expect(await ui.find({ type: "Text", text: "TWO" })).toBeUndefined();
});

test("the expand button opens a group that holds an edit and its Read rows, and collapse folds it again", async ($, on) => {
  stub(on);
  mock.store(on);

  const patch = { structuredPatch: [{ oldStart: 1, newStart: 1, lines: [" one", "-two", "+TWO"] }] };
  const ui = await $.ui.mount({
    plugin: "veneer",
    viewport: { columns: 100, rows: 30 },
    surface: "terminal",
    component: "ToolGroup",
    requestId: "g7",
    props: {
      isActive: false,
      isExpanded: false,
      calls: [
        call("Edit", { file_path: "/work/a.ts" }, patch, "e1"),
        call("Read", { file_path: "/work/b.ts" }, { type: "text", file: { content: "readbody", startLine: 1 } }, "c1"),
        call("Bash", { command: "ls" }, { stdout: "bashout", stderr: "" }, "c2"),
      ],
    },
  } as never);
  const band = await $.ui.mount({
    plugin: "veneer",
    viewport: { columns: 100, rows: 30 },
    surface: "terminal",
    component: "AbovePrompt",
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 },
  } as never);

  expect(await ui.find({ type: "Text", text: "TWO" })).toBeUndefined();

  await band.press({ key: "edits:toggle" });
  await band.press({ key: "edits:toggle" });

  expect(await ui.find({ type: "Text", text: "TWO" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "readbody" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "bashout" })).toBeUndefined();

  await band.press({ key: "edits:toggle" });

  expect(await ui.find({ type: "Text", text: "TWO" })).toBeUndefined();
  expect(await ui.find({ type: "Text", text: "readbody" })).toBeUndefined();
});
