import { escapeXml } from './svg-text'

// Pixels per terminal column in every picture. A picture is drawn 1:1 over whole cells, so its height is a whole number
// of cell rows and the engine never has to scale it.
export const CELL_WIDTH = 20

// The engine refuses a picture with a side over 4096 pixels, and a box of more than 250 cells.
const MAX_PIXELS = 4096
const MAX_CELLS = 250
export const MAX_COLUMNS = Math.floor(MAX_PIXELS / CELL_WIDTH)

const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const MEMORY_PICTURES = 300

export type Picture = { png: string; columns: number; rows: number }

// A picture's pixels before drawing: an SVG over `columns` cell columns and `rows` cell rows.
export type Sketch = { svg: string; columns: number; rows: number; alt: string }

export type Font = { family: string; cellHeight: number }

// What the picture pipeline needs from the engine, so it stays free of `$`.
export type PictureIo = {
  run: (argv: string[], stdin?: string) => Promise<boolean>
  readBase64: (path: string) => Promise<string | undefined>
}

export const cellHeightOf = (ratio: number): number => Math.round(CELL_WIDTH * ratio)

export const rowsFor = (heightPx: number, cellHeight: number): number =>
  Math.min(MAX_CELLS, Math.max(1, Math.ceil(heightPx / cellHeight)))

// A root element whose box is exactly `columns` by `rows` cells.
export function svgDocument(columns: number, rows: number, cellHeight: number, family: string, body: string): string {
  const width = columns * CELL_WIDTH
  const height = rows * cellHeight

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${escapeXml(family)}">${body}</svg>`
}

export const fill = (color: string, opacity?: number): string =>
  opacity === undefined ? `fill="${color}"` : `fill="${color}" fill-opacity="${opacity}"`

// A short stable name for a string, so a redraw finds its PNG again.
export const hashOf = (text: string): string => {
  let first = 5381
  let second = 52711

  for (const char of text) {
    const code = char.codePointAt(0)!

    first = ((first << 5) + first + code) >>> 0
    second = ((second << 5) ^ second ^ code) >>> 0
  }

  return first.toString(36) + second.toString(36)
}

export const isPng = (base64: string): boolean => {
  const head = atob(base64.slice(0, 32))
  const word = (at: number) => [0, 1, 2, 3].reduce((n, i) => n * 256 + head.charCodeAt(at + i), 0)

  return head.startsWith('\x89PNG') && (base64.length * 3) / 4 <= MAX_IMAGE_BYTES && word(16) <= MAX_PIXELS && word(20) <= MAX_PIXELS
}

const memory = new Map<string, Picture>()

function remember(key: string, picture: Picture): void {
  memory.delete(key)
  memory.set(key, picture)

  if (memory.size > MEMORY_PICTURES) {
    memory.delete(memory.keys().next().value as string)
  }
}

// A sketch as a PNG: from memory, then from the disk folder, then drawn once by `resvg`. Null where it cannot be drawn.
export async function rasterize(io: PictureIo, dir: string, sketch: Sketch, font: Font): Promise<Picture | null> {
  const { svg, columns, rows } = sketch
  const key = `${hashOf(`${svg}|${font.family}`)}-${columns}x${rows}`
  const cached = memory.get(key)

  if (cached !== undefined) {
    remember(key, cached)
    return cached
  }

  const file = `${dir}/${key}.png`
  let png = (await io.readBase64(file)) ?? ''

  if (png === '' || !isPng(png)) {
    // Drawn under a private name and moved into place, so a window reading the same picture never sees half a file.
    const draft = `${file}.${Math.random().toString(36).slice(2)}.tmp`
    const isDrawn =
      (await io.run(
        ['resvg', '--font-family', font.family, '--sans-serif-family', font.family, '--width', String(columns * CELL_WIDTH), '-', draft],
        svg,
      )) && (await io.run(['mv', draft, file]))

    png = isDrawn ? ((await io.readBase64(file)) ?? '') : ''
  }

  if (png === '' || !isPng(png)) {
    return null
  }

  const picture = { png, columns, rows }

  remember(key, picture)

  return picture
}
