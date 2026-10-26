import { expect, test } from "claude-code/testing";

import { inlineChanges, inlineMarks, markRuns } from "../hooks/inline-diff";

test("an edited line is marked where it changed, on both sides", () => {
  expect(inlineChanges("const a = 1;", "const a = 22;")).toEqual({ before: [[10, 11]], after: [[10, 12]] });
});

test("a changed phrase is one span, blank included", () => {
  expect(inlineChanges("call(old one, x)", "call(new two, x)")).toEqual({ before: [[5, 12]], after: [[5, 12]] });
});

test("lines that share too little are a rewrite, not an edit", () => {
  expect(inlineChanges("alpha beta gamma", "zzz yyy xxx")).toBeNull();
});

test("a run of removed lines is paired with the added lines that follow it", () => {
  const marks = inlineMarks([
    { kind: "context", text: "keep" },
    { kind: "remove", text: "let a = 1;" },
    { kind: "remove", text: "let b = 2;" },
    { kind: "add", text: "let a = 5;" },
    { kind: "add", text: "let b = 7;" },
    { kind: "add", text: "brand new" },
  ]);

  expect([...marks.keys()].sort()).toEqual([1, 2, 3, 4]);
  expect(marks.get(1)).toEqual([[8, 9]]);
  expect(marks.get(3)).toEqual([[8, 9]]);
});

test("runs are cut at the edges of a span, and the pieces inside it carry the background", () => {
  const runs = markRuns("abcdef", [{ text: "abcdef", color: "red" }], [[2, 4]], "mark");

  expect(runs).toEqual([
    { text: "ab", color: "red" },
    { text: "cd", color: "red", background: "mark" },
    { text: "ef", color: "red" },
  ]);
  expect(markRuns("abc", [{ text: "x" }], [[0, 1]], "mark")).toEqual([{ text: "x" }]);
  expect(markRuns("abc", undefined, undefined, "mark")).toBeUndefined();
});
