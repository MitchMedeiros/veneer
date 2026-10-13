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
