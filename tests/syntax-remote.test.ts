import { expect, test } from "claude-code/testing";

import {
  fileUrl,
  flattenTheme,
  needsStrings,
  pageOf,
  PAGE_SIZE,
  parseExtensionId,
  themesOf,
} from "../hooks/syntax-remote";
import { POPULAR_THEMES } from "../hooks/syntax-popular";

test("an extension is named by id or by the address of its Open VSX page", () => {
  const expected = { publisher: "MitchellMedeiros", name: "midnight-xenon" };

  expect(parseExtensionId("MitchellMedeiros.midnight-xenon")).toEqual(expected);
  expect(parseExtensionId(" https://www.open-vsx.org/extension/MitchellMedeiros/midnight-xenon ")).toEqual(expected);
  expect(parseExtensionId("https://open-vsx.org/extension/MitchellMedeiros/midnight-xenon/1.5.1?x=1")).toEqual(
    expected,
  );
});

test("a file name or path is not an extension", () => {
  expect(parseExtensionId("theme.json")).toBeUndefined();
  expect(parseExtensionId("~/themes/a.json")).toBeUndefined();
  expect(parseExtensionId("/elsewhere/midnight")).toBeUndefined();
  expect(parseExtensionId("midnight")).toBeUndefined();
  expect(parseExtensionId("")).toBeUndefined();
});

test("a file of an extension is addressed from its root with each part encoded", () => {
  const id = { publisher: "a", name: "b" };
  const base = "https://open-vsx.org/vscode/asset/a/b/latest/Microsoft.VisualStudio.Code.WebResources/extension";

  expect(fileUrl(id, "./themes/x y.json")).toBe(`${base}/themes/x%20y.json`);
  expect(fileUrl(id, "themes/../package.json")).toBe(`${base}/package.json`);
});

test("the themes of a manifest are its labels and paths, with labels read from the strings file", () => {
  const manifest = JSON.stringify({
    contributes: {
      themes: [
        { label: "Plain", path: "./a.json" },
        { id: "by-id", path: "./b.json" },
        { label: "%dark%", path: "./c.json" },
        { label: "No path" },
      ],
    },
  });

  expect(themesOf(manifest)).toEqual([
    { label: "Plain", path: "./a.json" },
    { label: "by-id", path: "./b.json" },
    { label: "%dark%", path: "./c.json" },
  ]);
  expect(needsStrings(themesOf(manifest))).toBe(true);
  expect(themesOf(manifest, JSON.stringify({ dark: { message: "Dark" } })).map(({ label }) => label)).toEqual([
    "Plain",
    "by-id",
    "Dark",
  ]);
  expect(themesOf("not json")).toEqual([]);
  expect(themesOf("{}")).toEqual([]);
});

test("a theme is flattened with the files it includes, which override in order", async () => {
  const files: Record<string, string> = {
    "/themes/base.json": JSON.stringify({
      colors: { "editor.background": "#111111" },
      tokenColors: [{ scope: "keyword", settings: { foreground: "#aaaaaa" } }],
    }),
  };
  const theme = JSON.stringify({
    include: "./base.json",
    colors: { "editor.foreground": "#eeeeee" },
    tokenColors: [{ scope: "string", settings: { foreground: "#bbbbbb" } }],
  });
  const flat = await flattenTheme(theme, "./themes/main.json", async (path) => files[path]);

  expect(JSON.parse(flat ?? "")).toEqual({
    colors: { "editor.background": "#111111", "editor.foreground": "#eeeeee" },
    tokenColors: [
      { scope: "keyword", settings: { foreground: "#aaaaaa" } },
      { scope: "string", settings: { foreground: "#bbbbbb" } },
    ],
  });
});

test("text that is not JSON does not flatten", async () => {
  expect(await flattenTheme("{", "a.json", async () => undefined)).toBeUndefined();
});

test("a list is cut into pages and the page asked for is kept in range", () => {
  const items = Array.from({ length: PAGE_SIZE * 2 + 1 }, (_, i) => i);

  expect(pageOf(items, 0)).toEqual({ rows: items.slice(0, PAGE_SIZE), page: 0, pages: 3 });
  expect(pageOf(items, 2).rows).toEqual([PAGE_SIZE * 2]);
  expect(pageOf(items, 9).page).toBe(2);
  expect(pageOf(items, -1).page).toBe(0);
  expect(pageOf([], 0)).toEqual({ rows: [], page: 0, pages: 1 });
});

test("the popular list holds fifty distinct extensions", () => {
  const ids = POPULAR_THEMES.map(({ id }) => id.toLowerCase());

  expect(ids).toHaveLength(50);
  expect(new Set(ids).size).toBe(50);
  expect(POPULAR_THEMES.every(({ id }) => parseExtensionId(id) !== undefined)).toBe(true);
});
