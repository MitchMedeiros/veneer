import { parseJsonc, parseThemeFile, resolvePath } from "./syntax/theme.ts";
import type { ReadText } from "./syntax/theme.ts";

export const OPEN_VSX_ORIGIN = "https://open-vsx.org";
const WEB_RESOURCES = "Microsoft.VisualStudio.Code.WebResources";

// How many rows a page of choices holds.
export const PAGE_SIZE = 10;

export type ExtensionId = { publisher: string; name: string };

// One color theme an extension contributes: its label and the path of its file inside the extension.
export type ThemeChoice = { label: string; path: string };

const EXTENSION_URL = /^https?:\/\/(?:www\.)?open-vsx\.org\/extension\/([\w-]+)\/([\w.-]+)/i;
const EXTENSION_ID = /^([\w-]+)\.([\w][\w.-]*)$/;

// The extension a person named: `publisher.name`, or the address of its page on Open VSX. A file name is not one.
export function parseExtensionId(input: string): ExtensionId | undefined {
  const text = input.trim();
  const found = EXTENSION_URL.exec(text) ?? (/\.jsonc?$/i.test(text) ? null : EXTENSION_ID.exec(text));

  return found?.[1] === undefined || found[2] === undefined ? undefined : { publisher: found[1], name: found[2] };
}

// Where a file of an extension's latest version is served. The `/api/.../file/` address only serves a few files of the
// package, such as `package.json` and the readme, while this one serves every file the way a web editor reads them.
export function fileUrl({ publisher, name }: ExtensionId, path: string): string {
  const inside = resolvePath("", path).slice(1).split("/").map(encodeURIComponent).join("/");

  return `${OPEN_VSX_ORIGIN}/vscode/asset/${encodeURIComponent(publisher)}/${encodeURIComponent(name)}/latest/${WEB_RESOURCES}/extension/${inside}`;
}

// The text a `%key%` label stands for in a `package.nls.json`.
function translated(label: string, strings: unknown): string {
  const key = /^%(.+)%$/.exec(label)?.[1];
  const entry = key === undefined ? undefined : (strings as Record<string, unknown> | null)?.[key];
  const message = typeof entry === "object" && entry !== null ? (entry as { message?: unknown }).message : entry;

  return typeof message === "string" ? message : label;
}

// The color themes an extension's `package.json` contributes. `nls` is its `package.nls.json` when labels need it.
export function themesOf(manifest: string, nls?: string): ThemeChoice[] {
  let themes: unknown;
  let strings: unknown;

  try {
    themes = (parseJsonc(manifest) as { contributes?: { themes?: unknown } } | null)?.contributes?.themes;
    strings = nls === undefined ? undefined : parseJsonc(nls);
  } catch {
    return [];
  }

  return (Array.isArray(themes) ? themes : []).flatMap((theme: { label?: unknown; id?: unknown; path?: unknown }) => {
    const label = typeof theme.label === "string" ? theme.label : theme.id;

    return typeof label === "string" && typeof theme.path === "string"
      ? [{ label: translated(label, strings), path: theme.path }]
      : [];
  });
}

// Whether a manifest's labels point at a `package.nls.json`.
export const needsStrings = (choices: readonly ThemeChoice[]): boolean =>
  choices.some(({ label }) => /^%.+%$/.test(label));

// A theme file with the files it includes folded in, as one file that needs nothing beside it. `read` takes a path from
// the extension's root. Undefined when the text is not a theme.
export async function flattenTheme(text: string, themePath: string, read: ReadText): Promise<string | undefined> {
  const full = resolvePath("", themePath);
  const parsed = await parseThemeFile(text, full.slice(0, full.lastIndexOf("/")), read, 0);

  return parsed === null
    ? undefined
    : JSON.stringify({
        colors: { "editor.background": parsed.background, "editor.foreground": parsed.foreground },
        tokenColors: parsed.rules,
      });
}

// One page of a list, counting from zero, with the page clamped to the list.
export function pageOf<T>(items: readonly T[], page: number): { rows: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const at = Math.min(Math.max(page, 0), pages - 1);

  return { rows: items.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE), page: at, pages };
}
