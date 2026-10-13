import { expect, test } from "claude-code/testing";

import { NATIVE, OTHER_MOD, stub } from "./helpers";

const spinner = (id: string) =>
  ({
    plugin: "veneer",
    viewport: { columns: 100, rows: 30 },
    surface: "terminal",
    component: "Spinner",
    requestId: id,
    props: { word: "Wrangling", message: null, suffix: "…", mode: "responding" },
  }) as never;

test("the native spinner line is kept, with a left margin", async ($, on) => {
  stub(on, NATIVE);

  const ui = await $.ui.mount(spinner("s1"));

  expect(await ui.drawn()).toMatchObject({ type: "Box", props: { marginLeft: 1 } });
});

test("a spinner another mod drew passes through untouched", async ($, on) => {
  stub(on, OTHER_MOD);

  const ui = await $.ui.mount(spinner("s2"));

  expect(await ui.drawn()).toMatchObject({ type: "Text" });
  expect(await ui.find({ type: "Text", text: "another mod" })).toBeDefined();
});
