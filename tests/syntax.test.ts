import { expect, test } from "claude-code/testing";

import { Registry, ROOT_SCOPE, tokenizeLine } from "../hooks/syntax/engine";
import type { StateStack } from "../hooks/syntax/engine";
import { highlight } from "../hooks/syntax/highlight";
import { hintOf, paintDiff } from "../hooks/paint";
import { colorOf, loadTheme, parseJsonc, Theme } from "../hooks/syntax/theme";
import type { Grammar, GrammarIndex } from "../hooks/syntax/types";

const MARK = String.fromCharCode(0xe000);

const TOY: Grammar = {
  scopeName: "source.toy",
  patterns: [
    { include: "#comment" },
    { include: "#string" },
    { include: "#heredoc" },
    { begin: "/<a/u", end: "/(?=>)/u", name: "meta.tag.toy" },
    { match: "/>/u", name: "punctuation.close.toy" },
    {
      match: "/\\b(fn)\\s+([a-z]+)/ud",
      captures: { "1": { name: "storage.toy" }, "2": { name: "entity.name.function.toy" } },
    },
    { match: "/\\b(let|fn)\\b/u", name: "keyword.toy" },
  ],
  repository: {
    comment: { match: "/#.*$/mu", name: "comment.line.toy" },
    string: {
      begin: '/"/u',
      end: '/"/u',
      name: "string.quoted.toy",
      patterns: [{ match: "/\\\\./u", name: "constant.character.escape.toy" }],
    },
    heredoc: {
      begin: "/<<(\\w+)/ud",
      beginCaptures: { "1": { name: "keyword.control.tag.toy" } },
      end: `/^${MARK}1${MARK}$/mu`,
      contentName: "string.unquoted.heredoc.toy",
    },
  },
};

function tokenize(lines: string[]) {
  const registry = new Registry();

  registry.add(TOY);

  let state = registry.initialState("source.toy") as StateStack;

  return lines.map((line) => {
    const result = tokenizeLine(line, state);

    state = result.state;

    return result.tokens.map((token) => [line.slice(token.start, token.end), token.scope.path.slice(1).join(" ")]);
  });
}

test("a match rule scopes its text and a begin and end rule scopes what lies between", () => {
  expect(tokenize(['let x "a\\nb"'])).toEqual([
    [
      ["let", "keyword.toy"],
      [" x ", ""],
      ['"a', "string.quoted.toy"],
      ["\\n", "string.quoted.toy constant.character.escape.toy"],
      ['b"', "string.quoted.toy"],
    ],
  ]);
});

test("captures lay their own scopes over the match", () => {
  expect(tokenize(["fn go"])[0]).toEqual([
    ["fn", "storage.toy"],
    [" ", ""],
    ["go", "entity.name.function.toy"],
  ]);
});

test("a rule stays open across lines and an end that names a begin capture closes on its text", () => {
  expect(tokenize(["<<EOT", "let", "EOT", "let"])).toEqual([
    [
      ["<<", ""],
      ["EOT", "keyword.control.tag.toy"],
    ],
    [["let", "string.unquoted.heredoc.toy"]],
    [["EOT", ""]],
    [["let", "keyword.toy"]],
  ]);
});

test("a rule that ends on nothing at the column it began on an earlier line still ends", () => {
  expect(tokenize(["<a", ">"])[1]).toEqual([[">", "punctuation.close.toy"]]);
});

test("a string left open at the end of a line continues on the next", () => {
  expect(tokenize(['"one', 'two" let']).map((line) => line.map(([text]) => text))).toEqual([
    ['"one'],
    ['two"', " ", "let"],
  ]);
});

test("theme files may hold comments and trailing commas", () => {
  expect(parseJsonc('{\n // note\n "a": [1, 2,], /* more */ "b": "x//y",\n}')).toEqual({ a: [1, 2], b: "x//y" });
});

test("colours are read as hex, with a short form widened and a transparency suffix dropped", () => {
  expect(colorOf("#ABC")).toBe("#aabbcc");
  expect(colorOf("#11223344")).toBe("#112233");
  expect(colorOf("red")).toBeUndefined();
});

const scope = (...names: string[]) => names.reduce((node, name) => node.push(name), ROOT_SCOPE.push("source.t"));

test("the most specific rule wins, a scope inherits from the scopes around it, and later rules win a tie", () => {
  const theme = new Theme([
    { scope: "string", settings: { foreground: "#111111" } },
    { scope: "string.quoted", settings: { foreground: "#222222", fontStyle: "italic" } },
    { scope: "string.quoted", settings: { foreground: "#333333" } },
    { scope: "source.t punctuation", settings: { foreground: "#444444" } },
    { scope: "meta.block variable", settings: { fontStyle: "bold" } },
  ]);

  expect(theme.styleOf(scope("string.quoted.double"))).toEqual({
    color: "#333333",
    bold: false,
    italic: true,
    underline: false,
    strikethrough: false,
  });
  expect(theme.styleOf(scope("string.quoted.double", "constant.character")).color).toBe("#333333");
  expect(theme.styleOf(scope("punctuation.definition")).color).toBe("#444444");
  expect(theme.styleOf(scope("variable")).bold).toBeUndefined();
  expect(theme.styleOf(scope("meta.block", "variable")).bold).toBe(true);
});

test("a theme includes another by path and overrides it", async () => {
  const files: Record<string, string> = {
    "/themes/base.json":
      '{"colors":{"editor.foreground":"#aaaaaa"},"tokenColors":[{"scope":"string","settings":{"foreground":"#010101"}}]}',
  };
  const theme = await loadTheme(
    '{"include":"./base.json","tokenColors":[{"scope":"comment","settings":{"foreground":"#020202"}}]}',
    "/themes",
    async (path) => files[path],
  );

  expect(theme?.styleOf(scope("string")).color).toBe("#010101");
  expect(theme?.styleOf(scope("comment")).color).toBe("#020202");
  expect(theme?.styleOf(scope("other")).color).toBe("#aaaaaa");
  expect(await loadTheme("not json", "/", async () => undefined)).toBeNull();
});

const INDEX: GrammarIndex = {
  languages: { toy: { scopeName: "source.toy", file: "toy.json", aliases: ["tiny"], extensions: ["toy"] } },
  scopes: { "source.toy": "toy.json" },
};

const FILES: Record<string, string> = {
  "/root/grammars/index.json": JSON.stringify(INDEX),
  "/root/grammars/toy.json": JSON.stringify(TOY),
  "/root/themes/default.json": JSON.stringify({
    tokenColors: [{ scope: "keyword", settings: { foreground: "#ff0000" } }],
  }),
  "/user/theme.json": JSON.stringify({ tokenColors: [{ scope: "keyword", settings: { foreground: "#00ff00" } }] }),
};
const io = { root: "/root", read: async (path: string) => FILES[path] };

test("code is highlighted by language name, alias or extension, and drawn plain when there is no grammar", async () => {
  const byName = await highlight(io, "", "toy", "let x");

  expect(byName?.[0]).toEqual([{ text: "let", color: "#ff0000" }, { text: " x" }]);
  expect(await highlight(io, "", "tiny", "let x")).toEqual(byName);
  expect(await highlight(io, "", ".toy", "let x")).toEqual(byName);
  expect(await highlight(io, "", "nope", "let x")).toBeNull();
  expect(await highlight(io, "", "", "let x")).toBeNull();
});

test("a theme path changes the colours and a path that cannot be read falls back to the shipped theme", async () => {
  expect((await highlight(io, "/user/theme.json", "toy", "let"))?.[0]?.[0]?.color).toBe("#00ff00");
  expect((await highlight(io, "/missing.json", "toy", "let"))?.[0]?.[0]?.color).toBe("#ff0000");
});

test("a block of too many lines draws plain", async () => {
  expect(await highlight(io, "", "toy", Array.from({ length: 1501 }, () => "let").join("\n"))).toBeNull();
});

test("a file's language comes from its extension or, without one, its name", () => {
  expect(hintOf("/work/src/App.TSX")).toBe("tsx");
  expect(hintOf("/work/Dockerfile")).toBe("dockerfile");
  expect(hintOf("/work/.gitignore")).toBe(".gitignore");
});

test("a diff is painted as the old and the new file, and each line takes the runs of its own side", async () => {
  const seen: string[] = [];
  const paint = async (_hint: string, code: string) => {
    seen.push(code);

    return code.split("\n").map((text) => [{ text }]);
  };
  const lines = [
    { kind: "context", text: "a", oldNumber: 1, newNumber: 1 },
    { kind: "remove", text: "b", oldNumber: 2, newNumber: null },
    { kind: "add", text: "B", oldNumber: null, newNumber: 2 },
    { kind: "context", text: "c", oldNumber: 3, newNumber: 3 },
    { kind: "context", text: "z", oldNumber: 9, newNumber: 9 },
    { kind: "add", text: "y", oldNumber: null, newNumber: 10 },
  ] as const;
  const runs = await paintDiff(paint, "x.ts", { lines: [...lines], breaks: new Set([4]) });

  expect(runs.map((line) => line?.[0]?.text)).toEqual(["a", "b", "B", "c", "z", "y"]);
  expect(seen.sort()).toEqual(["a\nB\nc", "a\nb\nc", "z\ny"]);
});
