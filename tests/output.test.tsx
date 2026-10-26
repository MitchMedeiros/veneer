import { expect, test } from "claude-code/testing";

import { parseOutput } from "../hooks/output";
import { stub } from "./helpers";

const result = (tool: string, output: unknown, id: string, isErrored = false) =>
  ({
    plugin: "veneer",
    viewport: { columns: 100, rows: 30 },
    surface: "terminal",
    component: "ToolResult",
    requestId: id,
    props: { tool_use_id: id, tool, output, isErrored },
  }) as never;

test("a command's output keeps stdout then stderr, with colour codes removed", () => {
  const lines = parseOutput("Bash", { stdout: "\u001b[1mone\u001b[0m\ntwo\n", stderr: "bad\n" }, "/work");

  expect(lines).toEqual([
    { text: "one", tone: undefined },
    { text: "two", tone: undefined },
    { text: "bad", tone: "error" },
  ]);
  expect(parseOutput("Bash", { stdout: "", stderr: "" }, "/work")).toBeNull();
});

test("the notice that the shell's folder was reset is not shown as output", () => {
  const stderr = "Shell cwd was reset to /work\n";

  expect(parseOutput("Bash", { stdout: "ok\n", stderr }, "/work")).toEqual([{ text: "ok", tone: undefined }]);
  expect(parseOutput("Bash", { stdout: "", stderr }, "/work")).toBeNull();
});

test("a read is numbered from its first line", () => {
  const lines = parseOutput("Read", { type: "text", file: { content: "a\nb", startLine: 10 } }, "/work");

  expect(lines?.map((line) => [line.number, line.text])).toEqual([
    [10, "a"],
    [11, "b"],
  ]);
});

test("a file list shows paths relative to the working folder", () => {
  expect(parseOutput("Glob", { filenames: ["/work/a.ts", "/etc/b"] }, "/work")?.map((line) => line.text)).toEqual([
    "a.ts",
    "/etc/b",
  ]);
  expect(parseOutput("Glob", { filenames: [] }, "/work")).toBeNull();
});

test("a tool with no card has no lines", () => {
  expect(parseOutput("WebFetch", { result: "x" }, "/work")).toBeNull();
});

test("a long command output folds, and pressing the fold line shows the rest", async ($, on) => {
  stub(on);

  const stdout = Array.from({ length: 30 }, (_, i) => `row ${i + 1}`).join("\n");
  const ui = await $.ui.mount(result("Bash", { stdout, stderr: "" }, "o1"));

  expect(await ui.find({ type: "Text", text: "row 24" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "row 25" })).toBeUndefined();

  await ui.press({ key: "fold:o1" });
  expect(await ui.find({ type: "Text", text: "row 30" })).toBeDefined();
});

test("a failed command keeps the native result", async ($, on) => {
  stub(on);

  const ui = await $.ui.mount(result("Bash", { stdout: "row", stderr: "" }, "o2", true));

  expect(await ui.find({ type: "Text", text: "row" })).toBeUndefined();
});
