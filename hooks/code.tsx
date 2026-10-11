import type { ElementTable, RenderElement } from 'claude-code'

type Ui = Pick<ElementTable, 'Box' | 'Text'>

const TAB = '    '

// A fenced block as a rounded card: the language dimmed at the top left, then the code as it was written. Native text,
// so it stays selectable, follows the theme and long lines wrap inside the card.
export function codeCard({ Box, Text }: Ui, lang: string, code: string): RenderElement {
  const lines = code.replace(/\s+$/, '').split('\n')

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
      {lang === '' ? null : <Text dimColor>{lang}</Text>}
      {lines.map((line, i) => (
        <Text key={`line-${i}`} wrap="wrap">
          {line === '' ? ' ' : line.replace(/\t/g, TAB)}
        </Text>
      ))}
    </Box>
  )
}
