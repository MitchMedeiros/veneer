import { expect, test } from "claude-code/testing";

import { changeCounts } from "../hooks/badge";
import { paletteOf } from "../hooks/palette";
import { NATIVE, OTHER_MOD, stub } from "./helpers";

const PATCH = {
  structuredPatch: [
    { oldStart: 1, oldLines: 3, newStart: 1, newLines: 4, lines: [" keep", "-old", "+new", "+extra", " keep"] },
  ],
};

const edit = (output: unknown, overrides: Record<string, unknown> = {}, id = "t1") =>
  ({
    plugin: "veneer",
    viewport: { columns: 100, rows: 30 },
    surface: "terminal",
    component: "ToolUse",
    requestId: id,
    props: {
      tool_use_id: id,
      tool: "Edit",
      input: {},
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      output,
      ...overrides,
    },
  }) as never;

test("changes are counted from the lines of the stored patch", () => {
  expect(changeCounts(PATCH)).toEqual({ added: 2, removed: 1 });
  expect(changeCounts({ structuredPatch: [] })).toBeNull();
  expect(changeCounts({ type: "create", content: "a\nb\nc\n", structuredPatch: [] })).toEqual({ added: 3, removed: 0 });
  expect(changeCounts("an error message")).toBeNull();
  expect(changeCounts(undefined)).toBeNull();
});

test("only the ansi themes are marked as ansi", () => {
  expect(paletteOf("dark-ansi", undefined).isAnsi).toBe(true);
  expect(paletteOf("light-ansi", undefined).isAnsi).toBe(true);
  expect(paletteOf("dark", undefined).isAnsi).toBe(false);
});

test("a finished edit gets a pill for each count after the native row", async ($, on) => {
  stub(on, NATIVE);

  const ui = await $.ui.mount(edit(PATCH));

  expect(await ui.find({ type: "Text", text: " +2 " })).toBeDefined();
  expect(await ui.find({ type: "Text", text: " -1 " })).toBeDefined();
});

test("a running or failed edit is left alone", async ($, on) => {
  stub(on, NATIVE);

  for (const [id, overrides] of [
    ["running", { isRunning: true }],
    ["failed", { isErrored: true }],
  ] as const) {
    expect(await (await $.ui.mount(edit(PATCH, overrides, id))).find({ type: "Text", text: " +2 " })).toBeUndefined();
  }
});

test("a row another mod drew passes through untouched", async ($, on) => {
  stub(on, OTHER_MOD);

  const ui = await $.ui.mount(edit(PATCH));

  expect(await ui.find({ type: "Text", text: "another mod" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: " +2 " })).toBeUndefined();
});
