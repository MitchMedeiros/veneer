export type Align = 'left' | 'right' | 'center'

export type Table = { kind: 'table'; header: string[]; align: Align[]; rows: string[][]; raw: string }

export type Heading = { kind: 'heading'; level: number; text: string; raw: string }

export type Code = { kind: 'code'; lang: string; code: string; raw: string }

export type Segment = { kind: 'text'; text: string } | Table | Heading | Code

const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/
const FENCE = /^(\s*)(`{3,}|~{3,})\s*([^\s`]*)/

const closesFence = (line: string, marker: string): boolean => {
  const text = line.trim()

  return text.length >= marker.length && text === marker[0]!.repeat(text.length)
}
const HEADING = /^ {0,3}(#{1,4})\s+(.+?)(?:\s+#+)?\s*$/

// Inline marks read as noise in a picture, where they cannot be styled.
const plain = (text: string): string =>
  text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .replace(/\\\|/g, '|')
    .trim()

const cellsOf = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map(plain)

const alignOf = (cell: string): Align => {
  const spec = cell.trim()

  if (spec.startsWith(':') && spec.endsWith(':')) {
    return 'center'
  }

  return spec.endsWith(':') ? 'right' : 'left'
}

// The reply as runs of text with each table, heading and closed code fence taken out as its own segment. A fence still
// open, as while the reply streams, stays text with everything after it.
export function splitReply(markdown: string): Segment[] {
  const lines = markdown.split('\n')
  const segments: Segment[] = []
  let text: string[] = []

  const flush = () => {
    if (text.join('\n').trim() !== '') {
      segments.push({ kind: 'text', text: text.join('\n') })
    }

    text = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''

    const fence = FENCE.exec(line)

    if (fence !== null) {
      const marker = fence[2]!
      const close = lines.findIndex((other, at) => at > i && closesFence(other, marker))

      if (close === -1) {
        text.push(...lines.slice(i))
        break
      }

      const indent = fence[1]!.length
      const body = lines.slice(i + 1, close).map(row => row.slice(Math.min(indent, row.length - row.trimStart().length)))

      flush()
      segments.push({ kind: 'code', lang: fence[3]!.toLowerCase(), code: body.join('\n'), raw: lines.slice(i, close + 1).join('\n') })
      i = close
      continue
    }

    const heading = HEADING.exec(line)

    // The last line of the text may still be streaming; a line is final once another follows it.
    if (heading !== null && i < lines.length - 1) {
      flush()
      segments.push({ kind: 'heading', level: heading[1]!.length, text: plain(heading[2]!), raw: line })
      continue
    }

    const header = cellsOf(line)
    const separator = lines[i + 1] ?? ''
    const isTable =
      line.includes('|') && SEPARATOR.test(separator) && header.length > 1 && cellsOf(separator).length === header.length

    let end = i + 2

    while (isTable && end < lines.length && (lines[end] ?? '').includes('|') && (lines[end] ?? '').trim() !== '') {
      end++
    }

    // A table is final once a line that is not a row follows it; until then it may still be growing.
    if (!isTable || end >= lines.length) {
      text.push(line)
      continue
    }

    const fit = (cells: string[]) => Array.from({ length: header.length }, (_, col) => cells[col] ?? '')

    flush()
    segments.push({
      kind: 'table',
      header,
      align: fit(separator.trim().replace(/^\||\|$/g, '').split('|')).map(alignOf),
      rows: lines.slice(i + 2, end).map(row => fit(cellsOf(row))),
      raw: lines.slice(i, end).join('\n'),
    })
    i = end - 1
  }

  flush()

  return segments
}

export const hasDrawn = (segments: readonly Segment[]): boolean => segments.some(segment => segment.kind !== 'text')
