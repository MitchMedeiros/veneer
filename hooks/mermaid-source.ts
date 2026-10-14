// The lines of a Mermaid source that say something: trimmed, without blanks and comments.
export const sourceLines = (source: string): string[] =>
  source
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("%%"));

// Text on one line, with `<br>` and runs of spaces turned into single spaces.
export const plain = (text: string): string =>
  text
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

export const unquote = (text: string): string => plain(text.trim().replace(/^"(.*)"$/s, "$1"));
