import { Draft, seriesTone, widest } from "./mermaid-scene";
import type { Ctx, Scene } from "./mermaid-scene";
import { listOf, titleOf, unquote } from "./mermaid-source";
import type { Tone } from "./palette";
import { clipCells } from "./svg-text";

type Step = { name: string; score: number; actors: string[]; section: number };
export type Journey = { title: string; sections: string[]; steps: Step[] };

const MAX_STEPS = 60;
const MAX_NAME = 36;
const STAR = 5;

const STEP = /^([^:]+):\s*([1-5])\s*(?::\s*(.*))?$/;

// A `journey` read well enough to draw. Null for a score outside one to five or a line this does not read.
export function parseJourney(lines: readonly string[]): Journey | null {
  if (lines[0] !== "journey") {
    return null;
  }

  const journey: Journey = { title: "", sections: [], steps: [] };

  for (const line of lines.slice(1)) {
    const title = titleOf(line);
    const section = /^section\s+(.*)$/i.exec(line);
    const step = STEP.exec(line);

    if (title !== null) {
      journey.title = title;
    } else if (section !== null) {
      journey.sections.push(unquote(section[1]!));
    } else if (step !== null) {
      journey.steps.push({
        name: unquote(step[1]!),
        score: Number(step[2]),
        actors: listOf(step[3] ?? ""),
        section: journey.sections.length - 1,
      });
    } else if (!/^(accTitle|accDescr)\b/i.test(line)) {
      return null;
    }
  }

  return journey.steps.length === 0 || journey.steps.length > MAX_STEPS ? null : journey;
}

const moodOf = (score: number): Tone => (score <= 2 ? "error" : score === 3 ? "warning" : "success");

export function journeyScene({ title, sections, steps }: Journey, ctx: Ctx): Scene | null {
  const actors = [...new Set(steps.flatMap((step) => step.actors))];
  const hasSections = sections.length > 0;
  const names = steps.map(({ name }) => clipCells(name, MAX_NAME));
  const indent = hasSections ? 2 : 0;
  const meter = indent + widest(names) + 2;
  const d = new Draft();
  let row = d.heading(title);
  let current = -2;

  steps.forEach((step, i) => {
    if (hasSections && step.section !== current) {
      current = step.section;

      if (current >= 0) {
        d.text(0, row, sections[current]!, seriesTone(current), { bold: true });
        row++;
      }
    }

    d.text(indent, row, names[i]!);

    for (let n = 0; n < STAR; n++) {
      if (n < step.score) {
        d.dot(meter + n * 2 + 0.5, row + 0.5, moodOf(step.score));
      } else {
        d.text(meter + n * 2, row, "○", "subtle");
      }
    }

    let at = meter + STAR * 2 + 1;

    for (const actor of step.actors) {
      d.text(at, row, actor, seriesTone(actors.indexOf(actor)));
      at += actor.length + 1;
    }

    row++;
  });

  if (actors.length > 0) {
    d.swatches(
      actors.map((label, i) => ({ label, tone: seriesTone(i) })),
      0,
      row + 1,
      ctx.columns,
    );
  }

  return d.finish(
    `User journey${title === "" ? "" : ` ${title}`}: ${steps.map(({ name, score }) => `${name} ${score} of ${STAR}`).join(", ")}`,
    ctx,
  );
}
