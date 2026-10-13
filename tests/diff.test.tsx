import { expect, test } from "claude-code/testing";

import { parseDiff } from "../hooks/diff";
import { NATIVE, OTHER_MOD, stub } from "./helpers";

const PATCH = {
  structuredPatch: [
    { oldStart: 1, newStart: 1, lines: [" one", "-two", "+TWO", " three"] },
    { oldStart: 20, newStart: 20, lines: [" tail", "+\tindented"] },
  ],
};

const result = (output: unknown, id: string, isErrored = false) =>
  ({
    plugin: "veneer",
    viewport: { columns: 100, rows: 30 },
    surface: "terminal",
    component: "ToolResult",
    requestId: id,
    props: { tool_use_id: id, tool: "Edit", output, isErrored },
  }) as never;

test("a patch becomes numbered lines, with a break where a hunk starts", () => {
  const diff = parseDiff(PATCH);

  expect(diff?.lines.map((line) => [line.kind, line.oldNumber, line.newNumber])).toEqual([
    ["context", 1, 1],
    ["remove", 2, null],
    ["add", null, 2],
    ["context", 3, 3],
    ["context", 20, 20],
    ["add", null, 21],
  ]);
  expect([...(diff?.breaks ?? [])]).toEqual([4]);
  expect(diff?.lines.at(-1)?.text).toBe("    indented");
});

test("a patch with no changed line is not a diff", () => {
  expect(parseDiff({ structuredPatch: [] })).toBeNull();
  expect(parseDiff({ structuredPatch: [{ oldStart: 1, newStart: 1, lines: [" same"] }] })).toBeNull();
  expect(parseDiff("error text")).toBeNull();
});

test("a created file, which stores no patch, becomes lines that are all added", () => {
  const diff = parseDiff({ type: "create", content: "one\ntwo\n", structuredPatch: [] });

  expect(diff?.lines.map((line) => [line.kind, line.text, line.oldNumber, line.newNumber])).toEqual([
    ["add", "one", null, 1],
    ["add", "two", null, 2],
  ]);
  expect(parseDiff({ type: "create", content: "", structuredPatch: [] })).toBeNull();
});

test("an edit result is drawn as the card, not the native block", async ($, on) => {
  stub(on, NATIVE);

  const ui = await $.ui.mount(result(PATCH, "r1"));

  expect(await ui.find({ type: "Text", text: "TWO" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "two" })).toBeDefined();
});

test("a long diff folds, and pressing the fold line shows every line and back", async ($, on) => {
  stub(on, NATIVE);

  const content = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n");
  const ui = await $.ui.mount(result({ type: "create", content, structuredPatch: [] }, "r4"));

  expect(await ui.find({ type: "Text", text: "line 24" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "line 25" })).toBeUndefined();

  await ui.press({ key: "fold:r4" });
  expect(await ui.find({ type: "Text", text: "line 30" })).toBeDefined();

  await ui.press({ key: "fold:r4" });
  expect(await ui.find({ type: "Text", text: "line 30" })).toBeUndefined();
});

test("a failed edit keeps the native result", async ($, on) => {
  stub(on, NATIVE);

  const ui = await $.ui.mount(result(PATCH, "r2", true));

  expect(await ui.find({ type: "Text", text: "TWO" })).toBeUndefined();
});

test("a result another mod drew passes through untouched", async ($, on) => {
  stub(on, OTHER_MOD);

  const ui = await $.ui.mount(result(PATCH, "r3"));

  expect(await ui.find({ type: "Text", text: "another mod" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "TWO" })).toBeUndefined();
});
