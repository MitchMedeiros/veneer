import { CELL_WIDTH, MAX_CELLS, svgDocument } from "./picture";
import type { Font, Sketch } from "./picture";
import { escapeXml } from "./svg-text";

// An image a tool call returned or a prompt carried: an id unique in the session, its bytes as the model saw them, the
// MIME type and a name to show. `size` is known up front when the tool reported it.
export type Found = {
  id: string;
  base64: string;
  mediaType: string;
  name: string;
  size?: Size;
};

export type Size = { width: number; height: number };

// The marker a prompt's text holds in place of each image pasted into it.
export const PASTED_MARKER = "[Image #";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// The image a Messages API block holds, or nothing for any other block.
function ofBlock(block: unknown, id: string, name: string): Found[] {
  if (!isRecord(block) || block.type !== "image" || !isRecord(block.source)) {
    return [];
  }

  const { type, media_type: mediaType, data } = block.source;

  return type === "base64" && typeof mediaType === "string" && typeof data === "string"
    ? [{ id, base64: data, mediaType, name }]
    : [];
}

const baseName = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

function ofRead(id: string, path: string | undefined, output: unknown): Found[] {
  if (!isRecord(output) || output.type !== "image" || !isRecord(output.file)) {
    return [];
  }

  const { base64, type, dimensions } = output.file;

  if (typeof base64 !== "string" || typeof type !== "string") {
    return [];
  }

  const width = isRecord(dimensions) ? Number(dimensions.displayWidth) : NaN;
  const height = isRecord(dimensions) ? Number(dimensions.displayHeight) : NaN;

  return [
    {
      id: `${id}#0`,
      base64,
      mediaType: type,
      name: path === undefined ? "image" : baseName(path),
      size: width > 0 && height > 0 ? { width, height } : undefined,
    },
  ];
}

// The blocks of an MCP result: the list itself, or the `content` of a result object.
const blocksOf = (output: unknown): unknown[] =>
  Array.isArray(output) ? output : isRecord(output) && Array.isArray(output.content) ? output.content : [];

function ofMcp(id: string, tool: string, output: unknown): Found[] {
  const images = blocksOf(output).filter((block) => isRecord(block) && block.type === "image");
  const name = tool.slice(tool.lastIndexOf("__") + 2);

  return images.flatMap((block, at) => ofBlock(block, `${id}#${at}`, images.length > 1 ? `${name} ${at + 1}` : name));
}

// The images a finished tool call returned: a Read of an image file, or the image blocks of an MCP tool's result.
export function imagesOf(call: { tool_use_id?: string; tool: string; output?: unknown }, path?: string): Found[] {
  const { tool_use_id: id, tool, output } = call;

  if (id === undefined) {
    return [];
  }

  if (tool === "Read") {
    return ofRead(id, path, output);
  }

  return tool.startsWith("mcp__") ? ofMcp(id, tool, output) : [];
}

// The images pasted into a prompt, from the conversation as the model reads it: those of the latest user message whose
// text is the prompt's. A prompt row carries only its text, and the `[Image #n]` markers in it are numbered through the
// session, so the text names its message. Null when no message holds the text, as before it is stored or after a
// compaction dropped it.
export function pastedImagesOf(
  messages: ReadonlyArray<{ role: string; content: ReadonlyArray<unknown> }>,
  text: string,
  id: string,
): Found[] | null {
  const message = messages.findLast(
    ({ role, content }) =>
      role === "user" && content.some((block) => isRecord(block) && block.type === "text" && block.text === text),
  );

  if (message === undefined) {
    return null;
  }

  const images = message.content.filter((block) => isRecord(block) && block.type === "image");

  return images.flatMap((block, at) => ofBlock(block, `${id}#${at}`, `Image ${at + 1}`));
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

// An image file's size in pixels, read from its header; null for a format not known here or a header cut short.
export function sizeOf(base64: string, mediaType: string): Size | null {
  try {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const at = (index: number) => bytes[index] ?? 0;
    const big = (index: number) => (at(index) << 8) | at(index + 1);
    const little = (index: number) => at(index) | (at(index + 1) << 8);

    if (mediaType === "image/png" && PNG_SIGNATURE.every((byte, i) => at(i) === byte)) {
      return { width: (big(16) << 16) | big(18), height: (big(20) << 16) | big(22) };
    }

    if (mediaType === "image/gif") {
      return { width: little(6), height: little(8) };
    }

    if (mediaType === "image/jpeg") {
      return jpegSize(bytes);
    }

    return mediaType === "image/webp" ? webpSize(bytes) : null;
  } catch {
    return null;
  }
}

// The frame header of a JPEG: the first start-of-frame marker holds the height and then the width.
function jpegSize(bytes: Uint8Array): Size | null {
  const at = (index: number) => bytes[index] ?? 0;

  for (let i = 2; i + 9 < bytes.length;) {
    if (at(i) !== 0xff) {
      i++;
      continue;
    }

    const marker = at(i + 1);

    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (at(i + 5) << 8) | at(i + 6), width: (at(i + 7) << 8) | at(i + 8) };
    }

    i += marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9) ? 2 : 2 + ((at(i + 2) << 8) | at(i + 3));
  }

  return null;
}

// The first chunk of a WebP file says its size in one of three layouts: lossy, lossless or extended.
function webpSize(bytes: Uint8Array): Size | null {
  const at = (index: number) => bytes[index] ?? 0;
  const tag = String.fromCharCode(at(12), at(13), at(14), at(15));

  if (tag === "VP8 ") {
    return { width: (at(26) | (at(27) << 8)) & 0x3fff, height: (at(28) | (at(29) << 8)) & 0x3fff };
  }

  if (tag === "VP8L") {
    return {
      width: 1 + (((at(22) & 0x3f) << 8) | at(21)),
      height: 1 + (((at(24) & 0x0f) << 10) | (at(23) << 2) | ((at(22) & 0xc0) >> 6)),
    };
  }

  return tag === "VP8X"
    ? {
        width: 1 + (at(24) | (at(25) << 8) | (at(26) << 16)),
        height: 1 + (at(27) | (at(28) << 8) | (at(29) << 16)),
      }
    : null;
}

// The cells a picture takes: its own size at 20 pixels a column, never wider than the room or taller than `maxRows`,
// with its shape kept.
export function boxFor(size: Size, available: number, maxRows: number, cellHeight: number) {
  const tallest = Math.min(MAX_CELLS, maxRows);
  let columns = Math.max(1, Math.min(available, Math.ceil(size.width / CELL_WIDTH)));
  let rows = Math.ceil((columns * CELL_WIDTH * (size.height / size.width)) / cellHeight);

  if (rows > tallest) {
    rows = tallest;
    columns = Math.max(1, Math.min(columns, Math.floor((rows * cellHeight * (size.width / size.height)) / CELL_WIDTH)));
  }

  return { columns, rows: Math.max(1, rows) };
}

// What the engine takes of the pictures in one tree, a little under its 2 MiB, so the PNGs of a row or a group share it.
export const TREE_BYTES = 1.9 * 1024 * 1024;

const SHRINK_MARGIN = 0.95;

// The bytes of a base64 string once decoded.
const bytesOf = (base64: string): number => Math.floor((base64.length * 3) / 4);

// The bytes the pictures of one tree come to; a picture that could not be drawn counts nothing.
export const treeBytes = (pictures: ReadonlyArray<{ png: string } | null>): number =>
  pictures.reduce((sum, picture) => sum + (picture === null ? 0 : bytesOf(picture.png)), 0);

// The scale for each side of a tree's pictures so that they fit the budget, 1 when they already do. A PNG's size follows
// its pixel count, so a side scales with the square root of the overflow, less a margin for art that compresses worse
// when it is smaller.
export const shrinkFactor = (bytes: number): number =>
  bytes <= TREE_BYTES ? 1 : Math.sqrt(TREE_BYTES / bytes) * SHRINK_MARGIN;

const MEMORY_SIZES = 200;
const sizes = new Map<string, Size | null>();

// The size of an image: as the tool reported it, or read once from its header.
export function sizeOfFound(found: Found): Size | null {
  if (found.size !== undefined) {
    return found.size;
  }

  const known = sizes.get(found.id);

  if (known !== undefined) {
    return known;
  }

  const size = sizeOf(found.base64, found.mediaType);

  sizes.set(found.id, size);

  if (sizes.size > MEMORY_SIZES) {
    sizes.delete(sizes.keys().next().value as string);
  }

  return size;
}

// What the picture says where it cannot be drawn.
export const altOf = ({ name }: Found, size: Size | null | undefined): string =>
  size === null || size === undefined ? name : `${name} · ${size.width}×${size.height}`;

// An SVG that holds the image inside the box of cells, shrunk to fit and centred, for `resvg` to decode and scale. Null
// where the size is unknown.
export function imageSketch(
  found: Found,
  available: number,
  maxRows: number,
  cellHeight: number,
  font: Font,
): Sketch | null {
  const size = sizeOfFound(found);

  if (size === null || size.width < 1 || size.height < 1) {
    return null;
  }

  const { columns, rows } = boxFor(size, available, maxRows, cellHeight);
  const width = columns * CELL_WIDTH;
  const height = rows * cellHeight;
  const image =
    `<image x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" ` +
    `href="data:${escapeXml(found.mediaType)};base64,${found.base64}"/>`;

  return { svg: svgDocument(columns, rows, cellHeight, font.family, image), columns, rows, alt: altOf(found, size) };
}
