import { expect, test } from "claude-code/testing";

import { headingSketch } from "../hooks/heading";
import { hasDrawn, splitReply } from "../hooks/markdown";
import { baseOf } from "../hooks/palette";
import { CELL_WIDTH, cellHeightOf, hashOf, pictureFor, rasterize, rowsFor } from "../hooks/picture";
import type { PictureIo } from "../hooks/picture";
import { fitColumns, tableSketch } from "../hooks/table";
import { wrap } from "../hooks/svg-text";

const PALETTE = baseOf("dark");
const FONT = { family: "Helvetica Neue", cellHeight: cellHeightOf(2.9) };

// A 1x1 PNG.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const TABLE = "| Name | Notes |\n|:--|--:|\n| a | one |\n| b | two |\n";

test("tables, headings and code fences split out of a reply, and a fence keeps what is inside it", () => {
  const segments = splitReply(
    `# Title\n\nintro\n\n${TABLE}\n\nafter\n\n\`\`\`md\n# not a heading\n| x | y |\n|---|---|\n\`\`\``,
  );

  expect(segments.map((segment) => segment.kind)).toEqual(["heading", "text", "table", "text", "code"]);
  expect(segments.at(-1)).toMatchObject({ kind: "code", lang: "md", code: "# not a heading\n| x | y |\n|---|---|" });
  expect(hasDrawn(splitReply("plain text only"))).toBe(false);
});

test("a heading or table still at the end of streaming text stays text", () => {
  expect(hasDrawn(splitReply("intro\n\n## Partial hea"))).toBe(false);
  expect(hasDrawn(splitReply("intro\n\n## Done\n"))).toBe(true);
  expect(hasDrawn(splitReply(TABLE.trimEnd()))).toBe(false);
  expect(hasDrawn(splitReply(`${TABLE.trimEnd()}\n\nafter`))).toBe(true);
});

test("a fence still open stays text with everything after it, and an indented fence is dedented", () => {
  expect(splitReply("intro\n\n```py\nprint(1)\n\n## later").map((segment) => segment.kind)).toEqual(["text"]);
  expect(splitReply("- item\n\n  ```sh\n  ls\n    -la\n  ```\n")[1]).toMatchObject({
    kind: "code",
    lang: "sh",
    code: "ls\n  -la",
  });
  expect(splitReply("````md\n```js\nx\n```\n````\n")[0]).toMatchObject({ kind: "code", code: "```js\nx\n```" });
});

test("a table keeps its alignment, pads short rows and drops inline marks", () => {
  const [table] = splitReply("| **A** | `B` |\n|:-:|--:|\n| 1 |\n");

  expect(table).toMatchObject({ kind: "table", header: ["A", "B"], align: ["center", "right"], rows: [["1", ""]] });
});

test("a table picture spans whole rows: a header and each body row take two", () => {
  const [table] = splitReply(TABLE);
  const sketch = tableSketch(table as never, 100, PALETTE, FONT);

  expect(sketch.rows).toBe(6);
  expect(sketch.svg).toContain(`height="${6 * FONT.cellHeight}"`);
  expect(sketch.columns).toBeLessThanOrEqual(100);
});

test("a wide table wraps into the room it has instead of overflowing", () => {
  const cell = "word ".repeat(60).trim();
  const [table] = splitReply(`| A | B |\n|---|---|\n| ${cell} | ${cell} |\n`);
  const sketch = tableSketch(table as never, 40, PALETTE, FONT);

  expect(sketch.columns).toBe(40);
  expect(sketch.rows).toBeGreaterThan(2);
});

test("columns that fit keep their width and the rest share what is left", () => {
  expect(fitColumns([100, 100], 300)).toEqual([100, 100]);
  expect(fitColumns([60, 600], 400).reduce((sum, w) => sum + w, 0)).toBeLessThanOrEqual(400);
});

test("a heading is one row and never wider than the room", () => {
  const [heading] = splitReply("## A very long heading ".repeat(1));
  const sketch = headingSketch(heading as never, 10, PALETTE, FONT);

  expect(sketch.rows).toBe(1);
  expect(sketch.columns).toBeLessThanOrEqual(10);
});

test("wrap ends the last line in an ellipsis past the cap", () => {
  const lines = wrap("alpha beta gamma delta epsilon zeta", 120, 30, 2);

  expect(lines).toHaveLength(2);
  expect(lines[1]).toMatch(/…$/);
});

test("picture sizing and hashing", () => {
  expect(rowsFor(1, 58)).toBe(1);
  expect(rowsFor(59, 58)).toBe(2);
  expect(cellHeightOf(2.9)).toBe(Math.round(CELL_WIDTH * 2.9));
  expect(hashOf("a")).toBe(hashOf("a"));
  expect(hashOf("a")).not.toBe(hashOf("b"));
});

test("a picture is drawn once, then served from disk and from memory", async () => {
  const files = new Map<string, string>();
  let draws = 0;
  const io: PictureIo = {
    run: async (argv) => {
      if (argv[0] === "mv") {
        files.set(argv[2]!, files.get(argv[1]!)!);
      } else {
        draws++;
        files.set(argv.at(-1)!, PNG);
      }

      return true;
    },
    readBase64: async (path) => files.get(path),
  };
  const sketch = { svg: '<svg id="once"/>', columns: 4, rows: 1, alt: "x" };

  const first = await rasterize(io, "/cache", sketch, FONT);
  const again = await rasterize(io, "/cache", sketch, FONT);
  const elsewhere = await rasterize(
    { ...io, run: async () => false },
    "/cache",
    { ...sketch, svg: '<svg id="once"/>' },
    FONT,
  );

  expect(first).toEqual({ png: PNG, columns: 4, rows: 1, alt: "x" });
  expect(again).toBe(first);
  expect(elsewhere).toBe(first);
  expect(draws).toBe(1);
});

test("a repeat of the same inputs builds no sketch, and calls that overlap share one draw", async () => {
  let draws = 0;
  let builds = 0;
  const io: PictureIo = {
    run: async (argv) => {
      draws += argv[0] === "resvg" ? 1 : 0;
      return true;
    },
    readBase64: async (path) => (path.endsWith(".tmp") || draws > 0 ? PNG : undefined),
  };
  const build = () => {
    builds++;
    return { svg: '<svg id="inputs"/>', columns: 4, rows: 1, alt: "x" };
  };

  const [first, overlapping] = await Promise.all([
    pictureFor(io, "/cache", "inputs-a", build, FONT),
    pictureFor(io, "/cache", "inputs-a", build, FONT),
  ]);
  const again = await pictureFor(io, "/cache", "inputs-a", build, FONT);

  expect(overlapping).toBe(first);
  expect(again).toBe(first);
  expect(builds).toBe(1);
  expect(draws).toBe(1);
});

test("no picture when resvg fails", async () => {
  const io: PictureIo = { run: async () => false, readBase64: async () => undefined };

  expect(await rasterize(io, "/cache", { svg: '<svg id="fails"/>', columns: 4, rows: 1, alt: "x" }, FONT)).toBeNull();
});
