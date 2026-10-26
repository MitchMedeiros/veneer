// The first and the newest row of the transcript, by the id `ui.scroll` takes. Rows draw near the viewport first, so the
// order of drawing says nothing about the order of rows. The ends come from the session's file and from every row
// appended after it, and hold ids only.

// How much of either end of the file is read to find a row. A line is never cut short, so a read that ends inside a line
// leaves that line out.
export const CHUNK_BYTES = 3_000_000;

// How many of the newest rows are kept to find where the last run of tool calls starts.
const RECENT = 200;

// The tools whose consecutive calls the transcript folds into one group row.
const FOLDED = new Set(["Read", "Grep", "Glob", "Bash"]);

// A row by its own id, and the tool it calls when it is a tool call.
type Entry = { id: string; tool?: string };

type Ends = { top?: string; recent: Entry[] };

// Where to scroll for an end, and the row before it to scroll to first when it is not drawn.
export type Target = { id: string; before?: string };

let top: string | undefined;
let recent: Entry[] = [];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

// The rows a transcript line draws, in order. A person's prompt draws under the line's `uuid`, an assistant text block
// under its line's `uuid` and a tool call under its `tool_use` id. Tool results, notes the person did not type, thinking,
// attachments and the lines of subagents draw no row of their own.
export function entriesOf(row: unknown): Entry[] {
  if (!isRecord(row) || row.isSidechain === true || typeof row.uuid !== "string" || !isRecord(row.message)) {
    return [];
  }

  const { content } = row.message;
  const { uuid } = row;

  if (row.type === "user") {
    const isTyped = row.isMeta !== true && (typeof content === "string" || !blocksOf(content).some(isToolResult));

    return isTyped && content !== "" ? [{ id: uuid }] : [];
  }

  if (row.type !== "assistant") {
    return [];
  }

  return blocksOf(content).flatMap((block): Entry[] => {
    if (block.type === "tool_use" && typeof block.id === "string") {
      return [{ id: block.id, tool: typeof block.name === "string" ? block.name : undefined }];
    }

    return block.type === "text" && typeof block.text === "string" && block.text.trim() !== "" ? [{ id: uuid }] : [];
  });
}

const blocksOf = (content: unknown): Record<string, unknown>[] =>
  Array.isArray(content) ? content.filter(isRecord) : [];

const isToolResult = (block: Record<string, unknown>): boolean => block.type === "tool_result";

function entriesOfLine(line: string): Entry[] {
  try {
    return entriesOf(JSON.parse(line));
  } catch {
    return [];
  }
}

// The first row in the start of a transcript file and the newest rows in its end. A line cut by either read fails to
// parse and is skipped.
export function endsOf(start: string, end: string): Ends {
  return {
    top: start.split("\n").flatMap(entriesOfLine)[0]?.id,
    recent: end.split("\n").flatMap(entriesOfLine).slice(-RECENT),
  };
}

const isFolded = (entry: Entry | undefined): boolean => entry?.tool !== undefined && FOLDED.has(entry.tool);

// The id of a run of two or more folded calls: the engine takes the first call's id cut to 24 characters and padded
// with zeros to 36. A single call keeps its own id, and the id changes when a second call joins it.
const groupIdOf = (firstCallId: string): string => `collapsed-${firstCallId.slice(0, 24).padEnd(36, "0")}`;

export const topTarget = (): Target | undefined => (top === undefined ? undefined : { id: top });

// The row the newest row draws in: its own, or its group's where it ends a run of folded calls.
export function bottomTarget(): Target | undefined {
  const last = recent.at(-1);

  if (last === undefined) {
    return undefined;
  }

  let start = recent.length - 1;

  while (isFolded(recent[start]) && isFolded(recent[start - 1])) {
    start -= 1;
  }

  const first = recent[start] ?? last;

  return { id: start < recent.length - 1 ? groupIdOf(first.id) : last.id, before: recent[start - 1]?.id };
}

// Takes the ends a read of the file found. The first row never changes once known.
export function noteEnds(ends: Ends): void {
  top ??= ends.top;
  recent = ends.recent.length > 0 ? ends.recent : recent;
}

// Notes the rows of a line just appended to the conversation.
export function noteAppended(row: unknown): void {
  const entries = entriesOf(row);

  top ??= entries[0]?.id;
  recent = [...recent, ...entries].slice(-RECENT);
}

// A new session or a cleared one starts its own transcript.
export function forgetEnds(): void {
  top = undefined;
  recent = [];
}
