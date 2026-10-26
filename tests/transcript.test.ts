import { expect, test } from "claude-code/testing";

import { bottomTarget, endsOf, entriesOf, forgetEnds, noteAppended, noteEnds, topTarget } from "../hooks/transcript";

const line = (fields: Record<string, unknown>): string =>
  JSON.stringify({ parentUuid: null, isSidechain: false, ...fields });

const prompt = (uuid: string, content: unknown = "hello", extra: Record<string, unknown> = {}): string =>
  line({ type: "user", message: { role: "user", content }, uuid, ...extra });

const reply = (uuid: string, ...content: unknown[]): string =>
  line({ type: "assistant", message: { role: "assistant", content }, uuid });

const text = (value: string) => ({ type: "text", text: value });
const call = (id: string, name = "Read") => ({ type: "tool_use", id, name, input: {} });
const returned = (id: string) => ({ type: "tool_result", tool_use_id: id, content: "x".repeat(10_000) });

const idsOf = (source: string): string[] => entriesOf(JSON.parse(source)).map((entry) => entry.id);

test("a person's prompt draws under its uuid", () => {
  expect(idsOf(prompt("u1"))).toEqual(["u1"]);
  expect(idsOf(prompt("u2", [text("look"), { type: "image" }]))).toEqual(["u2"]);
});

test("a prompt the person did not type, or a tool result, draws no row", () => {
  expect(idsOf(prompt("u1", "reminder", { isMeta: true }))).toEqual([]);
  expect(idsOf(prompt("u2", [returned("toolu_1")], { toolUseResult: { huge: "y".repeat(5000) } }))).toEqual([]);
});

test("an assistant text block draws under its uuid and a tool call under its tool_use id", () => {
  expect(idsOf(reply("a1", text("done")))).toEqual(["a1"]);
  expect(idsOf(reply("a2", call("toolu_1")))).toEqual(["toolu_1"]);
  expect(idsOf(reply("a3", text("both"), call("toolu_2")))).toEqual(["a3", "toolu_2"]);
});

test("thinking, blank text, attachments, notices and subagent lines draw no row", () => {
  expect(idsOf(reply("a1", { type: "thinking", thinking: "hmm" }))).toEqual([]);
  expect(idsOf(reply("a2", text("  ")))).toEqual([]);
  expect(idsOf(line({ type: "attachment", uuid: "t1", attachment: { type: "hook" } }))).toEqual([]);
  expect(idsOf(line({ type: "system", uuid: "s1", message: { content: "note" } }))).toEqual([]);
  expect(idsOf(line({ type: "user", isSidechain: true, message: { content: "sub" }, uuid: "u9" }))).toEqual([]);
});

test("the ends of a transcript are its first prompt and its newest row", () => {
  const start = [
    line({ type: "file-history-snapshot" }),
    line({ type: "attachment", uuid: "t1" }),
    prompt("u1"),
    reply("a1", text("sure")),
    reply("a2", call("toolu_1")),
    prompt("u2", [returned("toolu_1")]),
  ].join("\n");
  const end = [
    reply("a2", call("toolu_1")).slice(10),
    prompt("u2", [returned("toolu_1")]),
    reply("a3", text("a"), call("toolu_9")),
    prompt("u3", [returned("toolu_9")]),
    line({ type: "last-prompt" }),
  ].join("\n");

  const ends = endsOf(start, end);

  expect(ends.top).toBe("u1");
  expect(ends.recent.map((entry) => entry.id)).toEqual(["a3", "toolu_9"]);
});

test("a transcript with no rows, or no text at all, has no ends", () => {
  expect(endsOf("", "")).toEqual({ top: undefined, recent: [] });
  expect(endsOf(line({ type: "attachment", uuid: "t1" }), "{not json")).toEqual({ top: undefined, recent: [] });
});

const noteLines = (...lines: string[]): void => noteEnds(endsOf("", lines.join("\n")));

test("the newest row is the last message, or a lone tool call by its own id", () => {
  forgetEnds();
  noteLines(prompt("u1"), reply("a1", text("done")));

  expect(bottomTarget()).toEqual({ id: "a1" });

  noteLines(prompt("u1"), reply("a1", text("done")), reply("a2", call("toolu_1")));

  expect(bottomTarget()).toEqual({ id: "toolu_1" });
});

test("two or more folded calls in a row are one group, named for the first call", () => {
  forgetEnds();
  noteLines(
    reply("a1", text("looking")),
    reply("a2", call("toolu_01U9mu5jK5DkLfi3YqorUhNT", "Bash")),
    reply("a3", call("toolu_2", "Read")),
    prompt("u2", [returned("toolu_2")]),
    reply("a4", call("toolu_3", "Grep")),
  );

  expect(bottomTarget()).toEqual({ id: "collapsed-toolu_01U9mu5jK5DkLfi3Yq000000000000", before: "a1" });
});

test("a call that is not folded ends a run, and a folded call after it starts a new one", () => {
  forgetEnds();
  noteLines(reply("a1", call("toolu_1", "Read")), reply("a2", call("toolu_2", "Edit")), reply("a3", call("toolu_3")));

  expect(bottomTarget()).toEqual({ id: "toolu_3" });
});

test("a row appended after the file was read becomes the newest, and a clear forgets both ends", () => {
  forgetEnds();
  noteEnds(endsOf(prompt("u1"), prompt("u1")));
  noteAppended(JSON.parse(reply("a1", text("new"))));

  expect(topTarget()).toEqual({ id: "u1" });
  expect(bottomTarget()).toEqual({ id: "a1" });

  forgetEnds();

  expect(topTarget()).toBeUndefined();
  expect(bottomTarget()).toBeUndefined();
});
