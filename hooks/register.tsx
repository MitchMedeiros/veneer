import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Off, Palette } from '../types'
import { configOf } from './config'
import { OFF_TEXT, terminalOff } from './gate'
import { baseOf } from './palette'
import { loadPalette } from './theme'
import { userBubble } from './user-message'

const NOTICE_MS = 6000

// Why Veneer is off this session; null when it draws.
const offAtom = atom({ plugin: 'veneer', key: 'off' } as const, null as Off | null)
const paletteAtom = atom({ plugin: 'veneer', key: 'palette' } as const, baseOf('dark') as Palette)

async function themeFile($: EngineInterface, path: string): Promise<string | undefined> {
  return $.fs.read(path).catch(() => undefined)
}

async function refreshPalette($: EngineInterface, theme?: unknown): Promise<void> {
  const setting = theme ?? (await $.config.list()).find(row => row.key === 'theme')?.value
  const palette = await loadPalette(setting, await $.env.get('HOME'), await $.env.get('COLORFGBG'), path => themeFile($, path))

  await update($, paletteAtom, () => palette)
}

async function settle($: EngineInterface): Promise<Off | null> {
  const terminal = terminalOff({
    force: await $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES'),
    tmux: await $.env.get('TMUX'),
    program: await $.env.get('TERM_PROGRAM'),
    term: await $.env.get('TERM'),
    kittyWindow: await $.env.get('KITTY_WINDOW_ID'),
  })
  const probe = terminal === null ? await $.process.run(['resvg', '--version'], { timeoutMs: 2000 }).catch(() => null) : null
  const off = terminal ?? (probe?.exitCode === 0 ? null : 'resvg')

  await update($, offAtom, () => off)

  if (off === null) {
    await refreshPalette($)
  }

  return off
}

export const register: Register = (on, options) => {
  const config = configOf(options)

  on('session.start', async ($, e, next) => {
    const off = await settle($)

    if (off !== null) {
      $.ui.toast(OFF_TEXT[off], { timeoutMs: NOTICE_MS })
    }

    return next(e)
  })

  // /clear, /resume and /branch reset the session's state and skip session.start.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await settle($)

    return next(e)
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const { text, origin } = e.props

    if (e.surface !== 'terminal' || origin.kind !== 'composer' || text.trim() === '' || (await read($, offAtom)) !== null) {
      return next(e)
    }

    return userBubble($.ui.resolve(e), text, e.viewport?.columns ?? 100, config.align)
  })

  on('config.set', async ($, e, next) => {
    const result = await next(e)

    if (e.key === 'theme' && result.deny === undefined && (await read($, offAtom)) === null) {
      await refreshPalette($, result.value)
    }

    return result
  })
}
