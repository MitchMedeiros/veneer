import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

import { stub as stubWorld } from "./helpers";

const FILES: Record<string, unknown> = {
  "/grammars/index.json": {
    languages: {
      toy: { scopeName: "source.toy", file: "toy.json", aliases: [], extensions: ["toy"] },
      shellscript: { scopeName: "source.shell", file: "shell.json", aliases: [], extensions: ["sh"] },
      diff: { scopeName: "source.diff", file: "diff.json", aliases: [], extensions: ["diff"] },
    },
    scopes: { "source.toy": "toy.json", "source.shell": "shell.json", "source.diff": "diff.json" },
  },
  "/grammars/diff.json": {
    scopeName: "source.diff",
    patterns: [{ match: "/^\\+.*/u", name: "markup.inserted.diff" }],
  },
  "/grammars/shell.json": {
    scopeName: "source.shell",
    patterns: [{ match: "/\\blet\\b/u", name: "keyword.shell" }],
  },
  "/grammars/toy.json": {
    scopeName: "source.toy",
    patterns: [{ match: "/\\blet\\b/u", name: "keyword.toy" }],
  },
  "/syntax-themes/default.json": {
    colors: { "editor.background": "#101010" },
    tokenColors: [
      { scope: "keyword", settings: { foreground: "#ff0000" } },
      { scope: "markup.inserted", settings: { foreground: "#00ff00" } },
    ],
  },
};

function stub(on: On, files = true) {
  stubWorld(on);
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

type Filled = { findAll: (match: object) => Promise<{ props?: { backgroundColor?: string } }[]> };

// How many boxes were filled with the theme's background.
const filled = async (ui: Filled): Promise<number> =>
  (await ui.findAll({ type: "Box" })).filter((node) => node.props?.backgroundColor === "#101010").length;

test("fences, file reads and diffs take the theme's background", async ($, on) => {
  stub(on);

  const edit = {
    filePath: "/work/a.toy",
    structuredPatch: [{ oldStart: 1, newStart: 1, lines: [" let a", "-let b", "+let c"] }],
  };
  const read = { type: "text", file: { filePath: "/work/a.toy", content: "let a", startLine: 1 } };

  expect(await filled(await $.ui.mount(reply("```toy\nlet x\n```\n", "b1")))).toBe(1);
  expect(await filled(await $.ui.mount(result("Read", read, "b2")))).toBe(1);
  expect(await filled(await $.ui.mount(result("Edit", edit, "b3")))).toBe(1);
});

test("plain command output takes no background", async ($, on) => {
  stub(on);

  expect(await filled(await $.ui.mount(result("Bash", { stdout: "let a", stderr: "" }, "b4")))).toBe(0);
});

test("a command's output is never highlighted", async ($, on) => {
  stub(on);

  const ui = await $.ui.mount(result("Bash", { stdout: "let a", stderr: "" }, "h6"));

  expect(await ui.find({ type: "Text", text: "let a" })).toBeDefined();
  expect(await keywords(ui)).toBe(0);
});

const toolRowOf = (command: string, id: string) =>
  ({
    plugin: "veneer",
    viewport: { columns: 100, rows: 30 },
    surface: "terminal",
    component: "ToolUse",
    requestId: id,
    props: {
      tool_use_id: id,
      tool: "Bash",
      input: { command },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
    },
  }) as never;

const groupOf = (commands: string[], id: string) =>
  ({
    plugin: "veneer",
    viewport: { columns: 100, rows: 30 },
    surface: "terminal",
    component: "ToolGroup",
    requestId: id,
    props: {
      isActive: false,
      isExpanded: false,
      calls: commands.map((command, i) => ({
        tool: "Bash",
        input: { command },
        output: { stdout: "", stderr: "" },
        isRunning: false,
        isErrored: false,
        tool_use_id: `${id}-${i}`,
      })),
    },
  }) as never;

test("the command of a Command row is highlighted as shell, first line only", async ($, on) => {
  stub(on);

  const ui = await $.ui.mount(toolRowOf("let x\nlet y", "h7"));

  expect(await keywords(ui)).toBe(1);
});

test("a Command row draws plain when the grammar files cannot be read", async ($, on) => {
  stub(on, false);

  const ui = await $.ui.mount(toolRowOf("let x", "h8"));

  expect(await ui.find({ type: "Text", text: "let x" })).toBeDefined();
  expect(await keywords(ui)).toBe(0);
});

test("the commands of an opened group are highlighted", async ($, on) => {
  stub(on);

  const ui = await $.ui.mount(groupOf(["let a", "let b"], "h9"));

  await ui.press({ key: "group:h9" });
  expect(await keywords(ui)).toBe(2);
});

const bashResult = (stdout: string, id: string) => result("Bash", { stdout, stderr: "" }, id);

test("the output of cat is highlighted by the file's extension", async ($, on) => {
  stub(on);

  await $.ui.mount(toolRowOf("cat src/a.toy", "h10"));
  const ui = await $.ui.mount(bashResult("let a\nb", "h10"));

  expect(await keywords(ui)).toBe(1);
});

test("the output of a command that does not say what it prints stays plain", async ($, on) => {
  stub(on);

  await $.ui.mount(toolRowOf("cat src/a.toy | sort", "h11"));
  const ui = await $.ui.mount(bashResult("let a", "h11"));

  expect(await keywords(ui)).toBe(0);
});

test("a result whose command was never seen stays plain", async ($, on) => {
  stub(on);

  const ui = await $.ui.mount(bashResult("let a", "h12"));

  expect(await keywords(ui)).toBe(0);
});

test("stderr lines of a command stay plain", async ($, on) => {
  stub(on);

  await $.ui.mount(toolRowOf("cat src/a.toy", "h13"));

  const ui = await $.ui.mount(result("Bash", { stdout: "let a", stderr: "let oops" }, "h13"));

  expect(await keywords(ui)).toBe(1);
});

test("two commands that print the same language are highlighted together", async ($, on) => {
  stub(on);

  await $.ui.mount(toolRowOf("tail -2 src/a.toy; sed -n 1,2p src/a.toy", "h21"));

  const ui = await $.ui.mount(bashResult("let a\nlet b\nlet c", "h21"));

  expect(await keywords(ui)).toBe(3);
});

test("cat -n leaves the number column plain and highlights the code", async ($, on) => {
  stub(on);

  await $.ui.mount(toolRowOf("cat -n src/a.toy", "h22"));

  const ui = await $.ui.mount(bashResult("     1\tlet a\n     2\tb", "h22"));

  expect(await keywords(ui)).toBe(1);
  expect(await ui.find({ type: "Text", text: "     1    " })).toBeDefined();
});

test("cat -n output with a line that has no number stays plain", async ($, on) => {
  stub(on);

  await $.ui.mount(toolRowOf("cat -n src/a.toy", "h23"));

  const ui = await $.ui.mount(bashResult("     1\tlet a\nlet b", "h23"));

  expect(await keywords(ui)).toBe(0);
});

test("the matches printed by rg are highlighted by their own file", async ($, on) => {
  stub(on);

  await $.ui.mount(toolRowOf("rg -n let src", "h24"));

  const ui = await $.ui.mount(bashResult("src/a.toy:1:let a\nsrc/b.toy:4:let b", "h24"));

  expect(await keywords(ui)).toBe(2);
});

test("a search of one file is highlighted from its numbered lines", async ($, on) => {
  stub(on);

  await $.ui.mount(toolRowOf("grep -n let -B1 src/a.toy | head -9; grep -n let src/a.toy", "h26"));

  const ui = await $.ui.mount(bashResult("3-let a\n4:let b\n--\n9:let c", "h26"));

  expect(await keywords(ui)).toBe(3);
  expect(await ui.find({ type: "Text", text: "4:" })).toBeDefined();
});

test("a search of one file stays plain when its lines have no numbers", async ($, on) => {
  stub(on);

  await $.ui.mount(toolRowOf("grep let src/a.toy", "h27"));

  const ui = await $.ui.mount(bashResult("let a\nlet b", "h27"));

  expect(await keywords(ui)).toBe(0);
});

test("a search of a directory named like a file is read by the paths it prints", async ($, on) => {
  stub(on);

  await $.ui.mount(toolRowOf("grep -n let v1.2", "h28"));

  const ui = await $.ui.mount(bashResult("v1.2/a.toy:3:let a", "h28"));

  expect(await keywords(ui)).toBe(1);
});

test("rg output without line numbers stays plain", async ($, on) => {
  stub(on);

  await $.ui.mount(toolRowOf("rg let src", "h25"));

  const ui = await $.ui.mount(bashResult("src/a.toy:let a", "h25"));

  expect(await keywords(ui)).toBe(0);
});

test("a diff command is highlighted as a diff only when it printed one", async ($, on) => {
  stub(on);

  const painted = async (stdout: string, id: string) => {
    await $.ui.mount(toolRowOf("git diff", id));

    const ui = await $.ui.mount(bashResult(stdout, id));

    return (await ui.findAll({ type: "Text" })).filter(
      (node) => (node as { props?: { color?: string } }).props?.color === "#00ff00",
    ).length;
  };

  expect(await painted("@@ -1 +1 @@\n-a\n+b", "h14")).toBe(1);
  expect(await painted(" a.ts | 2 +-\n+not a diff", "h15")).toBe(0);
});

test("grep matches and context lines are highlighted by their own file's extension", async ($, on) => {
  stub(on);

  const content = "src/a.toy:1:let a\nsrc/a.toy-2-let b\n--\nsrc/b-1-x.toy:7:let c\nsrc/b-1-x.toy-8-let d";
  const ui = await $.ui.mount(result("Grep", { content, filenames: [] }, "h16"));

  expect(await keywords(ui)).toBe(4);
  expect(await ui.find({ type: "Text", text: "src/a.toy:1:" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "src/b-1-x.toy:7:" })).toBeDefined();
});

test("grep output without line numbers is left plain", async ($, on) => {
  stub(on);

  const ui = await $.ui.mount(result("Grep", { content: "src/a.toy:let a\nsrc/b.toy:let b", filenames: [] }, "h17"));

  expect(await keywords(ui)).toBe(0);
});

test("grep output that is partly unparsed is left plain", async ($, on) => {
  stub(on);

  const ui = await $.ui.mount(
    result("Grep", { content: "src/a.toy:1:let a\nsomething else\nsrc/b.toy:2:let b", filenames: [] }, "h18"),
  );

  expect(await keywords(ui)).toBe(0);
});

test("a note after the last grep line does not stop the lines being highlighted", async ($, on) => {
  stub(on);

  const content = "src/a.toy:1:let a\n[Showing results with pagination = limit: 1]";
  const ui = await $.ui.mount(result("Grep", { content, filenames: [] }, "h19"));

  expect(await keywords(ui)).toBe(1);
});

test("the output of a call in an opened group is highlighted", async ($, on) => {
  stub(on);

  const grouped = {
    plugin: "veneer",
    viewport: { columns: 100, rows: 30 },
    surface: "terminal",
    component: "ToolGroup",
    requestId: "h20",
    props: {
      isActive: false,
      isExpanded: false,
      calls: [
        {
          tool: "Bash",
          input: { command: "cat a.toy" },
          output: { stdout: "let a", stderr: "" },
          isRunning: false,
          isErrored: false,
          tool_use_id: "h20-0",
        },
      ],
    },
  } as never;
  const ui = await $.ui.mount(grouped);

  await ui.press({ key: "row:call:h20-0" });
  expect(await keywords(ui)).toBe(1);
});

test("the lines of a file read in an opened group are highlighted by the file's extension", async ($, on) => {
  stub(on);

  const call = (id: string, path: string) => ({
    tool: "Read",
    input: { file_path: path },
    output: { type: "text", file: { filePath: path, content: "let a", startLine: 1 } },
    isRunning: false,
    isErrored: false,
    tool_use_id: id,
  });
  const ui = await $.ui.mount({
    plugin: "veneer",
    viewport: { columns: 100, rows: 30 },
    surface: "terminal",
    component: "ToolGroup",
    requestId: "h21",
    props: { isActive: false, isExpanded: false, calls: [call("h21-0", "/work/a.toy"), call("h21-1", "/work/b.toy")] },
  } as never);

  await ui.press({ key: "group:h21" });
  await ui.press({ key: "row:call:h21-0" });
  expect(await keywords(ui)).toBe(1);
});
