import { inlineMath } from "./math-unicode";

export type Align = "left" | "right" | "center";

export type Table = { kind: "table"; header: string[]; align: Align[]; rows: string[][]; raw: string };

export type Heading = { kind: "heading"; level: number; text: string; raw: string };

export type Code = { kind: "code"; lang: string; code: string; raw: string };

export type Math = { kind: "math"; tex: string; raw: string };

export type AlertType = "note" | "tip" | "important" | "warning" | "caution";

export type Alert = { kind: "alert"; type: AlertType; text: string; raw: string };

export type Task = { text: string; isDone: boolean; depth: number };

export type Tasks = { kind: "tasks"; items: Task[]; raw: string };

// A list item: its markdown, how deep it is nested, its number (null in a bullet list), and whether a blank line came
// before it.
export type ListItem = { text: string; depth: number; number: number | null; isSpaced: boolean };

export type List = { kind: "list"; items: ListItem[]; raw: string };

export type Segment = { kind: "text"; text: string } | Table | Heading | Code | Math | Alert | Tasks | List;

const ITEM = /^( *)([-*+]|\d{1,9}[.)])\s+(\S.*)$/;
const RULE = /^ *([-*_])( *\1){2,} *$/;

const TASK = /^( *)[-*+]\s+\[([ xX])\]\s+(\S.*)$/;

// The list item a line is, or null where it is not a task.
const taskOf = (line: string): Task | null => {
  const match = TASK.exec(line);

  return match === null
    ? null
    : { text: plain(match[3]!), isDone: match[2] !== " ", depth: Math.floor(match[1]!.length / 2) };
};

const ALERT = /^ {0,3}>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i;
const QUOTE = /^ {0,3}>/;

const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const FENCE = /^(\s*)(`{3,}|~{3,})\s*([^\s`]*)/;

const closesFence = (line: string, marker: string): boolean => {
  const text = line.trim();

  return text.length >= marker.length && text === marker[0]!.repeat(text.length);
};
const HEADING = /^ {0,3}(#{1,4})\s+(.+?)(?:\s+#+)?\s*$/;
const MATH_OPEN = /^\s*(?:\$\$|\\\[|\\begin\{(?:equation|align|gather|multline|eqnarray)\*?\})/;
const MATH_ENVIRONMENT = /^\s*\\begin\{([a-z]+\*?)\}/;

// The display equation that starts on line `start`: its TeX, and the line it ends on. Null where it has not closed, as
// while the reply streams, or where text follows it on its last line.
function displayMath(lines: readonly string[], start: number): { tex: string; end: number } | null {
  const rest = lines.slice(start).join("\n").trimStart();
  const environment = MATH_ENVIRONMENT.exec(rest)?.[1];
  const [open, close] =
    environment !== undefined ? ["", `\\end{${environment}}`] : rest.startsWith("$$") ? ["$$", "$$"] : ["\\[", "\\]"];
  const stop = rest.indexOf(close, open.length);

  if (stop === -1) {
    return null;
  }

  const consumed = rest.slice(0, stop + close.length);
  const tail = rest.slice(consumed.length).split("\n")[0] ?? "";
  const tex = environment === undefined ? rest.slice(open.length, stop).trim() : consumed;

  return tex === "" || tail.trim() !== "" ? null : { tex, end: start + consumed.split("\n").length - 1 };
}

// Inline marks read as noise in a picture, where they cannot be styled.
const plain = (text: string): string =>
  inlineMath(text)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|`/g, "")
    .replace(/\\\|/g, "|")
    .trim();

const cellsOf = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(/(?<!\\)\|/)
    .map(plain);

const alignOf = (cell: string): Align => {
  const spec = cell.trim();

  if (spec.startsWith(":") && spec.endsWith(":")) {
    return "center";
  }

  return spec.endsWith(":") ? "right" : "left";
};

// The list that starts on line `start`, as its items and the line after its last, or null where that line is not an
// item. A list runs while lines are items; a line indented under an item that is not an item, fence, equation or table
// row goes on that item's text. A blank line followed by another item goes on the list, and the item is marked as
// spaced; a blank line followed by anything else, a task or any other line ends it, so a task list stays its own
// segment. Numbers count on from the first at each depth, as Markdown numbers a list, whatever each line says, and from
// the numbers of `carry` where the list goes on from an earlier one.
function listFrom(
  lines: readonly string[],
  start: number,
  carry: readonly (number | undefined)[] = [],
): { items: ListItem[]; end: number; counts: (number | undefined)[] } | null {
  const items: ListItem[] = [];
  const indents: number[] = [];
  const counts = [...carry];
  let isSpaced = false;
  let end = start;

  const isItem = (line: string | undefined) =>
    line !== undefined && ITEM.test(line) && !RULE.test(line) && taskOf(line) === null;

  for (; end < lines.length; end++) {
    const line = lines[end] ?? "";
    const item = ITEM.exec(line);

    if (line.trim() === "") {
      let next = end + 1;

      while (next < lines.length && (lines[next] ?? "").trim() === "") {
        next++;
      }

      if (items.length === 0 || !isItem(lines[next])) {
        break;
      }

      isSpaced = true;
      end = next - 1;
      continue;
    }

    if (item === null || RULE.test(line) || taskOf(line) !== null) {
      const isContinuation =
        items.length > 0 && /^ {2,}\S/.test(line) && !FENCE.test(line) && !MATH_OPEN.test(line) && !line.includes("|");

      if (!isContinuation) {
        break;
      }

      const last = items[items.length - 1]!;

      last.text = `${last.text} ${line.trim()}`;
      continue;
    }

    const indent = item[1]!.length;

    while (indents.length > 0 && indent < indents[indents.length - 1]!) {
      indents.pop();
    }

    if (indents.length === 0 || indent > indents[indents.length - 1]!) {
      indents.push(indent);
    }

    const depth = indents.length - 1;
    const ordered = /^\d/.test(item[2]!);

    counts.length = depth + 1;
    counts[depth] = ordered ? (counts[depth] === undefined ? parseInt(item[2]!, 10) : counts[depth]! + 1) : undefined;
    items.push({ text: inlineMath(item[3]!), depth, number: ordered ? counts[depth]! : null, isSpaced });
    isSpaced = false;
  }

  return items.length === 0 ? null : { items, end, counts };
}

const MEMORY_REPLIES = 64;
const splits = new Map<string, Segment[]>();

// The reply as runs of text with each table, heading, alert, task list and closed code fence taken out as its own segment. A fence still
// open, as while the reply streams, stays text with everything after it. A reply is split once however often it is
// drawn.
export function splitReply(markdown: string): Segment[] {
  const known = splits.get(markdown);

  if (known !== undefined) {
    return known;
  }

  const segments = split(markdown);

  splits.set(markdown, segments);

  if (splits.size > MEMORY_REPLIES) {
    splits.delete(splits.keys().next().value as string);
  }

  return segments;
}

function split(markdown: string): Segment[] {
  const lines = markdown.split("\n");
  const segments: Segment[] = [];
  let text: string[] = [];
  let counts: (number | undefined)[] = [];

  const flush = () => {
    if (text.join("\n").trim() !== "") {
      segments.push({ kind: "text", text: inlineMath(text.join("\n")) });
    }

    text = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    const fence = FENCE.exec(line);

    if (fence !== null) {
      const marker = fence[2]!;
      const close = lines.findIndex((other, at) => at > i && closesFence(other, marker));

      if (close === -1) {
        text.push(...lines.slice(i));
        break;
      }

      const indent = fence[1]!.length;
      const body = lines
        .slice(i + 1, close)
        .map((row) => row.slice(Math.min(indent, row.length - row.trimStart().length)));

      flush();
      segments.push({
        kind: "code",
        lang: fence[3]!.toLowerCase(),
        code: body.join("\n"),
        raw: lines.slice(i, close + 1).join("\n"),
      });
      i = close;
      continue;
    }

    const math = MATH_OPEN.test(line) ? displayMath(lines, i) : null;

    if (math !== null) {
      flush();
      segments.push({ kind: "math", tex: math.tex, raw: lines.slice(i, math.end + 1).join("\n") });
      i = math.end;
      continue;
    }

    const alert = ALERT.exec(line);

    if (alert !== null) {
      let end = i + 1;

      while (end < lines.length && QUOTE.test(lines[end] ?? "")) {
        end++;
      }

      flush();
      segments.push({
        kind: "alert",
        type: alert[1]!.toLowerCase() as AlertType,
        text: lines
          .slice(i + 1, end)
          .map((row) => row.replace(/^ {0,3}>\s?/, ""))
          .join("\n")
          .trim(),
        raw: lines.slice(i, end).join("\n"),
      });
      i = end - 1;
      continue;
    }

    // A list that a code fence cut in two goes on counting where the first part stopped.
    const goesOn = text.join("").trim() === "" && segments.at(-1)?.kind === "code" && segments.at(-2)?.kind === "list";
    const list = taskOf(line) === null && !RULE.test(line) ? listFrom(lines, i, goesOn ? counts : []) : null;

    if (list !== null) {
      flush();
      segments.push({ kind: "list", items: list.items, raw: lines.slice(i, list.end).join("\n") });
      counts = list.counts;
      i = list.end - 1;
      continue;
    }

    if (taskOf(line) !== null) {
      let end = i + 1;

      while (end < lines.length && taskOf(lines[end] ?? "") !== null) {
        end++;
      }

      flush();
      segments.push({
        kind: "tasks",
        items: lines.slice(i, end).map((row) => taskOf(row)!),
        raw: lines.slice(i, end).join("\n"),
      });
      i = end - 1;
      continue;
    }

    const heading = HEADING.exec(line);

    // The last line of the text may still be streaming; a line is final once another follows it.
    if (heading !== null && i < lines.length - 1) {
      flush();
      segments.push({ kind: "heading", level: heading[1]!.length, text: plain(heading[2]!), raw: line });
      continue;
    }

    const separator = lines[i + 1] ?? "";
    const header = line.includes("|") && SEPARATOR.test(separator) ? cellsOf(line) : [];
    const isTable = header.length > 1 && cellsOf(separator).length === header.length;

    let end = i + 2;

    while (isTable && end < lines.length && (lines[end] ?? "").includes("|") && (lines[end] ?? "").trim() !== "") {
      end++;
    }

    // A table is final once a line that is not a row follows it; until then it may still be growing.
    if (!isTable || end >= lines.length) {
      text.push(line);
      continue;
    }

    const fit = (cells: string[]) => Array.from({ length: header.length }, (_, col) => cells[col] ?? "");

    flush();
    segments.push({
      kind: "table",
      header,
      align: fit(
        separator
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|"),
      ).map(alignOf),
      rows: lines.slice(i + 2, end).map((row) => fit(cellsOf(row))),
      raw: lines.slice(i, end).join("\n"),
    });
    i = end - 1;
  }

  flush();

  return segments;
}

const NATIVE_KINDS: ReadonlySet<Segment["kind"]> = new Set(["text", "alert", "tasks", "list"]);

// Whether a reply has a block that may be drawn as a picture. Text, an alert, a task list and a list are native.
export const hasDrawn = (segments: readonly Segment[]): boolean =>
  segments.some((segment) => !NATIVE_KINDS.has(segment.kind));
