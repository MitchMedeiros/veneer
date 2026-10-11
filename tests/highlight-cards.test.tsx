import type { On, RenderElement } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

const NATIVE: RenderElement = { type: "engine", ref: 0 };

const FILES: Record<string, unknown> = {
  "/grammars/index.json": {
    languages: { toy: { scopeName: "source.toy", file: "toy.json", aliases: [], extensions: ["toy"] } },
    scopes: { "source.toy": "toy.json" },
  },
  "/grammars/toy.json": {
    scopeName: "source.toy",
    patterns: [{ match: "/\\blet\\b/u", name: "keyword.toy" }],
  },
  "/themes/default.json": { tokenColors: [{ scope: "keyword", settings: { foreground: "#ff0000" } }] },
};

function stub(on: On, files = true) {
  mock.clock(on, { now: 10_000 });
  on("env.get", () => ({ value: undefined }));
  on("ui.toast", () => ({ value: undefined }));
  on("ui.log", () => ({ value: undefined }));
  on("ui.render", () => NATIVE);
  on("session.cwd", () => ({ value: "/work" }));
  on("fs.read", (_$, e) => {
    const path = (e as unknown as { path: string }).path;
    const file = Object.entries(FILES).find(([name]) => path.endsWith(name));

    if (!files || file === undefined) {
      throw new Error("ENOENT");
    }

    return { value: JSON.stringify(file[1]) };
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

const result = (tool: string, output: unknown, id: string) =>
  ({
    plugin: "veneer",
    viewport: { columns: 100, rows: 30 },
    surface: "terminal",
    component: "ToolResult",
    requestId: id,
    props: { tool_use_id: id, tool, output, isErrored: false },
  }) as never;

type Mounted = { findAll: (match: object) => Promise<{ props?: { color?: string } }[]> };

// How many `let` keywords were drawn in the colour the theme gives them.
const keywords = async (ui: Mounted): Promise<number> =>
  (await ui.findAll({ type: "Text", text: "let" })).filter((node) => node.props?.color === "#ff0000").length;

test("a closed fence in a shipped language draws with coloured tokens", async ($, on) => {
  stub(on);

  const ui = await $.ui.mount(reply("```toy\nlet x\n```\n", "h1"));

  expect(await keywords(ui)).toBe(1);
});

test("a fence in a language with no grammar draws plain", async ($, on) => {
  stub(on);

  const ui = await $.ui.mount(reply("```nowhere\nlet x\n```\n", "h2"));

  expect(await ui.find({ type: "Text", text: "let x" })).toBeDefined();
  expect(await keywords(ui)).toBe(0);
});

test("a fence draws plain when the grammar files cannot be read", async ($, on) => {
  stub(on, false);

  const ui = await $.ui.mount(reply("```toy\nlet x\n```\n", "h3"));

  expect(await ui.find({ type: "Text", text: "let x" })).toBeDefined();
  expect(await keywords(ui)).toBe(0);
});

test("the code of an edit is highlighted by the file's extension", async ($, on) => {
  stub(on);

  const output = {
    filePath: "/work/a.toy",
    structuredPatch: [{ oldStart: 1, newStart: 1, lines: [" let a", "-let b", "+let c"] }],
  };
  const ui = await $.ui.mount(result("Edit", output, "h4"));

  expect(await keywords(ui)).toBe(3);
});

test("the lines of a file read are highlighted by the file's extension", async ($, on) => {
  stub(on);

  const output = { type: "text", file: { filePath: "/work/a.toy", content: "let a\nb", startLine: 1 } };
  const ui = await $.ui.mount(result("Read", output, "h5"));

  expect(await keywords(ui)).toBe(1);
});

test("a command's output is never highlighted", async ($, on) => {
  stub(on);

  const ui = await $.ui.mount(result("Bash", { stdout: "let a", stderr: "" }, "h6"));

  expect(await ui.find({ type: "Text", text: "let a" })).toBeDefined();
  expect(await keywords(ui)).toBe(0);
});
