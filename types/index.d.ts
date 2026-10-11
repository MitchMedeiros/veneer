// Why Veneer draws nothing this session; null when it draws.
export type Off = 'tmux' | 'terminal' | 'resvg'

// The colours pictures need as hex. Native rows use theme keys and need none of this.
export type Palette = {
  text: string
  inactive: string
  subtle: string
  accent: string
  border: string
  success: string
  error: string
  userBackground: string
}

declare module 'claude-code' {
  interface PluginState {
    veneer: {
      off: Off | null
      palette: Palette
    }
  }
}
