import type { Palette } from "../types";

type Tokens = Record<string, string>;

// Claude Code's built-in presets, for the tokens pictures read.
const DARK: Palette = {
  text: "#ffffff",
  inactive: "#999999",
  subtle: "#505050",
  accent: "#d77757",
  border: "#888888",
  success: "#4eba65",
  error: "#ff6b80",
  userBackground: "#373737",
  isAnsi: false,
};

const LIGHT: Palette = {
  text: "#000000",
  inactive: "#666666",
  subtle: "#afafaf",
  accent: "#d77757",
  border: "#8a8a8a",
  success: "#2c7a39",
  error: "#ab2b3f",
  userBackground: "#f0f0f0",
  isAnsi: false,
};

const TOKENS: Record<Exclude<keyof Palette, "isAnsi">, string> = {
  text: "text",
  inactive: "inactive",
  subtle: "subtle",
  accent: "claude",
  border: "promptBorder",
  success: "success",
  error: "error",
  userBackground: "userMessageBackground",
};

const ANSI: Record<string, string> = {
  black: "#000000",
  red: "#cd3131",
  green: "#0dbc79",
  yellow: "#e5e510",
  blue: "#2472c8",
  magenta: "#bc3fbc",
  cyan: "#11a8cd",
  white: "#e5e5e5",
  blackBright: "#666666",
  redBright: "#f14c4c",
  greenBright: "#23d18b",
  yellowBright: "#f5f543",
  blueBright: "#3b8eea",
  magentaBright: "#d670d6",
  cyanBright: "#29b8db",
  whiteBright: "#ffffff",
};

const hex2 = (n: number): string =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, "0");

// A theme colour value as `#rrggbb`, or null when it is none of the forms a theme accepts.
export function hexOf(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);

  if (short) {
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  }

  if (/^#[0-9a-f]{6}$/i.test(text)) {
    return text.toLowerCase();
  }

  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(text);

  if (rgb) {
    return `#${hex2(Number(rgb[1]))}${hex2(Number(rgb[2]))}${hex2(Number(rgb[3]))}`;
  }

  return /^ansi:/.test(text) ? (ANSI[text.slice(5)] ?? null) : null;
}

export const baseOf = (name: string | undefined): Palette => (name?.startsWith("light") ? LIGHT : DARK);

// The preset a theme starts from, with the theme's own overrides on top.
export function paletteOf(base: string | undefined, overrides: Tokens | undefined): Palette {
  const palette = { ...baseOf(base), isAnsi: base?.includes("ansi") === true };

  for (const key of Object.keys(TOKENS) as (keyof typeof TOKENS)[]) {
    palette[key] = hexOf(overrides?.[TOKENS[key]]) ?? palette[key];
  }

  return palette;
}

// A theme file's `base` and `overrides`, or null when the text is not a theme.
export function parseTheme(text: string): { base: string | undefined; overrides: Tokens | undefined } | null {
  try {
    const theme: unknown = JSON.parse(text);

    if (typeof theme !== "object" || theme === null) {
      return null;
    }

    const { base, overrides } = theme as { base?: unknown; overrides?: unknown };

    return {
      base: typeof base === "string" ? base : undefined,
      overrides: typeof overrides === "object" && overrides !== null ? (overrides as Tokens) : undefined,
    };
  } catch {
    return null;
  }
}
