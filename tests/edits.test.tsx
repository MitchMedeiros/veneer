import type { On } from "claude-code";
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
  on("session.id", () => ({ value: "s1" }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("process.run", () => ({
    value: { exitCode: 0, stdout: "", stderr: "", isStdoutTruncated: false, isStderrTruncated: false },
  }));

  await $.session.start({ cwd: "/work", surface: "terminal", isInteractive: true } as never);

  expect(await (await $.ui.mount(result("e4"))).find({ type: "Text", text: "TWO" })).toBeUndefined();
});

const ROWS = [
  { type: "user", message: { content: "first" }, uuid: "u1" },
  { type: "assistant", message: { content: [{ type: "tool_use", id: "toolu_1" }] }, uuid: "a1" },
  { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "toolu_1" }] }, uuid: "u2" },
  { type: "assistant", message: { content: [{ type: "text", text: "last" }] }, uuid: "a2" },
];

function scrollWorld(on: On, rows = ROWS): string[] {
  const transcript = rows.map((row) => JSON.stringify({ isSidechain: false, ...row })).join("\n");

  const toasts: string[] = [];

  mock.clock(on, { now: 10_000 });
  mock.env(on, { HOME: "/home/a" });
  mock.store(on);
  on("session.cwd", () => ({ value: "/work" }));
  on("session.id", () => ({ value: "s1" }));
  on("ui.log", () => ({ value: undefined }));
  on("ui.render", () => NATIVE);
  on("ui.toast", (_$, e) => {
    toasts.push((e as unknown as { text: string }).text);

    return { value: undefined };
  });
  on("process.run", (_$, e) => {
    const [command] = (e as unknown as { argv: string[] }).argv;

    return {
      value: {
        exitCode: 0,
        stdout: command === "find" ? "/home/a/.claude/projects/work/s1.jsonl\n" : transcript,
        stderr: "",
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    } as never;
  });

  return toasts;
}

// The test host cannot scroll, so a press shows which row it asked for in the refusal.
test("the scroll buttons ask for the first and the newest row of the session's file", async ($, on) => {
  const toasts = scrollWorld(on);
  const bandUi = await $.ui.mount(band);

  await bandUi.press({ key: "scroll:top" });
  await bandUi.press({ key: "scroll:bottom" });

  expect(toasts).toEqual([
    expect.stringContaining("Could not scroll to the top (u1): "),
    expect.stringContaining("Could not scroll to the bottom (a2): "),
  ]);
});

test("a run of folded calls at the end is scrolled to by the group's id", async ($, on) => {
  const call = (id: string, uuid: string) => ({
    type: "assistant",
    message: { content: [{ type: "tool_use", id, name: "Bash" }] },
    uuid,
  });
  const toasts = scrollWorld(on, [ROWS[0]!, call("toolu_1", "a1"), call("toolu_2", "a2")]);

  await (await $.ui.mount(band)).press({ key: "scroll:bottom" });

  expect(toasts).toEqual([expect.stringContaining("Could not scroll to the bottom (collapsed-toolu_1")]);
});
