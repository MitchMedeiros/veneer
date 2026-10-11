import type { ElementTable, RenderElement } from "claude-code";

type Ui = Pick<ElementTable, "Box" | "Text" | "Link">;

export type ToolCall = { tool: string; input: unknown; isRunning: boolean; isErrored: boolean };

type Input = Record<string, unknown>;

export type Look = {
  icon: string;
  label: string;
  // Edits take the success colour, as the diff does, and every other tool the suggestion colour.
  tone: "success" | "suggestion";
  // The input key holding a file path, when the detail is one that opens.
  pathKey?: string;
  detail: (input: Input) => string | undefined;
};

// Nerd Font glyphs, which Ghostty and kitty draw from their built-in symbol font.
const text = (key: string) => (input: Input) => (typeof input[key] === "string" ? (input[key] as string) : undefined);
const firstLine = (key: string) => (input: Input) => text(key)(input)?.split("\n")[0];

const LOOKS: Record<string, Look> = {
  Edit: { icon: "", label: "Edit", tone: "success", pathKey: "file_path", detail: text("file_path") },
  Write: { icon: "", label: "Write", tone: "success", pathKey: "file_path", detail: text("file_path") },
  NotebookEdit: {
    icon: "",
    label: "Edit",
    tone: "success",
    pathKey: "notebook_path",
    detail: text("notebook_path"),
  },
  Read: { icon: "", label: "Read", tone: "suggestion", pathKey: "file_path", detail: text("file_path") },
  Bash: { icon: "", label: "Run", tone: "suggestion", detail: firstLine("command") },
  Glob: { icon: "", label: "Find", tone: "suggestion", detail: text("pattern") },
  Grep: { icon: "", label: "Search", tone: "suggestion", detail: text("pattern") },
  Agent: { icon: "", label: "Agent", tone: "suggestion", detail: text("description") },
  Task: { icon: "", label: "Agent", tone: "suggestion", detail: text("description") },
  WebFetch: { icon: "", label: "Fetch", tone: "suggestion", detail: text("url") },
  WebSearch: { icon: "", label: "Web", tone: "suggestion", detail: text("query") },
  Skill: { icon: "", label: "Skill", tone: "suggestion", detail: text("skill") },
  TodoWrite: { icon: "", label: "Todos", tone: "suggestion", detail: () => undefined },
};

// A tool with no look of its own is named as it is, with a gear.
export const lookOf = (tool: string): Look =>
  LOOKS[tool] ?? { icon: "", label: tool, tone: "suggestion", detail: () => undefined };

export const inputOf = (input: unknown): Input => (input ?? {}) as Input;

// The file a call works on, when the tool names one.
export const pathOf = (look: Look, input: Input): string | undefined =>
  look.pathKey === undefined ? undefined : text(look.pathKey)(input);

// The path as shown: relative to the folder the session runs in when it lies under it.
export function shortPath(path: string, cwd: string): string {
  const root = cwd.replace(/\/+$/, "");

  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}

// The tool row as an icon, a bold name and a dim detail, or null for a tool with no look of its own. A path is a link,
// so a click opens the file as the native row's does.
export function toolRow({ Box, Text, Link }: Ui, call: ToolCall, cwd: string): RenderElement | null {
  const look = LOOKS[call.tool];

  if (look === undefined) {
    return null;
  }

  const input = inputOf(call.input);
  const detail = look.detail(input);
  const tone = call.isErrored ? "error" : look.tone;
  const path = pathOf(look, input);

  return (
    <Box flexDirection="row" marginTop={1} marginLeft={2} gap={2}>
      <Box flexShrink={0} gap={2}>
        <Text color={tone} dimColor={call.isRunning}>
          {look.icon}
        </Text>
        <Text color={tone} bold>
          {look.label}
        </Text>
      </Box>
      {detail === undefined ? null : (
        <Box flexShrink={1}>
          <Text dimColor wrap="truncate-end">
            {path === undefined ? detail : <Link href={`file://${encodeURI(path)}`}>{shortPath(detail, cwd)}</Link>}
          </Text>
        </Box>
      )}
    </Box>
  );
}
