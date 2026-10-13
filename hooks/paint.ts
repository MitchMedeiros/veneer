import { hintOf, looksLikeDiff, outputSource } from "./command";
import type { OutputSource } from "./command";
import type { Diff } from "./diff";
import { TAB } from "./fold";
import type { Segment } from "./markdown";
import type { OutputLine } from "./output";
import type { StyledRun } from "./syntax/types";
import type { ToolCall } from "./tool-row";
import { inputOf, lookOf } from "./tool-row";

// Styled runs for a block of code in a language, a language alias or a file extension; null where it draws plain. Built
// in `register.tsx`, which holds the engine handle.
export type Painter = (hint: string, code: string) => Promise<StyledRun[][] | null>;

// The lines a fence shows: trailing blank space dropped and tabs spread to spaces. Highlighting runs on these same lines
// so its runs line up with what is drawn.
export const codeLines = (code: string): string[] => code.replace(/\s+$/, "").replaceAll("\t", TAB).split("\n");

// The path of the file an Edit, Write or Read result is about.
export function filePathOf(output: unknown): string | undefined {
  const result = output as { filePath?: unknown; file?: { filePath?: unknown } } | null | undefined;
  const path = result?.filePath ?? result?.file?.filePath;

  return typeof path === "string" ? path : undefined;
}

export { hintOf };

// The runs of every closed fence in a reply, keyed by its segment.
export async function paintFences(paint: Painter, segments: readonly Segment[]): Promise<Map<Segment, StyledRun[][]>> {
  const painted = new Map<Segment, StyledRun[][]>();

  await Promise.all(
    segments.map(async (segment) => {
      const runs = segment.kind === "code" ? await paint(segment.lang, codeLines(segment.code).join("\n")) : null;

      if (runs !== null) {
        painted.set(segment, runs);
      }
    }),
  );

  return painted;
}

// The runs of each line of a diff, in the order of its lines. A hunk is painted as the old file and as the new file, so
// a string or comment that runs over several lines stays whole on each side, and a context line takes the new side.
export async function paintDiff(paint: Painter, path: string, diff: Diff): Promise<(StyledRun[] | undefined)[]> {
  const hint = hintOf(path);
  const runs: (StyledRun[] | undefined)[] = new Array<StyledRun[] | undefined>(diff.lines.length).fill(undefined);
  const starts = [0, ...[...diff.breaks].sort((a, b) => a - b), diff.lines.length];

  await Promise.all(
    starts.slice(0, -1).map(async (start, i) => {
      const hunk = diff.lines.slice(start, starts[i + 1]);
      const oldSide = hunk.filter((line) => line.kind !== "add");
      const newSide = hunk.filter((line) => line.kind !== "remove");
      const paintSide = (side: typeof hunk) => paint(hint, side.map((line) => line.text).join("\n"));
      const [oldRuns, newRuns] = await Promise.all([
        hunk.some((line) => line.kind === "remove") ? paintSide(oldSide) : null,
        newSide.length > 0 ? paintSide(newSide) : null,
      ]);
      let oldAt = 0;
      let newAt = 0;

      hunk.forEach((line, offset) => {
        const fromOld = line.kind !== "add" ? oldAt++ : -1;
        const fromNew = line.kind !== "remove" ? newAt++ : -1;

        runs[start + offset] = line.kind === "remove" ? oldRuns?.[fromOld] : newRuns?.[fromNew];
      });
    }),
  );

  return runs;
}

// The background an output card takes. A file read always takes it; the output of a command or search only where some
// line was highlighted, so plain output such as a file listing never changes look with the theme.
export const outputFill = (background: string | undefined, isFile: boolean, lines: readonly OutputLine[]) =>
  isFile || lines.some((line) => line.runs !== undefined) ? background : undefined;

// The lines with the runs of a language on those that have them.
async function paintAs(paint: Painter, hint: string, lines: OutputLine[]): Promise<OutputLine[]> {
  const runs = await paint(hint, lines.map((line) => line.text).join("\n"));

  return runs === null ? lines : lines.map((line, i) => ({ ...line, runs: runs[i] }));
}

// The lines of a file read, with the runs of its language on those that have them.
export const paintLines = (paint: Painter, path: string, lines: OutputLine[]): Promise<OutputLine[]> =>
  paintAs(paint, hintOf(path), lines);

// The runs of the line a Command row shows, highlighted as shell; undefined for any other tool or where it draws plain.
export async function paintCommand(
  paint: Painter,
  call: Pick<ToolCall, "tool" | "input">,
): Promise<StyledRun[] | undefined> {
  const line = call.tool === "Bash" ? lookOf(call.tool).detail(inputOf(call.input)) : undefined;

  return line === undefined || line === "" ? undefined : (await paint("shellscript", line))?.[0];
}

// The `cat -n` column of a line: right aligned digits and a tab, which the card has spread to spaces.
const NUMBER_COLUMN = new RegExp(`^( *\\d+ {${TAB.length}})(.*)$`);

// Lines of a file printed by `cat -n`, with the numbers left plain and the code painted. Plain if any line has no number.
async function paintNumbered(paint: Painter, hint: string, lines: OutputLine[]): Promise<OutputLine[]> {
  const parts = lines.map((line) => NUMBER_COLUMN.exec(line.text));

  if (parts.some((part) => part === null)) {
    return lines;
  }

  const runs = await paint(hint, parts.map((part) => part![2]!).join("\n"));

  return runs === null
    ? lines
    : lines.map((line, i) => ({ ...line, runs: [{ text: parts[i]![1]! }, ...(runs[i] ?? [])] }));
}

// Lines of stdout painted as what the command prints.
function paintStdout(paint: Painter, source: OutputSource, lines: OutputLine[]): Promise<OutputLine[]> {
  if (source.kind === "grep") {
    return paintGrep(paint, lines, source.file);
  }

  if (source.kind === "diff") {
    return looksLikeDiff(lines.map((line) => line.text)) ? paintAs(paint, "diff", lines) : Promise.resolve(lines);
  }

  return source.numbered ? paintNumbered(paint, hintOf(source.path), lines) : paintLines(paint, source.path, lines);
}

// A command's stdout as what the command says it prints. Lines on stderr, and a command that does not say, stay plain.
async function paintCommandOutput(paint: Painter, command: string, lines: OutputLine[]): Promise<OutputLine[]> {
  const source = outputSource(command);
  const stdout = lines.filter((line) => line.tone === undefined);

  if (source === null || stdout.length === 0) {
    return lines;
  }

  const painted = await paintStdout(paint, source, stdout);
  let at = 0;

  return lines.map((line) => (line.tone === undefined ? painted[at++]! : line));
}

type GrepLine = { path: string; number: number; prefix: string; code: string };

const FILE_EXTENSION = /\.[A-Za-z0-9_+-]+$/;

// A line of ripgrep output with line numbers, `path:12:code` for a match and `path-12-code` for a context line. A path
// may hold `-` or `:` itself, so a context line only counts when its path is one a match line already named.
function grepLine(text: string, matchedPaths: ReadonlySet<string> | null): GrepLine | undefined {
  const separator = matchedPaths === null ? ":" : "-";

  for (const found of text.matchAll(new RegExp(`\\${separator}(\\d+)\\${separator}`, "g"))) {
    const path = text.slice(0, found.index);
    const known = matchedPaths === null ? FILE_EXTENSION.test(path) : matchedPaths.has(path);

    if (known) {
      const prefix = text.slice(0, found.index + found[0].length);

      return { path, number: Number(found[1]), prefix, code: text.slice(prefix.length) };
    }
  }

  return undefined;
}

// The lines of a Grep result in content mode, each read as path, line number and code. Undefined unless every line is
// one of those, a `--` between groups, or a trailing note, so output without line numbers is never guessed at.
function grepLines(lines: OutputLine[]): (GrepLine | "separator")[] | undefined {
  const matches = lines.map((line) => grepLine(line.text, null));
  const matchedPaths = new Set(matches.flatMap((match) => (match === undefined ? [] : [match.path])));

  return settled(
    lines.map((line, i) => matches[i] ?? (line.text === "--" ? "separator" : grepLine(line.text, matchedPaths))),
  );
}

const SINGLE_FILE_LINE = /^(\d+)[:-]/;

// The same for a search of one file, which prints `12:code` and `12-code` with no file name.
function singleFileLines(lines: OutputLine[], path: string): (GrepLine | "separator")[] | undefined {
  return settled(
    lines.map((line) => {
      const found = SINGLE_FILE_LINE.exec(line.text);

      return line.text === "--"
        ? "separator"
        : found === null
          ? undefined
          : { path, number: Number(found[1]), prefix: found[0], code: line.text.slice(found[0].length) };
    }),
  );
}

// The parsed lines up to the last one that parsed, or undefined if any of those did not.
function settled(parsed: (GrepLine | "separator" | undefined)[]): (GrepLine | "separator")[] | undefined {
  const last = parsed.findLastIndex((line) => line !== undefined);
  const kept = parsed.slice(0, last + 1);

  return last < 0 || kept.includes(undefined) ? undefined : (kept as (GrepLine | "separator")[]);
}

// Grep content lines with the code after each `path:line:` painted by that file's extension. Lines that follow one
// another in a file are painted together, so a string or comment that runs over lines stays whole. A search of one
// file, named in `file`, prints no path, so its lines are read that way first.
async function paintGrep(paint: Painter, lines: OutputLine[], file?: string): Promise<OutputLine[]> {
  const parsed = (file === undefined ? undefined : singleFileLines(lines, file)) ?? grepLines(lines);

  if (parsed === undefined) {
    return lines;
  }

  const painted = [...lines];
  const blocks: { start: number; lines: GrepLine[] }[] = [];

  parsed.forEach((line, i) => {
    if (line === "separator") return;

    const block = blocks.at(-1);
    const before = parsed[i - 1];

    if (
      block !== undefined &&
      before !== undefined &&
      before !== "separator" &&
      before.path === line.path &&
      before.number + 1 === line.number
    ) {
      block.lines.push(line);
    } else {
      blocks.push({ start: i, lines: [line] });
    }
  });

  await Promise.all(
    blocks.map(async ({ start, lines: block }) => {
      const runs = await paint(hintOf(block[0]!.path), block.map((line) => line.code).join("\n"));

      block.forEach((line, offset) => {
        const codeRuns = runs?.[offset];

        if (codeRuns !== undefined) {
          painted[start + offset] = { ...lines[start + offset]!, runs: [{ text: line.prefix }, ...codeRuns] };
        }
      });
    }),
  );

  return painted;
}

// The lines of a Bash or Grep card with runs where the language is certain: the file or diff a plain command prints,
// and the code of each Grep match. The command is undefined when it is not known, which leaves a Bash card plain.
export function paintOutput(
  paint: Painter,
  tool: string,
  command: string | undefined,
  lines: OutputLine[],
): Promise<OutputLine[]> {
  if (tool === "Grep") return paintGrep(paint, lines);

  return tool === "Bash" && command !== undefined ? paintCommandOutput(paint, command, lines) : Promise.resolve(lines);
}
