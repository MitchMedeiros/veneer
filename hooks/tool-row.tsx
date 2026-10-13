import type { ElementTable, RenderElement } from "claude-code";

import { MARGIN } from "./reply";
import { lineChildren } from "./syntax/runs";
import type { StyledRun } from "./syntax/types";

type Ui = Pick<ElementTable, "Box" | "Text" | "Link">;

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

// The tool row as an icon, a bold name and a dim detail, or null for a tool with no look of its own. A path is a link,
// so a click opens the file as the native row's does. `detailRuns` colour the detail, as a Command's shell line.
export function toolRow(
  { Box, Text, Link }: Ui,
  call: ToolCall,
  cwd: string,
  detailRuns?: StyledRun[],
): RenderElement | null {
  const look = LOOKS[call.tool];

  if (look === undefined) {
    return null;
  }

  const input = inputOf(call.input);
  const detail = look.detail(input);
  const tone = toneOf(call);
  const path = pathOf(look, input);

  return (
    <Box flexDirection="row" marginTop={1} marginLeft={MARGIN} marginRight={MARGIN} gap={2}>
      <Box flexShrink={0} gap={2}>
        <Text color={tone} dimColor={call.isRunning}>
          {look.icon}
        </Text>
        <Text color={tone} bold>
          {labelOf(look, call)}
        </Text>
      </Box>
      {detail === undefined ? null : (
        <Box flexShrink={1}>
          <Text dimColor wrap="truncate-end" hover={path === undefined ? undefined : pathHover(call.tool_use_id ?? "")}>
            {path === undefined ? (
              lineChildren({ Text }, detail, detailRuns)
            ) : (
              <Link href={`file://${encodeURI(path)}`}>{shortPath(detail, cwd)}</Link>
            )}
          </Text>
        </Box>
      )}
    </Box>
  );
}
