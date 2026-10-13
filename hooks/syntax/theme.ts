import { ROOT_SCOPE } from "./engine.ts";
import type { ScopeNode } from "./engine";
import type { ThemeFile, ThemeRule, TokenStyle } from "./types";

export type ReadText = (path: string) => Promise<string | undefined>;

// How far `include` may chain before a theme is taken as a loop.
const MAX_INCLUDES = 8;

const SWATCH_SCOPES = ["keyword.control", "entity.name.function", "string.quoted", "constant.numeric", "comment.line"];

type Path = { parents: string[]; leaf: string };

type Selector = Path & { excluded: Path[]; index: number; settings: ThemeRule["settings"] };

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

// A theme colour as `#rrggbb`, or as a bare terminal colour name for `ansi:<name>` (the terminal's own palette), or
// undefined for anything else. A transparency suffix is dropped. Claude Code's own theme colours take other forms and
// are read in `palette.ts`.
export function colorOf(value: unknown): string | undefined {
  const named =
    typeof value === "string"
      ? /^ansi:((?:black|red|green|yellow|blue|magenta|cyan|white)(?:Bright)?|gray)$/.exec(value)
      : null;

  if (named !== null) {
    return named[1];
  }

  const found = typeof value === "string" ? /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value) : null;
  const digits = found?.[1]?.toLowerCase();

  if (digits === undefined) {
    return undefined;
  }

  return `#${digits.length <= 4 ? [...digits.slice(0, 3)].map((digit) => digit + digit).join("") : digits.slice(0, 6)}`;
}

const pathOf = (text: string): Path | undefined => {
  const parts = text.trim().split(/\s+/).filter(Boolean);

  return parts.length === 0 ? undefined : { parents: parts.slice(0, -1), leaf: parts.at(-1) as string };
};

// A selector reads `a b - c - d`: the scope path `a b`, except where `c` or `d` also match.
const selectorsOf = (rule: ThemeRule, index: number): Selector[] => {
  const scopes = Array.isArray(rule.scope) ? rule.scope : (rule.scope ?? "").split(",");

  return scopes.flatMap((scope) => {
    const [included = "", ...excluded] = scope.split(/(?:^|\s)-(?:\s|$)/);
    const path = pathOf(included);

    return path === undefined
      ? []
      : [
          {
            ...path,
            excluded: excluded.map(pathOf).filter((found) => found !== undefined),
            index,
            settings: rule.settings,
          },
        ];
  });
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

// An excluded path applies wherever in the scope path it matches, not only at the innermost scope.
const occursIn = ({ parents, leaf }: Path, path: string[]): boolean =>
  path.some((name, at) => within(name, leaf) && parentsMatch(parents, path.slice(0, at)));

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

  // The fill behind code, from the theme's `editor.background`; undefined when the theme sets none.
  readonly background: string | undefined;

  constructor(rules: ThemeRule[], base: TokenStyle = {}, background?: string) {
    this.selectors = rules.flatMap(selectorsOf);
    this.base = base;
    this.background = background;
  }

  // The colours the theme gives a keyword, a string, a function, a number and a comment: a glance at the theme.
  swatch(): string[] {
    return SWATCH_SCOPES.flatMap((name) => {
      const color = this.styleOf(ROOT_SCOPE.push(name)).color;

      return color === undefined ? [] : [color];
    });
  }

  styleOf(scope: ScopeNode): TokenStyle {
    const known = this.styles.get(scope);

    if (known !== undefined) {
      return known;
    }

    const outer = scope.parent === null ? this.base : this.styleOf(scope.parent);
    const ancestors = scope.path.slice(0, -1);
    const matching = this.selectors
      .filter(
        (selector) =>
          within(scope.name, selector.leaf) &&
          parentsMatch(selector.parents, ancestors) &&
          !selector.excluded.some((path) => occursIn(path, scope.path)),
      )
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
export function resolvePath(directory: string, relative: string): string {
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

export type Kind = "dark" | "light";

export type Parsed = {
  rules: ThemeRule[];
  foreground: string | undefined;
  background: string | undefined;
  kind: Kind | undefined;
};

const kindOf = (type: string | undefined): Kind | undefined => {
  if (type === "light" || type === "hc-light") {
    return "light";
  }

  return type === "dark" || type === "hc" || type === "hc-black" ? "dark" : undefined;
};

// Whether a theme is light: by its own `type`, else by how bright its background is, else dark.
const kindFor = (parsed: Parsed): Kind => {
  const hex = parsed.background?.startsWith("#") ? parsed.background.slice(1) : undefined;

  if (parsed.kind !== undefined || hex === undefined || hex.length !== 6) {
    return parsed.kind ?? "dark";
  }

  const [red, green, blue] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16));

  return 0.299 * (red as number) + 0.587 * (green as number) + 0.114 * (blue as number) > 128 ? "light" : "dark";
};

// A theme file and the files it includes. Rules of an included theme come first, so the including theme overrides them.
export async function parseThemeFile(
  text: string,
  directory: string,
  read: ReadText,
  depth: number,
): Promise<Parsed | null> {
  let file: ThemeFile;

  try {
    file = parseJsonc(text) as ThemeFile;
  } catch {
    return null;
  }

  let inherited: Parsed = { rules: [], foreground: undefined, background: undefined, kind: undefined };

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
    background: colorOf(file.colors?.["editor.background"]) ?? inherited.background,
    kind: kindOf(file.type) ?? inherited.kind,
  };
}

// Builds a theme from VS Code theme text. Relative `include` paths are read from `directory`. Where `fallbacks` name a
// dark and a light theme file, its rules sit under the theme's own, so a scope the theme leaves out takes the colour
// VS Code would give it.
export async function loadTheme(
  text: string,
  directory: string,
  read: ReadText,
  fallbacks?: Record<Kind, string>,
): Promise<Theme | null> {
  const parsed = await parseThemeFile(text, directory, read, 0);

  if (parsed === null) {
    return null;
  }

  const fallback = fallbacks === undefined ? undefined : await read(fallbacks[kindFor(parsed)]);
  const under = fallback === undefined ? [] : ((parseJsonc(fallback) as ThemeFile).tokenColors ?? []);

  return new Theme([...under, ...parsed.rules], { color: parsed.foreground }, parsed.background);
}
