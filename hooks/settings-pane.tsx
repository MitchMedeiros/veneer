import type { ConfigRow, ConfigValue, Elements, RenderElement } from "claude-code";

type Ui = Pick<Elements["terminal"], "Box" | "Text" | "Button" | "Input">;

export type Setting = Pick<ConfigRow, "key" | "label" | "description" | "kind" | "value" | "options" | "isLocked">;

// What a plugin's settings are keyed with in `/config`, before the field's name.
export const SETTINGS_PREFIX = "veneer.";

// What a setting's button key starts with, so the focus hook can tell which row the ring is on.
export const SETTING_KEY = "setting:";

const GROUPS = [
  { title: "Styling", fields: ["messageAlign", "fontFamily", "cellRatio"] },
  { title: "Rendering", fields: ["icons", "links", "nativeGraphics", "diagramHint"] },
  { title: "Mod Compatibility", fields: ["styleUserMessage", "styleSpinner"] },
  {
    title: "Syntax theme backgrounds",
    fields: ["fenceBackground", "readBackground", "outputBackground", "diffBackground"],
  },
];
const OTHER = "Other";

export type SettingGroup = { title: string; settings: Setting[] };

export const fieldOf = (key: string): string => key.slice(SETTINGS_PREFIX.length);

// The settings in their groups. A setting no group names falls into the last one, so a new option shows up unasked.
export function groupSettings(settings: readonly Setting[]): SettingGroup[] {
  const named = new Set(GROUPS.flatMap(({ fields }) => fields));
  const groups = GROUPS.map(({ title, fields }) => ({
    title,
    settings: fields.flatMap((field) => settings.filter((setting) => fieldOf(setting.key) === field)),
  }));
  const rest = settings.filter((setting) => !named.has(fieldOf(setting.key)));

  return [...groups, { title: OTHER, settings: rest }].filter(({ settings: row }) => row.length > 0);
}

// The keys of the pane's focusable elements in the order they are drawn, top to bottom. The arrow keys walk them.
export const settingsKeys = (groups: readonly SettingGroup[]): string[] =>
  groups.flatMap(({ settings }) => settings.map(({ key }) => `${SETTING_KEY}${key}`));

// The value a press on a switch or a choice moves to: the opposite, or the next option, wrapping round.
export function nextValue({ kind, value, options }: Setting): ConfigValue {
  if (kind === "boolean") {
    return value !== true;
  }

  const choices = options ?? [];
  const at = choices.indexOf(String(value));

  return choices[(at + 1) % choices.length] ?? value;
}

export function valueText({ kind, value }: Setting): string {
  if (kind === "boolean") {
    return value === true ? "on" : "off";
  }

  return String(value) === "" ? "(none)" : String(value);
}

export const isTyped = ({ kind }: Setting): boolean => kind === "text" || kind === "number";

export type SettingChange = { setting: Setting; value: ConfigValue } | { error: string };

const SWITCH_WORDS: Readonly<Record<string, boolean>> = {
  on: true,
  true: true,
  yes: true,
  off: false,
  false: false,
  no: false,
};

const squash = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, "");

function valueOf(setting: Setting, text: string): ConfigValue | undefined {
  if (setting.kind === "boolean") {
    return SWITCH_WORDS[text.toLowerCase()];
  }

  if (setting.kind === "choice") {
    return setting.options?.find((option) => option.toLowerCase() === text.toLowerCase());
  }

  if (setting.kind === "number") {
    return text === "" || Number.isNaN(Number(text)) ? undefined : Number(text);
  }

  return text;
}

const expectedValue = ({ kind, options }: Setting): string =>
  kind === "boolean"
    ? "on or off"
    : kind === "choice"
      ? (options ?? []).join(", ")
      : kind === "number"
        ? "a number"
        : "text";

// The change a typed `/veneer <setting> <value>` asks for. The setting is named by its title in the pane or by its option
// key, in any case and with or without separators (`cell-proportion`, `cellRatio`).
export function parseSettingChange(settings: readonly Setting[], args: string): SettingChange {
  const words = args.trim().split(/\s+/);

  for (let count = words.length; count >= 1; count--) {
    const name = squash(words.slice(0, count).join(""));
    const setting = settings.find(({ key, label }) => squash(label) === name || squash(fieldOf(key)) === name);

    if (setting === undefined) {
      continue;
    }

    const text = words.slice(count).join(" ");
    const value = valueOf(setting, text);

    return value === undefined ? { error: `${setting.label} takes ${expectedValue(setting)}.` } : { setting, value };
  }

  return { error: `No Veneer setting is named "${args.trim()}". Run /veneer to see them.` };
}

export type SettingsPaneView = {
  groups: readonly SettingGroup[];
  // The key of the setting being typed, or null.
  editing: string | null;
  // The key of the setting the focus ring is on, whose help shows at the bottom.
  focused: string | null;
  message: string | undefined;
};

export type SettingsPaneActions = {
  change: (setting: Setting) => void;
  submit: (setting: Setting, text: string) => void;
};

// The `/veneer` pane: every setting in groups, each changed in place. A switch flips and a choice moves to its next
// option on a press; a typed setting turns into a field. A message from the last change shows at the top.
export function settingsPane(
  ui: Ui,
  { groups, editing, focused, message }: SettingsPaneView,
  actions: SettingsPaneActions,
): RenderElement {
  const { Box, Text, Button, Input } = ui;
  const all = groups.flatMap(({ settings }) => settings);
  const width = Math.max(0, ...all.map(({ label }) => label.length));
  const help = all.find(({ key }) => key === focused)?.description;

  return (
    <Box flexDirection="column" gap={1} paddingLeft={1}>
      {message === undefined ? null : <Text color="suggestion">{message}</Text>}
      {groups.map(({ title, settings }) => (
        <Box key={`group-${title}`} flexDirection="column">
          <Text bold>{title}</Text>
          {settings.map((setting) =>
            setting.key === editing ? (
              <Input
                key={`${SETTING_KEY}${setting.key}`}
                label={setting.label}
                placeholder={String(setting.value)}
                submitLabel="set"
                autoFocus
                onSubmit={(text: string) => actions.submit(setting, text)}
              />
            ) : (
              <Button
                key={`${SETTING_KEY}${setting.key}`}
                plain
                onPress={() => (setting.isLocked ? undefined : actions.change(setting))}
              >
                {`${setting.label.padEnd(width)}  ${valueText(setting)}${setting.isLocked ? " (locked)" : ""}`}
              </Button>
            ),
          )}
        </Box>
      ))}
      {help === undefined ? null : <Text dimColor>{help}</Text>}
      <Text dimColor>Enter to change · Esc to close</Text>
    </Box>
  );
}
