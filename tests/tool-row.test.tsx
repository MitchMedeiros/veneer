import type { On, RenderElement } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

const NATIVE: RenderElement = { type: "engine", ref: 0 };
const OTHER_MOD: RenderElement = { type: "Text", props: {}, children: ["another mod"] };

function stub(on: On, row: RenderElement) {
  mock.clock(on, { now: 10_000 });
  on("env.get", () => ({ value: undefined }));
  on("session.cwd", () => ({ value: "/work" }));
  on("ui.toast", () => ({ value: undefined }));
  on("ui.log", () => ({ value: undefined }));
  on("ui.render", () => row);
}

const row = (tool: string, input: unknown, id: string, overrides: Record<string, unknown> = {}) =>
  ({
    plugin: "veneer",
    viewport: { columns: 100, rows: 30 },
    surface: "terminal",
    component: "ToolUse",
    requestId: id,
    props: {
      tool_use_id: id,
      tool,
      input,
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      ...overrides,
    },
  }) as never;

test("a file tool is an icon, a name and a path relative to the working folder", async ($, on) => {
  stub(on, NATIVE);

  const ui = await $.ui.mount(row("Edit", { file_path: "/work/tests/badge.test.tsx" }, "a1"));

  expect(await ui.find({ type: "Text", text: "Edit" })).toBeDefined();
  expect(await ui.find({ type: "Link" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "tests/badge.test.tsx" })).toBeDefined();
});

test("a write reads Create once it made a new file, and Write otherwise", async ($, on) => {
  stub(on, NATIVE);

  const made = await $.ui.mount(row("Write", { file_path: "/work/a.ts" }, "w1", { output: { type: "create" } }));
  const replaced = await $.ui.mount(row("Write", { file_path: "/work/a.ts" }, "w2", { output: { type: "update" } }));

  expect(await made.find({ type: "Text", text: "Create" })).toBeDefined();
  expect(await replaced.find({ type: "Text", text: "Write" })).toBeDefined();
});

test("a path outside the working folder keeps its full path", async ($, on) => {
  stub(on, NATIVE);

  const ui = await $.ui.mount(row("Read", { file_path: "/etc/hosts" }, "a2"));

  expect(await ui.find({ type: "Text", text: "/etc/hosts" })).toBeDefined();
});

test("a command shows its first line only", async ($, on) => {
  stub(on, NATIVE);

  const ui = await $.ui.mount(row("Bash", { command: "npm test\nnpm run lint" }, "a3"));

  expect(await ui.find({ type: "Text", text: "Command" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "npm test" })).toBeDefined();
});

test("a tool with no look keeps the native row", async ($, on) => {
  stub(on, NATIVE);

  const ui = await $.ui.mount(row("mcp__server__lookup", {}, "a4"));

  expect(await ui.find({ type: "Text", text: "Command" })).toBeUndefined();
});

test("a row another mod drew passes through untouched", async ($, on) => {
  stub(on, OTHER_MOD);

  const ui = await $.ui.mount(row("Edit", { file_path: "/work/a.ts" }, "a5"));

  expect(await ui.find({ type: "Text", text: "another mod" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "Edit" })).toBeUndefined();
});
