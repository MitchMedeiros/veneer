import type { ElementTable, RenderElement } from "claude-code";

import { borderOf, fitWidth } from "./fold";
import type { Tasks } from "./markdown";
import { cellWidth } from "./svg-text";

type Ui = Pick<ElementTable, "Box" | "Text">;

const DONE = "☑";
const OPEN = "☐";
const INDENT = 2;

// A task list as a rounded card: the count done on top, then a row for each task with a tick for a finished one, dimmed
// and struck through. A nested task is set in. With `fit`, the most columns a card may take, the card is as wide as its
// longest row where that is narrower.
export function tasksCard({ Box, Text }: Ui, tasks: Tasks, fit?: number, isBordered = true): RenderElement {
  const done = tasks.items.filter((item) => item.isDone).length;
  const title = `Tasks ${done}/${tasks.items.length}`;
  const widest = Math.max(
    cellWidth(title),
    ...tasks.items.map((item) => item.depth * INDENT + 2 + cellWidth(item.text)),
  );

  return (
    <Box
      flexDirection="column"
      alignSelf={fit === undefined ? undefined : "flex-start"}
      width={fitWidth(widest + 2, 0, fit, isBordered)}
      {...borderOf(isBordered)}
      paddingX={1}
    >
      <Text bold color={done === tasks.items.length ? "success" : "claude"}>
        {title}
      </Text>
      {tasks.items.map((item, i) => (
        <Box key={`task-${i}`} flexDirection="row" paddingLeft={item.depth * INDENT}>
          <Text color={item.isDone ? "success" : "inactive"}>{`${item.isDone ? DONE : OPEN} `}</Text>
          <Box flexShrink={1}>
            <Text dimColor={item.isDone} strikethrough={item.isDone} wrap="wrap">
              {item.text}
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
