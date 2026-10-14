import type { Palette } from "../types";
import {
  boxPaint,
  centredText,
  DASHED,
  DETAIL,
  EDGE_WIDTH,
  finish,
  LABEL,
  lineSvg,
  markerAttribute,
  markerDef,
  markerLength,
  MARGIN,
  pathSvg,
  rectSvg,
  TEXT,
  textSvg,
} from "./mermaid-layout";
import { plain, sourceLines } from "./mermaid-source";
import type { Font, Sketch } from "./picture";
import { CELL_WIDTH, fill } from "./picture";
import { measure, wrap } from "./svg-text";

const BOX_H = 76;
const MIN_BOX = 120;
const BOX_PAD = 2 * CELL_WIDTH;
const MIN_GAP = 140;
const ROW = 70;
const SELF_ROW = 88;
const LOOP_WIDTH = 46;
const BAR_WIDTH = 14;
const MAX_EVENTS = 80;
const MAX_NOTE_WIDTH = 16 * CELL_WIDTH;

type Participant = { id: string; label: string; isActor: boolean };
type Head = "filled" | "open" | "cross" | "none";

type Message = {
  type: "message";
  from: string;
  to: string;
  text: string;
  isDotted: boolean;
  head: Head;
  activates: boolean;
  deactivates: boolean;
};

type Note = { type: "note"; side: "over" | "left" | "right"; ids: string[]; text: string };
type Begin = { type: "begin"; name: string; text: string };
type Divider = { type: "divider"; name: string; text: string };
type Event = Message | Note | Begin | Divider | { type: "end" } | { type: "activate" | "deactivate"; id: string };
type Sequence = { participants: Participant[]; events: Event[]; isNumbered: boolean };

const PARTICIPANT = /^(participant|actor)\s+(\S+?)(?:\s+as\s+(.+))?$/i;
const MESSAGE = /^(\S+?)\s*(-->>|->>|-->|->|--x|-x|--\)|-\))\s*([+-]?)([^\s:+-]+)\s*:\s*(.*)$/;
const NOTE = /^note\s+(over|left of|right of)\s+([^:]+?)\s*:\s*(.*)$/i;
const BLOCK = /^(loop|alt|opt|par|critical|break|rect)\b\s*(.*)$/i;
const BRANCH = /^(else|and|option)\b\s*(.*)$/i;
const ACTIVATION = /^(activate|deactivate)\s+(\S+)$/i;

// A `sequenceDiagram` read well enough to draw. Null for boxes, created and destroyed participants and anything else
// this does not read, so the diagram is left to the text renderer.
export function parseSequence(source: string): Sequence | null {
  const lines = sourceLines(source);

  if (lines[0] !== "sequenceDiagram") {
    return null;
  }

  const participants = new Map<string, Participant>();
  const events: Event[] = [];
  let isNumbered = false;
  let depth = 0;

  const meet = (id: string) => {
    if (!participants.has(id)) {
      participants.set(id, { id, label: id, isActor: false });
    }
  };

  for (const line of lines.slice(1)) {
    const declared = PARTICIPANT.exec(line);
    const message = MESSAGE.exec(line);
    const note = NOTE.exec(line);
    const block = BLOCK.exec(line);
    const branch = BRANCH.exec(line);
    const activation = ACTIVATION.exec(line);

    if (declared !== null) {
      participants.set(declared[2]!, {
        id: declared[2]!,
        label: plain(declared[3] ?? declared[2]!),
        isActor: declared[1]!.toLowerCase() === "actor",
      });
    } else if (message !== null) {
      const [, from = "", arrow = "", flag = "", to = "", text = ""] = message;

      meet(from);
      meet(to);
      events.push({
        type: "message",
        from,
        to,
        text: plain(text),
        isDotted: arrow.startsWith("--"),
        head: arrow.endsWith(">>") ? "filled" : arrow.endsWith(")") ? "open" : arrow.endsWith("x") ? "cross" : "none",
        activates: flag === "+",
        deactivates: flag === "-",
      });
    } else if (note !== null) {
      const ids = note[2]!.split(",").map((id) => id.trim());

      ids.forEach(meet);
      events.push({
        type: "note",
        side: note[1]!.split(" ")[0]!.toLowerCase() as Note["side"],
        ids,
        text: plain(note[3]!),
      });
    } else if (block !== null) {
      depth++;
      events.push({ type: "begin", name: block[1]!.toLowerCase(), text: plain(block[2]!) });
    } else if (branch !== null && depth > 0) {
      events.push({ type: "divider", name: branch[1]!.toLowerCase(), text: plain(branch[2]!) });
    } else if (line === "end" && depth > 0) {
      depth--;
      events.push({ type: "end" });
    } else if (activation !== null) {
      meet(activation[2]!);
      events.push({ type: activation[1]!.toLowerCase() as "activate" | "deactivate", id: activation[2]! });
    } else if (/^autonumber\b/i.test(line)) {
      isNumbered = true;
    } else if (!/^title\b/i.test(line)) {
      return null;
    }
  }

  if (depth !== 0 || participants.size === 0 || events.length > MAX_EVENTS) {
    return null;
  }

  return { participants: [...participants.values()], events, isNumbered };
}

type Frame = {
  name: string;
  text: string;
  top: number;
  min: number;
  max: number;
  dividers: { y: number; text: string }[];
};
type Closed = Frame & { bottom: number };

// A sequence diagram as a picture, or null where it does not fit `available` columns.
export function sequenceSketch(diagram: Sequence, available: number, palette: Palette, font: Font): Sketch | null {
  const { participants, events } = diagram;
  const index = new Map(participants.map(({ id }, i) => [id, i]));
  const widths = participants.map(({ label }) => Math.max(MIN_BOX, measure(label, TEXT) + 2 * BOX_PAD));
  const gaps = widths.slice(1).map((w, i) => Math.max(MIN_GAP, (widths[i]! + w) / 2 + 24));
  const messages = events.filter((event): event is Message => event.type === "message");
  const numbered = (n: number, text: string) => (diagram.isNumbered ? `${n + 1}. ${text}` : text);

  // Gaps widen until the label of each message fits between its two lifelines.
  const needs = messages
    .map((message, n) => ({
      a: Math.min(index.get(message.from)!, index.get(message.to)!),
      b: Math.max(index.get(message.from)!, index.get(message.to)!),
      width: measure(numbered(n, message.text), LABEL) + 2 * CELL_WIDTH,
      isSelf: message.from === message.to,
    }))
    .map(({ a, b, width, isSelf }) =>
      isSelf ? { a, b: a + 1, width: width + LOOP_WIDTH + CELL_WIDTH } : { a, b, width },
    )
    .filter(({ b }) => b <= gaps.length)
    .sort((x, y) => x.b - x.a - (y.b - y.a));

  for (const { a, b, width } of needs) {
    const have = gaps.slice(a, b).reduce((sum, gap) => sum + gap, 0);

    if (have < width) {
      for (let i = a; i < b; i++) {
        gaps[i] = gaps[i]! + (width - have) / (b - a);
      }
    }
  }

  const centres = participants.map((_, i) => widths[0]! / 2 + gaps.slice(0, i).reduce((sum, gap) => sum + gap, 0));
  const lifeTop = BOX_H;
  const frames: Closed[] = [];
  const open: Frame[] = [];
  const bars: string[] = [];
  const marks: string[] = [];
  const active = new Map<string, number[]>();
  let minX = Math.min(...centres.map((c, i) => c - widths[i]! / 2));
  let maxX = Math.max(...centres.map((c, i) => c + widths[i]! / 2));
  let y = lifeTop + 30;
  let count = 0;

  const reach = (left: number, right: number) => {
    minX = Math.min(minX, left);
    maxX = Math.max(maxX, right);

    for (const frame of open) {
      frame.min = Math.min(frame.min, left);
      frame.max = Math.max(frame.max, right);
    }
  };
  const bar = (id: string, from: number, to: number) => {
    const depth = active.get(id)?.length ?? 0;
    const x = centres[index.get(id)!]! + depth * 6 - BAR_WIDTH / 2;

    bars.push(
      rectSvg(
        x,
        from,
        BAR_WIDTH,
        Math.max(8, to - from),
        2,
        `${fill(palette.accent, 0.35)} stroke="${palette.accent}" stroke-width="1.5"`,
      ),
    );
  };
  const activate = (id: string, at: number) => {
    active.set(id, [...(active.get(id) ?? []), at]);
  };
  const deactivate = (id: string, at: number) => {
    const stack = active.get(id) ?? [];
    const start = stack.pop();

    active.set(id, stack);

    if (start !== undefined) {
      bar(id, start, at);
    }
  };

  const arrow = markerLength("arrow");
  const opened = markerLength("open");

  for (const event of events) {
    switch (event.type) {
      case "message": {
        const from = centres[index.get(event.from)!]!;
        const to = centres[index.get(event.to)!]!;
        const text = numbered(count++, event.text);
        const dash = event.isDotted ? DASHED : "";
        const space =
          event.head === "filled" ? arrow : event.head === "open" ? opened : event.head === "cross" ? 12 : 0;
        const marker =
          event.head === "filled" ? markerAttribute("arrow") : event.head === "open" ? markerAttribute("open") : "";

        if (event.from === event.to) {
          const at = y + 22;
          const end = from + space + 4;
          const label = measure(text, LABEL);

          marks.push(
            pathSvg(
              `M${from} ${at}H${from + LOOP_WIDTH}V${at + 36}H${end}`,
              palette.inactive,
              EDGE_WIDTH,
              dash + marker,
            ),
            textSvg(from + LOOP_WIDTH + 14, at + 18 + LABEL * 0.35, text, LABEL, palette.text, "start"),
          );
          reach(from, from + LOOP_WIDTH + 14 + label);

          if (event.activates) {
            activate(event.to, at);
          }

          if (event.deactivates) {
            deactivate(event.from, at + 36);
          }

          y += SELF_ROW;
          break;
        }

        const at = y + 44;
        const direction = Math.sign(to - from);
        const end = to - direction * (space + 2);

        marks.push(
          pathSvg(`M${from} ${at}H${end}`, palette.inactive, EDGE_WIDTH, dash + marker),
          textSvg((from + to) / 2, y + 28, text, LABEL, palette.text),
        );

        if (event.head === "cross") {
          const x = to - direction * 8;

          marks.push(
            lineSvg({ x: x - 7, y: at - 7 }, { x: x + 7, y: at + 7 }, palette.inactive, EDGE_WIDTH),
            lineSvg({ x: x - 7, y: at + 7 }, { x: x + 7, y: at - 7 }, palette.inactive, EDGE_WIDTH),
          );
        }

        reach(Math.min(from, to), Math.max(from, to));

        if (event.activates) {
          activate(event.to, at);
        }

        if (event.deactivates) {
          deactivate(event.from, at);
        }

        y += ROW;
        break;
      }
      case "note": {
        const lines = wrap(event.text, MAX_NOTE_WIDTH, LABEL, 4);
        const first = centres[index.get(event.ids[0]!)!]!;
        const last = centres[index.get(event.ids.at(-1)!)!]!;
        const width = Math.max(...lines.map((line) => measure(line, LABEL))) + 40;
        const w = event.side === "over" ? Math.max(width, Math.abs(last - first) + 40) : width;
        const x =
          event.side === "over" ? (first + last) / 2 - w / 2 : event.side === "left" ? first - w - 16 : first + 16;
        const h = lines.length * LABEL * 1.3 + 20;

        marks.push(
          rectSvg(x, y + 4, w, h, 6, boxPaint(palette.inactive, 1.5, 0.2)),
          ...lines.map((line, n) =>
            textSvg(x + w / 2, y + 4 + 10 + (n + 1) * LABEL * 1.3 - LABEL * 0.3, line, LABEL, palette.text),
          ),
        );
        reach(x, x + w);
        y += h + 24;
        break;
      }
      case "begin":
        open.push({ name: event.name, text: event.text, top: y + 4, min: Infinity, max: -Infinity, dividers: [] });
        y += 44;
        break;
      case "divider":
        open.at(-1)?.dividers.push({ y: y + 2, text: event.text });
        y += 36;
        break;
      case "end": {
        const frame = open.pop();

        if (frame === undefined) {
          break;
        }

        const left = (Number.isFinite(frame.min) ? frame.min : minX) - 18;
        const right = (Number.isFinite(frame.max) ? frame.max : maxX) + 18;

        frames.push({ ...frame, min: left, max: right, bottom: y - 6 });
        reach(left, right);
        y += 22;
        break;
      }
      case "activate":
        activate(event.id, y);
        break;
      case "deactivate":
        deactivate(event.id, y);
        break;
    }
  }

  for (const id of active.keys()) {
    while ((active.get(id)?.length ?? 0) > 0) {
      deactivate(id, y);
    }
  }

  const bottomTop = y + 10;
  const lives = participants
    .map((_, i) =>
      lineSvg(
        { x: centres[i]!, y: lifeTop },
        { x: centres[i]!, y: bottomTop },
        palette.inactive,
        2,
        ` stroke-dasharray="10 10" stroke-opacity="0.7"`,
      ),
    )
    .join("");
  const boxes = (top: number) =>
    participants
      .map(({ label, isActor }, i) => {
        const color = isActor ? palette.success : palette.accent;

        return (
          rectSvg(centres[i]! - widths[i]! / 2, top, widths[i]!, BOX_H, 12, boxPaint(color, EDGE_WIDTH)) +
          centredText(centres[i]!, top + BOX_H / 2, label, TEXT, palette.text)
        );
      })
      .join("");
  const outlines = frames
    .map((frame) => {
      const tag = measure(frame.name, DETAIL) + 28;

      return (
        rectSvg(
          frame.min,
          frame.top,
          frame.max - frame.min,
          frame.bottom - frame.top,
          6,
          `fill="none" stroke="${palette.inactive}" stroke-width="1.5"`,
        ) +
        rectSvg(frame.min, frame.top, tag, DETAIL + 16, 6, fill(palette.inactive, 0.35)) +
        textSvg(frame.min + 14, frame.top + DETAIL + 2, frame.name, DETAIL, palette.text, "start") +
        (frame.text === ""
          ? ""
          : textSvg(
              frame.min + tag + 12,
              frame.top + DETAIL + 2,
              `[${frame.text}]`,
              DETAIL,
              palette.inactive,
              "start",
            )) +
        frame.dividers
          .map(
            (divider) =>
              lineSvg(
                { x: frame.min, y: divider.y },
                { x: frame.max, y: divider.y },
                palette.inactive,
                1.5,
                ` stroke-dasharray="8 8"`,
              ) +
              (divider.text === ""
                ? ""
                : textSvg(
                    frame.min + 14,
                    divider.y + DETAIL + 2,
                    `[${divider.text}]`,
                    DETAIL,
                    palette.inactive,
                    "start",
                  )),
          )
          .join("")
      );
    })
    .join("");
  const dx = MARGIN - minX;
  const body = `<defs>${markerDef("arrow", palette.inactive)}${markerDef("open", palette.inactive)}</defs><g transform="translate(${dx} ${MARGIN})">${lives}${bars.join("")}${outlines}${marks.join("")}${boxes(0)}${boxes(bottomTop)}</g>`;

  return finish(
    body,
    maxX - minX + 2 * MARGIN,
    bottomTop + BOX_H + 2 * MARGIN,
    available,
    font,
    messages.map(({ from, to, text }) => `${from} -> ${to}${text === "" ? "" : `: ${text}`}`).join("\n"),
  );
}
