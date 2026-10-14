import { Draft, mid, seriesTone, widest } from "./mermaid-scene";
import type { Ctx, DotShape, Pt, Scene } from "./mermaid-scene";
import type { Tone } from "./palette";

type Kind = "normal" | "reverse" | "highlight" | "merge";
type Commit = { label: string; tag: string; kind: Kind; branch: number; parents: number[]; isCherry: boolean };
type Branch = { name: string; order: number };

export type GitGraph = { title: string; branches: Branch[]; commits: Commit[] };

const MAX_COMMITS = 60;
const MAX_BRANCHES = 8;
const LANE = 3;
const MIN_STEP = 3;
const MAX_STEP = 16;
const SHAPES: Record<Kind, DotShape> = { normal: "circle", reverse: "cross", highlight: "square", merge: "diamond" };

const HEAD = /^gitGraph(?:\s+(?:LR|TB|BT))?:?$/;

// The `key: value` pairs after a command, values with or without quotes.
function attributesOf(text: string): Record<string, string> {
  return Object.fromEntries(
    [...text.matchAll(/(\w+)\s*:\s*(?:"([^"]*)"|(\S+))/g)].map((pair) => [pair[1]!, pair[2] ?? pair[3] ?? ""]),
  );
}

const kindOf = (type: string | undefined, fallback: Kind): Kind => {
  const found = (["reverse", "highlight"] as const).find((kind) => kind === type?.toLowerCase());

  return found ?? fallback;
};

// A `gitGraph` read well enough to draw: commits, branches, merges and cherry-picks. Null for a branch or commit that
// is not there or a line this does not read.
export function parseGit(lines: readonly string[]): GitGraph | null {
  if (!HEAD.test(lines[0] ?? "")) {
    return null;
  }

  const graph: GitGraph = { title: "", branches: [{ name: "main", order: 0 }], commits: [] };
  const heads: number[] = [-1];
  let current = 0;

  const add = (kind: Kind, label: string, tag: string, parents: number[], isCherry = false) => {
    graph.commits.push({
      label,
      tag,
      kind,
      branch: current,
      parents: parents.filter((parent) => parent >= 0),
      isCherry,
    });
    heads[current] = graph.commits.length - 1;
  };
  const find = (name: string) => graph.branches.findIndex((branch) => branch.name === name);

  for (const line of lines.slice(1)) {
    const [, word = "", rest = ""] = /^([\w-]+)\s*(.*)$/.exec(line) ?? [];
    const attributes = attributesOf(rest);

    switch (word.toLowerCase()) {
      case "commit":
        add(kindOf(attributes.type, "normal"), attributes.id ?? "", attributes.tag ?? "", [heads[current]!]);
        break;
      case "branch": {
        const name = /^([\w./-]+)/.exec(rest)?.[1] ?? "";

        if (name === "" || find(name) !== -1) {
          return null;
        }

        graph.branches.push({
          name,
          order: attributes.order === undefined ? graph.branches.length : Number(attributes.order),
        });
        heads.push(heads[current]!);
        current = graph.branches.length - 1;
        break;
      }
      case "checkout":
      case "switch": {
        const target = find(rest.trim());

        if (target === -1) {
          return null;
        }

        current = target;
        break;
      }
      case "merge": {
        const other = find(/^([\w./-]+)/.exec(rest)?.[1] ?? "");

        if (other === -1 || other === current || heads[other] === -1) {
          return null;
        }

        add("merge", attributes.id ?? "", attributes.tag ?? "", [heads[current]!, heads[other]!]);
        break;
      }
      case "cherry-pick": {
        const source = graph.commits.findIndex((commit) => commit.label === attributes.id);

        if (source === -1) {
          return null;
        }

        add("normal", "", attributes.tag ?? `cherry-pick: ${attributes.id}`, [heads[current]!, source], true);
        break;
      }
      default:
        if (!/^(accTitle|accDescr|title)\b/i.test(line)) {
          return null;
        }
    }
  }

  const { commits, branches } = graph;

  return commits.length === 0 || commits.length > MAX_COMMITS || branches.length > MAX_BRANCHES ? null : graph;
}

export function gitScene({ branches, commits }: GitGraph, ctx: Ctx): Scene | null {
  const lanes = branches.map((_, i) => i).sort((a, b) => branches[a]!.order - branches[b]!.order || a - b);
  const lane = (branch: number) => lanes.indexOf(branch);
  const names = widest(branches.map(({ name }) => name));
  const labels = commits.flatMap(({ label, tag }) => [label, tag === "" ? "" : `[${tag}]`]);
  const wanted = Math.min(MAX_STEP, Math.max(4, widest(labels) + 2));
  const left = names + 3;
  const step = [wanted, MIN_STEP].find((candidate) => left + (commits.length - 1) * candidate + 2 <= ctx.columns);

  if (step === undefined) {
    return null;
  }

  const d = new Draft();
  const x = (i: number) => mid(left + i * step);
  const y = (branch: number) => mid(lane(branch) * LANE + 1);
  const point = (i: number): Pt => ({ x: x(i), y: y(commits[i]!.branch) });
  const firsts = new Map(branches.map((_, b) => [b, commits.findIndex((commit) => commit.branch === b)]));
  const verticals: { x: number; top: number; bottom: number }[] = [];

  commits.forEach((commit, i) => {
    const tone = seriesTone(lane(commit.branch));

    commit.parents.forEach((parent, order) => {
      const from = point(parent);
      const to = point(i);
      const parentTone = seriesTone(lane(commits[parent]!.branch));

      if (from.y === to.y) {
        d.line([from, to], tone, { dash: commit.isCherry && order > 0 });
      } else {
        const isBranch = firsts.get(commit.branch) === i && order === 0;
        const column = isBranch ? from.x : to.x;

        verticals.push({
          x: column,
          top: Math.floor(Math.min(from.y, to.y)),
          bottom: Math.floor(Math.max(from.y, to.y)),
        });
        d.line(
          [from, { x: column, y: isBranch ? to.y : from.y }, to],
          isBranch ? tone : parentTone,
          isBranch ? {} : { dash: commit.isCherry },
        );
      }
    });
  });

  // A name is centred on its commit, or starts beside the commit where a line between lanes runs through its row.
  const name = (text: string, at: Pt, row: number, tone: Tone, isBold: boolean) => {
    const isCrossed = verticals.some(
      ({ x: column, top, bottom }) =>
        row >= top && row <= bottom && Math.abs(column - at.x) <= widest([text]) / 2 + 0.5,
    );

    d.text(isCrossed ? at.x + 1 : at.x, row, text, tone, { anchor: isCrossed ? "start" : "middle", bold: isBold });
  };

  commits.forEach((commit, i) => {
    const at = point(i);

    d.dot(at.x, at.y, seriesTone(lane(commit.branch)), SHAPES[commit.kind]);
    name(commit.label, at, Math.floor(at.y) + 1, "inactive", false);
    name(commit.tag === "" ? "" : `[${commit.tag}]`, at, Math.floor(at.y) - 1, "warning", true);
  });

  branches.forEach(({ name }, b) => d.text(0, Math.floor(y(b)), name, seriesTone(lane(b)), { bold: true }));

  return d.finish(
    `Git graph: ${commits
      .map(
        (commit) =>
          `${commit.kind === "merge" ? "merge" : "commit"} ${commit.label}${commit.tag === "" ? "" : ` tagged ${commit.tag}`} on ${branches[commit.branch]!.name}`,
      )
      .join("; ")}`,
    ctx,
  );
}
