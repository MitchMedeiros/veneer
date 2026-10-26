import type { On } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

import { splitReply } from "../hooks/markdown";
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

test("tables that follow one another are all drawn", async ($, on) => {
  stub(on, NATIVE);

  const table = (name: string) => `| ${name} | Role |\n| --- | --- |\n| x | y |`;
  const ui = await $.ui.mount(reply(`${table("One")}\n\n${table("Two")}\n\nafter`, "m8"));

  expect(await ui.find({ type: "Text", text: "One" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "Two" })).toBeDefined();
  expect(await ui.find({ type: "Markdown" })).toBeDefined();
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

test("pressing the copy button of a reply with no blocks copies the whole reply", async ($, on) => {
  const seen = copying(on, true);
  const ui = await $.ui.mount(reply("just words", "m5"));

  await $.ui.press({ plugin: "veneer", key: (await ui.find({ type: "Button" }))!.key! });

  expect(seen.copied).toEqual(["just words"]);
  expect(seen.toasts).toEqual(["Reply copied"]);
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

test("a blockquote tagged as an alert is split out with its kind and its quoted text", () => {
  const segments = splitReply("before\n\n> [!WARNING]\n> Back up **first**.\n> Then run it.\n\nafter");

  expect(segments.map((segment) => segment.kind)).toEqual(["text", "alert", "text"]);
  expect(segments[1]).toMatchObject({ type: "warning", text: "Back up **first**.\nThen run it." });
  expect(splitReply("> an ordinary quote").map((segment) => segment.kind)).toEqual(["text"]);
});

test("a run of task lines is split out with each task's state, and a plain list is not", () => {
  const segments = splitReply("Plan:\n\n- [x] Strip **the** notice\n- [ ] Draw cards\n  - [ ] Nested\n\nafter");

  expect(segments.map((segment) => segment.kind)).toEqual(["text", "tasks", "text"]);
  expect(segments[1]).toMatchObject({
    items: [
      { text: "Strip the notice", isDone: true, depth: 0 },
      { text: "Draw cards", isDone: false, depth: 0 },
      { text: "Nested", isDone: false, depth: 1 },
    ],
  });
  expect(splitReply("- one\n- two").map((segment) => segment.kind)).toEqual(["list"]);
});

test("a list keeps its depth, counts numbers on from the first, and holds an indented line in its item", () => {
  const [list] = splitReply("3. three\n3. again\n   - inner **b**\n     wraps here\n   - inner two\n9. nine\n\ntext");

  expect(list).toMatchObject({
    kind: "list",
    items: [
      { text: "three", depth: 0, number: 3 },
      { text: "again", depth: 0, number: 4 },
      { text: "inner **b** wraps here", depth: 1, number: null },
      { text: "inner two", depth: 1, number: null },
      { text: "nine", depth: 0, number: 5 },
    ],
  });
});

test("a blank line between items keeps one list and spaces the item, and a code fence cut keeps counting", () => {
  const [loose] = splitReply("1. First\n\n1. Second\n\ntext");

  expect(loose).toMatchObject({
    items: [
      { number: 1, isSpaced: false },
      { number: 2, isSpaced: true },
    ],
  });

  const parts = splitReply("1. Run this:\n   ```sh\n   npm test\n   ```\n1. Then this");

  expect(parts[2]).toMatchObject({ items: [{ text: "Then this", number: 2 }] });
});

test("a rule, a task line and a code fence in an item end the list and are not items", () => {
  expect(splitReply("- a\n---\n- b").map((segment) => segment.kind)).toEqual(["list", "text", "list"]);
  expect(splitReply("- a\n- [ ] b").map((segment) => segment.kind)).toEqual(["list", "tasks"]);
  expect(splitReply("1. a\n   ```ts\n   x\n   ```\n2. b").map((segment) => segment.kind)).toEqual([
    "list",
    "code",
    "list",
  ]);
});

test("a list is drawn with a mark for each item, bullets or numbers", async ($, on) => {
  stub(on, NATIVE);

  const ui = await $.ui.mount(reply("- first\n  - child\n\n9. nine\n10. ten\n\nafter", "l1"));

  expect(await ui.find({ type: "Text", text: "• " })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "◦ " })).toBeDefined();
  expect(await ui.find({ type: "Text", text: " 9. " })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "10. " })).toBeDefined();
});

test("a task list is a card with its count and a mark for each task", async ($, on) => {
  stub(on, NATIVE);

  const ui = await $.ui.mount(reply("- [x] Done thing\n- [ ] Open thing\n\nafter", "a2"));

  expect(await ui.find({ type: "Text", text: "Tasks 1/2" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "☑ " })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "☐ " })).toBeDefined();
});

test("an alert is a titled card holding its text", async ($, on) => {
  stub(on, NATIVE);

  const ui = await $.ui.mount(reply("> [!TIP]\n> Use `/veneer copy`.\n\nafter", "a1"));

  expect(await ui.find({ type: "Text", text: "✦ Tip" })).toBeDefined();
  expect(await ui.find({ type: "Markdown", text: "Use `/veneer copy`." })).toBeDefined();
});

test("an equation has a copy button for its Unicode form and one for its LaTeX", async ($, on) => {
  const seen = copying(on, true);
  const ui = await $.ui.mount(reply("$$\n\\alpha^2 \\leq \\beta\n$$\n\nafter", "k3"));

  expect(await ui.find({ type: "Button", text: " Copy LaTeX " })).toBeDefined();

  await $.ui.press({ plugin: "veneer", key: (await ui.find({ type: "Button" }))!.key! });
  await $.ui.press({ plugin: "veneer", key: (await ui.find({ type: "Button", text: " Copy LaTeX " }))!.key! });

  expect(seen.copied).toEqual(["α² ≤ β", "\\alpha^2 \\leq \\beta"]);
  expect(seen.toasts).toEqual(["Equation copied", "LaTeX copied"]);
});

test("pressing a table's copy button copies its markdown, and a failed copy says so", async ($, on) => {
  const seen = copying(on, false);
  const ui = await $.ui.mount(reply("| Name | Role |\n| --- | --- |\n| Ada | Engineer |\n\nafter", "k2"));

  await $.ui.press({ plugin: "veneer", key: (await ui.find({ type: "Button" }))!.key! });

  expect(seen.copied).toEqual(["| Name | Role |\n| --- | --- |\n| Ada | Engineer |"]);
  expect(seen.toasts).toEqual(["Copy failed"]);
});
