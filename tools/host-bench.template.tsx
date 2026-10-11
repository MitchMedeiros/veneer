// Dev only. `tools/host-bench.mjs` copies this into a scratch copy of the mod as a test, next to a generated `fixture.ts`
// that holds the real grammar files and a sample. It is not a test of the repo itself and `claude plugin test` never
// finds it here.
import type { On, RenderElement } from "claude-code";
import { expect, test } from "claude-code/testing";

import { FILES, LANGUAGE, SAMPLE } from "./fixture.ts";

const NATIVE: RenderElement = { type: "engine", ref: 0 };
const WARM_RUNS = 10;

function stub(on: On) {
  on("env.get", () => ({ value: undefined }));
  on("ui.toast", () => ({ value: undefined }));
  on("ui.log", () => ({ value: undefined }));
  on("ui.render", () => NATIVE);
  on("session.cwd", () => ({ value: "/work" }));
  on("fs.read", (_$, e) => {
    const path = (e as unknown as { path: string }).path;
    const file = Object.entries(FILES).find(([name]) => path.endsWith(name));

    if (file === undefined) {
      throw new Error("ENOENT");
    }

    return { value: file[1] };
  });
}

const reply = (text: string, id: string) =>
  ({
    plugin: "veneer",
    viewport: { columns: 100, rows: 30 },
    surface: "terminal",
    component: "AssistantMessage",
    requestId: id,
    props: { text, isFirstOfReply: true, isSummary: false },
  }) as never;

const fence = (code: string) => `\`\`\`${LANGUAGE}\n${code}\n\`\`\`\n`;

test(`${LANGUAGE}: time to highlight`, async ($, on) => {
  stub(on);

  let start = Date.now();
  await $.ui.mount(reply("plain text\n", "plain"));
  const baseline = Date.now() - start;

  start = Date.now();
  const ui = await $.ui.mount(reply(fence(SAMPLE), "cold"));
  const cold = Date.now() - start;

  start = Date.now();
  for (let run = 0; run < WARM_RUNS; run++) {
    await $.ui.mount(reply(fence(`${SAMPLE}\n${" ".repeat(run + 1)}`), `warm${run}`));
  }
  const warm = (Date.now() - start) / WARM_RUNS;

  const texts = (await ui.findAll({ type: "Text" })) as { props?: { color?: string } }[];
  const colours = new Set(texts.map((node) => node.props?.color).filter((color) => color !== undefined));

  expect(colours.size).toBeGreaterThan(2);

  console.log(
    `BENCH ${LANGUAGE.padEnd(12)} plain mount ${baseline} ms, cold fence ${cold} ms, warm fence ${warm.toFixed(1)} ms`,
  );
});
