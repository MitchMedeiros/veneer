import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Off, Palette } from '../types'
import { configOf } from './config'
import { OFF_TEXT, terminalOff } from './gate'
import { changeCounts, withBadges } from './badge'
import { diffCard, parseDiff } from './diff'
import { headingSketch } from './heading'
import { hasDrawn, splitReply } from './markdown'
import type { Segment } from './markdown'
import { baseOf } from './palette'
import { cellHeightOf, MAX_COLUMNS, rasterize } from './picture'
import type { Picture, PictureIo } from './picture'
import { GUTTER, replyTree } from './reply'
import { tableSketch } from './table'
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

const pictureIo = ($: EngineInterface): PictureIo => ({
  run: async (argv, stdin) => (await $.process.run(argv, { stdin, timeoutMs: 5000 }).catch(() => null))?.exitCode === 0,
  readBase64: path => $.fs.read(path, { as: 'bytes' }).then(file => file.base64, () => undefined),
})

async function pictureDir($: EngineInterface): Promise<string> {
  return `${((await $.env.get('TMPDIR')) ?? '/tmp').replace(/[\\/]+$/, '')}/veneer-pictures`
}

// Creates the picture folder and drops pictures a week old.
async function prepareFolder($: EngineInterface): Promise<void> {
  const dir = await pictureDir($)

  await $.process.run(['mkdir', '-p', dir], { timeoutMs: 2000 }).catch(() => null)
  await $.process.run(['find', dir, '-type', 'f', '-name', '*.png', '-mtime', '+7', '-delete'], { timeoutMs: 5000 }).catch(() => null)
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
    await prepareFolder($)
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

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const native = await next(e)
    const { text, isFirstOfReply, isSummary } = e.props

    // A tree another mod returned is theirs; only core's own drawing is replaced.
    if (e.surface !== 'terminal' || native.type !== 'engine' || isSummary === true || !/\||^ {0,3}#|^\s*(```|~~~)/m.test(text)) {
      return native
    }

    const ui = $.ui.resolve(e)

    if (!('Image' in ui) || (await read($, offAtom)) !== null) {
      return native
    }

    const segments = splitReply(text)

    if (!hasDrawn(segments)) {
      return native
    }

    const palette = await read($, paletteAtom)
    const font = { family: config.fontFamily, cellHeight: cellHeightOf(config.cellRatio) }
    const available = Math.min(MAX_COLUMNS, (e.viewport?.columns ?? 100) - GUTTER)
    const dir = await pictureDir($)
    const io = pictureIo($)
    const drawn = new Map<Segment, { picture: Picture; alt: string }>()

    await Promise.all(
      segments.map(async segment => {
        if (segment.kind === 'text' || segment.kind === 'code') {
          return
        }

        const sketch = segment.kind === 'table' ? tableSketch(segment, available, palette, font) : headingSketch(segment, available, palette, font)
        const picture = await rasterize(io, dir, sketch, font)

        if (picture !== null) {
          drawn.set(segment, { picture, alt: sketch.alt })
        }
      }),
    )

    return replyTree(ui, segments, drawn, isFirstOfReply)
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const native = await next(e)
    const { isRunning, isErrored, output } = e.props
    const changes = e.surface === 'terminal' && native.type === 'engine' && !isRunning && !isErrored ? changeCounts(output) : null

    if (changes === null || (await read($, offAtom)) !== null) {
      return native
    }

    return withBadges($.ui.resolve(e), native, changes, (await read($, paletteAtom)).isAnsi)
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const native = await next(e)
    const diff = e.surface === 'terminal' && native.type === 'engine' && !e.props.isErrored ? parseDiff(e.props.output) : null

    if (diff === null || (await read($, offAtom)) !== null) {
      return native
    }

    return diffCard($.ui.resolve(e), diff, (await read($, paletteAtom)).isAnsi)
  })

  on('config.set', async ($, e, next) => {
    const result = await next(e)

    if (e.key === 'theme' && result.deny === undefined && (await read($, offAtom)) === null) {
      await refreshPalette($, result.value)
    }

    return result
  })
}
