import { expect, test } from "claude-code/testing";

import {
  altOf,
  boxFor,
  imageSketch,
  imagesOf,
  pastedImagesOf,
  shrinkFactor,
  sizeOf,
  TREE_BYTES,
  treeBytes,
} from "../hooks/image";
import { CELL_WIDTH, cellHeightOf } from "../hooks/picture";
import { stub } from "./helpers";

const FONT = { family: "Helvetica Neue", cellHeight: cellHeightOf(2.9) };

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
const zeros = (count: number) => new Array<number>(count).fill(0);
const be16 = (value: number) => [value >> 8, value & 255];
const be32 = (value: number) => [...be16(value >>> 16), ...be16(value & 0xffff)];
const le16 = (value: number) => [value & 255, value >> 8];
const file = (...parts: number[][]) => btoa(String.fromCharCode(...parts.flat()));

const PNG = file([0x89], ascii("PNG\r\n\x1a\n"), be32(13), ascii("IHDR"), be32(800), be32(600), zeros(8));
const GIF = file(ascii("GIF89a"), le16(320), le16(200), zeros(8));
const JPEG = file([0xff, 0xd8], [0xff, 0xe0, 0, 4, 0, 0], [0xff, 0xc0, 0, 17, 8], be16(480), be16(640), zeros(8));
const WEBP_LOSSY = file(
  ascii("RIFF"),
  zeros(4),
  ascii("WEBP"),
  ascii("VP8 "),
  zeros(10),
  le16(640),
  le16(480),
  zeros(4),
);

test("an image file's size is read from its header", () => {
  expect(sizeOf(PNG, "image/png")).toEqual({ width: 800, height: 600 });
  expect(sizeOf(GIF, "image/gif")).toEqual({ width: 320, height: 200 });
  expect(sizeOf(JPEG, "image/jpeg")).toEqual({ width: 640, height: 480 });
  expect(sizeOf(WEBP_LOSSY, "image/webp")).toEqual({ width: 640, height: 480 });
  expect(sizeOf("not base64 !", "image/png")).toBeNull();
  expect(sizeOf(PNG, "image/bmp")).toBeNull();
});

test("a Read of an image and the image blocks of an MCP result are found, anything else is not", () => {
  const read = {
    tool_use_id: "r1",
    tool: "Read",
    output: {
      type: "image",
      file: { base64: PNG, type: "image/png", dimensions: { displayWidth: 400, displayHeight: 300 } },
    },
  };
  const mcp = {
    tool_use_id: "m1",
    tool: "mcp__browser__screenshot",
    output: [
      { type: "text", text: "ok" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } },
      { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } },
    ],
  };

  expect(imagesOf(read, "/work/shot.png")).toEqual([
    { id: "r1#0", base64: PNG, mediaType: "image/png", name: "shot.png", size: { width: 400, height: 300 } },
  ]);
  expect(imagesOf(mcp).map(({ id, name }) => [id, name])).toEqual([
    ["m1#0", "screenshot 1"],
    ["m1#1", "screenshot 2"],
  ]);
  expect(imagesOf({ tool_use_id: "b1", tool: "Bash", output: { stdout: "x" } })).toEqual([]);
  expect(imagesOf({ tool: "Read", output: read.output })).toEqual([]);
});

test("pasted images come from the latest message with the prompt's text", () => {
  const image = { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } };
  const messages = [
    { role: "user", content: [{ type: "text", text: "[Image #1] look" }, image] },
    { role: "assistant", content: [{ type: "text", text: "seen" }] },
    { role: "user", content: [{ type: "text", text: "[Image #2] again" }, image, image] },
  ];

  expect(pastedImagesOf(messages, "[Image #2] again", "u2")?.map(({ id, name }) => [id, name])).toEqual([
    ["u2#0", "Image 1"],
    ["u2#1", "Image 2"],
  ]);
  expect(pastedImagesOf(messages, "[Image #9] gone", "u9")).toBeNull();
});

test("a picture keeps its shape and fits the room and the height cap", () => {
  const cell = FONT.cellHeight;

  expect(boxFor({ width: 200, height: 100 }, 80, 20, cell)).toEqual({ columns: 10, rows: 2 });
  expect(boxFor({ width: 4000, height: 100 }, 60, 20, cell)).toEqual({ columns: 60, rows: 1 });
  expect(boxFor({ width: 1000, height: 4000 }, 80, 10, cell)).toEqual({ columns: 7, rows: 10 });
});

test("pictures that fit the tree budget keep their size, and larger ones scale each side down", () => {
  const picture = (bytes: number) => ({ png: "A".repeat(Math.ceil((bytes * 4) / 3)) });
  const half = Math.floor(TREE_BYTES / 2);

  expect(treeBytes([null, { png: "AAAA" }])).toBe(3);
  expect(shrinkFactor(treeBytes([picture(half), picture(half)]))).toBe(1);

  const factor = shrinkFactor(treeBytes([picture(2 * half), picture(2 * half)]));

  expect(factor).toBeLessThan(Math.sqrt(0.5));
  expect(factor).toBeGreaterThan(0.5);
});

test("a Read of an image keeps its row and names the image where the terminal has no pictures", async ($, on) => {
  stub(on);

  const ui = await $.ui.mount({
    plugin: "veneer",
    viewport: { columns: 100, rows: 30 },
    surface: "terminal",
    component: "ToolResult",
    requestId: "r1",
    props: {
      tool_use_id: "r1",
      tool: "Read",
      isErrored: false,
      output: {
        type: "image",
        file: { base64: PNG, type: "image/png", dimensions: { displayWidth: 400, displayHeight: 300 } },
      },
    },
  } as never);

  expect(await ui.find({ type: "Text", text: "image · 400×300" })).toBeDefined();
});

test("the sketch holds the image in a box of whole cells, and is null where the size is unknown", () => {
  const found = { id: "r1#0", base64: PNG, mediaType: "image/png", name: "shot.png" };
  const sketch = imageSketch(found, 100, 20, FONT.cellHeight, FONT);

  expect(sketch).not.toBeNull();
  expect(sketch!.svg).toContain(`href="data:image/png;base64,${PNG}"`);
  expect(sketch!.svg).toContain(`width="${sketch!.columns * CELL_WIDTH}"`);
  expect(sketch!.alt).toBe("shot.png · 800×600");
  expect(imageSketch({ ...found, id: "other", mediaType: "image/bmp" }, 100, 20, FONT.cellHeight, FONT)).toBeNull();
  expect(altOf(found, null)).toBe("shot.png");
});
