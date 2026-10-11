import type { Palette } from '../types'
import { paletteOf, parseTheme } from './palette'

export type ReadText = (path: string) => Promise<string | undefined>

const CUSTOM = 'custom:'

// `auto` follows the terminal; its background is the last number of COLORFGBG ("15;0" is dark on a black background).
const autoBase = (colorfgbg: string | undefined): string => {
  const background = Number(colorfgbg?.split(';').pop())

  return background === 7 || background === 15 ? 'light' : 'dark'
}

// The palette for the theme setting: a custom theme's file over its base, or a built-in preset.
export async function loadPalette(
  theme: unknown,
  home: string | undefined,
  colorfgbg: string | undefined,
  read: ReadText,
): Promise<Palette> {
  const name = typeof theme === 'string' ? theme : 'dark'

  if (name.startsWith(CUSTOM) && home !== undefined) {
    const slug = name.slice(CUSTOM.length)
    const parsed = /^[\w-]+$/.test(slug) ? parseTheme((await read(`${home}/.claude/themes/${slug}.json`)) ?? '') : null

    if (parsed !== null) {
      return paletteOf(parsed.base, parsed.overrides)
    }
  }

  return paletteOf(name === 'auto' ? autoBase(colorfgbg) : name.startsWith(CUSTOM) ? 'dark' : name, undefined)
}
