import type { On } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

import type { Table } from "../hooks/markdown";
import { columnWidths } from "../hooks/table-card";
import { NATIVE, OTHER_MOD, stub } from "./helpers";

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

test("a table with no picture is a native card with a copy button", async ($, on) => {
  stub(on, NATIVE);

  const ui = await $.ui.mount(reply("| Name | Role |\n| --- | --- |\n| Ada | Engineer |\n\nafter", "m6"));

  expect(await ui.find({ type: "Text", text: "Name" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "Engineer" })).toBeDefined();
  expect(await ui.find({ type: "Button" })).toBeDefined();
});

test("a heading with no picture is bold text with a rule under the first two levels", async ($, on) => {
  stub(on, NATIVE);

  const ui = await $.ui.mount(reply("# Title\n\nbody\n\n### Small\n\nmore", "m7"));

  expect(await ui.find({ type: "Text", text: "Title" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "━━━━━" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "Small" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "─────" })).toBeUndefined();
});

test("display math with no picture is its Unicode form with a copy button, and inline math is in the text", async ($, on) => {
  stub(on, NATIVE);

  const ui = await $.ui.mount(reply("Let $x \\in \\mathbb{R}$.\n\n$$\n\\alpha^2 \\leq \\beta\n$$\n\nafter", "m8"));

  expect(await ui.find({ type: "Markdown", text: "Let x ∈ ℝ." })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "α² ≤ β" })).toBeDefined();
  expect(await ui.find({ type: "Button" })).toBeDefined();
});

test("columns are as wide as their longest cell until the table is too wide, then the widest are cut back", () => {
  const table: Table = {
    kind: "table",
    header: ["A", "Notes"],
    align: ["left", "left"],
    rows: [["one", "a very long note that will not fit"]],
    raw: "",
  };

  expect(columnWidths(table, 80)).toEqual([3, 34]);
  expect(columnWidths(table, 20)).toEqual([3, 11]);
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

function copying(on: On, isCopied: boolean) {
  const seen = { copied: [] as string[], toasts: [] as string[] };

  mock.clock(on, { now: 10_000 });
  on("env.get", () => ({ value: undefined }));
  on("ui.log", () => ({ value: undefined }));
  on("ui.render", () => NATIVE);
  on("ui.toast", (_$, e) => {
    seen.toasts.push((e as unknown as { text: string }).text);

    return { value: undefined };
  });
  on("ui.copy", (_$, e) => {
    seen.copied.push((e as unknown as { text: string }).text);

    return { value: isCopied ? { isCopied: true } : { isCopied: false, reason: "no clipboard" } } as never;
  });

  return seen;
}

test("pressing a code block's copy button copies its code and says so", async ($, on) => {
  const seen = copying(on, true);
  const ui = await $.ui.mount(reply("before\n\n```ts\nconst a = 1;\n```\n\nafter", "k1"));

  await $.ui.press({ plugin: "veneer", key: (await ui.find({ type: "Button" }))!.key! });

  expect(seen.copied).toEqual(["const a = 1;"]);
  expect(seen.toasts).toEqual(["Code copied"]);
});

test("pressing a table's copy button copies its markdown, and a failed copy says so", async ($, on) => {
  const seen = copying(on, false);
  const ui = await $.ui.mount(reply("| Name | Role |\n| --- | --- |\n| Ada | Engineer |\n\nafter", "k2"));

  await $.ui.press({ plugin: "veneer", key: (await ui.find({ type: "Button" }))!.key! });

  expect(seen.copied).toEqual(["| Name | Role |\n| --- | --- |\n| Ada | Engineer |"]);
  expect(seen.toasts).toEqual(["Copy failed"]);
});
