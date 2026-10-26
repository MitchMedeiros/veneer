import type { ElementTable, RenderElement } from "claude-code";

import { outputCard, parseOutput } from "./output";
import type { OutputLine } from "./output";
import { outputFill } from "./paint";
import { MARGIN } from "./reply";
import { lineChildren } from "./syntax/runs";
import type { StyledRun } from "./syntax/types";
import type { Look, Plain, ToolCall } from "./tool-row";
import { inputOf, litOf, lookFor, NOT_PLAIN, pathHover, pathOf, shortPath, toneOf } from "./tool-row";

type Ui = Pick<ElementTable, "Box" | "Button" | "Link" | "Text">;

export type GroupCall = ToolCall;

// Which entries are open, by id, and the press that flips one.
export type Folds = { open: ReadonlySet<string>; toggle: (id: string) => void };

type Tone = ReturnType<typeof toneOf>;
type Segment = { look: Look; count: number; tone: Tone };

const SEVERITY: readonly Tone[] = ["success", "suggestion", "error"];

// The calls as one segment per tool name, in the order each first appears. A segment takes the worst colour of its calls:
// the error colour if one failed, else the running colour if one still runs.
function segmentsOf(calls: readonly GroupCall[], isPlain: boolean): Segment[] {
  const found = new Map<string, Segment>();

  for (const call of calls) {
    const look = lookFor(call.tool, isPlain);
    const segment = found.get(look.label) ?? { look, count: 0, tone: "success" as Tone };
    const tone = toneOf(call);

    found.set(look.label, {
      ...segment,
      count: segment.count + 1,
      tone: SEVERITY.indexOf(tone) > SEVERITY.indexOf(segment.tone) ? tone : segment.tone,
    });
  }

  return [...found.values()];
}

// The id a call's row is kept open or shut by.
export const callIdOf = (call: Pick<GroupCall, "tool_use_id">, groupId: string, index: number): string =>
  `call:${call.tool_use_id ?? `${groupId}:${index}`}`;

// The id that is in `open` while the images of a call are folded away.
export const hiddenIdOf = (callId: string): string => `hidden:${callId}`;

// A run of finished calls as one line of counts, `Command 2  Read 3`, which opens into a row for each call, and each row
// that has output opens into its card. A run of one call has nothing to count, so it is drawn as its row. The whole line takes the text colour while the pointer is on it. A path stays a
// link beside its row's button, so a click on it opens the file and a click on the rest folds the row. The images a
// call returned, drawn by the caller, sit under its row; a click on the row of a call in `imageCalls` folds them away
// and shows them again.
export function toolGroup(
  { Box, Button, Link, Text }: Ui,
  calls: readonly GroupCall[],
  id: string,
  cwd: string,
  { open, toggle }: Folds,
  detailRuns: readonly (StyledRun[] | undefined)[] = [],
  paintedOutput: readonly (OutputLine[] | undefined)[] = [],
  fills: { reads?: string; output?: string } = {},
  plain: Plain = NOT_PLAIN,
  images: readonly (RenderElement | null)[] = [],
  imageCalls: ReadonlySet<string> = new Set(),
): RenderElement {
  const fillOf = (tool: string, lines: readonly OutputLine[]) =>
    tool === "Read"
      ? fills.reads
      : tool === "Bash" || tool === "Grep"
        ? outputFill(fills.output, false, lines)
        : undefined;
  const iconGap = plain.icons ? " " : "  ";
  const groupId = `group:${id}`;
  const groupOpen = open.has(groupId);
  const single = calls.length === 1;
  const summaryLit = litOf(groupId);

  const summary = (
    <Box flexDirection="row" marginTop={1} marginLeft={MARGIN} marginRight={MARGIN}>
      <Button key={groupId} plain hover={summaryLit} onPress={() => toggle(groupId)}>
        {segmentsOf(calls, plain.icons).flatMap((segment, i) => {
          const { tone } = segment;

          return [
            <Text key={`icon-${i}`} color={tone} hover={summaryLit}>{`${segment.look.icon}${iconGap}`}</Text>,
            <Text key={`label-${i}`} color={tone} bold hover={summaryLit}>{`${segment.look.label} `}</Text>,
            <Text key={`count-${i}`} color={tone} hover={summaryLit}>{`${segment.count}  `}</Text>,
          ];
        })}
      </Button>
    </Box>
  );

  if (!single && !groupOpen) {
    return summary;
  }

  const rows = calls.map((call, i) => {
    const callId = callIdOf(call, id, i);
    const look = lookFor(call.tool, plain.icons);
    const input = inputOf(call.input);
    const detail = look.detail(input);
    const path = pathOf(look, input);
    const tone = toneOf(call);
    const lines = call.isRunning
      ? null
      : (paintedOutput[i] ?? parseOutput(call.tool, call.output, cwd, call.isErrored));
    const callOpen = lines !== null && open.has(callId);
    const rowLit = litOf(callId);
    const moreId = `more:${callId}`;
    const press = () => {
      if (lines !== null) {
        toggle(callId);
      } else if (imageCalls.has(callId)) {
        toggle(hiddenIdOf(callId));
      }
    };

    return (
      <Box key={callId} flexDirection="column" marginLeft={single ? 2 : 4} marginTop={single ? 1 : 0}>
        <Box flexDirection="row" gap={2}>
          <Button key={`row:${callId}`} plain hover={rowLit} onPress={press}>
            <Text key="icon" color={tone} dimColor={call.isRunning} hover={rowLit}>{`${look.icon}${iconGap}`}</Text>
            <Text key="label" color={tone} bold hover={rowLit}>
              {look.label}
            </Text>
            {detail === undefined || path !== undefined ? null : (
              <Text key="detail" dimColor wrap="truncate-end" hover={rowLit}>
                {"  "}
                {lineChildren({ Text }, detail, detailRuns[i], rowLit)}
              </Text>
            )}
          </Button>
          {detail === undefined || path === undefined ? null : (
            <Text dimColor wrap="truncate-end" hover={plain.links ? undefined : pathHover(callId)}>
              {plain.links ? detail : <Link href={`file://${encodeURI(path)}`}>{shortPath(detail, cwd)}</Link>}
            </Text>
          )}
        </Box>
        {callOpen ? (
          <Box marginLeft={2} flexDirection="column">
            {outputCard(
              { Box, Button, Text },
              lines,
              open.has(moreId),
              () => toggle(moreId),
              callId,
              fillOf(call.tool, lines),
            )}
          </Box>
        ) : null}
        {images[i] ?? null}
      </Box>
    );
  });

  return (
    <Box flexDirection="column">
      {single ? null : summary}
      {rows}
    </Box>
  );
}
