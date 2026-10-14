import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

import { stub as stubWorld } from "./helpers";

const PATCH = {
  structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: [" keep", "+new"] }],
};

function stub(on: On, deny?: string) {
  stubWorld(on);
  on("config.list", () => ({ value: [] }));
  on("config.set", (_$, e) => (deny === undefined ? { value: e.value } : { deny }));
}

const edit = (id: string) =>
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
      output: PATCH,
    },
  }) as never;

const set = (key: string, value: string) => ({
  key,
  value,
  previous: "dark",
  provider: { kind: "composer" },
  origin: { kind: "composer" },
});

type Painted = { findAll: (match: object) => Promise<unknown[]> };

const pills = async (ui: Painted) => JSON.stringify(await ui.findAll({ type: "Text", text: " +1 " }));

test("choosing an ansi theme redraws change pills in the terminal's own colours", async ($, on) => {
  stub(on);

  const before = await pills(await $.ui.mount(edit("a1")));

  await $.config.set(set("theme", "dark-ansi") as never);

  const after = await pills(await $.ui.mount(edit("a2")));

  expect(before).not.toBe("[]");
  expect(after).not.toBe(before);
});

test("a setting other than the theme leaves the palette alone", async ($, on) => {
  stub(on);

  const before = await pills(await $.ui.mount(edit("b1")));

  await $.config.set(set("verbose", "true") as never);

  expect(await pills(await $.ui.mount(edit("b2")))).toBe(before);
});

test("a theme the engine refuses leaves the palette alone", async ($, on) => {
  stub(on, "not allowed");

  const before = await pills(await $.ui.mount(edit("c1")));
  const result = await $.config.set(set("theme", "dark-ansi") as never);

  expect(result.deny).toBe("not allowed");
  expect(await pills(await $.ui.mount(edit("c2")))).toBe(before);
});

const ENGINE = { id: "tone", text: "Be brief.", scope: "session" } as const;

function compose(on: On) {
  stub(on);
  on("prompt.compose", () => ({ sections: [ENGINE] }));
}

const REQUEST = { model: "m", promptModel: "m", surfaces: ["terminal"], tools: [], outputStyle: null, traits: [] };

const ids = async (
  $: { prompt: { compose: (input: never) => Promise<{ sections: readonly { id: string }[] }> } },
  input: object,
) => (await $.prompt.compose({ ...REQUEST, ...input } as never)).sections.map(({ id }) => id);

test("the system prompt tells the model Mermaid is drawn, after the engine's own sections", async ($, on) => {
  compose(on);

  expect(await ids($, {})).toEqual(["tone", "veneer:diagrams"]);
});

test("a run that draws nothing gets no diagram hint", async ($, on) => {
  compose(on);

  expect(await ids($, { surfaces: [] })).toEqual(["tone"]);
  expect(await ids($, { traits: ["print"] })).toEqual(["tone"]);
  expect(await ids($, { traits: ["bare"] })).toEqual(["tone"]);
});

test("turning the diagram hint off takes it out of the system prompt", async ($, on) => {
  compose(on);

  await $.config.set(set("veneer.diagramHint", "false") as never);

  expect(await ids($, {})).toEqual(["tone"]);
});
