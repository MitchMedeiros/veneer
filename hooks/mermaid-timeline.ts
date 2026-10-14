import { Draft, mid, seriesTone, widest, wrapCells } from "./mermaid-scene";
import type { Ctx, Scene } from "./mermaid-scene";
import { plain, titleOf, unquote } from "./mermaid-source";

type Period = { label: string; events: string[]; section: number };
export type Timeline = { title: string; sections: string[]; periods: Period[] };

const MAX_PERIODS = 40;
const MAX_EVENT_LINES = 3;
const MIN_EVENT = 16;

// A `timeline` read well enough to draw. Null for a line this does not read.
export function parseTimeline(lines: readonly string[]): Timeline | null {
  if (!/^timeline(\s+(LR|TD))?$/i.test(lines[0] ?? "")) {
    return null;
  }

  const timeline: Timeline = { title: "", sections: [], periods: [] };
  const eventsOf = (text: string) =>
    text
      .split(":")
      .map(plain)
      .filter((event) => event !== "");

  for (const line of lines.slice(1)) {
    const title = titleOf(line);
    const section = /^section\s+(.*)$/i.exec(line);

    if (title !== null) {
      timeline.title = title;
    } else if (section !== null) {
      timeline.sections.push(unquote(section[1]!));
    } else if (line.startsWith(":")) {
      const last = timeline.periods.at(-1);

      if (last === undefined) {
        return null;
      }

      last.events.push(...eventsOf(line));
    } else if (!/^(accTitle|accDescr)\b/i.test(line)) {
      const [label = "", ...rest] = line.split(":");

      timeline.periods.push({
        label: plain(label),
        events: eventsOf(rest.join(":")),
        section: timeline.sections.length - 1,
      });
    }
  }

  return timeline.periods.length === 0 || timeline.periods.length > MAX_PERIODS ? null : timeline;
}

export function timelineScene({ title, sections, periods }: Timeline, ctx: Ctx): Scene | null {
  const labels = widest(periods.map(({ label }) => label));
  const spine = Math.max(labels, widest(sections)) + 1;
  const eventX = spine + 4;
  const room = ctx.columns - eventX;

  if (room < MIN_EVENT) {
    return null;
  }

  const d = new Draft();
  let row = d.heading(title);
  const dots: number[] = [];
  let current = -2;

  periods.forEach((period, i) => {
    const tone = seriesTone(Math.max(0, period.section));

    if (period.section !== current) {
      current = period.section;

      if (current >= 0) {
        d.text(0, row, sections[current]!, tone, { bold: true });
        row++;
      }
    }

    const events = period.events.flatMap((event) => wrapCells(event, room, MAX_EVENT_LINES));

    d.text(spine - 1, row, period.label, tone, { anchor: "end", bold: true });
    dots.push(row);
    events.forEach((event, n) => d.text(eventX, row + n, event));
    row += Math.max(1, events.length) + (i < periods.length - 1 ? 1 : 0);
  });

  const x = mid(spine);

  d.line(
    [
      { x, y: mid(dots[0]!) },
      { x, y: mid(dots.at(-1)!) },
    ],
    "subtle",
  );
  periods.forEach(({ section }, i) => {
    d.dot(x, mid(dots[i]!), seriesTone(Math.max(0, section)));
    d.line(
      [
        { x: x + 1, y: mid(dots[i]!) },
        { x: x + 2, y: mid(dots[i]!) },
      ],
      "subtle",
    );
  });

  return d.finish(
    `Timeline${title === "" ? "" : ` ${title}`}: ${periods.map(({ label, events }) => `${label} ${events.join(", ")}`).join("; ")}`,
    ctx,
  );
}
