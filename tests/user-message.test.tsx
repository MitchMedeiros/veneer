import type { PromptOrigin, RenderElement } from "claude-code";
import { expect, test } from "claude-code/testing";

import { stub } from "./helpers";

const STOCK: RenderElement = { type: "Text", props: {}, children: ["native row"] };
const TYPED: PromptOrigin = { kind: "composer" };
const PLUGIN: PromptOrigin = { kind: "plugin", name: "other" };

const message = (text: string, surface: "terminal" | "desktop" = "terminal", origin: PromptOrigin = TYPED) =>
  ({
    plugin: "veneer",
    viewport: { columns: 100, rows: 30 },
    surface,
    component: "UserMessage",
    requestId: "u1",
    props: { text, origin, isExpanded: false },
  }) as const;

test("a typed message is a filled bubble that replaces the native row", async ($, on) => {
  stub(on);

  const ui = await $.ui.mount(message("hello there"));

  expect(await ui.find({ type: "Text", text: "hello there" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "native row" })).toBeUndefined();
});

test("every line of a multi-line message is kept, blank lines included", async ($, on) => {
  stub(on);

  const ui = await $.ui.mount(message("first\n\nthird"));

  expect(await ui.find({ type: "Text", text: "first" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "third" })).toBeDefined();
});

test("an @file mention is its own piece of text", async ($, on) => {
  stub(on);

  const ui = await $.ui.mount(message("look in @.husky/ please"));

  expect(await ui.find({ type: "Text", text: "@.husky/" })).toBeDefined();
});

test("other surfaces and other senders keep Claude Code’s own row", async ($, on) => {
  stub(on, STOCK);

  for (const ui of [await $.ui.mount(message("hi", "desktop")), await $.ui.mount(message("hi", "terminal", PLUGIN))]) {
    expect(await ui.find({ type: "Text", text: "native row" })).toBeDefined();
  }
});

test("a tree another mod already drew is kept", async ($, on) => {
  stub(on, STOCK);

  const ui = await $.ui.mount(message("hello there"));

  expect(await ui.find({ type: "Text", text: "native row" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "hello there" })).toBeUndefined();
});
