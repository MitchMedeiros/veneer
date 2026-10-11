import type { PluginOptions } from 'claude-code'

export type Config = {
  align: 'left' | 'right'
}

export const configOf = (options: PluginOptions): Config => ({
  align: options.messageAlign === 'right' ? 'right' : 'left',
})
