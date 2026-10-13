import { expect, test } from "claude-code/testing";

import {
  baseNameOf,
  cleanName,
  configDirOf,
  expandHome,
  importName,
  themeNames,
  themeProblem,
  themesDirOf,
  uniqueName,
} from "../hooks/syntax-themes";

test("the Claude folder is CLAUDE_CONFIG_DIR when set, else .claude in the home folder", () => {
  expect(configDirOf(undefined, "/home/a")).toBe("/home/a/.claude");
  expect(configDirOf("", "/home/a/")).toBe("/home/a/.claude");
  expect(configDirOf("/work/claude/", "/home/a")).toBe("/work/claude");
  expect(configDirOf("  ", undefined)).toBeUndefined();
  expect(themesDirOf("/work/claude")).toBe("/work/claude/veneer/themes");
});

test("a typed path starting with ~/ is made absolute", () => {
  expect(expandHome("~/themes/a.json", "/home/a")).toBe("/home/a/themes/a.json");
  expect(expandHome("/x/a.json", "/home/a")).toBe("/x/a.json");
  expect(expandHome("~/a.json", undefined)).toBe("~/a.json");
});

test("the theme list holds the json files of a folder by name, sorted", () => {
  const entries = [
    { name: "zeta.json", kind: "file" },
    { name: "Alpha.JSON", kind: "file" },
    { name: "notes.txt", kind: "file" },
    { name: "old.json.bak", kind: "file" },
    { name: ".hidden.json", kind: "file" },
    { name: "sub.json", kind: "dir" },
    { name: "a::b.json", kind: "file" },
  ];

  expect(themeNames(entries)).toEqual(["Alpha", "zeta"]);
});

test("a name is cleaned to something safe in a file name", () => {
  expect(cleanName("  My Theme.json ")).toBe("My Theme");
  expect(cleanName("../../etc/passwd")).toBe("etc-passwd");
  expect(cleanName("a/b\\c")).toBe("a-b-c");
  expect(cleanName("...")).toBe("");
  expect(cleanName("")).toBe("");
});

test("a taken name gets the first free number added, ignoring case", () => {
  expect(uniqueName("xenon", [])).toBe("xenon");
  expect(uniqueName("xenon", ["xenon"])).toBe("xenon1");
  expect(uniqueName("xenon", ["Xenon", "xenon1", "other"])).toBe("xenon2");
});

test("an import keeps the name asked for, else the file's own, else a fallback", () => {
  expect(importName("mine", "/t/a.json")).toBe("mine");
  expect(importName("  ", "/t/midnight-xenon-color-theme.json")).toBe("midnight-xenon-color-theme");
  expect(importName("", "/t/...json")).toBe("theme");
  expect(baseNameOf("/t/a.json")).toBe("a.json");
});

test("only a JSON file with token colours is a theme", () => {
  expect(themeProblem('{"tokenColors":[{"scope":"a","settings":{}}],}')).toBeUndefined();
  expect(themeProblem("not json")).toContain("not valid JSON");
  expect(themeProblem('{"tokenColors":[]}')).toContain("no tokenColors");
  expect(themeProblem("[]")).toContain("no tokenColors");
  expect(themeProblem("null")).toContain("no tokenColors");
});
