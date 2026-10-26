import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

import { stub as stubWorld } from "./helpers";

function stub(on: On) {
  stubWorld(on);
  on("config.list", () => ({ value: [] }));
  on("config.set", (_$, e) => ({ value: e.value }));
}

const set = (key: string, value: string) => ({
  key,
  value,
  previous: "dark",
  provider: { kind: "composer" },
  origin: { kind: "composer" },
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
