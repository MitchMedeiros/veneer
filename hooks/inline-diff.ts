import type { StyledRun } from "./syntax/types";

// A span of a line, from its first character up to but not including its end.
export type Span = readonly [number, number];

type Token = { text: string; start: number };

const MAX_TOKENS = 300;
const MIN_SHARED = 0.4;

const tokensOf = (text: string): Token[] =>
  Array.from(text.matchAll(/\s+|\w+|[^\s\w]/g), (match) => ({ text: match[0], start: match.index }));

const isSpace = (token: Token): boolean => token.text.trim() === "";

// The tokens of each line that the other lacks, found as the tokens outside their longest common run of tokens. Null
// where the lines share too little to read as one edited line, or are too long to compare.
function changedTokens(before: Token[], after: Token[]): [Set<number>, Set<number>] | null {
  if (before.length > MAX_TOKENS || after.length > MAX_TOKENS) {
    return null;
  }

  const table = Array.from({ length: before.length + 1 }, () => new Array<number>(after.length + 1).fill(0));

  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i]![j] =
        before[i]!.text === after[j]!.text ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }

  const removed = new Set(before.keys());
  const added = new Set(after.keys());
  let shared = 0;

  for (let i = 0, j = 0; i < before.length && j < after.length;) {
    if (before[i]!.text === after[j]!.text) {
      removed.delete(i);
      added.delete(j);
      shared += before[i]!.text.length;
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      i += 1;
    } else {
      j += 1;
    }
  }

  const longest = Math.max(before.map((token) => token.text).join("").length, after.map((t) => t.text).join("").length);

  return shared / longest >= MIN_SHARED ? [removed, added] : null;
}

// The spans of changed tokens, with the blank between two changed tokens counted in so a changed phrase is one span.
function spansOf(tokens: Token[], changed: Set<number>): Span[] {
  const spans: [number, number][] = [];

  tokens.forEach((token, i) => {
    const isChanged = changed.has(i) || (isSpace(token) && changed.has(i - 1) && changed.has(i + 1));

    if (!isChanged) {
      return;
    }

    const end = token.start + token.text.length;
    const last = spans.at(-1);

    if (last !== undefined && last[1] === token.start) {
      last[1] = end;
    } else {
      spans.push([token.start, end]);
    }
  });

  return spans;
}

// The spans of a removed line and of the added line that replaces it, or null where they are not an edit of one line.
export function inlineChanges(before: string, after: string): { before: Span[]; after: Span[] } | null {
  const [from, to] = [tokensOf(before), tokensOf(after)];
  const changed = changedTokens(from, to);

  return changed === null ? null : { before: spansOf(from, changed[0]), after: spansOf(to, changed[1]) };
}

// The spans to emphasise on each line of a diff, by line index. A run of removed lines followed by a run of added ones
// is paired line by line, so a line edited in place is marked where it changed.
export function inlineMarks(
  lines: readonly { kind: "add" | "remove" | "context"; text: string }[],
): Map<number, Span[]> {
  const marks = new Map<number, Span[]>();

  for (let i = 0; i < lines.length;) {
    if (lines[i]!.kind !== "remove") {
      i += 1;
      continue;
    }

    let removedEnd = i;

    while (lines[removedEnd]?.kind === "remove") {
      removedEnd += 1;
    }

    let addedEnd = removedEnd;

    while (lines[addedEnd]?.kind === "add") {
      addedEnd += 1;
    }

    for (let k = 0; k < Math.min(removedEnd - i, addedEnd - removedEnd); k += 1) {
      const changes = inlineChanges(lines[i + k]!.text, lines[removedEnd + k]!.text);

      if (changes !== null) {
        marks.set(i + k, changes.before);
        marks.set(removedEnd + k, changes.after);
      }
    }

    i = addedEnd;
  }

  return marks;
}

// The runs of a line cut at the edges of the spans, with the runs inside a span given `background`. Runs that do not add
// up to the line are returned as they are.
export function markRuns(
  text: string,
  runs: StyledRun[] | undefined,
  spans: readonly Span[] | undefined,
  background: string,
): StyledRun[] | undefined {
  if (spans === undefined || spans.length === 0) {
    return runs;
  }

  const base = runs === undefined || runs.length === 0 ? [{ text }] : runs;

  if (base.map((run) => run.text).join("") !== text) {
    return runs;
  }

  const marked: StyledRun[] = [];
  let offset = 0;

  for (const run of base) {
    let at = 0;

    while (at < run.text.length) {
      const position = offset + at;
      const span = spans.find(([, end]) => position < end);
      const inside = span !== undefined && position >= span[0];
      const stop = span === undefined ? run.text.length : inside ? span[1] - offset : span[0] - offset;
      const piece = run.text.slice(at, Math.min(run.text.length, stop));

      marked.push(inside ? { ...run, text: piece, background } : { ...run, text: piece });
      at += piece.length;
    }

    offset += run.text.length;
  }

  return marked;
}
