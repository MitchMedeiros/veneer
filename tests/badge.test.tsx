import type { On } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

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

test("a finished edit gets a count of added and removed lines after the native row", async ($, on) => {
  stub(on, NATIVE);

  const ui = await $.ui.mount(edit(PATCH));

  expect(await ui.find({ type: "Text", text: "+2" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "-1" })).toBeDefined();
});

const LEFT_CAP = "\u{e0b6}";

// A world where the edit line counts setting holds `style`, started as a session in the terminal.
function withStyle(on: On, style: string) {
  mock.clock(on, { now: 10_000 });
  mock.env(on, { TERM_PROGRAM: "ghostty", HOME: "/home/a" });
  mock.store(on);
  on("session.cwd", () => ({ value: "/work" }));
  on("ui.toast", () => ({ value: undefined }));
  on("ui.log", () => ({ value: undefined }));
  on("ui.render", () => NATIVE);
  on("config.list", () => ({
    value: [{ key: "veneer.changeStyle", label: "counts", kind: "choice", value: style, isLocked: false }] as never,
  }));
  on("command.register", () => ({ value: undefined }) as never);
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("process.run", () => ({
    value: { exitCode: 0, stdout: "", stderr: "", isStdoutTruncated: false, isStderrTruncated: false },
  }));
}

const START = { cwd: "/work", surface: "terminal", isInteractive: true } as never;

test("the rounded style draws each count as a filled pill with rounded ends", async ($, on) => {
  withStyle(on, "rounded");
  await $.session.start(START);

  const ui = await $.ui.mount(edit(PATCH));

  expect(await ui.find({ type: "Text", text: " +2 " })).toBeDefined();
  expect(await ui.find({ type: "Text", text: LEFT_CAP })).toBeDefined();
});

test("the square style draws each count as a filled pill with square ends", async ($, on) => {
  withStyle(on, "square");
  await $.session.start(START);

  const ui = await $.ui.mount(edit(PATCH));

  expect(await ui.find({ type: "Text", text: " +2 " })).toBeDefined();
  expect(await ui.find({ type: "Text", text: LEFT_CAP })).toBeUndefined();
});

test("a running or failed edit is left alone", async ($, on) => {
  stub(on, NATIVE);

  for (const [id, overrides] of [
    ["running", { isRunning: true }],
    ["failed", { isErrored: true }],
  ] as const) {
    expect(await (await $.ui.mount(edit(PATCH, overrides, id))).find({ type: "Text", text: "+2" })).toBeUndefined();
  }
});

test("a row another mod drew passes through untouched", async ($, on) => {
  stub(on, OTHER_MOD);

  const ui = await $.ui.mount(edit(PATCH));

  expect(await ui.find({ type: "Text", text: "another mod" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "+2" })).toBeUndefined();
});
