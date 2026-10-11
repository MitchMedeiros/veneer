import type { Diff } from "./diff";
import { TAB } from "./fold";
import type { Segment } from "./markdown";
import type { OutputLine } from "./output";
import type { StyledRun } from "./syntax/types";

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

// What names a file's language: its extension, or for a file without one its name (`Dockerfile`).
export function hintOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const dot = name.lastIndexOf(".");

  return dot > 0 ? name.slice(dot + 1) : name;
}

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

// The lines of a file read, with the runs of its language on those that have them.
export async function paintLines(paint: Painter, path: string, lines: OutputLine[]): Promise<OutputLine[]> {
  const runs = await paint(hintOf(path), lines.map((line) => line.text).join("\n"));

  return runs === null ? lines : lines.map((line, i) => ({ ...line, runs: runs[i] }));
}
