export const escapeXml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Width of a string in pixels, close enough to lay a picture out without a renderer.
export function measure(text: string, size: number): number {
  return [...text].reduce((sum, char) => {
    if ("iljtf.,:;|!'` ".includes(char)) {
      return sum + size * 0.3;
    }

    if ("mwMW@%".includes(char)) {
      return sum + size * 0.82;
    }

    return sum + (char >= "A" && char <= "Z" ? size * 0.64 : size * 0.54);
  }, 0);
}

// Columns a string takes in a terminal: two for wide characters, none for combining marks.
export function cellWidth(text: string): number {
  return [...text].reduce((sum, char) => {
    const code = char.codePointAt(0)!;

    if ((code >= 0x300 && code <= 0x36f) || (code >= 0x200b && code <= 0x200f) || (code >= 0xfe00 && code <= 0xfe0f)) {
      return sum;
    }

    const isWide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1f64f) ||
      (code >= 0x1f900 && code <= 0x1f9ff) ||
      (code >= 0x20000 && code <= 0x3fffd);

    return sum + (isWide ? 2 : 1);
  }, 0);
}

type Widther = (text: string) => number;

function breakWord(word: string, width: number, widthOf: Widther): string[] {
  const pieces: string[] = [];
  let piece = "";

  for (const char of word) {
    if (piece !== "" && widthOf(piece + char) > width) {
      pieces.push(piece);
      piece = "";
    }

    piece += char;
  }

  return [...pieces, piece];
}

// The text as at most `maxLines` lines that fit `width` as `widthOf` measures it; past the cap the last line ends in an
// ellipsis.
export function wrapWith(text: string, width: number, maxLines: number, widthOf: Widther): string[] {
  const lines: string[] = [];
  let line = "";

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line === "" ? word : `${line} ${word}`;

    if (widthOf(candidate) <= width) {
      line = candidate;
      continue;
    }

    if (line !== "") {
      lines.push(line);
    }

    const pieces = widthOf(word) <= width ? [word] : breakWord(word, width, widthOf);
    lines.push(...pieces.slice(0, -1));
    line = pieces.at(-1) ?? "";
  }

  const all = line === "" ? lines : [...lines, line];

  if (all.length <= maxLines) {
    return all.length === 0 ? [""] : all;
  }

  return [...all.slice(0, maxLines - 1), ellipsize(all[maxLines - 1] ?? "", width, widthOf)];
}

function ellipsize(text: string, width: number, widthOf: Widther): string {
  const chars = [...text];

  while (chars.length > 0 && widthOf(`${chars.join("")}…`) > width) {
    chars.pop();
  }

  return `${chars.join("")}…`;
}

// The text cut to `width` columns with a trailing ellipsis, or whole where it fits.
export const clipCells = (text: string, width: number): string =>
  cellWidth(text) <= width ? text : ellipsize(text, width, cellWidth);

// The text as at most `maxLines` lines that fit `width` pixels at font size `size`.
export const wrap = (text: string, width: number, size: number, maxLines: number): string[] =>
  wrapWith(text, width, maxLines, (piece) => measure(piece, size));
