import type { ElementTable, RenderElement } from "claude-code";

import { outputCard, parseOutput } from "./output";
import type { Look, ToolCall } from "./tool-row";
import { inputOf, lookOf, pathOf, shortPath } from "./tool-row";

type Ui = Pick<ElementTable, "Box" | "Button" | "Link" | "Text">;

export type GroupCall = ToolCall & { tool_use_id?: string; output?: unknown };

// Which entries are open, by id, and the press that flips one.
export type Folds = { open: ReadonlySet<string>; toggle: (id: string) => void };

type Segment = { look: Look; count: number; failed: boolean };

// The calls as one segment per tool name, in the order each first appears.
function segmentsOf(calls: readonly GroupCall[]): Segment[] {
  const found = new Map<string, Segment>();

  for (const call of calls) {
    const look = lookOf(call.tool);
    const segment = found.get(look.label) ?? { look, count: 0, failed: false };

    found.set(look.label, { ...segment, count: segment.count + 1, failed: segment.failed || call.isErrored });
  }

  return [...found.values()];
}

// A run of finished calls as one line of counts, `Run 1  Read 3`, which opens into a row for each call, and each row
// that has output opens into its card. The whole line takes the text colour while the pointer is on it. A path stays a
// link beside its row's button, so a click on it opens the file and a click on the rest folds the row.
export function toolGroup(
  { Box, Button, Link, Text }: Ui,
  calls: readonly GroupCall[],
  id: string,
  cwd: string,
  { open, toggle }: Folds,
): RenderElement {
  const groupId = `group:${id}`;
  const groupOpen = open.has(groupId);
  const lit = (scope: string) => ({ scope, color: "text", dimColor: false }) as const;
  const summaryLit = lit(groupId);

  const summary = (
    <Box flexDirection="row" marginTop={1} marginLeft={2}>
      <Button key={groupId} plain hover={summaryLit} onPress={() => toggle(groupId)}>
        {segmentsOf(calls).flatMap((segment, i) => {
          const tone = segment.failed ? "error" : segment.look.tone;

          return [
            <Text key={`icon-${i}`} color={tone} hover={summaryLit}>{`${segment.look.icon}  `}</Text>,
            <Text key={`label-${i}`} color={tone} bold hover={summaryLit}>{`${segment.look.label} `}</Text>,
            <Text key={`count-${i}`} color={tone} hover={summaryLit}>{`${segment.count}  `}</Text>,
          ];
        })}
      </Button>
    </Box>
  );

  if (!groupOpen) {
    return summary;
  }

  const rows = calls.map((call, i) => {
    const callId = `call:${call.tool_use_id ?? `${id}:${i}`}`;
    const look = lookOf(call.tool);
    const input = inputOf(call.input);
    const detail = look.detail(input);
    const path = pathOf(look, input);
    const tone = call.isErrored ? "error" : look.tone;
    const lines = call.isRunning ? null : parseOutput(call.tool, call.output, cwd, call.isErrored);
    const callOpen = lines !== null && open.has(callId);
    const rowLit = lit(callId);
    const moreId = `more:${callId}`;
    const press = () => {
      if (lines !== null) {
        toggle(callId);
      }
    };

    return (
      <Box key={callId} flexDirection="column" marginLeft={4}>
        <Box flexDirection="row" gap={2}>
          <Button key={`row:${callId}`} plain hover={rowLit} onPress={press}>
            <Text key="icon" color={tone} dimColor={call.isRunning} hover={rowLit}>{`${look.icon}  `}</Text>
            <Text key="label" color={tone} bold hover={rowLit}>
              {look.label}
            </Text>
            {detail === undefined || path !== undefined ? null : (
              <Text key="detail" dimColor wrap="truncate-end" hover={rowLit}>{`  ${detail}`}</Text>
            )}
          </Button>
          {detail === undefined || path === undefined ? null : (
            <Text dimColor wrap="truncate-end">
              <Link href={`file://${encodeURI(path)}`}>{shortPath(detail, cwd)}</Link>
            </Text>
          )}
        </Box>
        {callOpen ? (
          <Box marginLeft={2} flexDirection="column">
            {outputCard({ Box, Button, Text }, lines, open.has(moreId), () => toggle(moreId), callId)}
          </Box>
        ) : null}
      </Box>
    );
  });

  return (
    <Box flexDirection="column">
      {summary}
      {rows}
    </Box>
  );
}
