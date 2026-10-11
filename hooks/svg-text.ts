export const escapeXml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Width of a string in pixels, close enough to lay a picture out without a renderer.
export function measure(text: string, size: number): number {
  return [...text].reduce((sum, char) => {
    if ("iljtf.,:;|!'` ".includes(char)) {
      return sum + size * 0.3
    }

    if ('mwMW@%'.includes(char)) {
      return sum + size * 0.82
    }

    return sum + (char >= 'A' && char <= 'Z' ? size * 0.64 : size * 0.54)
  }, 0)
}

function breakWord(word: string, width: number, size: number): string[] {
  const pieces: string[] = []
  let piece = ''

  for (const char of word) {
    if (piece !== '' && measure(piece + char, size) > width) {
      pieces.push(piece)
      piece = ''
    }

    piece += char
  }

  return [...pieces, piece]
}

// The text as at most `maxLines` lines that fit `width`; past the cap the last line ends in an ellipsis.
export function wrap(text: string, width: number, size: number, maxLines: number): string[] {
  const lines: string[] = []
  let line = ''

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line === '' ? word : `${line} ${word}`

    if (measure(candidate, size) <= width) {
      line = candidate
      continue
    }

    if (line !== '') {
      lines.push(line)
    }

    const pieces = measure(word, size) <= width ? [word] : breakWord(word, width, size)
    lines.push(...pieces.slice(0, -1))
    line = pieces.at(-1) ?? ''
  }

  const all = line === '' ? lines : [...lines, line]

  if (all.length <= maxLines) {
    return all.length === 0 ? [''] : all
  }

  const chars = [...(all[maxLines - 1] ?? '')]

  while (chars.length > 0 && measure(`${chars.join('')}…`, size) > width) {
    chars.pop()
  }

  return [...all.slice(0, maxLines - 1), `${chars.join('')}…`]
}
