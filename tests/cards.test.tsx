import { expect, test } from "claude-code/testing";

import { commandOfCall, rememberInput } from "../hooks/calls";
import { codeCard } from "../hooks/code";
import { copyRow } from "../hooks/copy-button";
import { foldButton, foldOf, limitOf, MAX_LINES } from "../hooks/fold";
import { headingCard } from "../hooks/heading-card";
import { ANCHOR_MARK, BACK_REFERENCE_MARK, FIRST_LINE_MARK, withoutMarks } from "../hooks/syntax/mark";
import { lineChildren } from "../hooks/syntax/runs";

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] };

// Every element of a tree, the root first.
function elements(node: unknown): Node[] {
  if (Array.isArray(node)) {
    return node.flatMap(elements);
  }

  if (typeof node !== "object" || node === null) {
    return [];
  }

  const element = node as Node;

  return [element, ...elements(element.children)];
}

// The text a tree shows, in order.
function textOf(node: unknown): string {
  if (typeof node === "string") {
    return node;
  }

  if (Array.isArray(node)) {
    return node.map(textOf).join("");
  }

  return typeof node === "object" && node !== null ? textOf((node as Node).children) : "";
}

// Elements that draw themselves as their own names, so a card's tree can be read without a surface.
const UI = { Box: "Box", Text: "Text", Button: "Button" } as unknown as Parameters<typeof codeCard>[0] &
  Parameters<typeof foldButton>[0] &
  Parameters<typeof copyRow>[0];

test("a remembered call gives back its command, and only a Bash command", () => {
  rememberInput("c1", { command: "ls -la" });
  rememberInput("c2", { file_path: "/a" });
  rememberInput("c3", null);
  rememberInput("c4", { command: 4 });

  expect(commandOfCall("c1")).toBe("ls -la");
  expect(commandOfCall("c2")).toBeUndefined();
  expect(commandOfCall("c3")).toBeUndefined();
  expect(commandOfCall("c4")).toBeUndefined();
  expect(commandOfCall("never-seen")).toBeUndefined();
});

test("the oldest remembered calls are forgotten once there are too many", () => {
  rememberInput("old", { command: "first" });

  for (let i = 0; i < 500; i += 1) {
    rememberInput(`filler-${i}`, { command: "x" });
  }

  expect(commandOfCall("old")).toBeUndefined();
  expect(commandOfCall("filler-499")).toBe("x");
});

test("a call seen again counts as the newest", () => {
  rememberInput("again", { command: "one" });

  for (let i = 0; i < 499; i += 1) {
    rememberInput(`spacer-${i}`, { command: "x" });
  }

  rememberInput("again", { command: "two" });
  rememberInput("pushes-one-out", { command: "x" });

  expect(commandOfCall("again")).toBe("two");
});

test("a card that fits has no fold button, and a longer one says how many lines it hides", () => {
  const none = () => {};
  const closed = { limit: MAX_LINES, more: none, less: none };
  const partly = { limit: MAX_LINES * 2, more: none, less: none };

  expect(foldButton(UI, MAX_LINES, closed, "a")).toBeNull();
  expect(textOf(foldButton(UI, MAX_LINES + 6, closed, "a"))).toBe("Show 6 more lines");
  expect(textOf(foldButton(UI, MAX_LINES + 1, closed, "a"))).toBe("Show 1 more line");
  expect(textOf(foldButton(UI, MAX_LINES * 3, closed, "a"))).toBe(`Show ${MAX_LINES} more lines`);
  expect(textOf(foldButton(UI, MAX_LINES * 3, partly, "a"))).toBe(`Show ${MAX_LINES} more linesShow fewer lines`);
  expect(textOf(foldButton(UI, MAX_LINES * 2, partly, "a"))).toBe("Show fewer lines");
});

test("a fold counts the step ids that are open, and a press adds or removes the next one", () => {
  const open = new Set(["a#1", "a#2", "a#4"]);
  const pressed: string[] = [];
  const fold = foldOf(open, (id) => pressed.push(id), "a");

  expect(limitOf(new Set(), "a")).toBe(MAX_LINES);
  expect(fold.limit).toBe(MAX_LINES * 3);

  fold.more();
  fold.less();

  expect(pressed).toEqual(["a#3", "a#2"]);
});

test("the fold button's key carries the card's id", () => {
  const closed = { limit: MAX_LINES, more: () => {}, less: () => {} };
  const button = elements(foldButton(UI, MAX_LINES + 1, closed, "card-7")).find((node) => node.type === "Button");

  expect(button?.props?.key).toBe("fold:card-7");
});

test("the copy row holds one button, labelled by the terminal's icon support", () => {
  const copy = { scope: "block-1", onCopy: () => {} };
  const nerd = copyRow(UI, copy);
  const plain = copyRow(UI, { ...copy, isPlain: true });

  expect(textOf(nerd)).toBe(" \u{f0c5}  Copy ");
  expect(textOf(plain)).toBe(" ❐  Copy ");
  expect(elements(nerd).filter((node) => node.type === "Button")).toHaveLength(1);
});

test("a code card names its language and keeps every line, empty ones included", () => {
  const card = codeCard(UI, "ts", "const a = 1;\n\nconst b = 2;");

  expect(textOf(card)).toBe("tsconst a = 1; const b = 2;");
  expect(elements(card).filter((node) => node.props?.wrap === "wrap")).toHaveLength(3);
});

test("a code card with no language has no label, and a background fills it", () => {
  const card = codeCard(UI, "", "x", undefined, "#101010") as unknown as Node;

  expect(textOf(card)).toBe("x");
  expect(card.props?.backgroundColor).toBe("#101010");
});

test("a code card has a rounded border unless borders are off", () => {
  const bordered = codeCard(UI, "", "x") as unknown as Node;
  const bare = codeCard(UI, "", "x", undefined, undefined, undefined, "plain") as unknown as Node;
  const padded = codeCard(UI, "", "x", undefined, undefined, undefined, "padded") as unknown as Node;

  expect(bordered.props?.borderStyle).toBe("round");
  expect(bare.props?.borderStyle).toBeUndefined();
  expect(bare.props?.paddingY).toBeUndefined();
  expect(padded.props?.borderStyle).toBeUndefined();
  expect(padded.props?.paddingY).toBe(1);
});

test("a code card colours a line by its runs", () => {
  const card = codeCard(UI, "", "let x", [[{ text: "let", color: "#ff0000" }, { text: " x" }]]);
  const colors = elements(card).flatMap((node) => (node.props?.color ? [node.props.color] : []));

  expect(colors).toEqual(["#ff0000"]);
});

test("a line with no runs is its text, and an empty one is a space", () => {
  const text = (() => null) as never;

  expect(lineChildren({ Text: text }, "abc", undefined)).toBe("abc");
  expect(lineChildren({ Text: text }, "abc", [])).toBe("abc");
  expect(lineChildren({ Text: text }, "", undefined)).toBe(" ");
});

test("heading levels one and two get a rule as long as the text, and deeper ones do not", () => {
  const draw = (level: number, text = "Title") => headingCard(UI, { level, text } as never, 80);
  const rules = (level: number) => elements(draw(level)).filter((node) => /^[━─]+$/.test(textOf(node)));

  expect(textOf(rules(1).at(-1))).toBe("━━━━━");
  expect(textOf(rules(2).at(-1))).toBe("─────");
  expect(rules(3)).toEqual([]);
  expect(rules(4)).toEqual([]);
});

test("a heading's rule is cut to the room there is and never empty", () => {
  const rule = (text: string, available: number) =>
    textOf(elements(headingCard(UI, { level: 1, text } as never, available)).at(-1));

  expect(rule("A long heading", 4)).toBe("━━━━");
  expect(rule("A long heading", 0)).toBe("━");
});

test("the fourth level is dim and the third is not", () => {
  const bold = (level: number) => elements(headingCard(UI, { level, text: "t" } as never, 10))[0]?.props;

  expect(bold(3)?.dimColor).toBeUndefined();
  expect(bold(4)?.dimColor).toBe(true);
});

test("the marks a translated regex carries are swapped for something that compiles", () => {
  const source = `a${BACK_REFERENCE_MARK}1${BACK_REFERENCE_MARK}${ANCHOR_MARK}b${FIRST_LINE_MARK}`;

  expect(withoutMarks(source)).toBe("ax1x(?:)b(?:)");
  expect(() => new RegExp(withoutMarks(source))).not.toThrow();
});
