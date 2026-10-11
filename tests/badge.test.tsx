import type { On, RenderElement } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { changeCounts } from '../hooks/badge'
import { paletteOf } from '../hooks/palette'

const PATCH = { structuredPatch: [{ oldStart: 1, oldLines: 3, newStart: 1, newLines: 4, lines: [' keep', '-old', '+new', '+extra', ' keep'] }] }

const NATIVE: RenderElement = { type: 'engine', ref: 0 }
const OTHER_MOD: RenderElement = { type: 'Text', props: {}, children: ['another mod'] }

function stub(on: On, row: RenderElement) {
  mock.clock(on, { now: 10_000 })
  on('env.get', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.render', () => row)
}

const edit = (output: unknown, overrides: Record<string, unknown> = {}, id = 't1') =>
  ({
    plugin: 'veneer',
    viewport: { columns: 100, rows: 30 },
    surface: 'terminal',
    component: 'ToolUse',
    requestId: id,
    props: { tool_use_id: id, tool: 'Edit', input: {}, isRunning: false, isErrored: false, isInterrupted: false, output, ...overrides },
  }) as never

test('changes are counted from the lines of the stored patch', () => {
  expect(changeCounts(PATCH)).toEqual({ added: 2, removed: 1 })
  expect(changeCounts({ structuredPatch: [] })).toBeNull()
  expect(changeCounts('an error message')).toBeNull()
  expect(changeCounts(undefined)).toBeNull()
})

test('only the ansi themes are marked as ansi', () => {
  expect(paletteOf('dark-ansi', undefined).isAnsi).toBe(true)
  expect(paletteOf('light-ansi', undefined).isAnsi).toBe(true)
  expect(paletteOf('dark', undefined).isAnsi).toBe(false)
})

test('a finished edit gets a pill for each count after the native row', async ($, on) => {
  stub(on, NATIVE)

  const ui = await $.ui.mount(edit(PATCH))

  expect(await ui.find({ type: 'Text', text: ' 2 added ' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' 1 removed ' })).toBeDefined()
})

test('a running or failed edit is left alone', async ($, on) => {
  stub(on, NATIVE)

  for (const [id, overrides] of [['running', { isRunning: true }], ['failed', { isErrored: true }]] as const) {
    expect(await (await $.ui.mount(edit(PATCH, overrides, id))).find({ type: 'Text', text: ' 2 added ' })).toBeUndefined()
  }
})

test('a row another mod drew passes through untouched', async ($, on) => {
  stub(on, OTHER_MOD)

  const ui = await $.ui.mount(edit(PATCH))

  expect(await ui.find({ type: 'Text', text: 'another mod' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' 2 added ' })).toBeUndefined()
})
