import type { ElementTable, RenderElement } from "claude-code";

import { MARGIN } from "./reply";
import { lineChildren } from "./syntax/runs";
import type { StyledRun } from "./syntax/types";

type Ui = Pick<ElementTable, "Box" | "Button" | "Text" | "Link">;

export type ToolCall = {
  tool: string;
  input: unknown;
  isRunning: boolean;
  isErrored: boolean;
  output?: unknown;
  tool_use_id?: string;
};

type Input = Record<string, unknown>;

export type Look = {
  icon: string;
  label: string;
  // The input key holding a file path, when the detail is one that opens.
  pathKey?: string;
  detail: (input: Input) => string | undefined;
};

// Nerd Font glyphs, which Ghostty and kitty draw from their built-in symbol font.
const text = (key: string) => (input: Input) => (typeof input[key] === "string" ? (input[key] as string) : undefined);
const firstLine = (key: string) => (input: Input) => text(key)(input)?.split("\n")[0];

const LOOKS: Record<string, Look> = {
  Edit: { icon: "", label: "Edit", pathKey: "file_path", detail: text("file_path") },
  Write: { icon: "", label: "Write", pathKey: "file_path", detail: text("file_path") },
  NotebookEdit: {
    icon: "",
    label: "Edit",
    pathKey: "notebook_path",
    detail: text("notebook_path"),
  },
  Read: { icon: "", label: "Read", pathKey: "file_path", detail: text("file_path") },
  Bash: { icon: "", label: "Command", detail: firstLine("command") },
  Glob: { icon: "", label: "Find", detail: text("pattern") },
  Grep: { icon: "", label: "Search", detail: text("pattern") },
  Agent: { icon: "", label: "Agent", detail: text("description") },
  Task: { icon: "", label: "Agent", detail: text("description") },
  WebFetch: { icon: "", label: "Fetch", detail: text("url") },
  WebSearch: { icon: "", label: "Web", detail: text("query") },
  Skill: { icon: "", label: "Skill", detail: text("skill") },
  TodoWrite: { icon: "", label: "Todos", detail: () => undefined },
};

// A tool with no look of its own is named as it is, with a gear.
export const lookOf = (tool: string): Look => LOOKS[tool] ?? { icon: "", label: tool, detail: () => undefined };

// Plain Unicode symbols, by label, for terminals with no Nerd Font to draw the icons above.
const PLAIN_ICONS: Record<string, string> = {
  Edit: "✎",
  Write: "✐",
  Read: "▤",
  Command: "❯",
  Find: "◇",
  Search: "◎",
  Agent: "◈",
  Fetch: "↓",
  Web: "⊕",
  Skill: "✧",
  Todos: "☑",
};
const PLAIN_DEFAULT = "◆";

// The look of a tool, with a Unicode symbol for its icon in plain mode.
export const lookFor = (tool: string, isPlain: boolean): Look => {
  const look = lookOf(tool);

  return isPlain ? { ...look, icon: PLAIN_ICONS[look.label] ?? PLAIN_DEFAULT } : look;
};

// A call is the suggestion colour while it runs, then the success colour, or the error colour if it failed.
export const toneOf = (call: Pick<ToolCall, "isRunning" | "isErrored">): "error" | "suggestion" | "success" =>
  call.isErrored ? "error" : call.isRunning ? "suggestion" : "success";

// The name a row shows. A Write that made a new file reads Create; it reads Write until the call finishes.
export const labelOf = (look: Look, call: Pick<ToolCall, "tool" | "output">): string =>
  call.tool === "Write" && (call.output as { type?: unknown } | undefined)?.type === "create" ? "Create" : look.label;

export const inputOf = (input: unknown): Input => (input ?? {}) as Input;

// The file a call works on, when the tool names one.
export const pathOf = (look: Look, input: Input): string | undefined =>
  look.pathKey === undefined ? undefined : text(look.pathKey)(input);

// A path is dim until the pointer is on it, then it takes the text colour and is underlined, which shows it is a link.
// The scope keeps one row's path apart from another's.
export const pathHover = (id: string) =>
  ({ scope: `path:${id}`, color: "text", dimColor: false, underline: true }) as const;

// The path as shown: relative to the folder the session runs in when it lies under it.
export function shortPath(path: string, cwd: string): string {
  const root = cwd.replace(/\/+$/, "");

  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}

// What a terminal cannot draw: Nerd Font icons, which become Unicode symbols, and links, which become plain text.
export type Plain = { icons: boolean; links: boolean };

export const NOT_PLAIN: Plain = { icons: false, links: false };

// How a pressable row looks under the pointer: the grey band of a tool group's rows, in place of the inverted colours.
// The scope joins the row's icon, gap and name, so they light as one.
export const litOf = (scope: string) =>
  ({ scope, color: "text", dimColor: false, backgroundColor: "userMessageBackground", inverse: false }) as const;

// The tool row as an icon, a bold name and a dim detail, or null for a tool with no look of its own. A path is a link,
// so a click opens the file as the native row's does. `detailRuns` colour the detail, as a Command's shell line. Given
// `onPress`, the icon and name are a button that runs it. `gap` is the blank rows above the row.
export function toolRow(
  { Box, Button, Text, Link }: Ui,
  call: ToolCall,
  cwd: string,
  detailRuns?: StyledRun[],
  plain: Plain = NOT_PLAIN,
  onPress?: () => void,
  gap = 0,
): RenderElement | null {
  if (LOOKS[call.tool] === undefined) {
    return null;
  }

  const look = lookFor(call.tool, plain.icons);

  const input = inputOf(call.input);
  const detail = look.detail(input);
  const tone = toneOf(call);
  const path = pathOf(look, input);
  const id = `row:${call.tool_use_id ?? call.tool}`;
  const lit = onPress === undefined ? undefined : litOf(id);
  const name = [
    <Text key="icon" color={tone} dimColor={call.isRunning} hover={lit}>
      {look.icon}
    </Text>,
    <Text key="label" color={tone} bold hover={lit}>
      {labelOf(look, call)}
    </Text>,
  ];

  return (
    <Box flexDirection="row" marginTop={gap} marginLeft={MARGIN} marginRight={MARGIN} gap={2}>
      <Box flexShrink={0} gap={plain.icons ? 1 : 2}>
        {onPress === undefined ? (
          name
        ) : (
          <Button key={id} plain hover={lit} onPress={onPress}>
            {name[0]}
            <Text hover={lit}>{plain.icons ? " " : "  "}</Text>
            {name[1]}
          </Button>
        )}
      </Box>
      {detail === undefined ? null : (
        <Box flexShrink={1}>
          <Text
            dimColor
            wrap="truncate-end"
            hover={path === undefined || plain.links ? undefined : pathHover(call.tool_use_id ?? "")}
          >
            {path === undefined ? (
              lineChildren({ Text }, detail, detailRuns)
            ) : plain.links ? (
              detail
            ) : (
              <Link href={`file://${encodeURI(path)}`}>{shortPath(detail, cwd)}</Link>
            )}
          </Text>
        </Box>
      )}
    </Box>
  );
}
