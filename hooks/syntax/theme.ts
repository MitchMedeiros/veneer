import type { ScopeNode } from "./engine";
import type { ThemeFile, ThemeRule, TokenStyle } from "./types";

export type ReadText = (path: string) => Promise<string | undefined>;

// How far `include` may chain before a theme is taken as a loop.
const MAX_INCLUDES = 8;

type Selector = { parents: string[]; leaf: string; index: number; settings: ThemeRule["settings"] };

// Strips comments and trailing commas, which VS Code theme files may hold and JSON does not allow.
export function parseJsonc(text: string): unknown {
  let clean = "";
  let i = 0;

  while (i < text.length) {
    const char = text[i] as string;

    if (char === '"') {
      let end = i + 1;

      while (end < text.length && text[end] !== '"') {
        end += text[end] === "\\" ? 2 : 1;
      }

      clean += text.slice(i, end + 1);
      i = end + 1;
    } else if (text.startsWith("//", i)) {
      i = text.indexOf("\n", i) === -1 ? text.length : text.indexOf("\n", i);
    } else if (text.startsWith("/*", i)) {
      i = text.indexOf("*/", i) === -1 ? text.length : text.indexOf("*/", i) + 2;
    } else {
      clean += char;
      i += 1;
    }
  }

  return JSON.parse(clean.replace(/,(\s*[}\]])/g, "$1"));
}

// A VS Code theme colour as `#rrggbb`, or undefined for anything else. A transparency suffix is dropped. Claude Code's
// own theme colours take other forms and are read in `palette.ts`.
export function colorOf(value: unknown): string | undefined {
  const found = typeof value === "string" ? /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value) : null;
  const digits = found?.[1]?.toLowerCase();

  if (digits === undefined) {
    return undefined;
  }

  return `#${digits.length <= 4 ? [...digits.slice(0, 3)].map((digit) => digit + digit).join("") : digits.slice(0, 6)}`;
}

const selectorsOf = (rule: ThemeRule, index: number): Selector[] => {
  const scopes = Array.isArray(rule.scope) ? rule.scope : (rule.scope ?? "").split(",");

  return scopes
    .map((scope) => scope.trim().split(/\s+/).filter(Boolean))
    .filter((parts) => parts.length > 0)
    .map((parts) => ({ parents: parts.slice(0, -1), leaf: parts.at(-1) as string, index, settings: rule.settings }));
};

// A scope matches a selector part when it is that scope or lies inside it: `string` matches `string.quoted`.
const within = (scope: string, part: string): boolean => scope === part || scope.startsWith(`${part}.`);

const parentsMatch = (parents: string[], ancestors: string[]): boolean => {
  let at = ancestors.length - 1;

  for (let i = parents.length - 1; i >= 0; i--) {
    while (at >= 0 && !within(ancestors[at] as string, parents[i] as string)) {
      at--;
    }

    if (at < 0) {
      return false;
    }

    at--;
  }

  return true;
};

const depthOf = (selector: Selector): number => selector.leaf.split(".").length;

const bySpecificity = (a: Selector, b: Selector): number =>
  depthOf(a) - depthOf(b) || a.parents.length - b.parents.length || a.index - b.index;

function applyFontStyle(style: TokenStyle, fontStyle: string): TokenStyle {
  const words = fontStyle.split(/\s+/);

  return {
    ...style,
    bold: words.includes("bold"),
    italic: words.includes("italic"),
    underline: words.includes("underline"),
    strikethrough: words.includes("strikethrough"),
  };
}

// A colour theme: what a scope path looks like. A scope takes the style of the scopes around it, then the rules that
// match it lay their settings over that, the more specific rule last.
export class Theme {
  private readonly selectors: Selector[];
  private readonly styles = new Map<ScopeNode, TokenStyle>();

  private readonly base: TokenStyle;

  constructor(rules: ThemeRule[], base: TokenStyle = {}) {
    this.selectors = rules.flatMap(selectorsOf);
    this.base = base;
  }

  styleOf(scope: ScopeNode): TokenStyle {
    const known = this.styles.get(scope);

    if (known !== undefined) {
      return known;
    }

    const outer = scope.parent === null ? this.base : this.styleOf(scope.parent);
    const ancestors = scope.path.slice(0, -1);
    const matching = this.selectors
      .filter((selector) => within(scope.name, selector.leaf) && parentsMatch(selector.parents, ancestors))
      .sort(bySpecificity);
    let style = outer;

    for (const { settings } of matching) {
      style = settings.fontStyle === undefined ? style : applyFontStyle(style, settings.fontStyle);
      style =
        settings.foreground === undefined ? style : { ...style, color: colorOf(settings.foreground) ?? style.color };
    }

    this.styles.set(scope, style);

    return style;
  }
}

// A path from a theme's `include`, made absolute against the theme's folder with `.` and `..` settled.
function resolvePath(directory: string, relative: string): string {
  const parts = (relative.startsWith("/") ? relative : `${directory}/${relative}`).split("/");
  const settled: string[] = [];

  for (const part of parts) {
    if (part === "..") {
      settled.pop();
    } else if (part !== "." && part !== "") {
      settled.push(part);
    }
  }

  return `/${settled.join("/")}`;
}

type Parsed = { rules: ThemeRule[]; foreground: string | undefined };

// A theme file and the files it includes. Rules of an included theme come first, so the including theme overrides them.
async function parseThemeFile(text: string, directory: string, read: ReadText, depth: number): Promise<Parsed | null> {
  let file: ThemeFile;

  try {
    file = parseJsonc(text) as ThemeFile;
  } catch {
    return null;
  }

  let inherited: Parsed = { rules: [], foreground: undefined };

  if (file.include !== undefined && depth < MAX_INCLUDES) {
    const path = resolvePath(directory, file.include);
    const included = await read(path);

    inherited =
      (included === undefined
        ? null
        : await parseThemeFile(included, path.slice(0, path.lastIndexOf("/")), read, depth + 1)) ?? inherited;
  }

  return {
    rules: [...inherited.rules, ...(file.tokenColors ?? [])],
    foreground: colorOf(file.colors?.["editor.foreground"]) ?? inherited.foreground,
  };
}

// Builds a theme from VS Code theme text. Relative `include` paths are read from `directory`.
export async function loadTheme(text: string, directory: string, read: ReadText): Promise<Theme | null> {
  const parsed = await parseThemeFile(text, directory, read, 0);

  return parsed === null ? null : new Theme(parsed.rules, { color: parsed.foreground });
}
