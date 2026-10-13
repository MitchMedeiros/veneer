import type { On, RenderElement } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

const NATIVE: RenderElement = { type: "engine", ref: 0 };
const OTHER_MOD: RenderElement = { type: "Text", props: {}, children: ["another mod"] };

function stub(on: On, row: RenderElement) {
  mock.clock(on, { now: 10_000 });
  on("env.get", () => ({ value: undefined }));
  on("ui.toast", () => ({ value: undefined }));
  on("ui.log", () => ({ value: undefined }));
  on("ui.render", () => row);
}

const reply = (text: string, id: string, isFirstOfReply = true) =>
  ({
    plugin: "veneer",
    viewport: { columns: 100, rows: 30 },
    surface: "terminal",
    component: "AssistantMessage",
    requestId: id,
    props: { text, isFirstOfReply, isSummary: false },
  }) as never;

test("a plain reply starts with the sparkle bullet", async ($, on) => {
  stub(on, NATIVE);

  const ui = await $.ui.mount(reply("just words", "m1"));

  expect(await ui.find({ type: "Text", text: "✦" })).toBeDefined();
  expect(await ui.find({ type: "Markdown" })).toBeDefined();
});

test("a later block of a reply has no bullet", async ($, on) => {
  stub(on, NATIVE);

  const ui = await $.ui.mount(reply("more words", "m2", false));

  expect(await ui.find({ type: "Text", text: "✦" })).toBeUndefined();
  expect(await ui.find({ type: "Markdown" })).toBeDefined();
});

test("a code block gets a copy button", async ($, on) => {
  stub(on, NATIVE);

  const ui = await $.ui.mount(reply("before\n\n```ts\nconst a = 1;\n```\n\nafter", "m4"));

  expect(await ui.find({ type: "Button" })).toBeDefined();
});

test("a reply with no code block or table has no copy button", async ($, on) => {
  stub(on, NATIVE);

  const ui = await $.ui.mount(reply("just words", "m5"));

  expect(await ui.find({ type: "Button" })).toBeUndefined();
});

test("a reply another mod drew passes through untouched", async ($, on) => {
  stub(on, OTHER_MOD);

  const ui = await $.ui.mount(reply("just words", "m3"));

  expect(await ui.find({ type: "Text", text: "another mod" })).toBeDefined();
  expect(await ui.find({ type: "Markdown" })).toBeUndefined();
});
