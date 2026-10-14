import { expect, test } from "claude-code/testing";

import { parseArchitecture } from "../hooks/mermaid-architecture";
import { parseBlock } from "../hooks/mermaid-block";
import { parseC4 } from "../hooks/mermaid-c4";
import { cellRows } from "../hooks/mermaid-cells";
import type { Row } from "../hooks/mermaid-cells";
import { addDuration, DAY, formatDate, parseDate, timeTicks } from "../hooks/mermaid-date";
import { diagramSketch, diagramText, sceneOf } from "../hooks/mermaid-diagram";
import { parseGantt } from "../hooks/mermaid-gantt";
import { parseGit } from "../hooks/mermaid-git";
import { parseJourney } from "../hooks/mermaid-journey";
import { parseKanban } from "../hooks/mermaid-kanban";
import { parseMindmap } from "../hooks/mermaid-mindmap";
import { parsePacket } from "../hooks/mermaid-packet";
import { parsePie } from "../hooks/mermaid-pie";
import { parseQuadrant } from "../hooks/mermaid-quadrant";
import { parseRadar } from "../hooks/mermaid-radar";
import { csvOf, parseSankey } from "../hooks/mermaid-sankey";
import { compactNumber, Draft, elbow, niceTicks, slice } from "../hooks/mermaid-scene";
import { frontmatterOf, indentedLines, listOf, sourceLines } from "../hooks/mermaid-source";
import { parseTimeline } from "../hooks/mermaid-timeline";
import { parseTreemap } from "../hooks/mermaid-treemap";
import { parseXy } from "../hooks/mermaid-xy";
import { baseOf } from "../hooks/palette";
import { cellHeightOf } from "../hooks/picture";
import { cellWidth, clipCells, wrapWith } from "../hooks/svg-text";

const PALETTE = baseOf("dark");
const FONT = { family: "Helvetica Neue", cellHeight: cellHeightOf(2.9) };
const CTX = { columns: 100, ratio: 2.9 };

const lines = (source: string) => sourceLines(source);
const parts = (source: string) => indentedLines(source);
const text = (rows: readonly Row[]) => rows.map((row) => row.map((run) => run.text).join("")).join("\n");

const SAMPLES: Record<string, string> = {
  pie: 'pie title Pets\n  "Dogs" : 386\n  "Cats" : 85\n  "Birds" : 40',
  xy: 'xychart-beta\n  title "Sales"\n  x-axis [jan, feb, mar]\n  y-axis "Revenue"\n  bar [5, 12, 7]\n  line "Trend" [4, 9, 10]',
  horizontal: "xychart horizontal\n  x-axis [a, b]\n  y-axis 0 --> 10\n  bar [3, 8]",
  gantt:
    "gantt\n  title Release\n  dateFormat YYYY-MM-DD\n  section Dev\n  Build :done, a1, 2026-01-01, 10d\n  Test :active, after a1, 6d\n  section Ship\n  Launch :milestone, m1, 2026-01-21, 0d",
  timeline: "timeline\n  title History\n  section Early\n  2002 : LinkedIn\n  2004 : Facebook : Google\n    : Orkut",
  journey: "journey\n  title Day\n  section Work\n    Make tea: 5: Me\n    Do work: 1: Me, Cat",
  kanban: "kanban\n  todo[Todo]\n    a[Write docs]@{ ticket: MC-1, priority: 'High' }\n  done[Done]\n    b[Ship]",
  mindmap: "mindmap\n  root((Veneer))\n    Rendering\n      Tables\n    Config",
  quadrant:
    "quadrantChart\n  title Reach\n  x-axis Low --> High\n  y-axis Cold --> Hot\n  quadrant-1 Expand\n  A: [0.3, 0.6]\n  B: [0.8, 0.2]",
  radar: 'radar-beta\n  axis a["A"], b["B"], c["C"]\n  curve x["X"]{1, 2, 3}\n  curve y{c: 3, a: 1, b: 2}\n  max 3',
  sankey: "sankey-beta\n\nA,B,10\nA,C,5\nB,D,8",
  treemap: 'treemap-beta\n"Root"\n  "A": 30\n  "B"\n    "C": 10\n    "D": 5',
  packet: 'packet-beta\n  0-15: "Source"\n  16-31: "Target"\n  +32: "Long"',
  block: 'block-beta\n  columns 2\n  a["A"] b:1\n  space c\n  a --> b',
  git: 'gitGraph\n  commit\n  branch dev\n  checkout dev\n  commit id: "x"\n  checkout main\n  merge dev tag: "v1"',
  architecture:
    "architecture-beta\n  group g(cloud)[G]\n  service a(server)[A] in g\n  service b(database)[B] in g\n  a:R -- L:b",
  c4: 'C4Context\n  title Context\n  Person(u, "User", "Uses")\n  System(s, "System", "Does")\n  Rel(u, s, "Uses")',
};

test("every kind is drawn as a scene that fits the columns, has no broken numbers and is the same every time", () => {
  for (const [name, source] of Object.entries(SAMPLES)) {
    const scene = sceneOf(source, CTX);

    expect(scene, name).not.toBeNull();
    expect(scene!.width, name).toBeLessThanOrEqual(CTX.columns);
    expect(scene!.alt, name).not.toBe("");
    expect(JSON.stringify(scene), name).not.toMatch(/NaN|undefined|Infinity/);
    expect(JSON.stringify(sceneOf(source, CTX)), name).toBe(JSON.stringify(scene));
  }
});

test("a scene is a picture over whole cells and a text row for every cell row", () => {
  for (const [name, source] of Object.entries(SAMPLES)) {
    const scene = sceneOf(source, CTX)!;
    const sketch = diagramSketch(source, CTX.columns, PALETTE, FONT)!;
    const rows = diagramText(source, CTX)!;

    expect(sketch.svg, name).toContain(`width="${sketch.columns * 20}"`);
    expect(sketch.svg, name).toContain(`height="${sketch.rows * FONT.cellHeight}"`);
    expect(sketch.svg, name).not.toMatch(/NaN|undefined|Infinity/);
    expect([sketch.columns, sketch.rows], name).toEqual([scene.width, scene.height]);
    expect(rows.length, name).toBe(scene.height);
    expect(text(rows), name).not.toMatch(/NaN|undefined/);
  }
});

test("a chart too wide for the columns is not drawn", () => {
  expect(sceneOf(SAMPLES.pie!, { columns: 10, ratio: 2.9 })).toBeNull();
  expect(sceneOf(SAMPLES.packet!, { columns: 20, ratio: 2.9 })).toBeNull();
  expect(sceneOf(SAMPLES.sankey!, { columns: 30, ratio: 2.9 })).toBeNull();
});

test("a source that is not one of these kinds, or cannot be read, draws nothing", () => {
  for (const source of [
    "flowchart TD\n  A --> B",
    "pie\n  not a slice",
    "xychart\n  x-axis [a]\n  bar [1, x]",
    "gantt\n  Task :after missing, 3d",
    "journey\n  Step: 9: Me",
    "mindmap\n  one\n  two",
    "gitGraph\n  checkout nowhere",
    "sankey\n  A,B,1\n  B,A,1",
    'packet\n  0-3: "a"\n  8-11: "gap"',
    'C4Context\n  Rel(a, b, "x")',
    "architecture-beta\n  service a(server)[A]\n  a:R -- L:ghost",
  ]) {
    expect(sceneOf(source, CTX), source).toBeNull();
  }

  expect(diagramText("pie\n  not a slice", CTX)).toBeNull();
});

test("a title in frontmatter names a diagram that has none of its own", () => {
  expect(frontmatterOf('---\ntitle: My pie\n---\npie\n  "a" : 1')).toEqual({ title: "My pie", body: 'pie\n  "a" : 1' });
  expect(text(diagramText('---\ntitle: My pie\n---\npie\n  "a" : 1', CTX)!)).toContain("My pie");
  expect(text(diagramText('---\ntitle: Other\n---\npie title Own\n  "a" : 1', CTX)!)).toContain("Own");
});

test("source helpers read indentation, lists and numbers", () => {
  expect(parts("a\n  b\n\t\tc\n%% x\n").indents).toEqual([0, 2, 8]);
  expect(listOf('a, "b, c", d')).toEqual(["a", "b, c", "d"]);
  expect(listOf("")).toEqual([]);
  expect(csvOf('A,"B, C",10')).toEqual(["A", "B, C", "10"]);
  expect(csvOf('"say ""hi""",x,1')[0]).toBe('say "hi"');
});

test("text is measured and cut by the columns it takes", () => {
  expect(cellWidth("abc")).toBe(3);
  expect(cellWidth("日本")).toBe(4);
  expect(clipCells("abcdef", 4)).toBe("abc…");
  expect(clipCells("abc", 4)).toBe("abc");
  expect(wrapWith("one two three four", 9, 2, cellWidth)).toEqual(["one two", "three…"]);
});

test("ticks are round numbers that hold the range, and numbers are shortened for an axis", () => {
  expect(niceTicks(0, 14, 5)).toEqual({ lo: 0, hi: 15, ticks: [0, 5, 10, 15] });
  expect(niceTicks(3, 3, 5).ticks.length).toBeGreaterThan(1);
  expect(compactNumber(12000)).toBe("12k");
  expect(compactNumber(2_500_000)).toBe("2.5M");
  expect(compactNumber(950)).toBe("950");
});

test("a route turns only at right angles and sits on the middle of cells", () => {
  const path = elbow(
    [
      { x: 2.2, y: 1.1 },
      { x: 9.7, y: 8.4 },
    ],
    true,
  );

  expect(path.every((p, i) => i === 0 || p.x === path[i - 1]!.x || p.y === path[i - 1]!.y)).toBe(true);
  expect(path.every((p) => p.x % 1 === 0.5 && p.y % 1 === 0.5)).toBe(true);
});

test("a full slice is a closed ring and a part of one starts at the centre", () => {
  const ring = slice(0, 0, 4, 2, 0, Math.PI * 2);

  expect(Math.hypot(ring[0]!.x - ring.at(-1)!.x, ring[0]!.y - ring.at(-1)!.y)).toBeLessThan(1e-9);
  expect(slice(0, 0, 4, 2, 0, Math.PI)[0]).toEqual({ x: 0, y: 0 });
});

const draw = (build: (d: Draft) => void, width: number, height: number) => {
  const d = new Draft();

  build(d);

  return text(cellRows({ width, height, prims: d.prims, alt: "" }));
};

test("straight lines and borders join into the box characters that fit", () => {
  expect(
    draw(
      (d) => {
        d.rect(0, 0, 4, 3, { stroke: "text" });
        d.line(
          [
            { x: 1.5, y: 2.5 },
            { x: 1.5, y: 4.5 },
          ],
          "text",
        );
      },
      4,
      5,
    ),
  ).toBe("┌──┐\n│  │\n└┬─┘\n │\n │");
  expect(draw((d) => d.rect(0, 0, 3, 3, { stroke: "text", round: true }), 3, 3)).toBe("╭─╮\n│ │\n╰─╯");
});

test("a line that ends in an arrow ends in the head that points along it", () => {
  expect(
    draw(
      (d) =>
        d.line(
          [
            { x: 0.5, y: 0.5 },
            { x: 4.5, y: 0.5 },
          ],
          "text",
          { arrow: true },
        ),
      5,
      1,
    ),
  ).toBe("────▸");
  expect(
    draw(
      (d) =>
        d.line(
          [
            { x: 0.5, y: 0.5 },
            { x: 0.5, y: 3.5 },
          ],
          "text",
          { arrow: true },
        ),
      1,
      4,
    ),
  ).toBe("│\n│\n│\n▾");
});

test("a slanting line is braille dots, and a dashed one is dashes", () => {
  expect(
    draw(
      (d) =>
        d.line(
          [
            { x: 0, y: 0 },
            { x: 4, y: 2 },
          ],
          "text",
        ),
      4,
      2,
    ),
  ).toMatch(/[⠁-⣿]/);
  expect(
    draw(
      (d) =>
        d.line(
          [
            { x: 0.5, y: 0.5 },
            { x: 3.5, y: 0.5 },
          ],
          "text",
          { dash: true },
        ),
      4,
      1,
    ),
  ).toBe("╌╌╌╌");
});

test("a bar is filled in eighths of a cell, so its top need not fall on a row", () => {
  const rows = cellRows({
    width: 1,
    height: 2,
    prims: new Draft().prims.concat(
      (() => {
        const d = new Draft();

        d.rect(0, 0.625, 1, 1.375, { fill: "success" });

        return d.prims;
      })(),
    ),
    alt: "",
  });

  expect(rows[0]).toEqual([{ text: "▃", color: "success" }]);
  expect(rows[1]).toEqual([{ text: " ", back: "success" }]);
});

test("text clears what is under it, and a translucent fill is shaded where text cannot tint", () => {
  expect(
    draw(
      (d) => {
        d.rect(0, 0, 5, 1, { fill: "success" });
        d.text(0, 0, "ab", "text");
      },
      5,
      1,
    ),
  ).toBe("ab   ");
  expect(draw((d) => d.rect(0, 0, 2, 1, { fill: "success", opacity: 0.45 }), 2, 1)).toBe("░░");
  expect(draw((d) => d.rect(0, 0, 2, 1, { fill: "success", opacity: 0.1 }), 2, 1)).toBe("");
});

test("a run carries the theme colour of its tone and a dot is the glyph of its shape", () => {
  const rows = cellRows({
    width: 4,
    height: 1,
    prims: (() => {
      const d = new Draft();

      d.dot(0.5, 0.5, "error", "diamond");
      d.text(1, 0, "hi", "success", { bold: true });

      return d.prims;
    })(),
    alt: "",
  });

  expect(rows[0]).toEqual([
    { text: "◆", color: "error" },
    { text: "hi", color: "success", bold: true },
  ]);
});

test("a wide character takes two cells and the row keeps its width", () => {
  expect(draw((d) => d.text(0, 0, "日a", "text"), 4, 1)).toBe("日a");
});

test("dates are read in the format given, written in d3 style and added to by duration", () => {
  const start = parseDate("2026-01-01", "YYYY-MM-DD")!;

  expect(formatDate(start, "%b %-e %Y")).toBe("Jan 1 2026");
  expect(parseDate("01/02/26 13:30", "DD/MM/YY HH:mm")).toBe(Date.UTC(2026, 1, 1, 13, 30));
  expect(parseDate("nope", "YYYY-MM-DD")).toBeNull();
  expect(addDuration(start, "10d")).toBe(start + 10 * DAY);
  expect(addDuration(start, "1M")).toBe(Date.UTC(2026, 1, 1));
  expect(addDuration(start, "soon")).toBeNull();
});

test("a time axis ticks on round days, weeks and months, no more than asked", () => {
  const from = Date.UTC(2026, 0, 1);
  const days = timeTicks(from, from + 10 * DAY, 12);
  const year = timeTicks(from, from + 300 * DAY, 8);

  expect(days.ticks.length).toBeLessThanOrEqual(12);
  expect(days.ticks.every((tick) => tick % DAY === 0)).toBe(true);
  expect(year.ticks.length).toBeLessThanOrEqual(8);
  expect(year.ticks.every((tick) => new Date(tick).getUTCDate() === 1)).toBe(true);
});

test("a pie reads its slices from the largest down and refuses a value that is not positive", () => {
  const pie = parsePie(lines('pie showData title Pets\n  "Cats" : 1\n  "Dogs" : 3\n  "None" : 0'))!;

  expect(pie.title).toBe("Pets");
  expect(pie.slices.map(({ label }) => label)).toEqual(["Dogs", "Cats"]);
  expect(parsePie(lines('pie\n  "a" : -1'))).toBeNull();
});

test("an xy chart reads axes of every form, named and unnamed series and the direction", () => {
  const chart = parseXy(
    lines(
      'xychart-beta horizontal\n  title Plain\n  x-axis "Month" [jan, "feb, 2"]\n  y-axis Revenue 0 --> 100\n  bar [1, 2]\n  line "Trend" [.5, +3]',
    ),
  )!;

  expect(chart).toMatchObject({
    title: "Plain",
    isHorizontal: true,
    xTitle: "Month",
    yTitle: "Revenue",
    yRange: [0, 100],
  });
  expect(chart.categories).toEqual(["jan", "feb, 2"]);
  expect(chart.series.map(({ kind, name, values }) => [kind, name, values])).toEqual([
    ["bar", "", [1, 2]],
    ["line", "Trend", [0.5, 3]],
  ]);
  expect(parseXy(lines("xychart\n  x-axis 1 --> 4\n  line [1, 2, 3, 4]"))!.xRange).toEqual([1, 4]);
});

test("an xy chart puts bars on the zero line and the value labels on the bars", () => {
  const rows = text(diagramText("xychart\n  x-axis [a, b]\n  bar [-5, 10]", CTX)!);

  expect(rows).toContain("-5");
  expect(rows).toContain("10");
  expect(rows).toContain("a");
});

test("a gantt reads tags, ids, dependencies, dates and durations in the date format given", () => {
  const read = parseGantt(
    lines(
      "gantt\n  dateFormat DD-MM-YYYY\n  axisFormat %d %b\n  section A\n  One :crit, done, t1, 01-01-2026, 2d\n  Two :after t1, 03-01-2026\n  Three :milestone, 4d",
    ),
  )!;
  const [one, two, three] = read.tasks;

  expect(read.axisFormat).toBe("%d %b");
  expect(one).toMatchObject({ name: "One", tags: ["crit", "done"], length: "2d" });
  expect(two!.start).toBe(one!.end);
  expect(three!.start).toBe(two!.end);
  expect(three!.end - three!.start).toBe(4 * DAY);
});

test("a gantt drawn in text marks milestones and puts each task on its own row", () => {
  const rows = text(diagramText(SAMPLES.gantt!, CTX)!);

  expect(rows).toContain("◆");
  expect(rows).toContain("Build");
  expect(rows).toContain("10d");
});

test("a timeline reads sections, periods and events carried on to the next line", () => {
  const timeline = parseTimeline(lines(SAMPLES.timeline!))!;

  expect(timeline.sections).toEqual(["Early"]);
  expect(timeline.periods.map(({ label, events }) => [label, events])).toEqual([
    ["2002", ["LinkedIn"]],
    ["2004", ["Facebook", "Google", "Orkut"]],
  ]);
});

test("a journey reads scores and the actors of each step", () => {
  const journey = parseJourney(lines(SAMPLES.journey!))!;

  expect(journey.steps.map(({ name, score, actors }) => [name, score, actors])).toEqual([
    ["Make tea", 5, ["Me"]],
    ["Do work", 1, ["Me", "Cat"]],
  ]);
});

test("a kanban reads columns by indentation and the metadata of a card", () => {
  const { lines: all, indents } = parts(SAMPLES.kanban!);
  const board = parseKanban(all, indents)!;

  expect(board.columns.map(({ name, cards }) => [name, cards.length])).toEqual([
    ["Todo", 1],
    ["Done", 1],
  ]);
  expect(board.columns[0]!.cards[0]).toEqual({ text: "Write docs", ticket: "MC-1", assigned: "", priority: "High" });
});

test("a kanban too narrow for its columns stacks them", () => {
  const rows = text(diagramText(SAMPLES.kanban!, { columns: 30, ratio: 2.9 })!).split("\n");

  expect(rows.findIndex((row) => row.startsWith("Done"))).toBeGreaterThan(
    rows.findIndex((row) => row.startsWith("Todo")) + 3,
  );
});

test("a mindmap nests nodes by indentation and has one root", () => {
  const { lines: all, indents } = parts(SAMPLES.mindmap!);
  const map = parseMindmap(all, indents)!;

  expect(map.root.label).toBe("Veneer");
  expect(map.root.children.map(({ label, children }) => [label, children.length])).toEqual([
    ["Rendering", 1],
    ["Config", 0],
  ]);
  expect(text(diagramText(SAMPLES.mindmap!, CTX)!)).toContain("Veneer");
});

test("a quadrant chart reads axes, quadrant names and points inside the square, and refuses one outside it", () => {
  const chart = parseQuadrant(lines(SAMPLES.quadrant!))!;

  expect(chart.xAxis).toEqual(["Low", "High"]);
  expect(chart.names[0]).toBe("Expand");
  expect(chart.points).toEqual([
    { name: "A", x: 0.3, y: 0.6 },
    { name: "B", x: 0.8, y: 0.2 },
  ]);
  expect(parseQuadrant(lines("quadrantChart\n  A: [1.5, 0.5]"))).toBeNull();
});

test("a radar reads values as a list or as pairs in any order", () => {
  const radar = parseRadar(lines(SAMPLES.radar!))!;

  expect(radar.curves.map(({ values }) => values)).toEqual([
    [1, 2, 3],
    [1, 2, 3],
  ]);
  expect(radar.max).toBe(3);
  expect(parseRadar(lines("radar-beta\n  axis a, b\n  curve x{1, 2}"))).toBeNull();
});

test("a sankey reads quoted fields, sets the sinks in the last column and refuses flows that loop", () => {
  expect(parseSankey(lines('sankey-beta\n\n"A, B",C,3'))!.links[0]).toEqual({ source: "A, B", target: "C", value: 3 });
  expect(parseSankey(lines("sankey-beta\nsource,target,value\nA,B,1"))!.links).toHaveLength(1);

  const rows = text(diagramText(SAMPLES.sankey!, CTX)!).split("\n");
  const column = (name: string) => rows.map((row) => row.indexOf(name)).find((at) => at >= 0)!;

  expect(column("D")).toBeGreaterThan(column("B"));
  expect(column("C")).toBe(column("D"));
});

test("a treemap sums a section from what it holds and keeps leaves in proportion", () => {
  const { lines: all, indents } = parts(SAMPLES.treemap!);
  const map = parseTreemap(all, indents)!;

  expect(map.items[0]!.value).toBe(45);
  expect(map.items[0]!.children.map(({ name, value }) => [name, value])).toEqual([
    ["A", 30],
    ["B", 15],
  ]);
});

test("a packet reads bits, ranges and counts after the last field, and keeps them end to end", () => {
  const packet = parsePacket(lines(SAMPLES.packet!))!;

  expect(packet.fields.map(({ start, end }) => [start, end])).toEqual([
    [0, 15],
    [16, 31],
    [32, 63],
  ]);
  expect(parsePacket(lines('packet\n  0-7: "a"\n  7-9: "overlap"'))).toBeNull();
});

test("a field that crosses a row is drawn on both rows", () => {
  const rows = text(diagramText('packet-beta\n  0-39: "Wide"', CTX)!);

  expect(rows.match(/Wide/g)).toHaveLength(2);
});

test("a block diagram reads columns, spans, spaces, nesting and arrows", () => {
  const block = parseBlock(
    lines('block-beta\n  columns 3\n  a b:2\n  space\n  block:g\n    c\n  end\n  a -- "x" --> b'),
  )!;

  expect(block.root.columns).toBe(3);
  expect(block.root.children.map(({ id, span, isSpace, isBlock }) => [id, span, isSpace, isBlock])).toEqual([
    ["a", 1, false, false],
    ["b", 2, false, false],
    ["", 1, true, false],
    ["g", 1, false, true],
  ]);
  expect(block.edges).toEqual([{ from: "a", to: "b", label: "x", hasStart: false }]);
  expect(parseBlock(lines("block-beta\n  a\n  end"))).toBeNull();
});

test("a git graph follows the branch each command acts on and joins merges to both parents", () => {
  const graph = parseGit(lines(SAMPLES.git!))!;

  expect(graph.branches.map(({ name }) => name)).toEqual(["main", "dev"]);
  expect(graph.commits.map(({ branch, kind, parents }) => [branch, kind, parents])).toEqual([
    [0, "normal", []],
    [1, "normal", [0]],
    [0, "merge", [0, 1]],
  ]);
  expect(graph.commits[2]!.tag).toBe("v1");
});

test("an architecture diagram reads groups, services, junctions and the sides an edge joins", () => {
  const diagram = parseArchitecture(lines(`${SAMPLES.architecture!}\n  junction j in g\n  b:B <--> T:j`))!;

  expect(diagram.groups).toEqual([{ id: "g", label: "G", parent: "" }]);
  expect(diagram.nodes.map(({ id, group, isJunction }) => [id, group, isJunction])).toEqual([
    ["a", "g", false],
    ["b", "g", false],
    ["j", "g", true],
  ]);
  expect(diagram.edges[1]).toMatchObject({
    from: "b",
    to: "j",
    fromSide: "B",
    toSide: "T",
    hasStart: true,
    hasEnd: true,
  });
});

test("an architecture diagram puts a service on the side its edge leaves from", () => {
  const rows = text(diagramText(SAMPLES.architecture!, CTX)!).split("\n");
  const row = rows.find((line) => line.includes("A") && line.includes("B"))!;

  expect(row.indexOf("A")).toBeLessThan(row.indexOf("B"));
});

test("a C4 diagram reads elements, boundaries, named arguments and relations", () => {
  const diagram = parseC4(
    lines(
      'C4Container\n  Person(u, "User")\n  System_Boundary(b, "Bank") {\n    Container(w, "Web", "React", $descr="The site")\n    ContainerDb_Ext(d, "Data", "SQL")\n  }\n  Rel(u, w, "Uses", "HTTPS")\n  BiRel(w, d, "Reads")',
    ),
  )!;

  expect(diagram.elements.map(({ id, chip, boundary }) => [id, chip, boundary])).toEqual([
    ["u", "[Person]", ""],
    ["w", "[Container: React]", "b"],
    ["d", "[External Container (Database): SQL]", "b"],
  ]);
  expect(diagram.elements[1]!.description).toBe("The site");
  expect(diagram.boundaries).toEqual([{ id: "b", label: "Bank", parent: "", order: 1 }]);
  expect(diagram.rels.map(({ label, hasStart }) => [label, hasStart])).toEqual([
    ["Uses [HTTPS]", false],
    ["Reads", true],
  ]);
});

test("a C4 diagram draws each relation as a line that ends in an arrow", () => {
  const rows = text(
    diagramText(
      'C4Context\n  Person(a, "A")\n  System(b, "B")\n  System(c, "C")\n  Rel(a, b, "x")\n  Rel(b, c, "y")',
      CTX,
    )!,
  );

  expect(rows.match(/[▸▾]/g)).toHaveLength(2);
});

test("a block arrow is a box that points the way it is told", () => {
  const rows = text(diagramText('block-beta\n  columns 1\n  a<["Go"]>(down)', CTX)!);

  expect(rows).toContain("Go");
  expect(rows).toContain("▾");
});

test("a C4 diagram with a boundary is a grid, with the boundary named on its border", () => {
  const rows = text(
    diagramText(
      'C4Context\n  Boundary(b, "Bank") {\n    System(s, "Core")\n    System(t, "Web")\n  }\n  Rel(s, t, "Calls")',
      CTX,
    )!,
  ).split("\n");

  expect(rows.find((row) => row.includes("Bank"))).toMatch(/^╭/);
  expect(rows.join("\n")).toContain("Calls");
});

test("a wide C4 diagram with no boundary is laid out as a grid rather than left as code", () => {
  const source = `C4Context\n${Array.from({ length: 8 }, (_, i) => `  System(s${i}, "System number ${i}", "Does a thing")`).join("\n")}`;

  expect(sceneOf(source, CTX)).not.toBeNull();
});
