// The input of recent tool calls by id. A tool's result block arrives without the call that made it, so the row above it
// leaves the input here. A result drawn without its row having been seen, as after a restart, finds nothing and stays
// plain.
const REMEMBERED = 500;

const inputs = new Map<string, unknown>();

export function rememberInput(id: string, input: unknown): void {
  inputs.delete(id);
  inputs.set(id, input);

  if (inputs.size > REMEMBERED) {
    inputs.delete(inputs.keys().next().value!);
  }
}

// The file a remembered Read call named.
export function pathOfCall(id: string): string | undefined {
  const path = (inputs.get(id) as { file_path?: unknown } | null | undefined)?.file_path;

  return typeof path === "string" ? path : undefined;
}

// The command of a remembered Bash call.
export function commandOfCall(id: string): string | undefined {
  const command = (inputs.get(id) as { command?: unknown } | null | undefined)?.command;

  return typeof command === "string" ? command : undefined;
}
