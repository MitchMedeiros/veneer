// The lines of a Mermaid source that say something: trimmed, without blanks and comments.
export const sourceLines = (source: string): string[] =>
  source
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("%%"));

// The same lines with how far each was indented, a tab counting as four spaces, for the kinds that nest by indentation.
export function indentedLines(source: string): { lines: string[]; indents: number[] } {
  const rows = source
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => ({
      text: line.trim(),
      indent: [...line.slice(0, line.length - line.trimStart().length)].reduce(
        (n, char) => n + (char === "\t" ? 4 : 1),
        0,
      ),
    }))
    .filter(({ text }) => text !== "" && !text.startsWith("%%"));

  return { lines: rows.map(({ text }) => text), indents: rows.map(({ indent }) => indent) };
}

// Text on one line, with `<br>` and runs of spaces turned into single spaces.
export const plain = (text: string): string =>
  text
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

export const unquote = (text: string): string => plain(text.trim().replace(/^"(.*)"$/s, "$1"));

// A source split into the title of its leading `---` frontmatter, if it has one, and the diagram after it.
export function frontmatterOf(source: string): { title: string; body: string } {
  const lines = source.replace(/\r/g, "").split("\n");

  if (lines[0]?.trim() !== "---") {
    return { title: "", body: source };
  }

  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");

  if (end === -1) {
    return { title: "", body: source };
  }

  const title = lines
    .slice(1, end)
    .map((line) => /^title\s*:\s*(.*)$/.exec(line.trim())?.[1])
    .find((text) => text !== undefined);

  return { title: unquote(title ?? ""), body: lines.slice(end + 1).join("\n") };
}

// The title a `title ...` line gives, or null for any other line.
export const titleOf = (line: string): string | null => {
  const match = /^title(?:\s+(.*))?$/i.exec(line);

  return match === null ? null : unquote(match[1] ?? "");
};

// A finite number written in full, or null.
export const numberOf = (text: string): number | null => {
  const value = Number(text.trim());

  return text.trim() !== "" && Number.isFinite(value) ? value : null;
};

// The items of a comma separated list, commas inside double quotes kept, each without its quotes.
export function listOf(text: string): string[] {
  if (text.trim() === "") {
    return [];
  }

  const items: string[] = [];
  let item = "";
  let isQuoted = false;

  for (const char of text) {
    if (char === '"') {
      isQuoted = !isQuoted;
    }

    if (char === "," && !isQuoted) {
      items.push(item);
      item = "";
    } else {
      item += char;
    }
  }

  return [...items, item].map(unquote);
}
