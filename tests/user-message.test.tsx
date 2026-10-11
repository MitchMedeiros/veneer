import type { On, PromptOrigin, RenderElement } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const STOCK: RenderElement = { type: 'Text', props: {}, children: ['native row'] }
const TYPED: PromptOrigin = { kind: 'composer' }
const PLUGIN: PromptOrigin = { kind: 'plugin', name: 'other' }

function stub(on: On) {
  mock.clock(on, { now: 10_000 })
  on('env.get', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.render', () => STOCK)
}

const message = (text: string, surface: 'terminal' | 'desktop' = 'terminal', origin: PromptOrigin = TYPED) =>
  ({
    plugin: 'veneer',
    viewport: { columns: 100, rows: 30 },
    surface,
    component: 'UserMessage',
    requestId: 'u1',
    props: { text, origin, isExpanded: false },
  }) as const

test('a typed message is a filled bubble that replaces the native row', async ($, on) => {
  stub(on)

  const ui = await $.ui.mount(message('hello there'))

  expect(await ui.find({ type: 'Text', text: 'hello there' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'native row' })).toBeUndefined()
})

test('every line of a multi-line message is kept, blank lines included', async ($, on) => {
  stub(on)

  const ui = await $.ui.mount(message('first\n\nthird'))

  expect(await ui.find({ type: 'Text', text: 'first' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'third' })).toBeDefined()
})

test('other surfaces and other senders keep Claude Code’s own row', async ($, on) => {
  stub(on)

  for (const ui of [await $.ui.mount(message('hi', 'desktop')), await $.ui.mount(message('hi', 'terminal', PLUGIN))]) {
    expect(await ui.find({ type: 'Text', text: 'native row' })).toBeDefined()
  }
})
