import { Registry, tokenizeLine } from "./engine";
import { loadTheme, Theme } from "./theme";
import type { Kind } from "./theme";
import type { ReadText } from "./theme";
import type { Grammar, GrammarIndex, LanguageEntry, StyledRun, TokenStyle } from "./types";

// Code past these limits draws plain: a long block costs a regex scan per line, and a minified line costs far more.
const MAX_LINES = 1500;
const MAX_LINE_LENGTH = 1000;
const MEMORY_BLOCKS = 200;

// Not `themes/`: Claude Code lists the files of that folder in `/theme` as themes of the plugin.
const DEFAULT_THEME = "syntax-themes/default.json";
const FALLBACK_THEMES = { dark: "syntax-themes/fallback-dark.json", light: "syntax-themes/fallback-light.json" };

// What highlighting needs from the engine, so it stays free of `$`.
export type SyntaxIo = {
  read: ReadText;
  // The plugin's folder, where `grammars/` and `syntax-themes/` live.
  root: string;
};

async function readJson<T>(io: SyntaxIo, path: string): Promise<T | undefined> {
  const text = await io.read(path);

  try {
    return text === undefined ? undefined : (JSON.parse(text) as T);
  } catch {
    return undefined;
  }
}

// The shipped language for a fence's language name, an alias of it, or a file extension.
function languageFor(index: GrammarIndex, hint: string): LanguageEntry | undefined {
  const wanted = hint.trim().split(/\s+/)[0]?.toLowerCase().replace(/^\./, "") ?? "";
  const entries = Object.entries(index.languages);

  return (
    index.languages[wanted] ??
    entries.find(([, entry]) => entry.aliases.includes(wanted))?.[1] ??
    entries.find(([, entry]) => entry.extensions.includes(wanted))?.[1]
  );
}

const sameStyle = (a: TokenStyle, b: TokenStyle): boolean =>
  a.color === b.color &&
  !a.bold === !b.bold &&
  !a.italic === !b.italic &&
  !a.underline === !b.underline &&
  !a.strikethrough === !b.strikethrough;

// What has been read from one plugin folder, kept for the life of the process: the grammar index, each grammar once it
// is needed, each theme, and the last blocks highlighted.
class Library {
  private readonly registry = new Registry();
  private readonly themes = new Map<string, Promise<Theme>>();
  private readonly grammars = new Map<string, Promise<Grammar | undefined>>();
  private readonly memory = new Map<string, StyledRun[][]>();
  private index: Promise<GrammarIndex | undefined> | undefined;

  async highlight(
    io: SyntaxIo,
    themePath: string,
    hint: string,
    lines: string[],
    code: string,
  ): Promise<StyledRun[][] | null> {
    this.index ??= readJson<GrammarIndex>(io, `${io.root}/grammars/index.json`);

    const index = await this.index;
    const language = index === undefined ? undefined : languageFor(index, hint);

    if (index === undefined || language === undefined) {
      return null;
    }

    const key = `${themePath}\n${language.scopeName}\n${code}`;
    const cached = this.memory.get(key);

    if (cached !== undefined) {
      return cached;
    }

    await this.load(io, index, language.scopeName);

    const runs = this.tokenize(language.scopeName, lines, await this.theme(io, themePath));

    if (runs !== null) {
      this.memory.set(key, runs);

      if (this.memory.size > MEMORY_BLOCKS) {
        this.memory.delete(this.memory.keys().next().value as string);
      }
    }

    return runs;
  }

  // Loads a grammar and, level by level, every grammar it includes. Grammars may include each other, so a grammar never
  // waits on the load of one it is itself needed by.
  private async load(io: SyntaxIo, index: GrammarIndex, scopeName: string): Promise<void> {
    const seen = new Set<string>();

    for (let level = [scopeName]; level.length > 0;) {
      const fresh = level.filter((scope) => !seen.has(scope));

      fresh.forEach((scope) => seen.add(scope));

      const grammars = await Promise.all(fresh.map((scope) => this.grammar(io, index, scope)));

      level = grammars.flatMap((grammar) => grammar?.deps ?? []);
    }
  }

  // A grammar file, read and added to the registry once.
  private grammar(io: SyntaxIo, index: GrammarIndex, scopeName: string): Promise<Grammar | undefined> {
    const file = index.scopes[scopeName];
    let loading = this.grammars.get(scopeName);

    if (file === undefined) {
      return Promise.resolve(undefined);
    }

    if (loading === undefined) {
      loading = readJson<Grammar>(io, `${io.root}/grammars/${file}`).then((grammar) => {
        if (grammar !== undefined) {
          this.registry.add(grammar);
        }

        return grammar;
      });
      this.grammars.set(scopeName, loading);
    }

    return loading;
  }

  // The theme at a path, or the shipped default when the path is empty or cannot be read as a theme.
  private theme(io: SyntaxIo, path: string): Promise<Theme> {
    let theme = this.themes.get(path);

    if (theme === undefined) {
      const fromFile = async (file: string, fallbacks?: Record<Kind, string>): Promise<Theme | null> => {
        const text = await io.read(file);

        return text === undefined ? null : loadTheme(text, file.slice(0, file.lastIndexOf("/")), io.read, fallbacks);
      };
      const fallbacks = { dark: `${io.root}/${FALLBACK_THEMES.dark}`, light: `${io.root}/${FALLBACK_THEMES.light}` };

      theme = (async () =>
        (path === "" ? null : await fromFile(path, fallbacks)) ??
        (await fromFile(`${io.root}/${DEFAULT_THEME}`)) ??
        new Theme([]))();
      this.themes.set(path, theme);
    }

    return theme;
  }

  async background(io: SyntaxIo, themePath: string): Promise<string | undefined> {
    return (await this.theme(io, themePath)).background;
  }

  async swatch(io: SyntaxIo, themePath: string): Promise<string[]> {
    return (await this.theme(io, themePath)).swatch();
  }

  private tokenize(scopeName: string, lines: string[], theme: Theme): StyledRun[][] | null {
    let state = this.registry.initialState(scopeName);

    if (state === undefined) {
      return null;
    }

    return lines.map((line, row) => {
      const result = tokenizeLine(line, state as NonNullable<typeof state>, row === 0);
      const runs: StyledRun[] = [];

      state = result.state;

      for (const token of result.tokens) {
        const style = theme.styleOf(token.scope);
        const previous = runs.at(-1);
        const text = line.slice(token.start, token.end);

        if (previous !== undefined && sameStyle(previous, style)) {
          previous.text += text;
        } else {
          runs.push({ text, ...style });
        }
      }

      return runs;
    });
  }
}

const libraries = new Map<string, Library>();

const libraryOf = (io: SyntaxIo): Library => {
  let library = libraries.get(io.root);

  if (library === undefined) {
    library = new Library();
    libraries.set(io.root, library);
  }

  return library;
};

// The colours a theme gives a few common kinds of code, or none when it cannot be read.
export async function themeSwatch(io: SyntaxIo, themePath: string): Promise<string[]> {
  try {
    return await libraryOf(io).swatch(io, themePath);
  } catch {
    return [];
  }
}

// The fill a theme sets behind code, or undefined when it sets none or cannot be read.
export async function themeBackground(io: SyntaxIo, themePath: string): Promise<string | undefined> {
  try {
    return await libraryOf(io).background(io, themePath);
  } catch {
    return undefined;
  }
}

// The code as styled runs, one list per line, or null when it should draw plain: no grammar for the language, too much
// code, or a grammar that failed. `themePath` names a VS Code theme file; empty uses the shipped default.
export async function highlight(
  io: SyntaxIo,
  themePath: string,
  hint: string,
  code: string,
): Promise<StyledRun[][] | null> {
  const lines = code.split("\n");

  if (hint.trim() === "" || lines.length > MAX_LINES || lines.some((line) => line.length > MAX_LINE_LENGTH)) {
    return null;
  }

  try {
    return await libraryOf(io).highlight(io, themePath, hint, lines, code);
  } catch {
    return null;
  }
}
