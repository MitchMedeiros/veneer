import { parseJsonc } from "./syntax/theme.ts";

export const THEME_EXTENSION = ".json";

const FALLBACK_NAME = "theme";

// Claude Code's configuration folder: `CLAUDE_CONFIG_DIR` where set, else `.claude` in the home folder.
export function configDirOf(configDir: string | undefined, home: string | undefined): string | undefined {
  const custom = configDir?.trim().replace(/\/+$/, "");

  if (custom !== undefined && custom !== "") {
    return custom;
  }

  return home === undefined || home === "" ? undefined : `${home.replace(/\/+$/, "")}/.claude`;
}

export const themesDirOf = (configDir: string): string => `${configDir}/veneer/themes`;

// A path a person typed, with a leading `~/` made absolute.
export const expandHome = (path: string, home: string | undefined): string =>
  path.startsWith("~/") && home !== undefined ? `${home.replace(/\/+$/, "")}${path.slice(1)}` : path;

export const baseNameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

// The theme names in a folder listing: each `.json` file, without its extension, in alphabetical order.
export function themeNames(entries: readonly { name: string; kind: string }[]): string[] {
  return entries
    .filter(
      (entry) =>
        entry.kind === "file" &&
        !entry.name.startsWith(".") &&
        !entry.name.includes("::") &&
        /\.json$/i.test(entry.name),
    )
    .map((entry) => entry.name.slice(0, -THEME_EXTENSION.length))
    .sort((a, b) => a.localeCompare(b));
}

// A name safe to use as a file name: letters, digits, spaces, `.`, `_` and `-`. Empty when nothing is left.
export const cleanName = (raw: string): string =>
  raw
    .trim()
    .replace(/\.json$/i, "")
    .replace(/[^A-Za-z0-9._ -]+/g, "-")
    .replace(/^[.\s-]+|[\s-]+$/g, "");

// The name, or the name with the first number after it that is free: `xenon`, `xenon1`, `xenon2`. Case is ignored, as
// file systems on macOS and Windows ignore it.
export function uniqueName(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((other) => other.toLowerCase()));
  let candidate = name;

  for (let number = 1; used.has(candidate.toLowerCase()); number++) {
    candidate = `${name}${number}`;
  }

  return candidate;
}

// Why a file cannot be used as a theme, or undefined when it can: it must be a JSON object with token colours.
export function themeProblem(text: string): string | undefined {
  let file: unknown;

  try {
    file = parseJsonc(text);
  } catch {
    return "That file is not valid JSON.";
  }

  const colors = (file as { tokenColors?: unknown } | null)?.tokenColors;

  return Array.isArray(colors) && colors.length > 0
    ? undefined
    : "That file has no tokenColors, so it is not a VS Code theme.";
}

// The name a file is imported under: the one asked for, else the file's own name.
export const importName = (requested: string, path: string): string =>
  cleanName(requested) || cleanName(baseNameOf(path)) || FALLBACK_NAME;
