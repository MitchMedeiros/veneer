import type { On, RenderElement } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { parseDiff } from '../hooks/diff'

const PATCH = {
  structuredPatch: [
    { oldStart: 1, newStart: 1, lines: [' one', '-two', '+TWO', ' three'] },
    { oldStart: 20, newStart: 20, lines: [' tail', '+\tindented'] },
  ],
}

const NATIVE: RenderElement = { type: 'engine', ref: 0 }
const OTHER_MOD: RenderElement = { type: 'Text', props: {}, children: ['another mod'] }

function stub(on: On, row: RenderElement) {
  mock.clock(on, { now: 10_000 })
  on('env.get', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.render', () => row)
}

const result = (output: unknown, id: string, isErrored = false) =>
  ({
    plugin: 'veneer',
    viewport: { columns: 100, rows: 30 },
    surface: 'terminal',
    component: 'ToolResult',
    requestId: id,
    props: { tool_use_id: id, tool: 'Edit', output, isErrored },
  }) as never

test('a patch becomes numbered lines, with a break where a hunk starts', () => {
  const diff = parseDiff(PATCH)

  expect(diff?.lines.map(line => [line.kind, line.oldNumber, line.newNumber])).toEqual([
    ['context', 1, 1],
    ['remove', 2, null],
    ['add', null, 2],
    ['context', 3, 3],
    ['context', 20, 20],
    ['add', null, 21],
  ])
  expect([...(diff?.breaks ?? [])]).toEqual([4])
  expect(diff?.lines.at(-1)?.text).toBe('    indented')
})

test('a patch with no changed line is not a diff', () => {
  expect(parseDiff({ structuredPatch: [] })).toBeNull()
  expect(parseDiff({ structuredPatch: [{ oldStart: 1, newStart: 1, lines: [' same'] }] })).toBeNull()
  expect(parseDiff('error text')).toBeNull()
})

test('an edit result is drawn as the card, not the native block', async ($, on) => {
  stub(on, NATIVE)

  const ui = await $.ui.mount(result(PATCH, 'r1'))

  expect(await ui.find({ type: 'Text', text: 'TWO' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'two' })).toBeDefined()
})

test('a failed edit keeps the native result', async ($, on) => {
  stub(on, NATIVE)

  const ui = await $.ui.mount(result(PATCH, 'r2', true))

  expect(await ui.find({ type: 'Text', text: 'TWO' })).toBeUndefined()
})

test('a result another mod drew passes through untouched', async ($, on) => {
  stub(on, OTHER_MOD)

  const ui = await $.ui.mount(result(PATCH, 'r3'))

  expect(await ui.find({ type: 'Text', text: 'another mod' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'TWO' })).toBeUndefined()
})
