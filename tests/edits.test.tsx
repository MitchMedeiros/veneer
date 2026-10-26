import { expect, test } from "claude-code/testing";
import { mock } from "claude-code/testing";

import { NATIVE, stub } from "./helpers";

const PATCH = { structuredPatch: [{ oldStart: 1, newStart: 1, lines: [" one", "-two", "+TWO"] }] };

const render = (component: string, props: Record<string, unknown>, id = "e1") =>
  ({
    plugin: "veneer",
    viewport: { columns: 100, rows: 30 },
    surface: "terminal",
    component,
    requestId: id,
    props,
  }) as never;

const result = (id = "e1") =>
  render("ToolResult", { tool_use_id: id, tool: "Edit", output: PATCH, isErrored: false }, id);
const use = (id = "e1") =>
  render(
    "ToolUse",
    {
      tool_use_id: id,
      tool: "Edit",
      input: {},
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      output: PATCH,
    },
    id,
  );
const band = render("AbovePrompt", { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 });

test("an edit card is drawn until the band's button folds every edit", async ($, on) => {
  stub(on, NATIVE);
  mock.store(on);

  const bandUi = await $.ui.mount(band);
  const card = await $.ui.mount(result());

  expect(await card.find({ type: "Text", text: "TWO" })).toBeDefined();

  await bandUi.press({ key: "edits:toggle" });

  expect(await card.find({ type: "Text", text: "TWO" })).toBeUndefined();

  await bandUi.press({ key: "edits:toggle" });

  expect(await card.find({ type: "Text", text: "TWO" })).toBeDefined();
});

test("pressing an edit's row folds that card alone, and again opens it", async ($, on) => {
  stub(on, NATIVE);
  mock.store(on);

  const row = await $.ui.mount(use("e2"));
  const card = await $.ui.mount(result("e2"));
  const other = await $.ui.mount(result("e3"));

  await row.press({ key: "row:e2" });

  expect(await card.find({ type: "Text", text: "TWO" })).toBeUndefined();
  expect(await other.find({ type: "Text", text: "TWO" })).toBeDefined();

  await row.press({ key: "row:e2" });

  expect(await card.find({ type: "Text", text: "TWO" })).toBeDefined();
});

test("a session starts from the last choice stored", async ($, on) => {
  stub(on, NATIVE);
  mock.store(on, { editsCollapsed: true });
  on("config.list", () => ({ value: [] }));
  on("command.register", () => ({ value: undefined }) as never);
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("process.run", () => ({
    value: { exitCode: 0, stdout: "", stderr: "", isStdoutTruncated: false, isStderrTruncated: false },
  }));

  await $.session.start({ cwd: "/work", surface: "terminal", isInteractive: true } as never);

  expect(await (await $.ui.mount(result("e4"))).find({ type: "Text", text: "TWO" })).toBeUndefined();
});

test("a scroll button that cannot scroll says why", async ($, on) => {
  mock.clock(on, { now: 10_000 });
  mock.env(on, {});
  mock.store(on);
  on("session.cwd", () => ({ value: "/work" }));
  on("ui.log", () => ({ value: undefined }));
  on("ui.render", () => NATIVE);

  const toasts: string[] = [];

  on("ui.toast", (_$, e) => {
    toasts.push((e as unknown as { text: string }).text);

    return { value: undefined };
  });

  await $.ui.mount(use("row-newest"));

  const bandUi = await $.ui.mount(band);

  await bandUi.press({ key: "scroll:bottom" });

  expect(toasts.join(" ")).toContain("Could not scroll to the bottom");
});
