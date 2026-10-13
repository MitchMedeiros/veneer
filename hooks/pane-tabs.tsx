import type { Elements, RenderElement } from "claude-code";

import type { Tab } from "../types";

type Ui = Pick<Elements["terminal"], "Box" | "Text" | "Button">;

// The id of the pane every Veneer command opens, on the tab the command names.
export const PANE_ID = "veneer";

// What a tab button's key starts with, so the focus hook can tell the tab row from the rows under it.
export const TAB_KEY = "tab:";

const TABS: readonly { tab: Tab; label: string }[] = [
  { tab: "settings", label: "General" },
  { tab: "syntax", label: "Syntax" },
];

// The keys of the tab buttons in the order they are drawn. The arrow keys walk them before the rows of the tab.
export const tabKeys: readonly string[] = TABS.map(({ tab }) => `${TAB_KEY}${tab}`);

// A tab's body under a row of buttons that switch between the tabs. The open tab is bold and underlined in the accent.
export function tabbed(ui: Ui, active: Tab, select: (tab: Tab) => void, body: RenderElement): RenderElement {
  const { Box, Text, Button } = ui;

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" gap={2} paddingLeft={1}>
        {TABS.map(({ tab, label }) => (
          <Button key={`${TAB_KEY}${tab}`} plain onPress={() => select(tab)}>
            {tab === active ? (
              <Text bold underline color="suggestion">
                {label}
              </Text>
            ) : (
              <Text dimColor>{label}</Text>
            )}
          </Button>
        ))}
      </Box>
      {body}
    </Box>
  );
}
