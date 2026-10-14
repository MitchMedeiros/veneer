import { addDuration, DAY, formatDate, parseDate, timeTicks } from "./mermaid-date";
import { Draft, mid, seriesTone, widest } from "./mermaid-scene";
import type { Ctx, Scene } from "./mermaid-scene";
import { listOf, titleOf, unquote } from "./mermaid-source";
import type { Tone } from "./palette";
import { clipCells } from "./svg-text";

type Tag = "done" | "active" | "crit" | "milestone";

type Task = {
  name: string;
  section: number;
  tags: Tag[];
  start: number;
  end: number;
  length: string;
};

export type Gantt = {
  title: string;
  axisFormat: string | undefined;
  sections: string[];
  tasks: Task[];
};

const MAX_TASKS = 60;
const MAX_NAME = 26;
const MIN_TIMELINE = 20;
const MAX_TIMELINE = 64;
const TAGS: readonly string[] = ["done", "active", "crit", "milestone"];
const IGNORED = /^(excludes|includes|todayMarker|weekday|weekend|tickInterval|topAxis|click|accTitle|accDescr)\b/i;
const AFTER = /^after\s+(.+)$/i;
const UNTIL = /^until\s+(.+)$/i;

// A `gantt` read well enough to draw. Null for a date that does not fit the date format, a task that starts after one
// that is not there yet, or a line this does not read.
export function parseGantt(lines: readonly string[]): Gantt | null {
  if (lines[0] !== "gantt") {
    return null;
  }

  const gantt: Gantt = { title: "", axisFormat: undefined, sections: [], tasks: [] };
  const byId = new Map<string, Task>();
  let format = "YYYY-MM-DD";
  let isInclusive = false;
  let section = -1;

  for (const line of lines.slice(1)) {
    const title = titleOf(line);
    const keyword = /^(dateFormat|axisFormat|section|inclusiveEndDates)\b\s*(.*)$/i.exec(line);

    if (title !== null) {
      gantt.title = title;
    } else if (keyword !== null) {
      const word = keyword[1]!.toLowerCase();

      if (word === "dateformat") {
        format = keyword[2]!.trim();
      } else if (word === "axisformat") {
        gantt.axisFormat = keyword[2]!.trim();
      } else if (word === "inclusiveenddates") {
        isInclusive = true;
      } else {
        gantt.sections.push(unquote(keyword[2]!));
        section = gantt.sections.length - 1;
      }
    } else if (IGNORED.test(line)) {
      continue;
    } else {
      const colon = line.indexOf(":");

      if (colon === -1) {
        return null;
      }

      const items = listOf(line.slice(colon + 1));
      const tags = items.filter(
        (item, i) => TAGS.includes(item) && items.slice(0, i).every((before) => TAGS.includes(before)),
      );
      const rest = items.slice(tags.length);
      const previous = gantt.tasks.at(-1);
      const [id, from, to] = rest.length === 3 ? rest : ["", ...(rest.length === 2 ? rest : [undefined, rest[0]])];
      const start = startOf(from, previous?.end, format, byId);
      const end = start === null ? null : endOf(to, start, format, isInclusive, byId);

      if (rest.length === 0 || rest.length > 3 || start === null || end === null) {
        return null;
      }

      const task: Task = {
        name: unquote(line.slice(0, colon)),
        section,
        tags: tags as Tag[],
        start,
        end,
        length: lengthOf(to, start, end),
      };

      gantt.tasks.push(task);

      if (id !== undefined && id !== "") {
        byId.set(id, task);
      }
    }
  }

  return gantt.tasks.length === 0 || gantt.tasks.length > MAX_TASKS ? null : gantt;
}

function startOf(text: string | undefined, previous: number | undefined, format: string, byId: Map<string, Task>) {
  if (text === undefined) {
    return previous ?? null;
  }

  const after = AFTER.exec(text);

  if (after === null) {
    return parseDate(text, format);
  }

  const ends = after[1]!.split(/\s+/).map((id) => byId.get(id)?.end);

  return ends.some((end) => end === undefined) ? null : Math.max(...(ends as number[]));
}

function endOf(text: string | undefined, start: number, format: string, isInclusive: boolean, byId: Map<string, Task>) {
  if (text === undefined) {
    return null;
  }

  const until = UNTIL.exec(text);

  if (until !== null) {
    return byId.get(until[1]!.trim())?.start ?? null;
  }

  const date = parseDate(text, format);

  if (date !== null) {
    return isInclusive ? date + DAY : date;
  }

  return AFTER.test(text) ? start + DAY : addDuration(start, text);
}

// How long a task is as it was written, or in days or hours where it was given as a date.
function lengthOf(text: string | undefined, start: number, end: number): string {
  if (text !== undefined && /^\d+(\.\d+)?(ms|s|m|h|d|w|M|y)$/.test(text)) {
    return text;
  }

  const days = (end - start) / DAY;

  return days >= 1 ? `${Math.round(days)}d` : `${Math.round(days * 24)}h`;
}

const STATUS: Partial<Record<Tag, Tone>> = { crit: "error", done: "inactive", active: "accent" };

const toneOf = ({ tags, section }: Task): Tone =>
  tags.map((tag) => STATUS[tag]).find((tone) => tone !== undefined) ?? seriesTone(Math.max(0, section));

export function ganttScene(gantt: Gantt, ctx: Ctx): Scene | null {
  const { tasks, sections } = gantt;
  const from = Math.min(...tasks.map(({ start }) => start));
  const last = Math.max(...tasks.map(({ end }) => end));
  const to = last > from ? last : from + DAY;
  const hasSections = sections.length > 0;
  const names = tasks.map(({ name }) => clipCells(name, MAX_NAME));
  const left =
    Math.max(widest(names), widest(sections.map((name) => clipCells(name, MAX_NAME + 2)))) + (hasSections ? 2 : 0);
  const lengths = widest(tasks.map(({ length }) => length));
  const x0 = left + 2;
  const width = Math.min(MAX_TIMELINE, ctx.columns - x0 - lengths - 3);

  if (width < MIN_TIMELINE) {
    return null;
  }

  const d = new Draft();
  const top = d.heading(gantt.title);
  const at = (t: number) => x0 + ((t - from) / (to - from)) * width;
  const probe = (format: string) => widest([formatDate(from, format), formatDate(to, format)]);
  const { ticks, isShort } = timeTicks(from, to, Math.floor(width / (probe(gantt.axisFormat ?? "%b %e") + 3)));
  const format = gantt.axisFormat ?? (isShort ? "%H:%M" : to - from > 400 * DAY ? "%b %Y" : "%b %-e");
  const axis = top + 1;
  let row = axis + 2;

  d.line(
    [
      { x: x0, y: mid(axis) },
      { x: x0 + width, y: mid(axis) },
    ],
    "inactive",
  );

  // A picture puts a tick at its date, and text in the cell that holds it.
  const placed = (tick: number) => [
    { x: at(tick), only: "picture" as const },
    { x: mid(Math.min(x0 + width - 1, Math.floor(at(tick)))), only: "text" as const },
  ];

  for (const tick of ticks) {
    for (const { x, only } of placed(tick)) {
      d.text(x, top, formatDate(tick, format), "inactive", { anchor: "middle", only });
      d.line(
        [
          { x, y: mid(axis) },
          { x, y: mid(axis) + 1 },
        ],
        "inactive",
        { only },
      );
    }
  }

  const body = row;
  const rows: { y: number; task?: Task; name: string }[] = [];
  let current = -2;

  tasks.forEach((task, i) => {
    if (hasSections && task.section !== current) {
      current = task.section;

      if (current >= 0) {
        d.text(0, row, clipCells(sections[current]!, MAX_NAME + 2), seriesTone(current), { bold: true });
        row++;
      }
    }

    rows.push({ y: row, task, name: names[i]! });
    row++;
  });

  for (const tick of ticks) {
    for (const { x, only } of placed(tick)) {
      d.line(
        [
          { x, y: body - 0.5 },
          { x, y: row },
        ],
        "subtle",
        { dash: true, only },
      );
    }
  }

  for (const { y, task, name } of rows) {
    const tone = toneOf(task!);
    const isMilestone = task!.tags.includes("milestone");

    d.text(hasSections ? 2 : 0, y, name);

    if (isMilestone) {
      d.dot(at(task!.start), y + 0.5, tone, "diamond");
    } else {
      d.rect(at(task!.start), y + 0.125, Math.max(0.5, at(task!.end) - at(task!.start)), 0.75, { fill: tone });
    }

    d.text(x0 + width + 2, y, task!.length, "inactive");
  }

  const shown = (Object.keys(STATUS) as Tag[]).filter((tag) => tasks.some((task) => task.tags.includes(tag)));

  if (shown.length > 0) {
    d.swatches(
      shown.map((tag) => ({ label: tag, tone: STATUS[tag]! })),
      0,
      row + 1,
      ctx.columns,
    );
  }

  return d.finish(
    `Gantt chart${gantt.title === "" ? "" : ` ${gantt.title}`}: ${tasks
      .map((task) => `${task.name} ${formatDate(task.start, "%Y-%m-%d")} to ${formatDate(task.end, "%Y-%m-%d")}`)
      .join(", ")}`,
    ctx,
  );
}
