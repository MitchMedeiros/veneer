import type { ElementTable, RenderElement } from 'claude-code'

type Ui = Pick<ElementTable, 'Box' | 'Text'>

export type DiffLine = { kind: 'add' | 'remove' | 'context'; text: string; oldNumber: number | null; newNumber: number | null }

export type Diff = { lines: DiffLine[]; breaks: ReadonlySet<number> }

// Lines drawn before the rest is folded into a count.
const MAX_LINES = 60
const TAB = '    '

type Hunk = { oldStart?: number; newStart?: number; lines?: unknown }

// The stored patch of an edit as numbered lines, with the indexes where a new hunk starts. Null when it holds none.
export function parseDiff(output: unknown): Diff | null {
  const patch = (output as { structuredPatch?: unknown } | null | undefined)?.structuredPatch

  if (!Array.isArray(patch) || patch.length === 0) {
    return null
  }

  const lines: DiffLine[] = []
  const breaks = new Set<number>()

  for (const hunk of patch as Hunk[]) {
    let oldNumber = hunk.oldStart ?? 1
    let newNumber = hunk.newStart ?? 1

    if (lines.length > 0) {
      breaks.add(lines.length)
    }

    for (const raw of Array.isArray(hunk.lines) ? hunk.lines : []) {
      if (typeof raw !== 'string') {
        continue
      }

      const text = raw.slice(1).replace(/\t/g, TAB)

      if (raw.startsWith('+')) {
        lines.push({ kind: 'add', text, oldNumber: null, newNumber: newNumber++ })
      } else if (raw.startsWith('-')) {
        lines.push({ kind: 'remove', text, oldNumber: oldNumber++, newNumber: null })
      } else {
        lines.push({ kind: 'context', text, oldNumber: oldNumber++, newNumber: newNumber++ })
      }
    }
  }

  return lines.some(line => line.kind !== 'context') ? { lines, breaks } : null
}

// The edit as a rounded card of numbered lines. A changed line's code is filled with the theme's diff token, so it matches
// Claude Code's own diff on every theme, and the fill starts right of its number. Like Claude Code's own diff there is
// one number column, coloured on changed lines in the line's own fill colour, as the badges are filled: the line's
// new number, or its old one where it was removed. The ansi themes draw the diff without fills, so there the numbers
// and text take the success and error colours.
export function diffCard({ Box, Text }: Ui, diff: Diff, isAnsi: boolean): RenderElement {
  const shown = diff.lines.slice(0, MAX_LINES)
  const numberOf = (line: DiffLine) => line.newNumber ?? line.oldNumber
  const digits = Math.max(1, ...shown.map(line => String(numberOf(line) ?? '').length))
  const tone = (kind: DiffLine['kind']) => (kind === 'add' ? 'success' : kind === 'remove' ? 'error' : undefined)
  const fillOf = (kind: DiffLine['kind']) => (isAnsi ? undefined : kind === 'add' ? 'diffAdded' : kind === 'remove' ? 'diffRemoved' : undefined)
  const numberTone = (kind: DiffLine['kind']) => (isAnsi ? tone(kind) : fillOf(kind))

  return (
    <Box flexDirection="column" marginLeft={2} borderStyle="round" borderColor="subtle">
      {shown.map((line, i) => (
        <Box key={`line-${i}`} flexDirection="column">
          {diff.breaks.has(i) ? <Text dimColor>{`${' '.repeat(digits + 2)}⋯`}</Text> : null}
          <Box flexDirection="row">
            <Text color={numberTone(line.kind)} dimColor={line.kind === 'context'}>{` ${String(numberOf(line) ?? '').padStart(digits)} `}</Text>
            <Box flexGrow={1} flexShrink={1} paddingLeft={1} backgroundColor={fillOf(line.kind)}>
              <Text color={isAnsi ? tone(line.kind) : undefined} wrap="wrap">
                {line.text === '' ? ' ' : line.text}
              </Text>
            </Box>
          </Box>
        </Box>
      ))}
      {diff.lines.length > MAX_LINES ? <Text dimColor>{` … ${diff.lines.length - MAX_LINES} more lines`}</Text> : null}
    </Box>
  )
}
